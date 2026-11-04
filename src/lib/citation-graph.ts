// Engine behind the literature explorer: fetches the origin's references,
// a citing sample and the co-cited candidates from OpenAlex (CC0), scores
// similarity (graph-similarity.ts) and assembles the CitationGraph contract
// with in-process caching and honest truncation flags.
//
// List-call budget per graph: references (1) + citers (2) + co-cited/related
// (3) + prior-works metadata (4). Single-record lookups are free.

import "server-only";
import {
  DOI_RE,
  NODE_SELECT,
  abstractFromIndex,
  getJson,
  getPaper,
  oaBatch,
  oaUrl,
  oaWork,
  type OaWork,
  type Source,
} from "./papers";
import { HttpError } from "./http";
import {
  NODE_LIMIT,
  buildSimilarityGraph,
  coCitedCandidates,
  derivativeCandidates,
  priorCandidates,
  unifyDuplicates,
  type SimWork,
} from "./graph-similarity";
import type { CitationGraph, GraphNode, OutsideWork, PaperDetail } from "./graph-types";

const MAX_CITERS = 100; // one page, one list call
const MAX_CITERS_AS_NODES = 30; // the citing sample scores; only the top citers join the graph
const MAX_COCITED = 40;
const MAX_RELATED = 10;
const MAX_PRIOR = 15;
const BIB_NODE_LIMIT = 100;

/* ---------------- caches ---------------- */

function lru<V>(ttlMs: number, max: number) {
  const map = new Map<string, { at: number; value: V }>();
  return {
    get(key: string): V | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      // LRU touch: re-insert as most recently used.
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key: string, value: V) {
      map.set(key, { at: Date.now(), value });
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
  };
}

const graphCache = lru<CitationGraph>(6 * 3600_000, 100);
const detailCache = lru<PaperDetail>(24 * 3600_000, 500);
const building = new Map<string, Promise<CitationGraph>>();

/** Runs `make()` once per key: concurrent requests share the construction. */
async function once(key: string, make: () => Promise<CitationGraph>): Promise<CitationGraph> {
  const cached = graphCache.get(key);
  if (cached) return cached;
  const pending = building.get(key);
  if (pending) return pending;
  const p = make().then((graph) => {
    graphCache.set(key, graph);
    return graph;
  });
  // Store the SAME promise the caller awaits: a detached .catch copy would
  // reject with nobody listening (vitest fails the run on it). Errors are
  // never cached — the map entry is dropped in finally, so a retry starts clean.
  building.set(key, p);
  try {
    return await p;
  } finally {
    building.delete(key);
  }
}

/* ---------------- mapping ---------------- */

const strip = (url: string) => url.replace("https://openalex.org/", "");

function toSimWork(w: OaWork): SimWork {
  return {
    id: strip(w.id),
    refs: (w.referenced_works ?? []).map(strip),
    title: w.display_name ?? "(sin título)",
    authors: (w.authorships ?? [])
      .map((a) => a.author.display_name ?? "")
      .filter(Boolean)
      .slice(0, 4),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    citedBy: w.cited_by_count ?? 0,
    doi: w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined,
  };
}

function toGraphNode(n: ReturnType<typeof buildSimilarityGraph>["nodes"][number]): GraphNode {
  return {
    id: n.id,
    title: n.title ?? "(sin título)",
    authors: n.authors ?? [],
    year: n.year,
    venue: n.venue,
    citedBy: n.citedBy ?? 0,
    doi: n.doi,
    role: n.role,
    sim: n.sim,
    shared: n.shared,
    cocited: n.cocited,
    inGraphCitedBy: n.inGraphCitedBy,
    inGraphRefs: n.inGraphRefs,
  };
}

function toOutsideWork(w: OaWork, links: number): OutsideWork {
  return {
    id: strip(w.id),
    title: w.display_name ?? "(sin título)",
    authors: (w.authorships ?? [])
      .map((a) => a.author.display_name ?? "")
      .filter(Boolean)
      .slice(0, 4),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    citedBy: w.cited_by_count ?? 0,
    doi: w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined,
    links,
  };
}

