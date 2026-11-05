import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { GET as listRoute, POST as uploadRoute } from "@/app/api/library/route";
import { DELETE as deleteRoute, GET as paperRoute } from "@/app/api/library/[id]/route";
import { POST as citeRoute } from "@/app/api/library/[id]/cite/route";
import { DELETE as detachRoute, POST as attachRoute } from "@/app/api/library/[id]/attach/route";
import { closeDb, db, schema } from "@/lib/db";
import { EMBED_DIMS } from "@/lib/rag";
import { createProfile } from "@/lib/llm-profiles";
import { createProject } from "@/lib/projects";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp, tinyPdf } from "../../../test/helpers";

vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  process.env.LLM_BASE_URL = "";
  process.env.LLM_MODEL = "";
});

// Same as the rag route tests: the embed profile points at a public host, and
// DNS is mocked so ai-policy's local-only check resolves deterministically.
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

// rag_chunks needs pgvector; the attach tests only run where it exists.
const ragReady = await (async () => {
  if (!/folio_test/.test(process.env.DATABASE_URL ?? "")) return false;
  try {
    const res = await db().execute(sql`select to_regclass('rag_chunks') as t`);
    return Boolean((res.rows[0] as { t: string | null } | undefined)?.t);
  } catch {
    return false;
  }
})();

const PDF = tinyPdf([
  "Estudio sobre redes neuronales",
  "doi: 10.9999/estudio",
  "Un parrafo corto.",
]);
const PDF_B64 = Buffer.from(PDF).toString("base64");

async function userIdOf(email: string): Promise<string> {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row.id;
}

async function labelledChunks(projectId: string): Promise<string[]> {
  const rows = await db()
    .select({ file: schema.ragChunks.file })
    .from(schema.ragChunks)
    .where(eq(schema.ragChunks.projectId, projectId));
  return rows.map((r) => r.file);
}

