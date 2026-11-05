import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { buildMessages } from "@/lib/ai-prompts";
import { db, closeDb, schema } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { createProfile } from "@/lib/llm-profiles";
import { resetRateLimits } from "@/lib/rate-limit";
import { chunkFiles, cosine, embedTexts, EMBED_DIMS } from "@/lib/rag";
import type { Endpoint } from "@/lib/llm-profiles";
import { signUp } from "../../test/helpers";

async function userIdOf(email: string): Promise<string> {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row.id;
}
// (eq/db/schema already imported above)

vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  // No .env endpoint: profiles come from the DB only.
  process.env.LLM_BASE_URL = "";
  process.env.LLM_MODEL = "";
});

// validateBaseUrl resolves hostnames (SSRF guard); tests resolve everything public.
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

const endpoint: Endpoint = {
  id: "test",
  label: "TestEmbed",
  kind: "openai",
  baseUrl: "https://api.mistral.ai/v1",
  apiKey: "sk-1",
  model: "test-embed",
  extra: {},
};

const oneHot = (n: number) =>
  Array.from({ length: EMBED_DIMS }, (_, i) => (i === n % EMBED_DIMS ? 1 : 0));

/** Responds {data:[{embedding}]} with one-hot vectors keyed by the TAG the text contains. */
function embedFetchMock(tags: string[], status = 200) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    const data =
      status === 200
        ? body.input.map((text) => {
            const tag = tags.find((t) => text.includes(t));
            return { embedding: oneHot(tag ? tags.indexOf(tag) : tags.length) };
          })
        : [];
    return new Response(JSON.stringify({ data }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  await closeDb();
});

/* ---------------- pure: chunking ---------------- */