/** Metadata for a batch of ids, mapped with their link counts. */
async function outsideBatch(wanted: { id: string; links: number }[]): Promise<OutsideWork[]> {
  if (wanted.length === 0) return [];
  try {
    const works = await oaBatch(wanted.map((w) => w.id));
    const byId = new Map(works.map((w) => [strip(w.id), w]));
    return wanted
      .map((w) => {
        const meta = byId.get(w.id);
        return meta ? toOutsideWork(meta, w.links) : undefined;
      })
      .filter((x): x is OutsideWork => !!x);
  } catch {
    return []; // the lists are a bonus; the graph stays useful without them
  }
}

/* ---------------- the graph around one paper ---------------- */

async function fetchCiters(originId: string): Promise<{ works: OaWork[]; truncated: boolean }> {
  const data = await getJson<{ results: OaWork[]; meta?: { has_more?: boolean } }>(
    oaUrl("/works", {
      filter: `cites:${originId}`,
      sort: "cited_by_count:desc",
      "per-page": String(MAX_CITERS),
      select: NODE_SELECT,
    }),
    "OpenAlex",
  );
  return { works: data.results ?? [], truncated: data.meta?.has_more === true };
}

/**
 * The similarity graph around one paper (Connected-Papers style). Citations
 * feed the similarity, they are not the picture: what you see is the field —
 * papers that share references with the origin, are co-cited with it, cite it
 * or are cited by it.
 */
export async function citationGraph(
  source: Source | "doi",
  paperId: string,
): Promise<CitationGraph> {
  const key = `origin:${source}:${paperId.toLowerCase()}`;
  return once(key, () => buildCitationGraph(source, paperId));
}

