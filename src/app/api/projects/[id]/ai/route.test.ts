import { createServer, type Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as aiRoute } from "@/app/api/projects/[id]/ai/route";
import { POST as createProject } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { PUT as saveFile } from "@/app/api/projects/[id]/files/[fileId]/route";
import { closeDb, db, schema } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../../../../test/helpers";

const LLM_PORT = 39_136;
vi.hoisted(() => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:39136/v1";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_API_KEY = "";
});

const servers: Server[] = [];
/** Reasoning emitted before the answer ("" = thinking-free stream). */
let reasoning = "";
let reply = "";

/** A fake OpenAI-compatible model: optional reasoning_content, then content. */
beforeAll(async () => {
  const s = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of reasoning ? [reasoning.slice(0, 5), reasoning.slice(5)] : []) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: piece } }] })}\n\n`,
        );
      }
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

beforeEach(() => {
  resetRateLimits();
  reasoning = "";
  reply = "";
});

const MAIN = "Line of the test document.\n".repeat(20);

type FileDto = { id: string; path: string; version: number };

/** A fresh user + project whose main.tex is saved, plus the main file's id. */
async function paper() {
  const { cookie } = await signUp();
  const created = await createProject(
    request("POST", "/api/projects", { cookie, body: { name: "AI chat paper" } }),
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

const ask = (cookie: string, id: string, mainId: string) =>
  aiRoute(
    request("POST", `/api/projects/${id}/ai`, {
      cookie,
      body: { action: "ask", fileId: mainId, instruction: "¿Qué es esto?" },
    }),
    ctx({ id }),
  );

/** Persists after the stream closes; waitFor covers that async tail. */
async function messagesOf(id: string) {
  return vi.waitFor(async () => {
    const rows = await db()
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.projectId, id));
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  });
}

describe("POST /api/projects/[id]/ai (framed NDJSON stream)", () => {
  it("emits think…think, text…text in order and persists ONLY the text answer", async () => {
    const { cookie, id, mainId } = await paper();
    reasoning = "Reazonando mucho";
    reply = "The answer.";
    const res = await ask(cookie, id, mainId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events).toEqual([
      { t: "think", s: "Reazo" },
      { t: "think", s: "nando mucho" },
      { t: "text", s: "The a" },
      { t: "text", s: "nswer." },
    ]);
    const rows = await messagesOf(id);
    expect(rows.map((r) => ({ role: r.role, content: r.content }))).toEqual([
      { role: "user", content: "¿Qué es esto?" },
      // Thinking is ephemeral: the stored assistant turn is the text answer only.
      { role: "assistant", content: "The answer." },
    ]);
  });

  it("a thinking-free stream behaves as before (text events only)", async () => {
    const { cookie, id, mainId } = await paper();
    reply = "Plain answer.";
    const res = await ask(cookie, id, mainId);
    expect(res.status).toBe(200);
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events).toEqual([
      { t: "text", s: "Plain " },
      { t: "text", s: "answer." },
    ]);
    const rows = await messagesOf(id);
    const assistant = rows.find((r) => r.role === "assistant")!;
    expect(assistant.content).toBe("Plain answer.");
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
  });

  it("does not persist anything when the provider answers nothing", async () => {
    const { cookie, id, mainId } = await paper();
    reply = "";
    const res = await ask(cookie, id, mainId);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    const rows = await db()
      .select()
      .from(schema.aiMessages)
      .where(and(eq(schema.aiMessages.projectId, id), eq(schema.aiMessages.role, "assistant")));
    expect(rows).toHaveLength(0);
  });
});
