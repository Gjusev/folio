import { describe, expect, it } from "vitest";
import {
  MAX_DEGREE,
  NODE_LIMIT,
  buildSimilarityGraph,
  citerWeight,
  coCitedCandidates,
  createScorer,
  derivativeCandidates,
  originRoles,
  priorCandidates,
  unifyDuplicates,
  type SimWork,
} from "@/lib/graph-similarity";

// Deterministic PRNG: the synthetic corpora never change between runs.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, pool: T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
}

const work = (id: string, refs: string[], extra: Partial<SimWork> = {}): SimWork => ({
  id,
  refs,
  ...extra,
});
const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

/** Two topics (A, B) with their own reference pools and a pair of ubiquitous refs. */
function twoClusters() {
  const r = rng(7);
  const poolA = range(30, (i) => `ra${i}`);
  const poolB = range(30, (i) => `rb${i}`);
  const works: SimWork[] = [];
  for (let i = 0; i < 12; i++) works.push(work(`A${i}`, [...pick(r, poolA, 14), "g0", "g1"]));
  for (let i = 0; i < 12; i++) works.push(work(`B${i}`, [...pick(r, poolB, 14), "g0", "g1"]));
  const citers: SimWork[] = [];
  for (let k = 0; k < 15; k++) {
    citers.push(
      work(
        `CA${k}`,
        pick(
          r,
          range(12, (i) => `A${i}`),
          6,
        ),
      ),
    );
    citers.push(
      work(
        `CB${k}`,
        pick(
          r,
          range(12, (i) => `B${i}`),
          6,
        ),
      ),
    );
  }
  return { works, citers };
}

function meanSim(
  s: ReturnType<typeof createScorer>,
  xs: string[],
  ys: string[],
  same: boolean,
): number {
  let sum = 0;
  let n = 0;
  for (const a of xs)
    for (const b of ys) {
      if (same && a >= b) continue; // each unordered pair once, never a pair with itself
      sum += s.sim(a, b);
      n++;
    }
  return sum / n;
}

describe("pairwise similarity", () => {
  const { works, citers } = twoClusters();
  const A = range(12, (i) => `A${i}`);
  const B = range(12, (i) => `B${i}`);

  it("is far higher inside a topic than across topics (bibliographic coupling alone)", () => {
    const s = createScorer(works, []);
    expect(meanSim(s, A, A, true)).toBeGreaterThan(3 * meanSim(s, A, B, false));
  });

  it("stays that way once co-citation by the citing sample is added", () => {
    const s = createScorer(works, citers);
    const intra = (meanSim(s, A, A, true) + meanSim(s, B, B, true)) / 2;
    expect(intra).toBeGreaterThan(3 * meanSim(s, A, B, false));
  });

  it("is symmetric and bounded", () => {
    const s = createScorer(works, citers);
    for (const a of [...A, ...B])
      for (const b of [...A, ...B]) {
        if (a === b) continue;
        expect(s.sim(a, b)).toBeCloseTo(s.sim(b, a), 12);
        expect(s.sim(a, b)).toBeGreaterThanOrEqual(0);
        expect(s.sim(a, b)).toBeLessThanOrEqual(1);
      }
  });

  it("gives 0 coupling when either side has no references, never NaN", () => {
    const s = createScorer([work("e", []), work("f", ["x", "y"]), work("g", [])], []);
    expect(s.bc("e", "f")).toBe(0);
    expect(s.bc("e", "g")).toBe(0);
    expect(s.sim("e", "f")).toBe(0);
  });

  it("scores the textbook bibliographic coupling |A∩B| / sqrt(|A||B|)", () => {
    const s = createScorer([work("a", ["1", "2", "3", "4"]), work("b", ["3", "4", "5", "6"])], []);
    expect(s.bc("a", "b")).toBeCloseTo(2 / 4, 12);
  });

  it("adds a bonus for direct citation in either direction", () => {
    const s = createScorer([work("a", ["b"]), work("b", []), work("c", [])], []);
    expect(s.direct("a", "b")).toBe(true);
    expect(s.direct("b", "a")).toBe(true);
    expect(s.direct("a", "c")).toBe(false);
    expect(s.sim("a", "b")).toBeGreaterThan(s.sim("a", "c"));
  });
});

