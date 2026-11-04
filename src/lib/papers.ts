import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

// One search box, three free engines, no keys required:
// - OpenAlex: 250M+ works across Crossref, DataCite (arXiv), PubMed. Best recall.
// - Semantic Scholar: strong CS/biomed coverage, citation counts, OA PDF links.
// - arXiv: preprints as published, minutes after upload.
// Fixed hosts everywhere: user input only reaches query parameters.

export type Source = "openalex" | "s2" | "arxiv";
export const SOURCES: Source[] = ["openalex", "s2", "arxiv"];

export type Paper = {
  source: Source;
  id: string; // engine-specific: W…, s2 paperId, arXiv id
  doi?: string;
  arxivId?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  type: string;
  citedBy: number;
  openAccessUrl?: string;
  abstract?: string;
  pages?: string;
};

export type SortOrder = "relevance" | "cited" | "recent";
export type PaperQuery = {
  q: string;
  sort: SortOrder;
  openAccess: boolean;
  fromYear?: number;
  page: number; // 1-based
};

export type PaperPage = { results: Paper[]; hasMore: boolean };

export const DOI_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,9}\/\S+)$/i;
const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}|[a-z-]+\/[0-9]{7})/i;
const ARXIV_ID_RE = /^(?:arxiv:)?([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z-]+\/[0-9]{7})$/i;

const UA = "Folio/0.3 (self-hosted)";

export async function getJson<T>(url: string, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new HttpError(502, `No se pudo contactar con ${what}`);
  }
  if (res.status === 404) throw new HttpError(404, "Trabajo no encontrado");
  if (res.status === 429)
    throw new HttpError(503, `${what} está limitando peticiones, prueba en un momento`);
  if (!res.ok) throw new HttpError(502, `${what} respondió con un error (${res.status})`);
  return (await res.json()) as T;
}

async function getText(url: string, what: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new HttpError(502, `${what} respondió con un error (${res.status})`);
    return await res.text();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `No se pudo contactar con ${what}`);
  }
}

/* ---------------- OpenAlex ---------------- */

const OA_SELECT =
  "id,doi,display_name,publication_year,type,authorships,primary_location,cited_by_count,open_access,abstract_inverted_index";

