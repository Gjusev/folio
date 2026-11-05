import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as ai } from "@/app/api/projects/[id]/ai/route";
import { POST as compile } from "@/app/api/projects/[id]/compile/route";
import { POST as addCitation } from "@/app/api/projects/[id]/citations/route";
import { GET as exportZip } from "@/app/api/projects/[id]/export/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { unzipSync, strFromU8 } from "fflate";
import { ctx, request, signUp } from "../../../test/helpers";

// Fake upstreams. Ports are fixed because env() is read once per test file.
const LLM_PORT = 39_123;
const COMPILER_PORT = 39_124;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39123/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.COMPILER_URL = "http://127.0.0.1:39124";
});

let llmRequests: {
  auth?: string;
  body: { model: string; messages: { role: string; content: string }[] };
}[] = [];
let compilerRequests: { auth?: string; body: { mainFile: string; files: { path: string }[] } }[] =
  [];
let compilerReply: { status: number; body: unknown } = { status: 200, body: {} };
const servers: Server[] = [];

function listen(port: number, handler: Parameters<typeof createServer>[1]) {
  const s = createServer(handler);
  servers.push(s);
  return new Promise<void>((r) => s.listen(port, "127.0.0.1", () => r()));
}

async function readJson(req: import("node:http").IncomingMessage) {
  let raw = "";
  for await (const c of req) raw += c;
  return JSON.parse(raw);
}

beforeAll(async () => {
  await listen(LLM_PORT, async (req, res) => {
    llmRequests.push({ auth: req.headers.authorization, body: await readJson(req) });
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const piece of ["<think>hidden</think>", "Improved ", "text."]) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
  await listen(COMPILER_PORT, async (req, res) => {
    compilerRequests.push({ auth: req.headers.authorization, body: await readJson(req) });
    res.writeHead(compilerReply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(compilerReply.body));
  });
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  llmRequests = [];
  compilerRequests = [];
});

async function setup() {
  const { cookie } = await signUp();
  const res = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Ünïcode paper!" } }),
    undefined,
  );
  const { project } = await res.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const files = detail.files as { id: string; path: string; content: string; version: number }[];
  return {
    cookie,
    id: project.id as string,
    main: files.find((f) => f.path === "main.tex")!,
    bib: files.find((f) => f.path === "references.bib")!,
  };
}

