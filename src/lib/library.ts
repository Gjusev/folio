import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { resolveProjectEndpoint } from "@/lib/ai-policy";
import { recordAiUsage } from "@/lib/ai-usage";
import { db, schema } from "@/lib/db";
import { fail } from "@/lib/http";
import { DOI_RE } from "@/lib/papers";
import { getEditableProject } from "@/lib/projects";
import { chunkFiles, embedTexts } from "@/lib/rag";

/** Upload cap: 25 MB per PDF, enforced before anything is parsed or stored. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Extraction cap: 400k chars is ~80 pages of dense text; the flag says when we cut. */
const MAX_TEXT_CHARS = 400_000;
/** Texts per /embeddings request (the same provider-side cap rag.ts uses). */
const EMBED_BATCH = 32;

/* ---------------- pure helpers ---------------- */

/** True when the bytes start with the %PDF- magic. */
export function sniffPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes.subarray(0, 5).every((b, i) => b === [0x25, 0x50, 0x44, 0x46, 0x2d][i])
  );
}

/** First DOI in free text (candidates scanned, then validated by papers' DOI_RE
 *  so URL/doi: prefixes are stripped the same way as in search). */
export function detectDoi(text: string): string | null {
  for (const m of text.matchAll(/10\.\d{4,9}\/\S+/gi)) {
    const candidate = m[0].replace(/[.,;:)\]}]+$/, "");
    const doi = DOI_RE.exec(candidate)?.[1];
    if (doi) return doi;
  }
  return null;
}

/** Extracts the text of every page with pdf.js (legacy build, fake worker on
 *  the main thread under Node). `truncated` is honest: true when the 400k-char
 *  cap cut the text short. */
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  // pdf.js may take ownership of the buffer it is handed; the caller still
  // wants its bytes (they get stored), so hand over a copy.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    let total = 0;
    let truncated = false;
    for (let p = 1; p <= doc.numPages && !truncated; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join(""),
      );
      total += pages.at(-1)!.length + 2;
      if (total >= MAX_TEXT_CHARS) truncated = true;
    }
    return { text: pages.join("\n\n").slice(0, MAX_TEXT_CHARS), pages: doc.numPages, truncated };
  } finally {
    await task.destroy();
  }
}

/* ---------------- storage ---------------- */

export type LibraryPaperMeta = {
  id: string;
  title: string;
  filename: string;
  size: number;
  pages: number | null;
  doi: string | null;
  text: boolean; // fullText extracted?
  createdAt: Date;
};

/** Saves an uploaded PDF: magic check, best-effort text extraction (a failure
 *  still saves the file, with fullText null), DOI detection from the text. */
export async function savePaper(
  userId: string,
  input: { filename: string; bytes: Uint8Array },
): Promise<LibraryPaperMeta> {
  if (input.bytes.length > MAX_PDF_BYTES) throw fail(413, "api.library.tooLarge");
  if (!sniffPdf(input.bytes)) throw fail(415, "api.library.notPdf");
  const title = input.filename.replace(/\.pdf$/i, "").trim() || input.filename;
  let extracted: { text: string; pages: number; truncated: boolean } | null = null;
  try {
    extracted = await extractPdfText(input.bytes);
  } catch (err) {
    console.error("library pdf extraction failed", err);
  }
  const [row] = await db()
    .insert(schema.libraryPapers)
    .values({
      userId,
      title: title.slice(0, 300),
      filename: input.filename.slice(0, 300),
      size: input.bytes.length,
      pages: extracted?.pages ?? null,
      data: Buffer.from(input.bytes),
      fullText: extracted?.text || null,
      doi: extracted ? detectDoi(extracted.text) : null,
    })
    .returning({
      id: schema.libraryPapers.id,
      title: schema.libraryPapers.title,
      filename: schema.libraryPapers.filename,
      size: schema.libraryPapers.size,
      pages: schema.libraryPapers.pages,
      doi: schema.libraryPapers.doi,
      fullText: schema.libraryPapers.fullText,
      createdAt: schema.libraryPapers.createdAt,
    });
  const { fullText, ...meta } = row;
  return { ...meta, text: fullText !== null };
}

/** All of the user's papers, each with the projects it is attached to. */
export async function listPapers(
  userId: string,
): Promise<(LibraryPaperMeta & { attachedTo: { projectId: string; name: string }[] })[]> {
  const rows = await db()
    .select({
      id: schema.libraryPapers.id,
      title: schema.libraryPapers.title,
      filename: schema.libraryPapers.filename,
      size: schema.libraryPapers.size,
      pages: schema.libraryPapers.pages,
      doi: schema.libraryPapers.doi,
      fullText: schema.libraryPapers.fullText,
      createdAt: schema.libraryPapers.createdAt,
    })
    .from(schema.libraryPapers)
    .where(eq(schema.libraryPapers.userId, userId))
    .orderBy(desc(schema.libraryPapers.createdAt));
  const links = await db()
    .select({
      paperId: schema.libraryProjectLinks.paperId,
      projectId: schema.libraryProjectLinks.projectId,
      name: schema.projects.name,
    })
    .from(schema.libraryProjectLinks)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.libraryProjectLinks.projectId))
    .innerJoin(
      schema.libraryPapers,
      eq(schema.libraryPapers.id, schema.libraryProjectLinks.paperId),
    )
    .where(eq(schema.libraryPapers.userId, userId));
  const byPaper = new Map<string, { projectId: string; name: string }[]>();
  for (const l of links) {
    const list = byPaper.get(l.paperId) ?? [];
    list.push({ projectId: l.projectId, name: l.name });
    byPaper.set(l.paperId, list);
  }
  return rows.map(({ fullText, ...meta }) => ({
    ...meta,
    text: fullText !== null,
    attachedTo: byPaper.get(meta.id) ?? [],
  }));
}

