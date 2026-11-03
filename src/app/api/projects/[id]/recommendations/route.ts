import { z } from "zod";
import { bibDois } from "@/lib/bibtex";
import { HttpError, enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { recommendPapers } from "@/lib/papers";
import { getViewableProject, listFiles } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ limit: z.coerce.number().int().min(5).max(30).default(20) });

/** Papers like this project's bibliography (DOIs from every .bib file). */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const { limit } = await parseJson(req, body);
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  enforceRateLimit(`recs:${user.id}`, 10, 60_000);

  // DOIs are read server-side from the stored .bib; the client cannot shape them.
  const dois = (await listFiles(project.id))
    .filter((f) => f.path.endsWith(".bib"))
    .flatMap((f) => bibDois(f.content))
    .slice(0, 25);
  if (dois.length === 0)
    throw new HttpError(400, "Sin DOIs en la bibliografía: cita algunos trabajos primero");

  const { engine, results } = await recommendPapers({ dois }, limit);
  return Response.json({ engine, results });
});