describe("compile", () => {
  it("sends project sources to the compiler and returns PDF plus parsed log", async () => {
    const { cookie, id } = await setup();
    compilerReply = {
      status: 200,
      body: { ok: false, log: "./main.tex:3: Undefined control sequence.\n" },
    };
    const res = await compile(
      request("POST", `/api/projects/${id}/compile`, { cookie }),
      ctx({ id }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.errors).toEqual([
      { file: "main.tex", line: 3, message: "Undefined control sequence." },
    ]);
    expect(compilerRequests[0].auth).toBe(`Bearer ${process.env.COMPILER_TOKEN}`);
    expect(compilerRequests[0].body.mainFile).toBe("main.tex");
    expect(compilerRequests[0].body.files.map((f) => f.path).sort()).toEqual([
      "main.tex",
      "references.bib",
    ]);
  });

  it("maps a busy compiler to 503", async () => {
    const { cookie, id } = await setup();
    compilerReply = { status: 429, body: { error: "busy" } };
    const res = await compile(
      request("POST", `/api/projects/${id}/compile`, { cookie }),
      ctx({ id }),
    );
    expect(res.status).toBe(503);
  });

  it("does not compile other users' projects", async () => {
    const { id } = await setup();
    const other = await signUp();
    const res = await compile(
      request("POST", `/api/projects/${id}/compile`, { cookie: other.cookie }),
      ctx({ id }),
    );
    expect(res.status).toBe(404);
    expect(compilerRequests).toHaveLength(0);
  });
});

describe("export", () => {
  it("returns a zip with all sources", async () => {
    const { cookie, id } = await setup();
    const res = await exportZip(
      request("GET", `/api/projects/${id}/export`, { cookie }),
      ctx({ id }),
    );
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Unicode-paper.zip"');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["main.tex", "references.bib"]);
    expect(strFromU8(files["main.tex"])).toContain("\\documentclass");
  });
});

describe("ai", () => {
  it("streams the model answer without reasoning blocks", async () => {
    const { cookie, id, main } = await setup();
    const res = await ai(
      request("POST", `/api/projects/${id}/ai`, {
        cookie,
        body: {
          action: "improve",
          fileId: main.id,
          selection: "State your research question here.",
        },
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(200);
    // The stream is NDJSON frames now; text rejoined must match the old shape.
    const text = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { t: string; s: string })
      .filter((e) => e.t === "text")
      .map((e) => e.s)
      .join("");
    expect(text).toBe("Improved text.");
    const sent = llmRequests[0].body;
    expect(sent.model).toBe("test-model");
    expect(sent.messages.at(-1)!.content).toContain("vaswani2017attention"); // bib keys in context
    expect(sent.messages.at(-1)!.content).toContain("\\documentclass"); // document from DB
  });

  it("validates the request before calling the model", async () => {
    const { cookie, id, main } = await setup();
    const noSel = await ai(
      request("POST", `/api/projects/${id}/ai`, {
        cookie,
        body: { action: "improve", fileId: main.id },
      }),
      ctx({ id }),
    );
    expect(noSel.status).toBe(400);
    const badAction = await ai(
      request("POST", `/api/projects/${id}/ai`, {
        cookie,
        body: { action: "rm -rf", fileId: main.id },
      }),
      ctx({ id }),
    );
    expect(badAction.status).toBe(400);
    expect(llmRequests).toHaveLength(0);
  });

  it("cannot read another user's file", async () => {
    const a = await setup();
    const b = await setup();
    const res = await ai(
      request("POST", `/api/projects/${b.id}/ai`, {
        cookie: b.cookie,
        body: { action: "ask", fileId: a.main.id, instruction: "summarise" },
      }),
      ctx({ id: b.id }),
    );
    expect(res.status).toBe(404);
    expect(llmRequests).toHaveLength(0);
  });
});

describe("citations", () => {
  const work = {
    id: "https://openalex.org/W1919346000",
    doi: "https://doi.org/10.1038/nature14539",
    display_name: "Deep learning",
    publication_year: 2015,
    type: "article",
    authorships: [
      { author: { display_name: "Yann LeCun" } },
      { author: { display_name: "Yoshua Bengio" } },
      { author: { display_name: "Geoffrey Hinton" } },
    ],
    primary_location: { source: { display_name: "Nature" } },
    cited_by_count: 70000,
    open_access: { is_oa: false, oa_url: null },
    biblio: { volume: "521", issue: "7553", first_page: "436", last_page: "444" },
  };

  function mockOpenAlex() {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://api.openalex.org/works/W1919346000")) {
        return Response.json(work);
      }
      if (url.startsWith("https://api.openalex.org/works/W9"))
        return new Response("", { status: 404 });
      return realFetch(input, init);
    });
  }

  it("adds an OpenAlex work to the bibliography once", async () => {
    const { cookie, id, bib } = await setup();
    const spy = mockOpenAlex();
    try {
      const add = () =>
        addCitation(
          request("POST", `/api/projects/${id}/citations`, {
            cookie,
            body: { source: "openalex", paperId: "W1919346000" },
          }),
          ctx({ id }),
        );
      const first = await (await add()).json();
      expect(first).toMatchObject({
        key: "lecun2015deep",
        added: true,
        file: { id: bib.id, version: 2 },
      });
      expect(first.file.content).toContain("vaswani2017attention");
      expect(first.file.content).toContain("@article{lecun2015deep,");
      expect(first.file.content).toContain("pages       = {436--444}");

      const second = await (await add()).json();
      expect(second).toMatchObject({ key: "lecun2015deep", added: false, file: { version: 2 } });
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects ids that are not OpenAlex work ids", async () => {
    const { cookie, id } = await setup();
    const res = await addCitation(
      request("POST", `/api/projects/${id}/citations`, {
        cookie,
        body: { source: "openalex", paperId: "https://evil/x" },
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(400);
  });

  it("reports works OpenAlex does not know", async () => {
    const { cookie, id } = await setup();
    const spy = mockOpenAlex();
    try {
      const res = await addCitation(
        request("POST", `/api/projects/${id}/citations`, {
          cookie,
          body: { source: "openalex", paperId: "W999" },
        }),
        ctx({ id }),
      );
      expect(res.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
});
