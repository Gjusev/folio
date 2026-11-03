import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, requireUser, route } from "@/lib/http";
import { SOURCES, searchAllPapers, searchPapers, type Source } from "@/lib/papers";

const query = z.object({
  q: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(300),
  source: z.enum(["all", "openalex", "s2", "arxiv"]).default("all"),
  sort: z.enum(["relevance", "cited", "recent"]).default("relevance"),
  oa: z.enum(["0", "1"]).default("0"),
  from: z.coerce.number().int().min(1900).max(2100).optional(),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const params = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  enforceRateLimit(`papers:${user.id}`, 30, 60_000);
  const { source, q, sort, oa, from, page } = params;
  // Engines degrade unsupported sorts to relevance internally.
  const search = {
    q,
    sort,
    openAccess: oa === "1" && source !== "arxiv", // arXiv is always open
    fromYear: from,
    page,
  };
  const page_data =
    source === "all" ? await searchAllPapers(search) : await searchPapers(source as Source, search);
  return NextResponse.json({
    results: page_data.results,
    hasMore: page_data.hasMore,
    sources: SOURCES,
  });
});