export type OaWork = {
  id: string;
  doi?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  authorships?: { author: { display_name?: string | null } }[];
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  cited_by_count?: number;
  open_access?: { is_oa?: boolean; oa_url?: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
  referenced_works?: string[] | null;
  related_works?: string[] | null;
  biblio?: {
    volume?: string | null;
    issue?: string | null;
    first_page?: string | null;
    last_page?: string | null;
  };
};

export function abstractFromIndex(
  index: Record<string, number[]> | null | undefined,
): string | undefined {
  if (!index) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ") || undefined;
}

function oaToPaper(w: OaWork): Paper {
  return {
    source: "openalex",
    id: w.id.replace("https://openalex.org/", ""),
    doi: w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined,
    title: w.display_name ?? "(sin título)",
    authors: (w.authorships ?? []).map((a) => a.author.display_name ?? "").filter(Boolean),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    type: w.type ?? "other",
    citedBy: w.cited_by_count ?? 0,
    openAccessUrl: (w.open_access?.is_oa && w.open_access.oa_url) || undefined,
    abstract: abstractFromIndex(w.abstract_inverted_index),
    pages:
      w.biblio?.first_page && w.biblio?.last_page
        ? `${w.biblio.first_page}--${w.biblio.last_page}`
        : (w.biblio?.first_page ?? undefined),
  };
}

export function oaUrl(path: string, params: Record<string, string>) {
  const { OPENALEX_MAILTO, OPENALEX_API_KEY } = env();
  const q = new URLSearchParams({
    ...params,
    ...(OPENALEX_MAILTO ? { mailto: OPENALEX_MAILTO } : {}),
    // A key moves the instance off the shared keyless $0.10/day pool.
    ...(OPENALEX_API_KEY ? { api_key: OPENALEX_API_KEY } : {}),
  });
  return `https://api.openalex.org${path}?${q}`;
}

async function searchOpenAlex(query: PaperQuery): Promise<PaperPage> {
  const per = 15;
  const doi = DOI_RE.exec(query.q.trim())?.[1];
  if (doi) {
    const work = await getJson<OaWork>(
      oaUrl(`/works/doi:${encodeURIComponent(doi)}`, { select: OA_SELECT }),
      "OpenAlex",
    );
    return { results: [oaToPaper(work)], hasMore: false };
  }
  const params: Record<string, string> = {
    search: query.q,
    "per-page": String(per),
    page: String(query.page),
    select: OA_SELECT,
  };
  if (query.sort === "cited") params.sort = "cited_by_count:desc";
  if (query.sort === "recent") params.sort = "publication_date:desc";
  const filters: string[] = [];
  if (query.openAccess) filters.push("is_oa:true");
  if (query.fromYear) filters.push(`from_publication_date:${query.fromYear}-01-01`);
  if (filters.length) params.filter = filters.join(",");
  const data = await getJson<{ results: OaWork[]; meta?: { has_more?: boolean } }>(
    oaUrl("/works", params),
    "OpenAlex",
  );
  return { results: data.results.map(oaToPaper), hasMore: data.meta?.has_more ?? false };
}

async function getOpenAlex(id: string): Promise<Paper> {
  if (!/^W\d{1,12}$/.test(id)) throw new HttpError(400, "Identificador de OpenAlex no válido");
  return oaToPaper(await getJson<OaWork>(oaUrl(`/works/${id}`, { select: OA_SELECT }), "OpenAlex"));
}

/* ---------------- Semantic Scholar ---------------- */

const S2_FIELDS =
  "title,authors,year,abstract,citationCount,openAccessPdf,externalIds,venue,publicationTypes";
const S2_PAGE = 10;

type S2Paper = {
  paperId: string;
  title?: string;
  year?: number;
  abstract?: string | null;
  citationCount?: number;
  openAccessPdf?: { url: string } | null;
  externalIds?: { DOI?: string; ArXiv?: string } | null;
  venue?: string;
  publicationTypes?: string[];
  authors?: { name: string }[];
  journal?: { pages?: string | null } | null;
};

function s2ToPaper(p: S2Paper): Paper {
  const types = p.publicationTypes ?? [];
  const type = types.includes("JournalArticle")
    ? "article"
    : types.includes("Conference")
      ? "conference-paper"
      : types.includes("Review")
        ? "review"
        : "other";
  return {
    source: "s2",
    id: p.paperId,
    doi: p.externalIds?.DOI,
    arxivId: p.externalIds?.ArXiv,
    title: p.title ?? "(sin título)",
    authors: (p.authors ?? []).map((a) => a.name).filter(Boolean),
    year: p.year ?? undefined,
    venue: p.venue || undefined,
    type,
    citedBy: p.citationCount ?? 0,
    openAccessUrl: p.openAccessPdf?.url,
    abstract: p.abstract ?? undefined,
    pages: p.journal?.pages || undefined,
  };
}

async function searchS2(query: PaperQuery): Promise<PaperPage> {
  const doi = DOI_RE.exec(query.q.trim())?.[1];
  const path = doi ? `paper/DOI:${encodeURIComponent(doi)}` : "paper/search";
  const params = new URLSearchParams({ fields: S2_FIELDS });
  if (!doi) {
    params.set("query", query.q);
    params.set("limit", String(S2_PAGE));
    params.set("offset", String((query.page - 1) * S2_PAGE));
    // S2 has no sort options beyond relevance; citation sorting is OpenAlex's job.
  }
  const data = await getJson<{ data?: S2Paper[] | S2Paper }>(
    `https://api.semanticscholar.org/graph/v1/${path}?${params}`,
    "Semantic Scholar",
  );
  const list = Array.isArray(data.data) ? data.data : [data.data as S2Paper];
  return {
    results: list.filter(Boolean).map(s2ToPaper),
    hasMore: !doi && list.length === S2_PAGE,
  };
}

async function getS2(id: string): Promise<Paper> {
  if (!/^[0-9a-f]{40}$/i.test(id) && !DOI_RE.test(id) && !/^arXiv:/i.test(id)) {
    throw new HttpError(400, "Identificador de Semantic Scholar no válido");
  }
  const p = await getJson<S2Paper>(
    `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}?fields=${S2_FIELDS}`,
    "Semantic Scholar",
  );
  return s2ToPaper(p);
}

/* ---------------- arXiv (Atom XML) ---------------- */

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Parses an arXiv Atom feed without an XML dependency (stable format). */
export function parseArxivFeed(xml: string): Paper[] {
  const entries = xml.split(/<entry>/).slice(1);
  const pick = (block: string, tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
    return m ? decodeXml(m[1]).replace(/\s+/g, " ").trim() : "";
  };
  return entries.map((e) => {
    const idUrl = pick(e, "id"); // http://arxiv.org/abs/2401.00001v1
    const arxivId = ARXIV_URL_RE.exec(idUrl)?.[1] ?? idUrl;
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1]).trim());
    return {
      source: "arxiv" as const,
      id: arxivId.replace(/v\d+$/, ""),
      title: pick(e, "title") || "(sin título)",
      authors,
      year: Number(pick(e, "published").slice(0, 4)) || undefined,
      venue: "arXiv",
      type: "preprint",
      citedBy: 0,
      abstract: pick(e, "summary") || undefined,
      openAccessUrl: `https://arxiv.org/abs/${arxivId}`,
      doi: /<arxiv:doi[^>]*>([\s\S]*?)</.exec(e)?.[1]?.trim(),
    } satisfies Paper;
  });
}