describe("citing-sample weights (Adamic-Adar)", () => {
  it("a 300-reference survey weighs less than a 10-reference paper", () => {
    expect(citerWeight(300)).toBeLessThan(citerWeight(10));
    expect(citerWeight(0)).toBeGreaterThan(0);
  });

  it("ranks co-cited works cited by a focused paper above those cited by a survey", () => {
    const survey = work("S", ["O", "X", ...range(298, (i) => `s${i}`)]);
    const short = work("T", ["O", "Y", ...range(8, (i) => `t${i}`)]);
    const ranked = coCitedCandidates("O", [survey, short], new Set(), 400);
    expect(ranked.indexOf("Y")).toBeGreaterThanOrEqual(0);
    expect(ranked.indexOf("Y")).toBeLessThan(ranked.indexOf("X"));
  });

  it("carries the same preference into the co-citation similarity", () => {
    const survey = work("S", ["O", "X", ...range(298, (i) => `s${i}`)]);
    const short = work("T", ["O", "Y", ...range(8, (i) => `t${i}`)]);
    const s = createScorer([work("O", []), work("X", []), work("Y", [])], [survey, short]);
    expect(s.cocit("O", "Y")).toBeGreaterThan(s.cocit("O", "X"));
  });

  it("excludes the origin, known works and one-off noise; breaks ties deterministically", () => {
    const sample = range(10, (k) =>
      work(`c${k}`, ["O", "keep", "seen", ...(k < 3 ? ["pair"] : [])]),
    );
    sample[0].refs = [...sample[0].refs, "once"];
    const ranked = coCitedCandidates("O", sample, new Set(["seen"]), 10);
    expect(ranked).toEqual(["keep", "pair"]); // "once" has a single co-citer; "O"/"seen" are excluded
    expect(coCitedCandidates("O", [...sample].reverse(), new Set(["seen"]), 10)).toEqual(ranked);
    expect(coCitedCandidates("O", sample, new Set(["seen"]), 1)).toEqual(["keep"]);
  });

  it("accepts single co-citations when the sample is tiny", () => {
    const ranked = coCitedCandidates(
      "O",
      [work("c0", ["O", "x"]), work("c1", ["O", "y"])],
      new Set(),
      5,
    );
    expect(ranked.sort()).toEqual(["x", "y"]);
  });
});

