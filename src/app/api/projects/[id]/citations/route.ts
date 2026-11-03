import { NextResponse } from "next/server";
import { z } from "zod";
import { addBibEntry, toBibtex } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { getPaper } from "@/lib/papers";
import { createFile, getEditableProject, getFile, listFiles, saveFile } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  source: z.enum(["openalex", "s2", "arxiv"]),
  // W… for OpenAlex, 40-hex/DOI:…/arXiv:… for S2, arXiv id for arXiv.
  paperId: z.string().min(3).max(120),
});

/**
 * Adds a paper to the project's .bib file. The metadata is fetched again on
 * the server from the right engine, so the client cannot shape the entry.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const { source, paperId } = await parseJson(req, body);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  const paper = await getPaper(source, paperId);
  const { entry } = toBibtex(paper);

  const bibs = (await listFiles(project.id)).filter((f) => f.path.endsWith(".bib"));
  const bib =
    bibs.find((f) => f.path === "references.bib") ??
    bibs[0] ??
    (await createFile(project.id, { path: "references.bib", content: "" }));

  // Read-modify-write guarded by the file version; retry once if a save raced us.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getFile(project.id, bib.id);
    const { content, key, added } = addBibEntry(current.content, entry, {
      doi: paper.doi,
      title: paper.title,
    });
    if (!added) return NextResponse.json({ key, added, file: pick(current) });
    try {
      const saved = await saveFile(project.id, current.id, content, current.version);
      return NextResponse.json({
        key,
        added,
        file: { ...pick(current), content, version: saved.version },
      });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409) || attempt === 1) throw err;
    }
  }
  throw new HttpError(409, "No se pudo actualizar la bibliografía");
});

const pick = (f: { id: string; path: string; content: string; version: number }) => ({
  id: f.id,
  path: f.path,
  content: f.content,
  version: f.version,
  binary: false,
  size: Buffer.byteLength(f.content),
});
