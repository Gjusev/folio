// Pure similarity engine for the citation graph (Connected-Papers style):
// bibliographic coupling + weighted co-citation + a direct-citation bonus,
// node selection with role floors, degree-capped edge selection, and OpenAlex
// duplicate unification. No I/O — the engine in citation-graph.ts feeds it.

import { normalizeTitle } from "./bib-entries";
import type { GraphEdge, GraphRole } from "./graph-types";

/* ---------------- types ---------------- */

export type SimWork = {
  id: string; // OpenAlex work id
  refs: string[]; // ids this work cites
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  citedBy?: number;
  doi?: string;
};

export type SimNode = SimWork & {
  role: GraphRole;
  /** Best similarity to a seed (a seed itself: 1). */
  sim: number;
  /** References shared with the (best) seed. */
  shared: number;
  /** Citing-sample members that cite both this work and a seed. */
  cocited: number;
  /** Graph papers that cite this one. */
  inGraphCitedBy: number;
  /** Graph papers this one cites. */
  inGraphRefs: number;
};

export type SimEdge = GraphEdge;

export const NODE_LIMIT = 70;
export const MAX_DEGREE = 8;
/** Minimum normalized-title length before two records can be duplicates. */
const DUP_MIN_TITLE = 16;
/** |Δyear| beyond which same-title records are different papers. */
const DUP_YEAR_WINDOW = 1;
/** Node floors kept per role even when look-alikes outscore them. */
const DEFAULT_FLOORS: Record<"prior" | "derivative", number> = { prior: 8, derivative: 12 };
// Similarity mix. Bibliographic coupling and co-citation carry the field;
// a direct citation is a strong signal but must not drown both.
const W_COUPLING = 0.45;
const W_COCITATION = 0.45;
const W_DIRECT = 0.25;

/* ---------------- citing-sample weights (Adamic-Adar) ---------------- */

/** A survey with 300 references weighs less than a paper with 10. */
export function citerWeight(refCount: number): number {
  return 1 / Math.log(2 + Math.max(0, refCount));
}

/* ---------------- pairwise similarity ---------------- */

export type Scorer = {
  sim: (a: string, b: string) => number;
  bc: (a: string, b: string) => number;
  cocit: (a: string, b: string) => number;
  direct: (a: string, b: string) => boolean;
};

/**
 * Similarity over a candidate pool plus the citing sample. `bc` is the
 * textbook bibliographic coupling |A∩B|/√(|A||B|); `cocit` is the same cosine
 * over the citing sample with Adamic-Adar weights; `sim` combines them and a
 * direct-citation bonus, clamped to [0,1]. All symmetric, never NaN.
 */
export function createScorer(works: SimWork[], citers: SimWork[]): Scorer {
  const refs = new Map<string, Set<string>>();
  for (const w of works) refs.set(w.id, new Set(w.refs));

  // Co-citation index: per-work weighted citation mass and per-pair mass.
  const mass = new Map<string, number>();
  const pair = new Map<string, number>();
  for (const c of citers) {
    const w = citerWeight(c.refs.length);
    const cited = c.refs.filter((r) => refs.has(r)); // only pool members matter
    for (const id of cited) mass.set(id, (mass.get(id) ?? 0) + w);
    for (let i = 0; i < cited.length; i++)
      for (let j = i + 1; j < cited.length; j++) {
        const key = cited[i] < cited[j] ? `${cited[i]}|${cited[j]}` : `${cited[j]}|${cited[i]}`;
        pair.set(key, (pair.get(key) ?? 0) + w);
      }
  }

  const bc = (a: string, b: string): number => {
    const A = refs.get(a);
    const B = refs.get(b);
    if (!A || !B || A.size === 0 || B.size === 0) return 0;
    let shared = 0;
    for (const r of A) if (B.has(r)) shared++;
    return shared / Math.sqrt(A.size * B.size);
  };
  const cocit = (a: string, b: string): number => {
    const ma = mass.get(a) ?? 0;
    const mb = mass.get(b) ?? 0;
    if (ma === 0 || mb === 0) return 0;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    return (pair.get(key) ?? 0) / Math.sqrt(ma * mb);
  };
  const direct = (a: string, b: string): boolean =>
    refs.get(a)?.has(b) === true || refs.get(b)?.has(a) === true;

  return {
    bc,
    cocit,
    direct,
    sim: (a: string, b: string) =>
      Math.min(
        1,
        W_COUPLING * bc(a, b) + W_COCITATION * cocit(a, b) + (direct(a, b) ? W_DIRECT : 0),
      ),
  };
}

/* ---------------- co-cited candidates ---------------- */