async function searchArxiv(query: PaperQuery): Promise<PaperPage> {
  const per = 15;
  const urlId = ARXIV_ID_RE.exec(query.q.trim())?.[1] ?? ARXIV_URL_RE.exec(query.q.trim())?.[1];
  const params = new URLSearchParams({
    max_results: String(per),
    start: String((query.page - 1) * per),
  });
  if (urlId) {
    params.set("id_list", urlId);
  } else {
    const terms = query.q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `all:"${t}"`);
    // URLSearchParams encodes the space as "+", the separator arXiv expects.
    // A literal "+" would be sent as %2B and parsed as an OR-ish token.
    params.set("search_query", terms.join(" AND "));
    params.set("sortBy", query.sort === "recent" ? "submittedDate" : "relevance");
    params.set("sortOrder", "descending");
  }
  const xml = await getText(`https://export.arxiv.org/api/query?${params}`, "arXiv");
  const results = parseArxivFeed(xml);
  return { results, hasMore: results.length === per };
}

async function getArxiv(id: string): Promise<Paper> {
  if (!ARXIV_ID_RE.test(id)) throw new HttpError(400, "Identificador de arXiv no válido");
  const xml = await getText(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
    "arXiv",
  );
  const [paper] = parseArxivFeed(xml);
  if (!paper || /error/.test(paper.title))
    throw new HttpError(404, "Trabajo no encontrado en arXiv");
  return paper;
}

/* ---------------- public API ---------------- */

export async function searchPapers(source: Source, query: PaperQuery): Promise<PaperPage> {
  switch (source) {
    case "openalex":
      return searchOpenAlex(query);
    case "s2":
      return searchS2(query);
    case "arxiv":
      return searchArxiv(query);
  }
}

/**
 * Unified search: asks every engine in parallel and interleaves the results,
 * deduplicating by DOI (OpenAlex wins: richest metadata). A source that fails
 * or rate-limits simply contributes nothing; only a total failure is an error.
 */
export async function searchAllPapers(query: PaperQuery): Promise<PaperPage> {
  const pages = await Promise.allSettled(
    (["openalex", "s2", "arxiv"] as Source[]).map((s) => searchPapers(s, query)),
  );
  const ok = pages.filter((p) => p.status === "fulfilled").map((p) => p.value);
  if (ok.length === 0) {
    const err = pages.find((p) => p.status === "rejected") as PromiseRejectedResult;
    throw err.reason instanceof HttpError
      ? err.reason
      : new HttpError(502, "No se pudo contactar con ningún buscador");
  }
  const byDoi = new Map<string, Paper>();
  const queues = ok.map((p) => [...p.results]);
  const merged: Paper[] = [];
  // Round-robin so every engine gets the top of its list visible.
  for (let i = 0; queues.some((q) => q.length > 0); i++) {
    for (const q of queues) {
      const paper = q.shift();
      if (!paper) continue;
      const key = paper.doi?.toLowerCase() ?? `${paper.source}:${paper.id}`;
      if (byDoi.has(key)) continue;
      byDoi.set(key, paper);
      merged.push(paper);
    }
    if (i > 200) break; // safety valve
  }
  return { results: merged, hasMore: ok.some((p) => p.hasMore) };
}