describe("chunkFiles", () => {
  it("returns no chunks for empty or whitespace-only files", () => {
    expect(chunkFiles([{ path: "main.tex", content: "" }])).toEqual([]);
    expect(chunkFiles([{ path: "main.tex", content: "  \n\n  \n" }])).toEqual([]);
  });

  it("keeps a short file as one identical chunk", () => {
    const content = "\\section{Intro}\nSome text.\n\nMore text.";
    expect(chunkFiles([{ path: "main.tex", content }])).toEqual([
      { file: "main.tex", idx: 0, content },
    ]);
  });

  it("never cuts a line and keeps chunks near the target size", () => {
    const line = "x".repeat(90); // 90-char lines, blank line every other line
    const paras = Array.from({ length: 40 }, (_, i) => `${line} ${i}\n${line}`);
    const content = paras.join("\n\n"); // ~7300 chars
    const chunks = chunkFiles([{ path: "main.tex", content }]);
    expect(chunks.length).toBeGreaterThan(3);
    const sourceLines = new Set(content.split("\n"));
    for (const c of chunks) {
      for (const l of c.content.split("\n")) {
        if (l.trim()) expect(sourceLines.has(l)).toBe(true); // whole lines only
      }
      // A chunk exceeds the target only when it is a single unbreakable line.
      expect(c.content.length <= 1050 || c.content.split("\n").length === 1).toBe(true);
    }
  });

  it("overlaps consecutive chunks with ~150 characters of whole lines", () => {
    const para = Array.from({ length: 30 }, (_, i) => `línea número ${i} de prueba`).join("\n");
    const content = Array.from({ length: 8 }, (_, p) => `párrafo ${p}\n${para}`).join("\n\n");
    const chunks = chunkFiles([{ path: "main.tex", content }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].content
        .split("\n")
        .filter((l) => l.trim())
        .slice(-2);
      const head = chunks[i].content.split("\n");
      expect(head.some((l) => prevTail.includes(l))).toBe(true);
    }
  });

  it("gives one chunk per .bib entry", () => {
    const bib = [
      "% comment\n",
      "@article{a, title={A}, year={2020}}",
      "@book{b,\n  title={B},\n  author={X}}",
      "@misc{c, title={C}}",
    ].join("\n\n");
    const chunks = chunkFiles([{ path: "refs.bib", content: bib }]);
    expect(chunks).toHaveLength(4);
    expect(chunks[0].content).toContain("% comment");
    expect(chunks[1].content).toMatch(/^@article\{a,/);
    expect(chunks[2].content).toContain("author={X}");
    expect(chunks[3].content).toMatch(/^@misc\{c,/);
  });

  it("numbers idx per file across several files", () => {
    const chunks = chunkFiles([
      { path: "a.tex", content: `${"a".repeat(600)}\n\n${"b".repeat(600)}` },
      { path: "b.tex", content: "tres" },
    ]);
    expect(chunks.map((c) => `${c.file}#${c.idx}`)).toEqual(["a.tex#0", "a.tex#1", "b.tex#0"]);
  });
});

/* ---------------- pure: cosine ---------------- */

describe("cosine", () => {
  it("is 1 for equal vectors, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([2, 0], [-5, 0])).toBeCloseTo(-1);
  });

  it("stays in [-1, 1] and returns 0 for zero vectors", () => {
    const a = Array.from({ length: 64 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 64 }, (_, i) => Math.cos(i * 0.5));
    const s = cosine(a, b);
    expect(s).toBeGreaterThan(-1.000001);
    expect(s).toBeLessThan(1.000001);
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

/* ---------------- embedTexts (fetch mocked) ---------------- */

describe("embedTexts", () => {
  it("posts an OpenAI-style embeddings request and returns the vectors", async () => {
    const fetchMock = embedFetchMock(["alpha", "beta"]);
    vi.stubGlobal("fetch", fetchMock);
    const out = await embedTexts(endpoint, ["text about alpha", "text about beta"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(oneHot(0));
    expect(out[1]).toEqual(oneHot(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/embeddings");
    expect(init.headers).toMatchObject({ authorization: "Bearer sk-1" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-embed",
      input: ["text about alpha", "text about beta"],
    });
  });

  it("rejects wrong dimensionalities with a clear message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 }),
      ),
    );
    await expect(embedTexts(endpoint, ["x"])).rejects.toThrow(/1536/);
  });

  it("surfaces provider errors honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(embedTexts(endpoint, ["x"])).rejects.toThrow(
      /TestEmbed respondió con un error \(401\)/,
    );
  });
});

/* ---------------- buildMessages with projectContext ---------------- */

describe("buildMessages projectContext", () => {
  it("adds retrieved fragments with the staleness marker and a size budget", () => {
    const messages = buildMessages({
      action: "ask",
      filePath: "main.tex",
      document: "doc",
      bibKeys: [],
      selection: "",
      beforeCursor: "",
      instruction: "¿Qué dice el proyecto sobre alpha?",
      log: "",
      history: [],
      projectContext: [
        { file: "intro.tex", content: "alpha ".repeat(2000) },
        { file: "refs.bib", content: "@article{a}" },
      ],
    });
    const user = messages.at(-1)!.content;
    expect(user).toContain("PROJECT FRAGMENTS");
    expect(user).toContain("[intro.tex]");
    expect(user.length).toBeLessThan(30_000);
  });
});

/* ---------------- against the real folio_test database ---------------- */

// The rag_chunks table needs the pgvector extension, which only exists once the
// db container runs the pgvector/pgvector:pg17 image. Until the main session
// recreates it, folio_test cannot run migration 0006: probe and skip.
const ragTableReady = await (async () => {
  if (!/folio_test/.test(process.env.DATABASE_URL ?? "")) return false;
  try {
    const res = await db().execute(sql`select to_regclass('rag_chunks') as t`);
    return Boolean((res.rows[0] as { t: string | null } | undefined)?.t);
  } catch {
    return false;
  }
})();
const itDb = it.skipIf(!ragTableReady);

describe("rag index + retrieve (folio_test)", () => {
  itDb("indexes a project, retrieves by similarity and reports status", async () => {
    resetRateLimits();
    const { email } = await signUp();
    const userId = await userIdOf(email);
    const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email));
    // One embed profile for this user (resolveEndpoint falls back to it).
    await createProfile(userId, {
      label: "Embed",
      kind: "openai",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: "",
      models: "mistral-embed",
    });

    const para = (tag: string, n: number) =>
      `Estudio del método ${tag} con detalles número ${n}.\n` + `dato ${tag}\n`.repeat(20);
    const tex =
      "\\documentclass{article}\n\\begin{document}\n" +
      Array.from({ length: 24 }, (_, i) =>
        para(i % 3 === 0 ? "alpha" : i % 3 === 1 ? "beta" : "gamma", i),
      ).join("\n\n") +
      "\n\\end{document}";
    const bib = "@article{a, title={A}}\n\n@book{b, title={B}}";
    const project = await createProject(user.id, "RAG test", [
      { path: "main.tex", content: tex },
      { path: "refs.bib", content: bib },
    ]);

    vi.stubGlobal("fetch", embedFetchMock(["alpha", "beta", "gamma"]));
    const { indexProject, indexStatus, retrieve, deleteRagIndex } = await import("@/lib/rag");
    const result = await indexProject(user.id, project);
    expect(result.files).toBe(2);
    expect(result.chunks).toBeGreaterThan(10);

    const status = await indexStatus(project.id);
    expect(status).toMatchObject({ files: 2 });
    expect(status!.chunks).toBe(result.chunks);
    expect(status!.updatedAt).toBeInstanceOf(Date);

    // The query names a tag; the mock embeds it as that tag's one-hot vector.
    const hits = await retrieve(user.id, project, "¿dónde se explica alpha?");
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(hits[0].content).toContain("alpha");

    await deleteRagIndex(project.id);
    expect(await indexStatus(project.id)).toBeNull();
  });
});