/**
 * Works co-cited with the origin by the citing sample, best first: the pool
 * for the "related" ring. Excludes the origin and known ids; one-off noise
 * (a single co-citer) is dropped unless the sample itself is tiny.
 */
export function coCitedCandidates(
  origin: string,
  citers: SimWork[],
  known: Set<string>,
  limit: number,
): string[] {
  const originRefs = new Set(citers.filter((c) => c.refs.includes(origin)));
  const minCociters = citers.length >= 4 ? 2 : 1;
  const score = new Map<string, number>();
  const cociters = new Map<string, number>();
  for (const c of originRefs) {
    const w = citerWeight(c.refs.length);
    for (const r of c.refs) {
      if (r === origin || known.has(r)) continue;
      score.set(r, (score.get(r) ?? 0) + w);
      cociters.set(r, (cociters.get(r) ?? 0) + 1);
    }
  }
  return [...score.entries()]
    .filter(
      ([id, s]) =>
        s > 0 && id !== origin && !known.has(id) && (cociters.get(id) ?? 0) >= minCociters,
    )
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([id]) => id);
}

/* ---------------- duplicate unification ---------------- */

/**
 * Merges OpenAlex records of the same paper (same normalized title, years at
 * most DUP_YEAR_WINDOW apart): the most cited record survives (a protected id
 * — the origin — always wins), references union (self-references dropped),
 * and every other work's references follow the alias.
 */
export function unifyDuplicates(
  works: SimWork[],
  protectedIds: Set<string>,
): { works: SimWork[]; alias: Map<string, string> } {
  // The same record can reach the pool twice — a reference that also shows up
  // in the citing sample (OpenAlex's citation graph is not acyclic-clean).
  // Same id IS the same paper: drop the repeats before title-matching (an id
  // repeated downstream would render the same node twice).
  const seen = new Set<string>();
  works = works.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));

  // Group by normalized title, then chain-merge same-title records whose
  // publication years are close (preprint 2018 / published 2019).
  const byTitle = new Map<string, SimWork[]>();
  for (const w of works) {
    if (!w.title) continue;
    const key = normalizeTitle(w.title);
    if (key.length < DUP_MIN_TITLE) continue; // short titles merge nothing
    const group = byTitle.get(key);
    if (group) group.push(w);
    else byTitle.set(key, [w]);
  }

  const alias = new Map<string, string>();
  const mergedAway = new Set<string>();
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    const clusters: SimWork[][] = [];
    for (const w of group) {
      const last = clusters.at(-1);
      if (last && Math.abs((w.year ?? 0) - (last[0].year ?? 0)) <= DUP_YEAR_WINDOW) last.push(w);
      else clusters.push([w]);
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const canonical =
        cluster.find((w) => protectedIds.has(w.id)) ??
        [...cluster].sort(
          (a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0) || (a.id < b.id ? -1 : 1),
        )[0];
      for (const w of cluster)
        if (w.id !== canonical.id) {
          alias.set(w.id, canonical.id);
          mergedAway.add(w.id);
        }
      // The canonical absorbs the cluster's references (aliases applied later).
      canonical.refs = [...new Set(cluster.flatMap((w) => w.refs))];
    }
  }

  const out = works
    .filter((w) => !mergedAway.has(w.id))
    .map((w) => ({
      ...w,
      refs: [...new Set(w.refs.map((r) => alias.get(r) ?? r))].filter((r) => r !== w.id),
    }));
  return { works: out, alias };
}

/* ---------------- roles ---------------- */

/**
 * Role of a work relative to the origin. A record that both cites and is
 * cited (preprint ↔ published) falls back to publication year: the older one
 * is the prior work.
 */
export function originRoles(origin: SimWork): (w: SimWork) => GraphRole {
  const originYear = origin.year ?? 0;
  return (w) => {
    const citesOrigin = w.refs.includes(origin.id);
    const citedByOrigin = origin.refs.includes(w.id);
    if (citedByOrigin && !citesOrigin) return "prior";
    if (citesOrigin && citedByOrigin)
      return w.year !== undefined && w.year !== originYear
        ? w.year < (origin.year ?? 0)
          ? "prior"
          : "derivative"
        : "related";
    if (citesOrigin && !citedByOrigin) return "derivative";
    return "related";
  };
}

/* ---------------- graph construction ---------------- */

export type BuildOptions = {
  works: SimWork[];
  /** Origin (single) or the user's own papers (bibliography mode). */
  seeds: string[];
  /** Citing sample for co-citation (outside the pool or part of it). */
  citers?: SimWork[];
  nodeLimit?: number;
  /** Role floors; pass `{}` to disable (tests, honest truncation). */
  floors?: Partial<Record<"prior" | "derivative", number>>;
  /** Bibliography mode: role of every work (seeds are "mine"). */
  roleOf?: (w: SimWork) => GraphRole;
};

