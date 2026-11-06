import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as grammar } from "@/app/api/projects/[id]/grammar/route";
import { POST as createFile } from "@/app/api/projects/[id]/files/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { closeDb } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../test/helpers";

const LT_PORT = 39_161;
vi.hoisted(() => {
  process.env.LANGUAGETOOL_URL = "http://127.0.0.1:39161";
});

const raw = String.raw;

/** What the fake server answers for one request, given the form it received. */
type Reply = (form: URLSearchParams) => { status?: number; body: string } | "hang-up";
let reply: Reply;
let received: URLSearchParams[] = [];
let server: Server;

/** A fake LanguageTool: records each form-encoded /v2/check and answers via `reply`. */
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const form = new URLSearchParams(body);
    received.push(form);
    expect(req.url).toBe("/v2/check");
    expect(req.headers["content-type"]).toContain("application/x-www-form-urlencoded");
    const r = reply(form);
    if (r === "hang-up") {
      res.socket?.destroy();
      return;
    }
    res.writeHead(r.status ?? 200, { "content-type": "application/json" });
    res.end(r.body);
  });
  await new Promise<void>((r) => server.listen(LT_PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  received = [];
  reply = () => ({ body: JSON.stringify({ matches: [] }) });
});

/** A LanguageTool match on the first occurrence of `word` in the checked text. */
function matchOn(text: string, word: string, id: string) {
  const offset = text.indexOf(word);
  expect(offset, `"${word}" sent to LanguageTool`).toBeGreaterThanOrEqual(0);
  return {
    message: `Problem with ${word}`,
    offset,
    length: word.length,
    replacements: [{ value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }],
    context: { text: `…${word}…`, offset: 1, length: word.length },
    rule: { id },
  };
}

type FileDto = { id: string; path: string; version: number };

const MAIN = [
  raw`\documentclass{article}`, // 1
  raw`\begin{document}`, // 2
  raw`\section{Introduction}\label{sec:intro}`, // 3
  raw`This are a sentence with \emph{an error} in it~\cite{knuth}.`, // 4
  "% a comment that LanguageTool never sees", // 5
  raw`\begin{equation}`, // 6
  "  E = mc^2", // 7
  raw`\end{equation}`, // 8
  raw`Then we has a second mistake, costing 50\% of $x$ the effort.`, // 9
  raw`\end{document}`, // 10
].join("\r\n"); // CRLF on purpose: lines must survive it

async function paper(main = MAIN) {
  const { cookie } = await signUp();
  const created = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Grammar paper" } }),
    undefined,
  );
  const { project } = await created.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const file = (detail.files as FileDto[]).find((f) => f.path === "main.tex")!;
  const saved = await saveFile(
    request("PUT", `/api/projects/${project.id}/files/${file.id}`, {
      cookie,
      body: { content: main, baseVersion: file.version },
    }),
    ctx({ id: project.id, fileId: file.id }),
  );
  if (saved.status !== 200) throw new Error(`save failed: ${await saved.text()}`);
  return { cookie, id: project.id as string };
}

async function addFile(cookie: string, id: string, path: string, content: string) {
  const res = await createFile(
    request("POST", `/api/projects/${id}/files`, { cookie, body: { path, content } }),
    ctx({ id }),
  );
  if (res.status !== 201) throw new Error(`create failed: ${await res.text()}`);
}

const check = (cookie: string, id: string) =>
  grammar(request("POST", `/api/projects/${id}/grammar`, { cookie }), ctx({ id }));

