import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as imageRoute } from "@/app/api/projects/[id]/ai/image/route";
import { listAiUsage } from "@/lib/ai-usage";
import { compileProject } from "@/lib/compiler";
import { closeDb, db, schema } from "@/lib/db";
import { addMember, createProject } from "@/lib/projects";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../../test/helpers";

vi.mock("@/lib/compiler", () => ({ compileProject: vi.fn() }));

const LLM_PORT = 39_151;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = `http://127.0.0.1:39151/v1`;
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

/** A real (if truncated) PNG header: the sniff step must accept it. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PNG_B64 = Buffer.from(PNG_BYTES).toString("base64");
const EQUATION = "\\begin{equation}\n  E = mc^2\n\\end{equation}";

/** What the fake model answers and with which HTTP status; swapped per test. */
let reply: string[] = [EQUATION];
let llmStatus = 200;
const llmBodies: unknown[] = [];
const servers: Server[] = [];

beforeAll(async () => {
  const s = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = null;
      }
      llmBodies.push(body);
      if (llmStatus !== 200) {
        res.writeHead(llmStatus, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "no vision" } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of reply)
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
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

const compileMock = vi.mocked(compileProject);

beforeEach(() => {
  resetRateLimits();
  compileMock.mockReset();
  llmBodies.length = 0;
  reply = [EQUATION];
  llmStatus = 200;
});

async function setup() {
  const owner = await signUp();
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, owner.email));
  const project = await createProject(row.id, "Image paper", [
    { path: "main.tex", content: "\\documentclass{article}\n\\begin{document}x\\end{document}\n" },
  ]);
  return { owner, userId: row.id, id: project.id };
}

const call = (cookie: string, id: string, body: unknown) =>
  imageRoute(request("POST", `/api/projects/${id}/ai/image`, { cookie, body }), ctx({ id }));

describe("image → LaTeX", () => {
  it("sends the image as an OpenAI image_url part, returns LaTeX and the compile verdict", async () => {
    const { owner, id } = await setup();
    compileMock.mockResolvedValue({ ok: true, log: "", pdf: "" });

    const res = await call(owner.cookie, id, {
      image: `data:image/png;base64,${PNG_B64}`,
      kind: "equation",
      hint: "Maxwell",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ latex: EQUATION, compiles: true });

    // The wire request really carried the picture as a data URL.
    const sent = llmBodies[0] as {
      messages: { role: string; content: string | { type: string }[] }[];
    };
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].role).toBe("system");
    const turn = sent.messages[1].content as {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
    expect(turn[0]).toMatchObject({ type: "text", text: expect.stringContaining("Maxwell") });
    expect(turn[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${PNG_B64}` },
    });

    // The honesty check compiled a wrapped snippet, and usage was recorded.
    expect(compileMock).toHaveBeenCalledWith("snippet.tex", [
      { path: "snippet.tex", content: expect.stringContaining("\\documentclass{article}") },
    ]);
    expect(await listAiUsage(id)).toMatchObject([{ action: "image", model: "test-model" }]);
  });

  it("reports a failed compile with the first log error", async () => {
    const { owner, id } = await setup();
    compileMock.mockResolvedValue({
      ok: false,
      log: "./snippet.tex:5: Undefined control sequence.",
    });
    const res = await call(owner.cookie, id, { image: PNG_B64 });
    expect(await res.json()).toEqual({
      latex: EQUATION,
      compiles: false,
      error: "Undefined control sequence.",
    });
  });

  it("says compiles:null (honestly not checked) when the compiler is unreachable", async () => {
    const { owner, id } = await setup();
    compileMock.mockRejectedValue(new Error("sandbox down"));
    const res = await call(owner.cookie, id, { image: PNG_B64 });
    expect(await res.json()).toEqual({ latex: EQUATION, compiles: null });
  });

  it("maps % unreadable to the unreadable answer without compiling", async () => {
    const { owner, id } = await setup();
    reply = ["% unreadable"];
    const res = await call(owner.cookie, id, { image: PNG_B64 });
    expect(await res.json()).toEqual({ latex: "", compiles: null, unreadable: true });
    expect(compileMock).not.toHaveBeenCalled();
  });

  it("rethrows provider errors as a vision hint", async () => {
    const { owner, id } = await setup();
    llmStatus = 400;
    const res = await call(owner.cookie, id, { image: PNG_B64 });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/modelo con visión/);
  });

  it("rejects an oversized body with 413 before touching the provider", async () => {
    const { owner, id } = await setup();
    const res = await call(owner.cookie, id, { image: "A".repeat(6_000_001) });
    expect(res.status).toBe(413);
    expect(llmBodies).toHaveLength(0);
  });

  it("rejects bytes that are no recognized image with 415", async () => {
    const { owner, id } = await setup();
    const res = await call(owner.cookie, id, { image: Buffer.from("hello").toString("base64") });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/PNG, JPEG, WebP o GIF/);
    expect(llmBodies).toHaveLength(0);
  });

  it("refuses viewers with 403", async () => {
    const { id } = await setup();
    const viewer = await signUp();
    await addMember(id, viewer.email, "viewer");
    const res = await call(viewer.cookie, id, { image: PNG_B64 });
    expect(res.status).toBe(403);
  });

  it("refuses the whole route when the project's AI policy is off", async () => {
    const { owner, id } = await setup();
    await db().update(schema.projects).set({ aiPolicy: "off" }).where(eq(schema.projects.id, id));
    const res = await call(owner.cookie, id, { image: PNG_B64 });
    expect(res.status).toBe(403);
    expect(llmBodies).toHaveLength(0);
  });
});