async function buildCitationGraph(source: Source | "doi", paperId: string): Promise<CitationGraph> {
  // Resolve any source to the origin's OpenAlex record.
  let ref: string;
  if (source === "openalex") {
    if (!/^W\d{1,12}$/.test(paperId))
      throw new HttpError(400, "Identificador de OpenAlex no válido");
    ref = paperId;
  } else if (source === "doi") {
    if (!DOI_RE.test(paperId)) throw new HttpError(400, "DOI no válido");
    ref = `doi:${paperId}`;
  } else {
    const paper = await getPaper(source, paperId);
    if (!paper.doi)
      throw new HttpError(400, "Ese trabajo no tiene DOI; busca su versión de OpenAlex");
    ref = `doi:${paper.doi}`;
  }
  const seedWork = await oaWork(ref);
  const origin = toSimWork(seedWork);
  let truncated = false;

  // Phase 1 — references and citers in parallel; either may fail or be capped.
  const refs = (seedWork.referenced_works ?? []).map(strip).slice(0, 100);
  if ((seedWork.referenced_works ?? []).length > refs.length) truncated = true;
  const [refsSettled, citersSettled] = await Promise.allSettled([
    refs.length ? oaBatch(refs) : Promise.resolve<OaWork[]>([]),
    fetchCiters(origin.id),
  ]);
  const refWorks = refsSettled.status === "fulfilled" ? refsSettled.value : [];
  if (refsSettled.status === "rejected") truncated = true;
  const citersRaw = citersSettled.status === "fulfilled" ? citersSettled.value.works : [];
  if (
    citersSettled.status === "rejected" ||
    (citersSettled.status === "fulfilled" && citersSettled.value.truncated)
  )
    truncated = true;
  const citers = citersRaw.map(toSimWork);
  // The whole sample scores co-citation; only the top citers join the pool as
  // node candidates — as raw records: the pool is mapped OaWork → SimWork
  // below, and mapping an already-mapped SimWork would wipe its references.
  const citersAsNodeWorks = [...citersRaw]
    .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
    .slice(0, MAX_CITERS_AS_NODES);

  // Phase 2 — co-cited candidates (from the citing sample, in memory) plus
  // OpenAlex's own "related" list: one metadata batch for the whole ring.
  const known = new Set([
    origin.id,
    ...refWorks.map((w) => strip(w.id)),
    ...citersAsNodeWorks.map((w) => strip(w.id)),
  ]);
  const cocited = coCitedCandidates(origin.id, citers, known, MAX_COCITED);
  const related = (seedWork.related_works ?? [])
    .map(strip)
    .filter((id) => !known.has(id))
    .slice(0, MAX_RELATED);
  const ringIds = [...new Set([...cocited, ...related])].slice(0, MAX_COCITED + MAX_RELATED);
  const ringWorks = ringIds.length ? await oaBatch(ringIds).catch(() => [] as OaWork[]) : [];
  if (ringIds.length && ringWorks.length < ringIds.length) truncated = true;

  // Unify duplicates (preprint ↔ published records of the same paper), then
  // score and select. The origin survives unification whatever its citations.
  const pool = [seedWork, ...refWorks, ...citersAsNodeWorks, ...ringWorks].map(toSimWork);
  const { works, alias } = unifyDuplicates(pool, new Set([origin.id]));
  const originId = alias.get(origin.id) ?? origin.id;
  const citersUnified = citers.map((c) => ({ ...c, id: alias.get(c.id) ?? c.id }));
  const { nodes, edges } = buildSimilarityGraph({
    works,
    seeds: [originId],
    citers: citersUnified,
    nodeLimit: NODE_LIMIT,
  });
  if (nodes.length === 1) {
    return {
      seed: originId,
      nodes: nodes.map(toGraphNode),
      edges: [],
      prior: [],
      derivative: [],
      truncated,
    };
  }

  // Works outside the graph worth knowing about — prior first (one batch),
  // derivative straight from the citing sample already in memory.
  const inGraph = new Set(nodes.map((n) => n.id));
  const prior = await outsideBatch(priorCandidates(works, inGraph, MAX_PRIOR));
  const citersById = new Map(citersUnified.map((c) => [c.id, c]));
  const derivative: OutsideWork[] = derivativeCandidates(citersUnified, inGraph, MAX_PRIOR)
    .map((d): OutsideWork | undefined => {
      const c = citersById.get(d.id);
      if (!c) return undefined;
      return {
        id: c.id,
        title: c.title ?? "(sin título)",
        authors: c.authors ?? [],
        year: c.year,
        venue: c.venue,
        citedBy: c.citedBy ?? 0,
        doi: c.doi,
        links: d.links,
      };
    })
    .filter((x): x is OutsideWork => !!x);

  return {
    seed: originId,
    nodes: nodes.map(toGraphNode),
    edges,
    prior,
    derivative,
    truncated,
  };
}

/* ---------------- the bibliography graph ---------------- */

/**
 * The graph of the project's own papers: the .bib's DOIs as seeds ("mine"),
 * what they cite as the ring, similarity edges between everything — including
 * seed→seed citations. Two list calls at most: none (seeds are free lookups)
 * and the ring batch.
 */
