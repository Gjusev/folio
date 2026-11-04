import { z } from "zod";
import { paperDetail } from "@/lib/citation-graph";
import { enforceRateLimit, requireUser, route } from "@/lib/http";

const query = z.object({
  id: z
    .string()
    .trim()
    .regex(/^W\d{1,12}$/, "Identificador de OpenAlex no válido"),
});

/** Full details of one work: abstract, summary, topics, links. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const { id } = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  return Response.json(await paperDetail(id));
});
