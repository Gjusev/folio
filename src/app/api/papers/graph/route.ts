import { z } from "zod";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { citationGraph } from "@/lib/papers";

const query = z.object({
  source: z.enum(["openalex", "s2", "arxiv"]),
  paperId: z.string().trim().min(2).max(200),
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const { source, paperId } = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  // A graph walk makes a handful of upstream calls; keep its own budget too.
  enforceRateLimit(`graph:${user.id}`, 6, 60_000);
  return Response.json(await citationGraph(source, paperId));
});
