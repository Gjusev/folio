import { NextResponse } from "next/server";
import { z } from "zod";
import { addBibEntry, removeBibEntry, toBibtex } from "@/lib/bibtex";
import { replaceCiteKey } from "@/lib/citation-health";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { getPaper } from "@/lib/papers";
import { getEditableProject, getFile, listFiles, saveFile } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

type FileDocLike = { id: string; path: string; content: string; version: number };

const body = z.object({
  source: z.enum(["openalex", "s2", "arxiv"]),
  paperId: z.string().min(3).max(120),
  /** The preprint key being replaced; its \cite uses are rewritten too. */
  oldKey: z.string().min(1).max(200),
});

/**
 * Replaces one bibliography entry (e.g. an arXiv preprint) with the published
 * version: adds the new entry, drops the old one, and rewrites \cite keys in
 * every .tex file. Every step is a normal versioned save.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getEditableProject(user.id, (await params).id);
  const { source, paperId, oldKey } = await parseJson(req, body);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  const paper = await getPaper(source, paperId);
  const { entry } = toBibtex(paper);

  const files = await listFiles(project.id);
  const bibFile = files.find((f) => f.path.endsWith(".bib") && f.content.includes(`{${oldKey},`));
  if (!bibFile) throw new HttpError(404, "La entrada a sustituir ya no está en la bibliografía");

  // Add the published entry (or reuse it if already there), then drop the
  // preprint, in one versioned save.
  const current = await getFile(project.id, bibFile.id);
  const added = addBibEntry(current.content, entry, { doi: paper.doi, title: paper.title });
  const content = removeBibEntry(added.content, oldKey);
  const changed: FileDocLike[] = [];
  if (content !== current.content) {
    const saved = await saveFile(project.id, current.id, content, current.version);
    changed.push({
      id: current.id,
      path: current.path,
      content,
      version: saved.version,
    });
  }

  // Rewrite \cite{oldKey} → \cite{newKey} wherever it appears.
  let texFiles = 0;
  for (const f of files.filter((x) => x.path.endsWith(".tex"))) {
    if (!f.content.includes(oldKey)) continue;
    const latest = await getFile(project.id, f.id);
    const next = replaceCiteKey(latest.content, oldKey, added.key);
    if (next === latest.content) continue;
    const saved = await saveFile(project.id, f.id, next, latest.version);
    texFiles++;
    changed.push({ id: f.id, path: f.path, content: next, version: saved.version });
  }
  return NextResponse.json({ key: added.key, upgraded: true, texFiles, files: changed });
});