export async function getPaper(source: Source, id: string): Promise<Paper> {
  switch (source) {
    case "openalex":
      return getOpenAlex(id);
    case "s2":
      return getS2(id);
    case "arxiv":
      return getArxiv(id);
  }
}

// Select shared by every graph-adjacent lookup: metadata + both link lists.
export const NODE_SELECT =
  "id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,referenced_works,related_works";

/** Single work record (free lookup) with the graph select. */
export async function oaWork(id: string): Promise<OaWork> {
  return getJson<OaWork>(
    oaUrl(`/works/${encodeURIComponent(id)}`, { select: NODE_SELECT }),
    "OpenAlex",
  );
}

/** Metadata for up to 100 ids in one call (OpenAlex allows OR over ids.openalex). */
export async function oaBatch(ids: string[]): Promise<OaWork[]> {
  const data = await getJson<{ results: OaWork[] }>(
    oaUrl("/works", {
      filter: `ids.openalex:${ids.slice(0, 100).join("|")}`,
      "per-page": "100",
      select: NODE_SELECT,
    }),
    "OpenAlex",
  );
  return data.results;
}

/* ---------------- recommendations ---------------- */

export type SeedPaper = { source: Source; paperId: string };
export type RecommendationEngine = "s2-list" | "openalex-related";

/**
 * Papers like the given seeds (resolved through their metadata) or like a
 * plain list of DOIs (the project bibliography). Primary engine: Semantic
 * Scholar's list recommendations; its catalogue pools are CS-leaning, so we
 * say which engine produced the results. Fallback: OpenAlex nearest
 * neighbours of the first seed.
 */
export async function recommendPapers(
  seeds: SeedPaper[] | { dois: string[] },
  limit = 20,
): Promise<{ engine: RecommendationEngine; results: Paper[] }> {
  const positive: string[] = [];
  let relatedRef: string | null = null;
  if ("dois" in seeds) {
    for (const doi of seeds.dois.slice(0, 25)) positive.push(`DOI:${doi}`);
    if (seeds.dois.length) relatedRef = `doi:${seeds.dois[0]}`;
  } else {
    for (const s of seeds.slice(0, 25)) {
      if (s.source === "s2") {
        positive.push(s.paperId);
        continue;
      }
      const paper = await getPaper(s.source, s.paperId);
      if (paper.doi) {
        positive.push(`DOI:${paper.doi}`);
        relatedRef ??= `doi:${paper.doi}`;
      } else if (paper.arxivId) {
        positive.push(`ArXiv:${paper.arxivId}`);
      }
    }
  }

  if (positive.length) {
    try {
      const data = await fetch(
        `https://api.semanticscholar.org/recommendations/v1/papers/?fields=${S2_FIELDS}&limit=${limit}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": UA },
          body: JSON.stringify({ positivePaperIds: positive.slice(0, 25) }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (data.ok) {
        const json = (await data.json()) as { recommendedPapers?: S2Paper[] };
        const results = (json.recommendedPapers ?? []).filter(Boolean).map(s2ToPaper);
        if (results.length) return { engine: "s2-list", results };
      }
      // 429/5xx from the free pool: fall through to the OpenAlex fallback.
    } catch {
      // network error: fall through
    }
  }

  if (relatedRef) {
    const work = await oaWork(relatedRef); // free single lookup
    const related = (work.related_works ?? [])
      .map((r) => r.replace("https://openalex.org/", ""))
      .slice(0, 10);
    if (related.length) {
      const results = (await oaBatch(related)).map(oaToPaper);
      if (results.length) return { engine: "openalex-related", results };
    }
  }
  // Only reachable with seeds that produced no positives and no OpenAlex
  // neighbours: both engines came back empty-handed.
  throw new HttpError(503, "Sin recomendaciones ahora mismo; reintenta en unos segundos");
}
