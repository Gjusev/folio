import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  GET as ragStatus,
  POST as ragIndex,
  DELETE as ragDelete,
} from "@/app/api/projects/[id]/rag/route";
import { db, closeDb, schema } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { createProfile } from "@/lib/llm-profiles";
import { resetRateLimits } from "@/lib/rate-limit";
import { EMBED_DIMS } from "@/lib/rag";
import { request, signUp } from "../../../test/helpers";

async function userIdOf(email: string): Promise<string> {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row.id;
}

vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  process.env.LLM_BASE_URL = "";
  process.env.LLM_MODEL = "";
});

vi.mock("node:dns/promises", () => {
  const isIP = (s: string) => (/^\d+\.\d+\.\d+\.\d+$/.test(s) ? 4 : s.includes(":") ? 6 : 0);
  return {
    lookup: (host: string) => {
      const bare = host.replace(/^\[|\]$/g, "");
      const own = isIP(bare);
      if (own) return Promise.resolve([{ address: bare, family: own }]);
      return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
    },
  };
});

afterAll(async () => {
  await closeDb();
});

// rag_chunks needs the pgvector extension: until the db container is recreated
// from the pgvector/pgvector:pg17 image, migration 0006 cannot run on
// folio_test, so this whole suite skips (the main session runs it after
// recreating the container).
const ragReady = await (async () => {
  if (!/folio_test/.test(process.env.DATABASE_URL ?? "")) return false;
  try {
    const res = await db().execute(sql`select to_regclass('rag_chunks') as t`);
    return Boolean((res.rows[0] as { t: string | null } | undefined)?.t);
  } catch {
    return false;
  }
})();

describe.skipIf(!ragReady)("project RAG route", () => {
  it("reports null status, refuses indexing without an embed provider, then indexes and deletes", async () => {
    resetRateLimits();
    const { cookie, email } = await signUp();
    const userId = await userIdOf(email);
    const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email));
    const project = await createProject(user.id, "RAG route", [
      { path: "main.tex", content: "\\section{Uno}\nTexto sobre alpha.\n" },
    ]);
    const ctx = { params: Promise.resolve({ id: project.id }) };

    // Fresh project: no index.
    const empty = await ragStatus(
      request("GET", `/api/projects/${project.id}/rag`, { cookie }),
      ctx,
    );
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { status: unknown }).status).toBeNull();

    // No embed profile routed or available: clear 503.
    const refused = await ragIndex(
      request("POST", `/api/projects/${project.id}/rag`, { cookie, body: {} }),
      ctx,
    );
    expect(refused.status).toBe(503);

    // With an embed profile (fetch mocked at the OpenAI wire format).
    await createProfile(userId, {
      label: "Embed",
      kind: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: "",
      models: "mistral-embed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ embedding: Array(EMBED_DIMS).fill(0.1) }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const indexed = await ragIndex(
      request("POST", `/api/projects/${project.id}/rag`, { cookie, body: {} }),
      ctx,
    );
    expect(indexed.status).toBe(200);
    expect((await indexed.json()) as { files: number; chunks: number }).toMatchObject({
      files: 1,
      chunks: 1,
    });

    const status = await ragStatus(
      request("GET", `/api/projects/${project.id}/rag`, { cookie }),
      ctx,
    );
    expect(((await status.json()) as { status: { chunks: number } }).status).toMatchObject({
      chunks: 1,
    });

    const gone = await ragDelete(
      request("DELETE", `/api/projects/${project.id}/rag`, { cookie }),
      ctx,
    );
    expect(gone.status).toBe(204);
    const after = await ragStatus(
      request("GET", `/api/projects/${project.id}/rag`, { cookie }),
      ctx,
    );
    expect(((await after.json()) as { status: unknown }).status).toBeNull();
    vi.unstubAllGlobals();
  });

  it("requires a session", async () => {
    const res = await ragStatus(
      request("GET", "/api/projects/00000000-0000-0000-0000-000000000000/rag"),
      {
        params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
      },
    );
    expect(res.status).toBe(401);
  });
});
