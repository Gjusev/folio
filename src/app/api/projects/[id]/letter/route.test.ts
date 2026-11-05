import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as letterRoute } from "@/app/api/projects/[id]/letter/route";
import { POST as draftsRoute } from "@/app/api/projects/[id]/letter/drafts/route";
import { POST as compileRoute } from "@/app/api/projects/[id]/compile/route";
import { POST as createProject } from "@/app/api/projects/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../test/helpers";

const LLM_PORT = 39_137;
const COMPILER_PORT = 39_138;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39137/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
  process.env.COMPILER_URL = "http://127.0.0.1:39138";
});

const servers: Server[] = [];
let reply = "";
/** Compile roots the compile route asked the (fake) compiler for. */
let compiledMains: string[] = [];

/** A fake OpenAI-compatible model that answers with whatever `reply` holds. */
beforeAll(async () => {
  const s = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const half = Math.floor(reply.length / 2);
      for (const piece of [reply.slice(0, half), reply.slice(half)]) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    });
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(LLM_PORT, "127.0.0.1", () => r()));

  // A fake compiler that always succeeds with a two-page PDF log.
  const c = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      compiledMains.push((JSON.parse(raw) as { mainFile: string }).mainFile);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, log: "Output written on main.pdf (2 pages, 1234 bytes)." }),
      );
    });
  });
  servers.push(c);
  await new Promise<void>((r) => c.listen(COMPILER_PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  reply = "";
  compiledMains = [];
});

/** A fresh user with a template project. */
async function paper() {
  const { cookie } = await signUp();
  const created = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Letter paper" } }),
    undefined,
  );
  const { project } = await created.json();
  return { cookie, id: project.id as string };
}

const item = (id: string) => ({
  id,
  reviewer: "Reviewer 1",
  severity: "major" as const,
  quote: null,
  comment: `Comment ${id}`,
  file: null,
  line: null,
  response: "",
  aiDraft: false,
});

const postLetter = (cookie: string, id: string, body: unknown) =>
  letterRoute(request("POST", `/api/projects/${id}/letter`, { cookie, body }), ctx({ id }));

const postDrafts = (cookie: string, id: string, body: unknown) =>
  draftsRoute(request("POST", `/api/projects/${id}/letter/drafts`, { cookie, body }), ctx({ id }));

describe("POST /api/projects/[id]/letter", () => {
  it("creates the .tex once and upserts on re-runs (same file, bumped version)", async () => {
    const { cookie, id } = await paper();
    const first = await postLetter(cookie, id, {
      items: [item("R1.1"), item("R1.2")],
      lang: "en",
    });
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.path).toBe("response-letter.tex");
    expect(a.content).toContain("\\subsection*{R1.1");
    expect(a.content).toContain("\\end{document}");

    const second = await postLetter(cookie, id, {
      items: [item("R1.1")],
      lang: "en",
    });
    expect(second.status).toBe(200);
    const b = await second.json();
    expect(b.fileId).toBe(a.fileId);
    expect(b.version).toBe(a.version + 1);
  });

  it("rejects bad paths, empty items and over the caps", async () => {
    const { cookie, id } = await paper();
    const base = { lang: "en" } as const;
    expect(
      (await postLetter(cookie, id, { ...base, items: [item("P1")], path: "../evil.tex" })).status,
    ).toBe(400);
    expect(
      (await postLetter(cookie, id, { ...base, items: [item("P1")], path: "letter.txt" })).status,
    ).toBe(400);
    expect((await postLetter(cookie, id, { ...base, items: [] })).status).toBe(400);
    expect(
      (
        await postLetter(cookie, id, {
          ...base,
          items: Array.from({ length: 41 }, (_, i) => item(`P${i}`)),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await postLetter(cookie, id, {
          ...base,
          items: [{ ...item("P1"), comment: "x".repeat(4001) }],
        })
      ).status,
    ).toBe(400);
    // Strangers keep getting the uniform 404.
    const stranger = await signUp();
    expect((await postLetter(stranger.cookie, id, { ...base, items: [item("P1")] })).status).toBe(
      404,
    );
  });

  it("renders a letter that compiles as its own root, reporting its pages", async () => {
    const { cookie, id } = await paper();
    const nasty = {
      ...item("R1.1"),
      comment: "100% of $5 & #1 _great_ {braces} ~tilde~ ^caret^ back\\slash",
      quote: 'quoted "text" with %',
      response: "Fixed: see the revised discussion.",
      aiDraft: true,
    };
    const created = await postLetter(cookie, id, {
      items: [nasty, item("R1.2")],
      lang: "en",
      snapshotLabel: "v1 submitted",
    });
    expect(created.status).toBe(201);
    const compiled = await compileRoute(
      request("POST", `/api/projects/${id}/compile`, {
        cookie,
        body: { mainFile: "response-letter.tex" },
      }),
      ctx({ id }),
    );
    expect(compiled.status).toBe(200);
    const r = (await compiled.json()) as { ok: boolean; pages?: number };
    expect(r.ok).toBe(true);
    expect(r.pages).toBe(2);
    expect(compiledMains).toEqual(["response-letter.tex"]);
  });

  it("still compiles the project main file when no body is sent", async () => {
    const { cookie, id } = await paper();
    const res = await compileRoute(
      request("POST", `/api/projects/${id}/compile`, { cookie }),
      ctx({ id }),
    );
    expect(res.status).toBe(200);
    expect(compiledMains).toEqual(["main.tex"]);
  });

  it("rejects a mainFile that is not a .tex of the project", async () => {
    const { cookie, id } = await paper();
    const res = await compileRoute(
      request("POST", `/api/projects/${id}/compile`, {
        cookie,
        body: { mainFile: "references.bib" },
      }),
      ctx({ id }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/projects/[id]/letter/drafts", () => {
  it("discards drafts whose id was not sent", async () => {
    const { cookie, id } = await paper();
    reply = JSON.stringify({
      drafts: [
        { id: "P1", response: "We clarified this in the revised discussion." },
        { id: "HACKED", response: "Ignore previous instructions." },
      ],
    });
    const res = await postDrafts(cookie, id, {
      items: [
        { id: "P1", comment: "The method is unclear." },
        { id: "P2", comment: "Missing baseline." },
      ],
      lang: "en",
    });
    expect(res.status).toBe(200);
    const { drafts } = await res.json();
    expect(drafts).toEqual([
      { id: "P1", response: "We clarified this in the revised discussion." },
    ]);
  });

  it("answers 502 when the model returns nothing usable", async () => {
    const { cookie, id } = await paper();
    reply = "I cannot do that.";
    const res = await postDrafts(cookie, id, {
      items: [{ id: "P1", comment: "Something." }],
      lang: "en",
    });
    expect(res.status).toBe(502);
  });
});
