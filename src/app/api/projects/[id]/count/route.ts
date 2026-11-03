import { countProject } from "@/lib/compiler";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Word/heading/float counts via texcount in the isolated service. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  enforceRateLimit(`count:${user.id}`, 30, 60_000);
  const files = await listFilesWithData(project.id);
  const r = await countProject(project.mainFile, files);
  return Response.json(r);
});