/** The paper's bytes, for serving the PDF back to its owner. */
export async function getPaperData(
  userId: string,
  paperId: string,
): Promise<{ data: Buffer; title: string; filename: string }> {
  const [row] = await db()
    .select({
      data: schema.libraryPapers.data,
      title: schema.libraryPapers.title,
      filename: schema.libraryPapers.filename,
    })
    .from(schema.libraryPapers)
    .where(and(eq(schema.libraryPapers.id, paperId), eq(schema.libraryPapers.userId, userId)))
    .limit(1);
  if (!row) throw fail(404, "api.library.notFound");
  return row;
}

/** Meta of one owned paper (doi/fullText included, for cite/attach). */
export async function getPaperMeta(userId: string, paperId: string) {
  const [row] = await db()
    .select({
      id: schema.libraryPapers.id,
      title: schema.libraryPapers.title,
      doi: schema.libraryPapers.doi,
      fullText: schema.libraryPapers.fullText,
    })
    .from(schema.libraryPapers)
    .where(and(eq(schema.libraryPapers.id, paperId), eq(schema.libraryPapers.userId, userId)))
    .limit(1);
  if (!row) throw fail(404, "api.library.notFound");
  return row;
}

async function ownedPaper(userId: string, paperId: string) {
  const [row] = await db()
    .select({
      id: schema.libraryPapers.id,
      title: schema.libraryPapers.title,
      fullText: schema.libraryPapers.fullText,
    })
    .from(schema.libraryPapers)
    .where(and(eq(schema.libraryPapers.id, paperId), eq(schema.libraryPapers.userId, userId)))
    .limit(1);
  if (!row) throw fail(404, "api.library.notFound");
  return row;
}

/** Deletes the paper and, for every project it was attached to, the chunks the
 *  attachment had indexed (the link rows cascade with the paper). */
export async function deletePaper(userId: string, paperId: string) {
  const paper = await ownedPaper(userId, paperId);
  const links = await db()
    .select({ projectId: schema.libraryProjectLinks.projectId })
    .from(schema.libraryProjectLinks)
    .where(eq(schema.libraryProjectLinks.paperId, paper.id));
  const label = paperLabel(paper.title);
  for (const { projectId } of links) {
    await db()
      .delete(schema.ragChunks)
      .where(and(eq(schema.ragChunks.projectId, projectId), eq(schema.ragChunks.file, label)));
  }
  await db().delete(schema.libraryPapers).where(eq(schema.libraryPapers.id, paper.id));
}

/** File label under which a library paper is indexed in a project's RAG. */
function paperLabel(title: string) {
  return `library/${title}.pdf`;
}

/**
 * Indexes the paper's extracted text into the project's rag_chunks and records
 * the link. Chunks reuse rag.ts' chunking/embeddings, so the assistant answers
 * from the paper like from any project file. Re-attaching is a no-op; a paper
 * without extracted text is refused with 422 (nothing to index).
 */
export async function attachToProject(
  userId: string,
  paperId: string,
  projectId: string,
): Promise<{ attached: true; chunks: number }> {
  const project = await getEditableProject(userId, projectId);
  const paper = await ownedPaper(userId, paperId);
  if (!paper.fullText?.trim()) throw fail(422, "api.library.noText");
  const [existing] = await db()
    .select({ paperId: schema.libraryProjectLinks.paperId })
    .from(schema.libraryProjectLinks)
    .where(
      and(
        eq(schema.libraryProjectLinks.paperId, paper.id),
        eq(schema.libraryProjectLinks.projectId, project.id),
      ),
    )
    .limit(1);
  if (existing) return { attached: true, chunks: 0 }; // already indexed: idempotent

  const endpoint = await resolveProjectEndpoint(userId, project, "embed");
  if (!endpoint) throw fail(503, "api.ai.notConfigured");
  const label = paperLabel(paper.title);
  const chunks = chunkFiles([{ path: label, content: paper.fullText }]);
  const rows: (typeof schema.ragChunks.$inferInsert)[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const embeddings = await embedTexts(
      endpoint,
      batch.map((c) => c.content),
    );
    batch.forEach((c, j) =>
      rows.push({
        projectId: project.id,
        file: c.file,
        idx: c.idx,
        content: c.content,
        embedding: embeddings[j],
      }),
    );
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db()
      .insert(schema.ragChunks)
      .values(rows.slice(i, i + 500));
  }
  await db()
    .insert(schema.libraryProjectLinks)
    .values({ paperId: paper.id, projectId: project.id })
    .onConflictDoNothing();
  await recordAiUsage(project.id, "embed", endpoint.model).catch(() => {});
  return { attached: true, chunks: rows.length };
}

/** Removes the link and the chunks the attachment had added to the project.
 *  deleteRagIndex() would wipe the whole project index, so this deletes by the
 *  paper's own `library/<title>.pdf` label instead. */
export async function detachFromProject(
  userId: string,
  paperId: string,
  projectId: string,
): Promise<{ attached: false }> {
  await getEditableProject(userId, projectId);
  const paper = await ownedPaper(userId, paperId);
  await db()
    .delete(schema.libraryProjectLinks)
    .where(
      and(
        eq(schema.libraryProjectLinks.paperId, paper.id),
        eq(schema.libraryProjectLinks.projectId, projectId),
      ),
    );
  await db()
    .delete(schema.ragChunks)
    .where(
      and(
        eq(schema.ragChunks.projectId, projectId),
        eq(schema.ragChunks.file, paperLabel(paper.title)),
      ),
    );
  return { attached: false };
}
