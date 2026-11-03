import { z } from "zod";
import { parseJson, requireUser, route } from "@/lib/http";
import { getRoutes, setRoutes } from "@/lib/llm-profiles";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return Response.json(await getRoutes(user.id));
});

const putBody = z.object({
  search: z.string().nullable(),
  draft: z.string().nullable(),
  embed: z.string().nullable(),
});

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, putBody);
  await setRoutes(user.id, input);
  return Response.json(await getRoutes(user.id));
});
