import { z } from "zod";
import { synctexQuery, type SynctexQuery } from "@/lib/compiler";
import { enforceRateLimit, parseJson, requireUser, route } from "@/lib/http";
import { getViewableProject, listFilesWithData } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

const body = z.union([
  z.object({
    mode: z.literal("view"),
    line: z.number().int().min(1),
    col: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("edit"),
    page: z.number().int().min(1),
    x: z.number().min(0),
    y: z.number().min(0),
  }),
]);

/** Exact PDF↔source sync (costs a recompile inside the isolated service). */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const project = await getViewableProject(user.id, (await params).id);
  const query = (await parseJson(req, body)) as SynctexQuery;
  enforceRateLimit(`synctex:${user.id}`, 20, 60_000);
  const files = await listFilesWithData(project.id);
  const r = await synctexQuery(project.mainFile, files, query);
  return Response.json(r);
});