type Ranked = { work: SimWork; sim: number; shared: number; cocited: number };

/**
 * The similarity graph: the seeds, the works most similar to them (with role
 * floors so direct citers never vanish), and degree-capped edges — every
 * selected paper keeps its best link even past the cap, so nothing orphans.
 * Deterministic: same input (any order) → same output.
 */
export function buildSimilarityGraph(opts: BuildOptions): { nodes: SimNode[]; edges: SimEdge[] } {
  const { works, seeds, citers = [], nodeLimit = NODE_LIMIT, floors = DEFAULT_FLOORS } = opts;
  const byId = new Map(works.map((w) => [w.id, w]));
  const seedList = seeds.filter((s) => byId.has(s));
  if (seedList.length === 0) return { nodes: [], edges: [] };
  const seedSet = new Set(seedList);
  const scorer = createScorer(works, citers);
  const bibMode = seedList.length > 1 || !!opts.roleOf;
  const natural = originRoles(byId.get(seedList[0])!);
  const roleFn =
    opts.roleOf ??
    (bibMode
      ? (w: SimWork) => (seedSet.has(w.id) ? "mine" : "prior")
      : (w: SimWork) => (w.id === seedList[0] ? "origin" : natural(w)));

  // Rank every work by its best similarity to a seed (and the seed overlap).
  const ranked: Ranked[] = [];
  for (const w of works) {
    if (seedSet.has(w.id)) {
      ranked.push({ work: w, sim: 1, shared: 0, cocited: 0 });
      continue;
    }
    let sim = 0;
    let shared = 0;
    let cocited = 0;
    for (const s of seedList) {
      sim = Math.max(sim, scorer.sim(w.id, s));
      const sw = byId.get(s)!;
      shared = Math.max(shared, w.refs.filter((r) => sw.refs.includes(r)).length);
      cocited = Math.max(
        cocited,
        citers.filter((c) => c.refs.includes(w.id) && c.refs.includes(s)).length,
      );
    }
    if (sim > 0) ranked.push({ work: w, sim, shared, cocited });
  }
  ranked.sort(
    (a, b) =>
      Number(seedSet.has(b.work.id)) - Number(seedSet.has(a.work.id)) ||
      b.sim - a.sim ||
      (a.work.id < b.work.id ? -1 : 1),
  );

  // Selection: seeds always in; the rest by rank, with role floors that swap
  // out the weakest picks (direct citers must not be crowded out by look-alikes).
  const limit = Math.max(seedList.length + 1, nodeLimit);
  let selected: Ranked[] = [];
  const rest: Ranked[] = [];
  for (const r of ranked) (selected.length < limit ? selected : rest).push(r);
  if (!bibMode && floors && ((floors.prior ?? 0) > 0 || (floors.derivative ?? 0) > 0)) {
    const count = (role: GraphRole) => selected.filter((r) => roleFn(r.work) === role).length;
    for (const role of ["derivative", "prior"] as const) {
      const want = floors[role] ?? 0;
      for (let have = count(role); have < want; have++) {
        const incoming = rest.findIndex((r) => roleFn(r.work) === role);
        if (incoming === -1) break;
        const swapOut = [...selected]
          .reverse()
          .find((r) => !seedSet.has(r.work.id) && roleFn(r.work) === "related");
        if (!swapOut) break;
        selected = selected.map((r) => (r === swapOut ? rest.splice(incoming, 1)[0] : r));
      }
    }
    selected.sort(
      (a, b) =>
        Number(seedSet.has(b.work.id)) - Number(seedSet.has(a.work.id)) ||
        b.sim - a.sim ||
        (a.work.id < b.work.id ? -1 : 1),
    );
  }
  const chosen = new Set(selected.map((r) => r.work.id));

  // In-graph citation counts over the final node set.
  const inGraphCitedBy = new Map<string, number>();
  const inGraphRefs = new Map<string, number>();
  for (const r of selected) {
    inGraphCitedBy.set(r.work.id, 0);
    inGraphRefs.set(r.work.id, 0);
  }
  for (const r of selected)
    for (const ref of r.work.refs)
      if (chosen.has(ref) && ref !== r.work.id) {
        inGraphRefs.set(r.work.id, (inGraphRefs.get(r.work.id) ?? 0) + 1);
        inGraphCitedBy.set(ref, (inGraphCitedBy.get(ref) ?? 0) + 1);
      }

  const nodes: SimNode[] = selected.map((r) => ({
    ...r.work,
    role: roleFn(r.work),
    sim: r.sim,
    shared: r.shared,
    cocited: r.cocited,
    inGraphCitedBy: inGraphCitedBy.get(r.work.id) ?? 0,
    inGraphRefs: inGraphRefs.get(r.work.id) ?? 0,
  }));

  // Edges: each node nominates its top-<MAX_DEGREE> neighbours; the union is
  // then trimmed so no node exceeds the cap, dropping only links whose other
  // end would keep at least one edge (star hubs stay intact on purpose).
  type Cand = { a: string; b: string; w: number; direct: boolean; yearA?: number; yearB?: number };
  const candidates = new Map<string, Cand>();
  const nominate = (a: string, b: string) => {
    if (a === b || !chosen.has(a) || !chosen.has(b)) return;
    const w = scorer.sim(a, b);
    if (w <= 0) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!candidates.has(key)) {
      const wa = byId.get(a)!;
      const wb = byId.get(b)!;
      candidates.set(key, { a, b, w, direct: scorer.direct(a, b), yearA: wa.year, yearB: wb.year });
    }
  };
  const neighboursOf = (id: string) =>
    [...chosen]
      .filter((other) => other !== id)
      .map((other) => ({ other, w: scorer.sim(id, other) }))
      .filter((x) => x.w > 0)
      .sort((x, y) => y.w - x.w || (x.other < y.other ? -1 : 1))
      .slice(0, MAX_DEGREE);
  for (const id of chosen) for (const n of neighboursOf(id)) nominate(id, n.other);

  let edges = [...candidates.values()];
  const degree = new Map<string, number>();
  const bump = (id: string, d: number) => degree.set(id, (degree.get(id) ?? 0) + d);
  for (const e of edges) {
    bump(e.a, 1);
    bump(e.b, 1);
  }
  const over = () => [...degree.entries()].filter(([id, d]) => d > MAX_DEGREE && chosen.has(id));
  for (;;) {
    const hot = over();
    if (hot.length === 0) break;
    let dropped = false;
    for (const [id] of hot) {
      const weakest = edges
        .filter((e) => (e.a === id || e.b === id) && (degree.get(e.a === id ? e.b : e.a) ?? 0) > 1)
        .sort((x, y) => x.w - y.w || (x.a < y.a ? -1 : 1))[0];
      if (weakest) {
        edges = edges.filter((e) => e !== weakest);
        bump(weakest.a, -1);
        bump(weakest.b, -1);
        dropped = true;
      }
    }
    if (!dropped) break; // only orphan-avoiding links remain
  }

  const simEdges: SimEdge[] = edges
    .map((e) => {
      if (!e.direct) {
        const [from, to] = [e.a, e.b].sort(); // deterministic orientation
        return { from, to, w: e.w };
      }
      // Citing → cited; mutual citations (preprint ↔ published) break towards
      // the newer paper citing the older one.
      const aCitesB = byId.get(e.a)!.refs.includes(e.b);
      const bCitesA = byId.get(e.b)!.refs.includes(e.a);
      let from = e.a;
      let to = e.b;
      if (aCitesB && bCitesA) {
        const aNewer = (e.yearA ?? 0) > (e.yearB ?? 0);
        from = aNewer ? e.a : e.b;
        to = aNewer ? e.b : e.a;
      } else if (bCitesA) {
        from = e.b;
        to = e.a;
      }
      return { from, to, w: e.w, direct: true as const };
    })
    .sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : 1));

  return { nodes, edges: simEdges };
}

/* ---------------- outside the graph ---------------- */

/** Works cited by ≥2 graph papers but not in it: the "prior" list, most-linked first. */
export function priorCandidates(
  nodes: SimWork[],
  inGraph: Set<string>,
  limit: number,
): { id: string; links: number }[] {
  const links = new Map<string, number>();
  for (const n of nodes)
    for (const r of n.refs) if (!inGraph.has(r)) links.set(r, (links.get(r) ?? 0) + 1);
  return [...links.entries()]
    .filter(([, l]) => l >= 2)
    .map(([id, l]) => ({ id, links: l }))
    .sort((a, b) => b.links - a.links || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

/** Sample citers outside the graph by how many graph papers they cite. */
export function derivativeCandidates(
  citers: SimWork[],
  inGraph: Set<string>,
  limit: number,
): { id: string; links: number }[] {
  return citers
    .filter((c) => !inGraph.has(c.id))
    .map((c) => ({ id: c.id, links: c.refs.filter((r) => inGraph.has(r)).length }))
    .filter((x) => x.links > 0)
    .sort((a, b) => b.links - a.links || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}