describe("buildSimilarityGraph", () => {
  const { works, citers } = twoClusters();
  const origin = works[0]; // A0

  it("keeps the topics apart: almost every edge joins papers of the same topic", () => {
    const g = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    const topic = (id: string) => id[0];
    const intra = g.edges.filter((e) => topic(e.from) === topic(e.to)).length;
    expect(g.edges.length).toBeGreaterThan(20);
    expect(intra / g.edges.length).toBeGreaterThanOrEqual(0.9);
  });

  it("puts the origin first with sim 1 and everything else in [0,1], sorted by similarity", () => {
    const g = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    expect(g.nodes[0]).toMatchObject({ id: "A0", role: "origin", sim: 1, shared: 0, cocited: 0 });
    for (const n of g.nodes) {
      expect(n.sim).toBeGreaterThanOrEqual(0);
      expect(n.sim).toBeLessThanOrEqual(1);
    }
    const sims = g.nodes.slice(1).map((n) => n.sim);
    expect(sims).toEqual([...sims].sort((a, b) => b - a));
    // A papers are more similar to A0 than any B paper
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    const minA = Math.min(...range(11, (i) => `A${i + 1}`).map((id) => byId[id].sim));
    const maxB = Math.max(...range(12, (i) => `B${i}`).map((id) => byId[id]?.sim ?? 0));
    expect(minA).toBeGreaterThan(maxB);
  });

  it("keeps edge weights in (0,1], without duplicates or self-loops", () => {
    const g = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    const seen = new Set<string>();
    for (const e of g.edges) {
      expect(e.w).toBeGreaterThan(0);
      expect(e.w).toBeLessThanOrEqual(1);
      expect(e.from).not.toBe(e.to);
      const key = [e.from, e.to].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("never leaves a selected paper without edges", () => {
    const g = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    const deg = new Map(g.nodes.map((n) => [n.id, 0]));
    for (const e of g.edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    for (const [id, d] of deg) expect(d, id).toBeGreaterThan(0);
  });

  it("connects a chain of papers that each share references only with the next one", () => {
    const chain = range(12, (i) =>
      work(`p${i}`, [...range(5, (j) => `e${i - 1}_${j}`), ...range(5, (j) => `e${i}_${j}`)]),
    );
    const g = buildSimilarityGraph({
      works: chain,
      seeds: chain.map((w) => w.id), // bibliography-style: everyone is anchored
      roleOf: () => "mine",
    });
    const deg = new Map(g.nodes.map((n) => [n.id, 0]));
    for (const e of g.edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    for (const [id, d] of deg) expect(d, id).toBeGreaterThanOrEqual(1);
  });

  it("keeps an anchored paper with no overlap at all as an isolated node without breaking", () => {
    const ws = [
      work("a", ["1", "2", "3"]),
      work("b", ["2", "3", "4"]),
      work("lonely", []),
      work("also-lonely", ["zzz"]),
    ];
    const g = buildSimilarityGraph({ works: ws, seeds: ws.map((w) => w.id), roleOf: () => "mine" });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["a", "also-lonely", "b", "lonely"]);
    expect(g.edges).toHaveLength(1);
    expect([g.edges[0].from, g.edges[0].to].sort()).toEqual(["a", "b"]);
    for (const n of g.nodes) expect(Number.isFinite(n.sim)).toBe(true);
  });

  it("returns an empty graph when the seed is not among the works", () => {
    expect(buildSimilarityGraph({ works, seeds: ["nope"], citers })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("returns the lone origin when nothing relates to it", () => {
    const g = buildSimilarityGraph({ works: [work("o", ["x"]), work("far", ["y"])], seeds: ["o"] });
    expect(g.nodes.map((n) => n.id)).toEqual(["o"]);
    expect(g.edges).toEqual([]);
  });

  it("is deterministic: same input, same output; and input order does not matter", () => {
    const a = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    const b = buildSimilarityGraph({ works, seeds: [origin.id], citers });
    expect(b).toEqual(a);
    const shuffled = buildSimilarityGraph({
      works: [...works].reverse(),
      seeds: [origin.id],
      citers: [...citers].reverse(),
    });
    expect(shuffled).toEqual(a);
  });

  it("orients direct citations citing → cited and flags only those", () => {
    const o = work("O", ["P", "x1", "x2", "x3"], { year: 2020 });
    const p = work("P", ["x1", "x2", "x3"], { year: 2015 });
    const d = work("D", ["O", "x1", "x2", "x3"], { year: 2022 });
    const sib = work("S", ["x1", "x2", "x3", "x4"], { year: 2019 }); // similar, no citation
    const g = buildSimilarityGraph({ works: [o, p, d, sib], seeds: ["O"] });
    const find = (a: string, b: string) =>
      g.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
    expect(find("O", "P")).toMatchObject({ from: "O", to: "P", direct: true });
    expect(find("D", "O")).toMatchObject({ from: "D", to: "O", direct: true });
    const sibEdge = find("S", "O") ?? find("S", "P") ?? find("S", "D");
    expect(sibEdge).toBeDefined();
    expect(sibEdge).not.toHaveProperty("direct");
  });

  it("breaks mutual citations (preprint ↔ published) towards the newer paper citing the older", () => {
    const a = work("a", ["b", "x"], { year: 2016 });
    const b = work("b", ["a", "x"], { year: 2018 });
    const g = buildSimilarityGraph({ works: [a, b], seeds: ["a"] });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ from: "b", to: "a", direct: true });
  });

  it("classifies roles from the reference lists and counts citations inside the graph", () => {
    const o = work("O", ["P1", "P2"]);
    const p1 = work("P1", []);
    const p2 = work("P2", ["P1"]);
    const d1 = work("D1", ["O", "P1", "P2"]);
    const rel = work("R", ["P1", "P2"]);
    const g = buildSimilarityGraph({ works: [o, p1, p2, d1, rel], seeds: ["O"] });
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(by.O.role).toBe("origin");
    expect(by.P1.role).toBe("prior");
    expect(by.D1.role).toBe("derivative");
    expect(by.R.role).toBe("related");
    expect(by.P1).toMatchObject({ shared: 0, inGraphCitedBy: 4, inGraphRefs: 0 });
    expect(by.D1).toMatchObject({ shared: 2, inGraphCitedBy: 0, inGraphRefs: 3 });
    expect(by.R.shared).toBe(2);
  });

  it("counts the citing-sample members that cite both a paper and the origin", () => {
    const o = work("O", []);
    const x = work("X", []);
    const citersLocal = [work("c1", ["O", "X"]), work("c2", ["O", "X"]), work("c3", ["O"])];
    const g = buildSimilarityGraph({
      works: [o, x, ...citersLocal],
      seeds: ["O"],
      citers: citersLocal,
    });
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(by.X.cocited).toBe(2);
    expect(by.c3.cocited).toBe(0);
  });

  it("respects the node limit and keeps the origin", () => {
    const g = buildSimilarityGraph({ works, seeds: [origin.id], citers, nodeLimit: 10 });
    expect(g.nodes).toHaveLength(10);
    expect(g.nodes[0].id).toBe("A0");
    expect(NODE_LIMIT).toBe(70);
  });

  it("caps the degree of dense graphs", () => {
    const r = rng(11);
    const pool = range(28, (i) => `r${i}`);
    const dense = range(60, (i) => work(`n${i}`, pick(r, pool, 20)));
    const g = buildSimilarityGraph({ works: dense, seeds: ["n0"] });
    const deg = new Map<string, number>();
    for (const e of g.edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    expect(Math.max(...deg.values())).toBeLessThanOrEqual(MAX_DEGREE);
    expect(deg.size).toBe(g.nodes.length);
  });

  it("goes over the degree cap only to avoid orphaning a paper (star around the origin)", () => {
    const leaves = range(30, (i) =>
      work(
        `L${i}`,
        range(6, (j) => `own${i}_${j}`),
      ),
    );
    const hub = work(
      "H",
      leaves.map((l) => l.id),
    );
    const g = buildSimilarityGraph({ works: [hub, ...leaves], seeds: ["H"] });
    expect(g.nodes).toHaveLength(31);
    const deg = new Map<string, number>();
    for (const e of g.edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    for (const l of leaves) expect(deg.get(l.id), l.id).toBe(1);
    expect(deg.get("H")).toBe(30);
  });

  it("keeps a floor of direct citers even when look-alikes outscore them", () => {
    const base = range(12, (i) => `base${i}`);
    const o = work("O", base);
    const lookalikes = range(40, (i) => work(`R${i}`, [...base, `extra${i}`]));
    const citersOfO = range(20, (i) => work(`D${i}`, ["O", `own${i}`]));
    const all = [o, ...lookalikes, ...citersOfO];
    const withFloor = buildSimilarityGraph({ works: all, seeds: ["O"], nodeLimit: 30 });
    expect(withFloor.nodes.filter((n) => n.role === "derivative").length).toBeGreaterThanOrEqual(
      12,
    );
    const noFloor = buildSimilarityGraph({ works: all, seeds: ["O"], nodeLimit: 30, floors: {} });
    expect(noFloor.nodes.filter((n) => n.role === "derivative").length).toBe(0);
  });

  it("handles 250 papers × 100 references in well under 200 ms", () => {
    const r = rng(3);
    const pool = range(800, (i) => `r${i}`);
    const ws = range(250, (i) => work(`w${i}`, pick(r, pool, 100)));
    const cit = ws.slice(0, 100);
    const t0 = performance.now();
    const g = buildSimilarityGraph({ works: ws, seeds: ["w0"], citers: cit });
    const ms = performance.now() - t0;
    expect(g.nodes.length).toBeLessThanOrEqual(NODE_LIMIT);
    expect(ms).toBeLessThan(200);
  });
});

describe("unifyDuplicates", () => {
  const title = "BERT: Pre-training of Deep Bidirectional Transformers";

  it("merges records of the same paper, keeping the most cited one and the union of references", () => {
    const a = work("W1", ["r1", "r2"], { title, year: 2018, citedBy: 47_000 });
    const b = work("W2", ["r2", "r3", "W1"], { title, year: 2019, citedBy: 50_000 });
    const c = work("W3", ["W1", "W2", "r9"], {
      title: "Something else entirely different",
      year: 2020,
    });
    const { works, alias } = unifyDuplicates([a, b, c], new Set());
    expect(works.map((w) => w.id).sort()).toEqual(["W2", "W3"]);
    expect(alias.get("W1")).toBe("W2");
    expect(works.find((w) => w.id === "W2")!.refs.sort()).toEqual(["r1", "r2", "r3"]); // self-reference dropped
    expect(works.find((w) => w.id === "W3")!.refs.sort()).toEqual(["W2", "r9"]); // refs follow the alias, no repeats
  });

  it("never drops a protected id (the origin), whatever its citation count", () => {
    const origin = work("O", [], { title, year: 2018, citedBy: 10 });
    const dup = work("D", [], { title, year: 2018, citedBy: 99_999 });
    const { works, alias } = unifyDuplicates([origin, dup], new Set(["O"]));
    expect(works.map((w) => w.id)).toEqual(["O"]);
    expect(alias.get("D")).toBe("O");
  });

  it("leaves short titles and distant years alone", () => {
    const short = [
      work("a", [], { title: "Deep learning", year: 2015 }),
      work("b", [], { title: "Deep learning", year: 2015 }),
    ];
    expect(unifyDuplicates(short, new Set()).works).toHaveLength(2);
    const far = [work("a", [], { title, year: 1998 }), work("b", [], { title, year: 2018 })];
    expect(unifyDuplicates(far, new Set()).works).toHaveLength(2);
  });

  it("is insensitive to case, punctuation and accents", () => {
    const x = work("x", [], {
      title: "Représentation learning: a Review!",
      year: 2013,
      citedBy: 1,
    });
    const y = work("y", [], { title: "representation LEARNING a review", year: 2013, citedBy: 2 });
    expect(unifyDuplicates([x, y], new Set()).works.map((w) => w.id)).toEqual(["y"]);
  });

  it("drops a repeated id (a reference that also appears in the citing sample)", () => {
    const a = work("W1", ["r1"], { title, year: 2018 });
    const again = work("W1", ["r1"], { title, year: 2018 });
    const b = work("W2", ["r2"], { title: "Another paper entirely different", year: 2020 });
    const { works } = unifyDuplicates([a, again, b], new Set());
    expect(works.map((w) => w.id)).toEqual(["W1", "W2"]);
  });
});

describe("outside lists", () => {
  it("lists works cited by ≥2 graph papers that are not in the graph, most-linked first", () => {
    const nodes = [work("a", ["x", "y", "z"]), work("b", ["x", "y"]), work("c", ["x", "in"])];
    const out = priorCandidates(nodes, new Set(["a", "b", "c", "in"]), 10);
    expect(out).toEqual([
      { id: "x", links: 3 },
      { id: "y", links: 2 },
    ]);
    expect(priorCandidates(nodes, new Set(["a", "b", "c", "in"]), 1)).toEqual([
      { id: "x", links: 3 },
    ]);
  });

  it("lists sample citers outside the graph by how many graph papers they cite", () => {
    const citersLocal = [
      work("d1", ["a", "b", "c"], { citedBy: 5 }),
      work("d2", ["a"], { citedBy: 50 }),
      work("d3", ["a", "b"], { citedBy: 10 }),
      work("inside", ["a", "b", "c"]),
    ];
    const out = derivativeCandidates(citersLocal, new Set(["a", "b", "c", "inside"]), 10);
    expect(out).toEqual([
      { id: "d1", links: 3 },
      { id: "d3", links: 2 },
      { id: "d2", links: 1 },
    ]);
  });
});

describe("originRoles", () => {
  it("falls back to publication year when a record both cites and is cited", () => {
    const o = work("O", ["dup"], { year: 2018 });
    const role = originRoles(o);
    expect(role(work("dup", ["O"], { year: 2015 }))).toBe("prior");
    expect(role(work("dup", ["O"], { year: 2020 }))).toBe("derivative");
  });
});