async function uploadPaper(cookie: string, filename = "estudio.pdf") {
  const res = await uploadRoute(
    request("POST", "/api/library", { cookie, body: { filename, data: PDF_B64 } }),
    undefined,
  );
  if (res.status !== 201) throw new Error(`upload failed: ${res.status}`);
  return (await res.json()) as { paper: { id: string; title: string; doi: string | null } };
}

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const input = (JSON.parse(String(init?.body ?? "{}")).input ?? []) as unknown[];
      return new Response(
        JSON.stringify({ data: input.map(() => ({ embedding: Array(EMBED_DIMS).fill(0.1) })) }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

describe("library route", () => {
  it("requires a session", async () => {
    const res = await listRoute(request("GET", "/api/library"), undefined);
    expect(res.status).toBe(401);
  });

  it("uploads 201, lists, serves the bytes back and deletes", async () => {
    const { cookie } = await signUp();
    const { paper } = await uploadPaper(cookie);
    expect(paper.title).toBe("estudio");
    expect(paper.doi).toBe("10.9999/estudio");

    const list = await listRoute(request("GET", "/api/library", { cookie }), undefined);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { papers: { id: string; attachedTo: unknown[] }[] };
    expect(body.papers).toHaveLength(1);
    expect(body.papers[0].id).toBe(paper.id);
    expect(body.papers[0].attachedTo).toEqual([]);

    const bytes = await paperRoute(
      request("GET", `/api/library/${paper.id}`, { cookie }),
      ctx({ id: paper.id }),
    );
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get("content-type")).toContain("application/pdf");
    expect(
      Buffer.from(await bytes.arrayBuffer())
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");

    const gone = await deleteRoute(
      request("DELETE", `/api/library/${paper.id}`, { cookie }),
      ctx({ id: paper.id }),
    );
    expect(gone.status).toBe(204);
    const after = await listRoute(request("GET", "/api/library", { cookie }), undefined);
    expect(((await after.json()) as { papers: unknown[] }).papers).toEqual([]);
  });

  it("rejects an oversized raw body with 413 before parsing", async () => {
    const { cookie } = await signUp();
    const res = await uploadRoute(
      request("POST", "/api/library", {
        cookie,
        body: { filename: "x.pdf", data: "A".repeat(34_000_001) },
      }),
      undefined,
    );
    expect(res.status).toBe(413);
  });

  it("rejects a decoded PDF over 25 MB with 413", async () => {
    const { cookie } = await signUp();
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const res = await uploadRoute(
      request("POST", "/api/library", {
        cookie,
        body: { filename: "big.pdf", data: Buffer.from(big).toString("base64") },
      }),
      undefined,
    );
    expect(res.status).toBe(413);
  });

  it("rejects non-PDF bytes with 415", async () => {
    const { cookie } = await signUp();
    const res = await uploadRoute(
      request("POST", "/api/library", {
        cookie,
        body: { filename: "doc.txt", data: Buffer.from("hello, not a pdf").toString("base64") },
      }),
      undefined,
    );
    expect(res.status).toBe(415);
  });

  it("refuses to cite a paper with no detected DOI (422)", async () => {
    const { cookie } = await signUp();
    const noDoi = Buffer.from(tinyPdf(["sin identifier en absoluto"])).toString("base64");
    const uploaded = await uploadRoute(
      request("POST", "/api/library", { cookie, body: { filename: "sindoi.pdf", data: noDoi } }),
      undefined,
    );
    expect(uploaded.status).toBe(201);
    const paperId = ((await uploaded.json()) as { paper: { id: string } }).paper.id;

    const res = await citeRoute(
      request("POST", `/api/library/${paperId}/cite`, {
        cookie,
        body: { projectId: "00000000-0000-0000-0000-000000000000" },
      }),
      ctx({ id: paperId }),
    );
    expect(res.status).toBe(422);
  });

  it("rate-limits uploads to 20 per hour per user", async () => {
    const { cookie } = await signUp();
    for (let i = 0; i < 20; i++) {
      const res = await uploadRoute(
        request("POST", "/api/library", {
          cookie,
          body: { filename: `n${i}.pdf`, data: PDF_B64 },
        }),
        undefined,
      );
      expect(res.status).toBe(201);
    }
    const extra = await uploadRoute(
      request("POST", "/api/library", { cookie, body: { filename: "x.pdf", data: PDF_B64 } }),
      undefined,
    );
    expect(extra.status).toBe(429);
  });
});

describe.skipIf(!ragReady)("library attach route", () => {
  it("indexes labelled chunks, is idempotent, and detach/delete remove them", async () => {
    const { cookie, email } = await signUp();
    const userId = await userIdOf(email);
    const project = await createProject(userId, "Adjunto", [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
      },
    ]);
    await createProfile(userId, {
      label: "Embed",
      kind: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: "",
      models: "mistral-embed",
    });
    const { paper } = await uploadPaper(cookie, "estudio.pdf");

    const first = await attachRoute(
      request("POST", `/api/library/${paper.id}/attach`, {
        cookie,
        body: { projectId: project.id },
      }),
      ctx({ id: paper.id }),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { attached: boolean; chunks: number };
    expect(firstBody).toMatchObject({ attached: true });
    expect(firstBody.chunks).toBeGreaterThan(0);
    const label = `library/${paper.title}.pdf`;
    expect(await labelledChunks(project.id)).toEqual([label]);

    // The link shows up in the listing.
    const list = (await (
      await listRoute(request("GET", "/api/library", { cookie }), undefined)
    ).json()) as {
      papers: { attachedTo: { projectId: string; name: string }[] }[];
    };
    expect(list.papers[0].attachedTo).toEqual([{ projectId: project.id, name: "Adjunto" }]);

    // Re-attach: idempotent, no duplicate chunks.
    const again = await attachRoute(
      request("POST", `/api/library/${paper.id}/attach`, {
        cookie,
        body: { projectId: project.id },
      }),
      ctx({ id: paper.id }),
    );
    expect(await again.json()).toEqual({ attached: true, chunks: 0 });
    expect(await labelledChunks(project.id)).toEqual([label]);

    // Detach removes exactly the labelled chunks.
    const detach = await detachRoute(
      request("DELETE", `/api/library/${paper.id}/attach`, {
        cookie,
        body: { projectId: project.id },
      }),
      ctx({ id: paper.id }),
    );
    expect(detach.status).toBe(200);
    expect(await labelledChunks(project.id)).toEqual([]);

    // Attach again, then deleting the paper also cleans the chunks.
    await attachRoute(
      request("POST", `/api/library/${paper.id}/attach`, {
        cookie,
        body: { projectId: project.id },
      }),
      ctx({ id: paper.id }),
    );
    expect(await labelledChunks(project.id)).toEqual([label]);
    await deleteRoute(
      request("DELETE", `/api/library/${paper.id}`, { cookie }),
      ctx({ id: paper.id }),
    );
    expect(await labelledChunks(project.id)).toEqual([]);
  });

  it("refuses to attach a paper whose PDF has no extracted text (422)", async () => {
    const { cookie, email } = await signUp();
    const userId = await userIdOf(email);
    const project = await createProject(userId, "Sin texto", [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
      },
    ]);
    await createProfile(userId, {
      label: "Embed",
      kind: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: "",
      models: "mistral-embed",
    });
    const junk = new Uint8Array(64);
    junk.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const uploaded = await uploadRoute(
      request("POST", "/api/library", {
        cookie,
        body: { filename: "roto.pdf", data: Buffer.from(junk).toString("base64") },
      }),
      undefined,
    );
    const paperId = ((await uploaded.json()) as { paper: { id: string } }).paper.id;

    const res = await attachRoute(
      request("POST", `/api/library/${paperId}/attach`, {
        cookie,
        body: { projectId: project.id },
      }),
      ctx({ id: paperId }),
    );
    expect(res.status).toBe(422);
  });
});