describe("POST /api/projects/[id]/grammar (fake LanguageTool)", () => {
  it("sends only prose and maps two matches back to their source lines", async () => {
    const { cookie, id } = await paper();
    reply = (form) => {
      const text = form.get("text")!;
      return {
        body: JSON.stringify({
          matches: [matchOn(text, "are", "AGREEMENT"), matchOn(text, "has", "HAVE_HAS")],
        }),
      };
    };
    const res = await check(cookie, id);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(received).toHaveLength(1);
    const form = received[0];
    expect(form.get("language")).toBe("auto");
    const text = form.get("text")!;
    // LaTeX, math and comments never leave the server.
    expect(text).not.toMatch(/\\|documentclass|knuth|sec:intro|comment|mc\^2|\$/);
    expect(text).toContain("This are a sentence with an error in it.");
    expect(text).toContain("costing 50% of the effort.");

    expect(body).toEqual({
      off: false,
      filesChecked: 1,
      truncated: false,
      issues: [
        {
          file: "main.tex",
          line: 4,
          column: 6,
          ruleId: "AGREEMENT",
          message: "Problem with are",
          replacements: ["a", "b", "c"],
          context: "…are…",
        },
        {
          file: "main.tex",
          line: 9,
          column: 9,
          ruleId: "HAVE_HAS",
          message: "Problem with has",
          replacements: ["a", "b", "c"],
          context: "…has…",
        },
      ],
    });
  });

  it("checks main first, every .tex, skips short files and sorts by file then line", async () => {
    const { cookie, id } = await paper();
    await addFile(
      cookie,
      id,
      "a-chapter.tex",
      "First line here.\nSecond line has the typo in it, sadly.",
    );
    await addFile(cookie, id, "short.tex", "Too short.");
    await addFile(cookie, id, "notes.md", "Markdown is not LaTeX, so it is never sent anywhere.");
    reply = (form) => {
      const text = form.get("text")!;
      const word = text.includes("typo") ? "typo" : "has";
      return { body: JSON.stringify({ matches: [matchOn(text, word, "R")] }) };
    };
    const body = await (await check(cookie, id)).json();
    expect(received).toHaveLength(2);
    expect(received[0].get("text")).toContain("This are"); // main.tex first
    expect(body.filesChecked).toBe(2);
    expect(body.issues.map((i: { file: string; line: number }) => [i.file, i.line])).toEqual([
      ["main.tex", 9],
      ["a-chapter.tex", 2],
    ]);
  });

  it("ignores single-character matches on the gap a removed command left", async () => {
    const { cookie, id } = await paper(
      raw`Our method\cite{x}works well, as the long experiments below show clearly.`,
    );
    reply = (form) => {
      const text = form.get("text")!;
      const gap = text.indexOf(" works"); // synthetic space where \cite was
      return {
        body: JSON.stringify({
          matches: [{ message: "Whitespace", offset: gap, length: 1, rule: { id: "WS" } }],
        }),
      };
    };
    const body = await (await check(cookie, id)).json();
    expect(body.issues).toEqual([]);
  });

  it("a malformed answer degrades to unreachable (200, not 500)", async () => {
    const { cookie, id } = await paper();
    reply = () => ({ body: "<html>not json</html>" });
    const res = await check(cookie, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ off: false, error: "unreachable" });

    reply = () => ({ body: JSON.stringify({ nope: true }) });
    expect(await (await check(cookie, id)).json()).toEqual({ off: false, error: "unreachable" });

    reply = () => ({ status: 500, body: "{}" });
    expect(await (await check(cookie, id)).json()).toEqual({ off: false, error: "unreachable" });
  });

  it("a failure after the first file returns what was checked, flagged truncated", async () => {
    const { cookie, id } = await paper();
    await addFile(cookie, id, "b.tex", "Another file with enough prose to be checked by the tool.");
    let calls = 0;
    reply = (form) =>
      ++calls === 1
        ? { body: JSON.stringify({ matches: [matchOn(form.get("text")!, "are", "R")] }) }
        : "hang-up";
    const body = await (await check(cookie, id)).json();
    expect(body).toMatchObject({ off: false, filesChecked: 1, truncated: true });
    expect(body.issues).toHaveLength(1);
  });

  it("stops at the first file when the server hangs up (no 30 attempts)", async () => {
    const { cookie, id } = await paper();
    await addFile(cookie, id, "b.tex", "Another file with enough prose to be checked by the tool.");
    reply = () => "hang-up";
    const body = await (await check(cookie, id)).json();
    expect(body).toEqual({ off: false, error: "unreachable" });
    expect(received).toHaveLength(1);
  });

  it("caps at 100 issues and flags truncated", async () => {
    const { cookie, id } = await paper();
    reply = (form) => {
      const text = form.get("text")!;
      const m = matchOn(text, "are", "R");
      return { body: JSON.stringify({ matches: Array.from({ length: 150 }, () => m) }) };
    };
    const body = await (await check(cookie, id)).json();
    expect(body.issues).toHaveLength(100);
    expect(body.truncated).toBe(true);
  });

  it("requires sign-in and project access", async () => {
    const { id } = await paper();
    expect(
      (await grammar(request("POST", `/api/projects/${id}/grammar`), ctx({ id }))).status,
    ).toBe(401);
    const stranger = await signUp();
    expect((await check(stranger.cookie, id)).status).toBe(404);
    expect(received).toHaveLength(0);
  });

  it("rate-limits at 10 checks per minute", async () => {
    const { cookie, id } = await paper();
    for (let n = 0; n < 10; n++) expect((await check(cookie, id)).status).toBe(200);
    expect((await check(cookie, id)).status).toBe(429);
  });

  // Last: closes the fake server for good.
  it("a closed port answers unreachable", async () => {
    const { cookie, id } = await paper();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    const res = await check(cookie, id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ off: false, error: "unreachable" });
  });
});
