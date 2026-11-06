import { env } from "@/lib/env";
import { checkGrammar } from "@/lib/grammar";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/**
 * LanguageTool over the prose of the stored .tex sources (LaTeX, math and
 * comments stripped; matches mapped back to source lines). `{ off: true }`
 * when LANGUAGETOOL_URL is unset; a down server answers 200 `{ error:
 * "unreachable" }` so the UI degrades to chktex alone.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const url = env().LANGUAGETOOL_URL;
  if (!url) return Response.json({ off: true });
  enforceRateLimit(`grammar:${user.id}`, 10, 60_000);
  const files = await listFilesWithData(project.id);
  return Response.json(await checkGrammar(url, project.mainFile, files));
});
