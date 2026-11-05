import { NextResponse } from "next/server";
import { z } from "zod";
import { addBibEntry, toBibtex } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, fail, parseJson, requireUser, route } from "@/lib/http";
import { getPaperMeta } from "@/lib/library";
import { searchPapers } from "@/lib/papers";
import { createFile, getEditableProject, getFile, listFiles, saveFile } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ projectId: z.uuid() });

/**
 * Adds the library paper to the project's .bib: the DOI detected in the PDF is
 * resolved through OpenAlex (the same service search uses), so the metadata —
 * and therefore the entry — is fetched on the server, never shaped by the
 * client. Falls back to references.bib creation, exactly like cite-from-search.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const { projectId } = await parseJson(req, body);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  const paper = await getPaperMeta(user.id, (await params).id);
  if (!paper.doi) throw fail(422, "api.library.noDoi");
  const project = await getEditableProject(user.id, projectId);

  // A DOI query resolves to the single work (searchOpenAlex handles it).
  const page = await searchPapers("openalex", {
    q: paper.doi,
    sort: "relevance",
    openAccess: false,
    page: 1,
  });
  const work = page.results[0];
  if (!work) throw fail(404, "api.library.noPaper");
  const { entry } = toBibtex(work);

  const bibs = (await listFiles(project.id)).filter((f) => f.path.endsWith(".bib"));
  const bib =
    bibs.find((f) => f.path === "references.bib") ??
    bibs[0] ??
    (await createFile(project.id, { path: "references.bib", content: "" }));

  // Read-modify-write guarded by the file version; retry once if a save raced us.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getFile(project.id, bib.id);
    const { content, key, added } = addBibEntry(current.content, entry, {
      doi: work.doi,
      title: work.title,
    });
    if (!added) return NextResponse.json({ key, added, bibPath: bib.path });
    try {
      await saveFile(project.id, current.id, content, current.version);
      return NextResponse.json({ key, added, bibPath: bib.path });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409) || attempt === 1) throw err;
    }
  }
  throw new HttpError(409, "No se pudo actualizar la bibliografía");
});