export async function bibliographyGraph(dois: string[]): Promise<CitationGraph> {
  const clean = [...new Set(dois.map((d) => d.trim().toLowerCase()))].slice(0, 25);
  const key = `bib:${clean.slice().sort().join(",")}`;
  const cached = graphCache.get(key);
  if (cached) return cached;
  const pending = building.get(key);
  if (pending) return pending;
  const p = (async (): Promise<CitationGraph> => {
    const seedResults = await Promise.allSettled(clean.map((d) => oaWork(`doi:${d}`)));
    const seedWorks = seedResults
      .filter((r): r is PromiseFulfilledResult<OaWork> => r.status === "fulfilled")
      .map((r) => r.value);
    if (seedWorks.length === 0)
      throw new HttpError(404, "Ningún DOI de la bibliografía resolvió en OpenAlex");

    const seedIds = new Set(seedWorks.map((w) => strip(w.id)));
    const ringIds: string[] = [];
    const seen = new Set(seedIds);
    for (const w of seedWorks)
      for (const r of w.referenced_works ?? []) {
        const id = strip(r);
        if (!seen.has(id)) {
          seen.add(id);
          ringIds.push(id);
        }
      }
    const truncated = ringIds.length > 100;
    const ringWorks = ringIds.length
      ? await oaBatch(ringIds.slice(0, 100)).catch(() => [] as OaWork[])
      : [];

    const pool = [...seedWorks, ...ringWorks].map(toSimWork);
    const { works, alias } = unifyDuplicates(pool, new Set(seedIds));
    const seeds = [...seedIds].map((id) => alias.get(id) ?? id);
    const { nodes, edges } = buildSimilarityGraph({
      works,
      seeds,
      citers: [],
      nodeLimit: BIB_NODE_LIMIT,
      roleOf: (w) => (seeds.includes(w.id) ? "mine" : "prior"),
    });
    graphCache.set(key, {
      seed: "",
      nodes: nodes.map(toGraphNode),
      edges,
      prior: [],
      derivative: [],
      truncated,
    });
    return graphCache.get(key)!;
  })();
  building.set(key, p);
  try {
    return await p;
  } finally {
    building.delete(key);
  }
}

/* ---------------- one paper's full details ---------------- */

const DETAIL_SELECT = [
  "id",
  "doi",
  "display_name",
  "publication_year",
  "type",
  "authorships",
  "primary_location",
  "cited_by_count",
  "referenced_works_count",
  "open_access",
  "best_oa_location",
  "abstract_inverted_index",
  "topics",
].join(",");

type OaDetail = OaWork & {
  referenced_works_count?: number;
  topics?: { display_name?: string }[];
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null;
  primary_location?: {
    source?: { display_name?: string | null } | null;
    landing_page_url?: string | null;
  } | null;
};

/** Everything the details panel shows; the S2 one-sentence summary is a
 *  best-effort extra that fails silently. */
export async function paperDetail(id: string): Promise<PaperDetail> {
  if (!/^W\d{1,12}$/.test(id)) throw new HttpError(400, "Identificador de OpenAlex no válido");
  const cached = detailCache.get(id);
  if (cached) return cached;

  const w = await getJson<OaDetail>(
    oaUrl(`/works/${encodeURIComponent(id)}`, { select: DETAIL_SELECT }),
    "OpenAlex",
  );
  const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "") || undefined;
  const abstract = abstractFromIndex(w.abstract_inverted_index);

  // One-sentence summary from Semantic Scholar — 3 s budget, silent failure.
  let tldr: string | undefined;
  if (doi) {
    tldr = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=tldr`,
      { signal: AbortSignal.timeout(3_000), headers: { "user-agent": "Folio/0.3 (self-hosted)" } },
    )
      .then(async (r) =>
        r.ok ? ((await r.json()) as { tldr?: { text?: string } }).tldr?.text : undefined,
      )
      .catch(() => undefined);
  }

  const pdf = w.best_oa_location?.pdf_url ?? undefined;
  const landing = w.primary_location?.landing_page_url ?? undefined;
  const arxivFromDoi = doi?.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1];
  const detail: PaperDetail = {
    id,
    title: w.display_name ?? "(sin título)",
    authors: (w.authorships ?? [])
      .map((a) => a.author.display_name ?? "")
      .filter(Boolean)
      .slice(0, 50),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    type: w.type ?? undefined,
    doi,
    arxivId: arxivFromDoi,
    citedBy: w.cited_by_count ?? 0,
    referencesCount: w.referenced_works_count ?? 0,
    abstract,
    openAccessUrl: w.open_access?.is_oa ? (pdf ?? w.open_access.oa_url ?? undefined) : pdf,
    landingUrl: landing && landing !== `https://doi.org/${doi}` ? landing : undefined,
    openalexUrl: `https://openalex.org/${id}`,
    topics: (w.topics ?? [])
      .map((t) => t.display_name ?? "")
      .filter(Boolean)
      .slice(0, 5),
    isOa: w.open_access?.is_oa === true,
    tldr,
  };
  detailCache.set(id, detail);
  return detail;
}
