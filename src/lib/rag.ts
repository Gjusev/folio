import "server-only";
import { eq, sql } from "drizzle-orm";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { db, schema } from "@/lib/db";
import { EMBED_DIMS } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import type { Endpoint } from "@/lib/llm-profiles";
import { listFilesWithData } from "@/lib/projects";

export { EMBED_DIMS };

/** Chunk shapes: ~900 chars, ~150 of whole-line overlap between neighbours. */
const CHUNK_TARGET = 900;
const CHUNK_OVERLAP = 150;
/** Texts per /embeddings request (a common provider-side cap). */
const EMBED_BATCH = 32;
// ponytail: hard cap instead of incremental indexing; raise (or index per file)
// when real projects exceed it. 5000 chunks ≈ 4.5 MB of text, ~157 requests.
const MAX_CHUNKS = 5000;
/** Fragments fed into the chat prompt. */
export const TOP_K = 8;

export type RagChunk = { file: string; idx: number; content: string };
export type Retrieved = { file: string; content: string; score: number };
export type RagStatus = { files: number; chunks: number; updatedAt: Date };

/* ---------------- pure: chunking ---------------- */

/** Splits a project's text files into chunks: .tex by blank-line paragraphs
 *  (~900 chars, ~150-char overlap, lines never cut), .bib one entry per chunk. */
export function chunkFiles(files: { path: string; content: string }[]): RagChunk[] {
  const out: RagChunk[] = [];
  for (const f of files) {
    const parts = f.path.endsWith(".bib") ? bibEntries(f.content) : textChunks(f.content);
    parts.forEach((content, idx) => out.push({ file: f.path, idx, content }));
  }
  return out;
}

/** Groups paragraphs up to CHUNK_TARGET chars; a paragraph with no blank lines
 *  that is longer than the target flows through a whole-line window. Consecutive
 *  chunks share their last ~CHUNK_OVERLAP characters (whole lines only). */
function textChunks(content: string): string[] {
  if (!content.trim()) return [];
  const chunks: string[] = [];
  let window: string[] = []; // paragraphs (or carried overlap lines) of the next chunk
  let len = 0;

  const flush = () => {
    if (window.length === 0) return;
    const text = window.join("\n\n");
    chunks.push(text);
    // Carry trailing whole lines (~CHUNK_OVERLAP chars) into the next chunk.
    const lines = text.split("\n");
    const tail: string[] = [];
    let t = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].length + t > CHUNK_OVERLAP) break;
      tail.unshift(lines[i]);
      t += lines[i].length + 1;
    }
    window = tail.length ? [tail.join("\n")] : [];
    len = t;
  };

  for (const para of content.split(/\n[ \t]*\n/)) {
    if (!para.trim()) continue;
    if (para.length > CHUNK_TARGET) {
      flush(); // start the monster paragraph on its own
      lineWindow(para, chunks);
      window = [];
      len = 0;
      continue;
    }
    if (len + para.length + 2 > CHUNK_TARGET && window.length) flush();
    window.push(para);
    len += para.length + 2;
  }
  flush();
  return chunks;
}

/** Whole-line sliding window for a single paragraph longer than the target. */
function lineWindow(para: string, chunks: string[]): void {
  let cur: string[] = [];
  let len = 0;
  const flush = () => {
    if (!cur.length) return;
    chunks.push(cur.join("\n"));
    const tail: string[] = [];
    let t = 0;
    for (let i = cur.length - 1; i >= 0; i--) {
      if (cur[i].length + t > CHUNK_OVERLAP) break;
      tail.unshift(cur[i]);
      t += cur[i].length + 1;
    }
    cur = tail;
    len = t;
  };
  for (const line of para.split("\n")) {
    if (len + line.length + 1 > CHUNK_TARGET && cur.length) flush();
    cur.push(line);
    len += line.length + 1;
  }
  flush();
}

/** One chunk per BibTeX entry (split at each line starting with @); any leading
 *  comments/strings before the first entry become their own chunk. */
