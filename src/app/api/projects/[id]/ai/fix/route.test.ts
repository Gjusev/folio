import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as fixRoute } from "@/app/api/projects/[id]/ai/fix/route";
import { POST as createProject } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { closeDb, db, schema } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../test/helpers";

const LLM_PORT = 39_134;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39134/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

const servers: Server[] = [];
let lastPrompt = "";
let reply = "";

/** A fake OpenAI-compatible model that answers with whatever `reply` holds. */
beforeAll(async () => {
  const s = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastPrompt = JSON.stringify(JSON.parse(data).messages);
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
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => resetRateLimits());

// 80 lines; line 12 is the one the compiler chokes on.
const BAD_LINE = String.raw`The sample weighed \si{\kilogram} in total.`;
const MAIN = Array.from({ length: 80 }, (_, i) =>
  i === 11 ? BAD_LINE : `Line ${i + 1} of the test document.`,
).join("\n");

const LOG = [
  "This is pdfTeX, Version 3.141592653-2.6-1.40.25 (preloaded format=pdflatex)",
  " restricted \\write18 enabled.",
  "entering extended mode",
  "./main.tex:12: Undefined control sequence.",
  "l.12 ...ighed \\si",
  "No pages of output.",
].join("\n");

const FIXED = String.raw`The sample weighed 3\,kg in total.`;

type FileDto = { id: string; path: string; version: number };

/** A fresh user + project whose main.tex is MAIN, plus the main file's id. */
async function paper() {
  const { cookie } = await signUp();
  const created = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "Fix paper" } }),
    undefined,
  );
  const { project } = await created.json();
  const detail = await (
    await getProject(
      request("GET", `/api/projects/${project.id}`, { cookie }),
      ctx({ id: project.id }),
    )
  ).json();
  const main = (detail.files as FileDto[]).find((f) => f.path === "main.tex")!;
  const saved = await saveFile(
    request("PUT", `/api/projects/${project.id}/files/${main.id}`, {
      cookie,
      body: { content: MAIN, baseVersion: main.version },
    }),
    ctx({ id: project.id, fileId: main.id }),
  );
  if (saved.status !== 200) throw new Error(`save failed: ${await saved.text()}`);
  return { cookie, id: project.id as string, mainId: main.id };
}

const post = (cookie: string, id: string, body: unknown) =>
  fixRoute(request("POST", `/api/projects/${id}/ai/fix`, { cookie, body }), ctx({ id }));

describe("POST /api/projects/[id]/ai/fix", () => {
  it("locates the error from a real-looking log and returns a reviewed patch", async () => {
    const { cookie, id, mainId } = await paper();
    reply = JSON.stringify({
      explanation: "\\si requiere siunitx; uso unidades literales.",
      startLine: 12,
      endLine: 12,
      replacement: FIXED,
    });
    const res = await post(cookie, id, { log: LOG, lang: "es" });
    expect(res.status).toBe(200);
    const fix = await res.json();
    expect(fix).toEqual({
      explanation: "\\si requiere siunitx; uso unidades literales.",
      fileId: mainId,
      path: "main.tex",
      startLine: 12,
      endLine: 12,
      original: BAD_LINE,
      replacement: FIXED,
      error: { message: "Undefined control sequence.", line: 12 },
    });
    // The model saw a numbered window, the error and the language hint.
    expect(lastPrompt).toContain("  12|");
    expect(lastPrompt).toContain("Undefined control sequence. (line 12)");
    expect(lastPrompt).toContain("Spanish");
    expect(lastPrompt).toContain("untrusted data");
  });

  it("answers 502 when the model answers junk", async () => {
    const { cookie, id } = await paper();
    reply = "Lo siento, no puedo ayudarte con eso.";
    expect((await post(cookie, id, { log: LOG })).status).toBe(502);
  });

  it("answers 502 when the patch points outside the shown window", async () => {
    const { cookie, id } = await paper();
    // Line 12's window is 1..42; line 50 was never shown.
    reply = JSON.stringify({
      explanation: "Arreglo lejano.",
      startLine: 50,
      endLine: 50,
      replacement: "x",
    });
    expect((await post(cookie, id, { log: LOG })).status).toBe(502);
  });

  it("answers 502 when the replacement is a no-op", async () => {
    const { cookie, id } = await paper();
    reply = JSON.stringify({
      explanation: "Sin cambios.",
      startLine: 12,
      endLine: 12,
      replacement: BAD_LINE,
    });
    expect((await post(cookie, id, { log: LOG })).status).toBe(502);
  });

  it("answers 422 when no error in the log has a file and line", async () => {
    const { cookie, id } = await paper();
    const res = await post(cookie, id, { log: "! Emergency stop.\n<*> main.tex" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("localizar");
  });

  it("answers 403 for a viewer (patches are a write-class action)", async () => {
    const { cookie, id } = await paper();
    const bob = await signUp();
    const invite = await addMember(
      request("POST", `/api/projects/${id}/members`, {
        cookie,
        body: { email: bob.email, role: "viewer" },
      }),
      ctx({ id }),
    );
    expect(invite.status).toBe(201);
    expect((await post(bob.cookie, id, { log: LOG })).status).toBe(403);
  });

  it("answers 403 when the project's AI policy is off", async () => {
    const { cookie, id } = await paper();
    await db().update(schema.projects).set({ aiPolicy: "off" }).where(eq(schema.projects.id, id));
    const res = await post(cookie, id, { log: LOG });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("desactivada");
  });

  it("answers 400 for a malformed body", async () => {
    const { cookie, id } = await paper();
    expect((await post(cookie, id, { log: 12 })).status).toBe(400);
    expect((await post(cookie, id, { log: "x".repeat(20_001) })).status).toBe(400);
  });
});