function bibEntries(content: string): string[] {
  if (!content.trim()) return [];
  return content
    .split(/(?=^@)/m)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/* ---------------- pure: similarity ---------------- */

/** Cosine similarity in [-1, 1]; 0 when either vector is zero. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) na += a[i] * a[i];
  for (let i = 0; i < b.length; i++) nb += b[i] * b[i];
  if (na === 0 || nb === 0) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ---------------- embeddings ---------------- */

/** POST {baseUrl}/embeddings (OpenAI-compatible) and validates the response:
 *  one embedding per input, finite, exactly EMBED_DIMS dimensions. */
export async function embedTexts(endpoint: Endpoint, texts: string[]): Promise<number[][]> {
  if (endpoint.kind === "anthropic") {
    throw new HttpError(400, "Anthropic no ofrece embeddings; usa un proveedor OpenAI-compatible");
  }
  let res: Response;
  try {
    res = await fetch(`${endpoint.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: endpoint.model, input: texts }),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError(502, `No se pudo contactar con ${endpoint.label}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error("embeddings error", endpoint.label, res.status, detail);
    throw new HttpError(502, `${endpoint.label} respondió con un error (${res.status})`);
  }
  let json: { data?: unknown };
  try {
    json = (await res.json()) as { data?: unknown };
  } catch {
    throw new HttpError(502, `${endpoint.label} devolvió una respuesta no válida`);
  }
  const rows = json.data;
  if (!Array.isArray(rows) || rows.length !== texts.length) {
    throw new HttpError(502, `${endpoint.label} devolvió una respuesta de embeddings inesperada`);
  }
  return rows.map((r) => {
    const e = (r as { embedding?: unknown }).embedding;
    if (
      !Array.isArray(e) ||
      e.length === 0 ||
      !e.every((x) => typeof x === "number" && Number.isFinite(x))
    ) {
      throw new HttpError(502, `${endpoint.label} devolvió un embedding no válido`);
    }
    if (e.length !== EMBED_DIMS) {
      throw new HttpError(
        400,
        `El modelo «${endpoint.model}» devuelve ${e.length} dimensiones, pero Folio indexa con ${EMBED_DIMS}; configura un modelo de embeddings de ${EMBED_DIMS} dimensiones`,
      );
    }
    return e as number[];
  });
}

/* ---------------- index + retrieval ---------------- */

/** Who embeds, for which project: chunks are manuscript text, so the project's
 *  AI policy filters the user's embedding endpoint (403 when it forbids it). */
type RagProject = { id: string; aiPolicy: string };

/** Rebuilds the project's RAG index: previous chunks are deleted only after the
 *  new embeddings succeed, so a failed run keeps the old index intact. */
export async function indexProject(userId: string, project: RagProject) {
  const projectId = project.id;
  const endpoint = await resolveProjectEndpoint(userId, project, "embed");
  if (!endpoint) {
    throw new HttpError(503, "Configura un proveedor con modelo de embeddings en Ajustes");
  }
  const files = (await listFilesWithData(projectId))
    .filter((f) => f.data === null && f.content.trim())
    .map((f) => ({ path: f.path, content: f.content }));
  const chunks = chunkFiles(files);
  if (chunks.length > MAX_CHUNKS) {
    throw new HttpError(
      413,
      `El proyecto genera ${chunks.length} fragmentos (máximo ${MAX_CHUNKS}); indexa un proyecto más pequeño`,
    );
  }
  const rows: (typeof schema.ragChunks.$inferInsert)[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const embeddings = await embedTexts(
      endpoint,
      batch.map((c) => c.content),
    );
    batch.forEach((c, j) =>
      rows.push({
        projectId,
        file: c.file,
        idx: c.idx,
        content: c.content,
        embedding: embeddings[j],
      }),
    );
  }
  const updatedAt = new Date();
  await db().delete(schema.ragChunks).where(eq(schema.ragChunks.projectId, projectId));
  for (let i = 0; i < rows.length; i += 500) {
    await db()
      .insert(schema.ragChunks)
      .values(rows.slice(i, i + 500));
  }
  await recordAiUsage(projectId, "embed", endpoint.model).catch(() => {});
  return {
    files: new Set(chunks.map((c) => c.file)).size,
    chunks: rows.length,
    updatedAt,
  };
}

/** Top-k chunks by cosine similarity. No ANN index: every chunk of the project
 *  is scored in memory (1536 dims × a few thousand chunks is fine); upgrade to
 *  pgvector's <=> operator if projects grow past that. */
export async function retrieve(
  userId: string,
  project: RagProject,
  query: string,
  k = TOP_K,
): Promise<Retrieved[]> {
  const endpoint = await resolveProjectEndpoint(userId, project, "embed");
  if (!endpoint) return [];
  const [qv] = await embedTexts(endpoint, [query]);
  const rows = await db()
    .select({
      file: schema.ragChunks.file,
      content: schema.ragChunks.content,
      embedding: schema.ragChunks.embedding,
    })
    .from(schema.ragChunks)
    .where(eq(schema.ragChunks.projectId, project.id));
  return rows
    .map((r) => ({ file: r.file, content: r.content, score: cosine(qv, r.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** {files, chunks, updatedAt} of the index, or null when nothing is indexed. */
export async function indexStatus(projectId: string): Promise<RagStatus | null> {
  const [row] = await db()
    .select({
      chunks: sql<number>`count(*)::int`,
      files: sql<number>`count(distinct ${schema.ragChunks.file})::int`,
      updatedAt: sql<Date | null>`max(${schema.ragChunks.createdAt})`,
    })
    .from(schema.ragChunks)
    .where(eq(schema.ragChunks.projectId, projectId));
  if (!row || row.chunks === 0 || !row.updatedAt) return null;
  // node-postgres hands timestamptz back as a string unless told otherwise;
  // callers get a real Date whatever the driver decides.
  const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  return { files: row.files, chunks: row.chunks, updatedAt };
}

export async function deleteRagIndex(projectId: string) {
  await db().delete(schema.ragChunks).where(eq(schema.ragChunks.projectId, projectId));
}
