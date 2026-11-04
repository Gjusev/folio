import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, GraphSeed, OutsideWork } from "@/lib/graph-types";
import {
  authorLine,
  buildAdjacency,
  edgeStyle,
  filterNodes,
  makeNodeSize,
  needsRecentre,
  neighborsOf,
  seedKey,
  shortLabel,
  sortNodes,
  sortOutside,
  yearColor,
  yearRange,
} from "./graph-model";

const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  title: `Paper ${id}`,
  authors: ["Ada Lovelace"],
  year: 2015,
  citedBy: 10,
  role: "related",
  sim: 0.5,
  shared: 0,
  cocited: 0,
  inGraphCitedBy: 0,
  inGraphRefs: 0,
  ...over,
});

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("yearColor", () => {
  it("maps the oldest to dark blue and the newest to orange, relative to the graph", () => {
    expect(yearColor(1990, 1990, 2020)).toBe("#2f5a82");
    expect(yearColor(2020, 1990, 2020)).toBe("#e8a94f");
  });

  it("is relative: the same year changes colour with the graph's range", () => {
    expect(yearColor(2018, 2010, 2020)).not.toBe(yearColor(2018, 1990, 2020));
  });

  it("grows monotonically in luminance (survives grayscale printing)", () => {
    const ramp = [1990, 1995, 2000, 2005, 2010, 2015, 2020].map((y) =>
      lum(yearColor(y, 1990, 2020)),
    );
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  });

  it("gives unknown years a neutral grey and survives a single-year graph", () => {
    expect(yearColor(undefined, 2000, 2020)).toBe("#8a857b");
    expect(yearColor(2019, 2019, 2019)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("yearRange", () => {
  it("returns the real min/max of the nodes and ignores unknown years", () => {
    expect(
      yearRange([
        node("a", { year: 2001 }),
        node("b", { year: undefined }),
        node("c", { year: 2019 }),
      ]),
    ).toEqual({
      min: 2001,
      max: 2019,
    });
    expect(yearRange([node("a", { year: undefined })])).toBeNull();
  });
});

describe("makeNodeSize", () => {
  const size = makeNodeSize(100_000);
  it("is bounded and monotonic in citations", () => {
    expect(size(0)).toBeGreaterThanOrEqual(5);
    expect(size(100_000)).toBeLessThanOrEqual(17);
    expect(size(10)).toBeLessThan(size(1_000));
    expect(size(1_000)).toBeLessThan(size(100_000));
  });
  it("separates mid-field papers (a few hundred vs a few thousand citations)", () => {
    expect(size(3_000) - size(300)).toBeGreaterThan(1);
  });
  it("copes with a graph where nobody is cited", () => {
    expect(Number.isFinite(makeNodeSize(0)(0))).toBe(true);
  });
});

describe("edgeStyle", () => {
  it("draws stronger similarity thicker and darker", () => {
    const weak = edgeStyle(0.1);
    const strong = edgeStyle(0.9);
    expect(strong.size).toBeGreaterThan(weak.size);
    expect(lum(strong.color)).toBeLessThan(lum(weak.color));
  });
  it("on a dark surface stronger similarity reads lighter, still thicker", () => {
    const weak = edgeStyle(0.1, true);
    const strong = edgeStyle(0.9, true);
    expect(strong.size).toBeGreaterThan(weak.size);
    expect(lum(strong.color)).toBeGreaterThan(lum(weak.color));
  });
});

describe("sortNodes", () => {
  const list = [
    node("a", { sim: 0.2, citedBy: 500, year: 2010, title: "B paper" }),
    node("b", { sim: 0.9, citedBy: 5, year: 2022, title: "A paper" }),
    node("c", { sim: 0.5, citedBy: 50, year: 2016, title: "C paper" }),
  ];
  it("orders by each key without mutating the input", () => {
    expect(sortNodes(list, "sim").map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(sortNodes(list, "citations").map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(sortNodes(list, "yearDesc").map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(sortNodes(list, "yearAsc").map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(list.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps the origin on top whatever the key", () => {
    const withOrigin = [...list, node("o", { role: "origin", sim: 1, citedBy: 1, year: 1990 })];
    expect(sortNodes(withOrigin, "citations")[0].id).toBe("o");
    expect(sortNodes(withOrigin, "yearAsc")[0].id).toBe("o");
  });
});

describe("filterNodes", () => {
  const list = [
    node("a", {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      venue: "NeurIPS",
    }),
    node("b", { title: "Deep Residual Learning", authors: ["Kaiming He"], year: 2016 }),
  ];
  it("matches every word in title, authors, venue or year, ignoring case and accents", () => {
    expect(filterNodes(list, "attention").map((n) => n.id)).toEqual(["a"]);
    expect(filterNodes(list, "VASWANI neurips").map((n) => n.id)).toEqual(["a"]);
    expect(filterNodes(list, "2016").map((n) => n.id)).toEqual(["b"]);
    expect(filterNodes(list, "attentión").map((n) => n.id)).toEqual(["a"]);
  });
  it("returns everything for an empty query and nothing for no match", () => {
    expect(filterNodes(list, "  ")).toHaveLength(2);
    expect(filterNodes(list, "zebra")).toHaveLength(0);
  });
});

describe("adjacency", () => {
  const edges: GraphEdge[] = [
    { from: "a", to: "b", w: 0.8 },
    { from: "b", to: "c", w: 0.3, direct: true },
  ];
  it("is symmetric and carries weights", () => {
    const adj = buildAdjacency(edges);
    expect([...neighborsOf(adj, "b")].sort()).toEqual(["a", "c"]);
    expect([...neighborsOf(adj, "a")]).toEqual(["b"]);
    expect(adj.get("c")?.get("b")).toBe(0.3);
  });
  it("returns an empty set for unknown ids", () => {
    expect(neighborsOf(buildAdjacency(edges), "zzz").size).toBe(0);
  });
});

describe("needsRecentre", () => {
  const box = { w: 800, h: 600 };
  it("leaves nodes in the comfortable middle alone", () => {
    expect(needsRecentre({ x: 400, y: 300 }, box)).toBe(false);
    expect(needsRecentre({ x: 120, y: 90 }, box)).toBe(false);
  });
  it("recentres nodes near the edge or off screen", () => {
    expect(needsRecentre({ x: 20, y: 300 }, box)).toBe(true);
    expect(needsRecentre({ x: 400, y: 590 }, box)).toBe(true);
    expect(needsRecentre({ x: -50, y: 300 }, box)).toBe(true);
    expect(needsRecentre({ x: 5000, y: 5000 }, box)).toBe(true);
  });
});

describe("shortLabel", () => {
  it("is 'FirstAuthor year' and is bounded", () => {
    expect(shortLabel(node("a", { authors: ["Ashish Vaswani", "Noam Shazeer"], year: 2017 }))).toBe(
      "Vaswani 2017",
    );
    expect(shortLabel(node("a", { authors: [], year: undefined }))).toBe("?");
    expect(
      shortLabel(
        node("a", { authors: ["X Averyveryverylongsurnamethatgoesonforever"], year: 2001 }),
      ).length,
    ).toBeLessThanOrEqual(20);
  });
});

describe("sortOutside", () => {
  const work = (id: string, over: Partial<OutsideWork> = {}): OutsideWork => ({
    id,
    title: `Work ${id}`,
    authors: [],
    citedBy: 10,
    links: 1,
    ...over,
  });
  const list = [
    work("a", { links: 3, citedBy: 100, year: 2001 }),
    work("b", { links: 9, citedBy: 5, year: 2020 }),
    work("c", { links: 5, citedBy: 900, year: 2010 }),
  ];
  it("ranks by graph connectivity by default, then by the other keys", () => {
    expect(sortOutside(list, "sim").map((w) => w.id)).toEqual(["b", "c", "a"]);
    expect(sortOutside(list, "citations").map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(sortOutside(list, "yearDesc").map((w) => w.id)).toEqual(["b", "c", "a"]);
    expect(sortOutside(list, "yearAsc").map((w) => w.id)).toEqual(["a", "c", "b"]);
    expect(list.map((w) => w.id)).toEqual(["a", "b", "c"]); // input untouched
  });
});

describe("seedKey", () => {
  const seed = (source: GraphSeed["source"], paperId: string): GraphSeed => ({
    source,
    paperId,
    title: "t",
  });
  it("identifies a graph origin regardless of casing, and the bibliography graph", () => {
    expect(seedKey(null)).toBe("bib");
    expect(seedKey(seed("openalex", "W123"))).toBe("openalex:w123");
    expect(seedKey(seed("doi", "10.1/ABC"))).toBe("doi:10.1/abc");
    expect(seedKey(seed("openalex", "W1"))).not.toBe(seedKey(seed("s2", "W1")));
  });
});

describe("authorLine", () => {
  it("lists up to three family names and abbreviates the rest", () => {
    expect(authorLine(["Ashish Vaswani", "Noam Shazeer"])).toBe("Vaswani, Shazeer");
    expect(authorLine(["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"])).toBe(
      "Vaswani, Shazeer, Parmar et al.",
    );
    expect(authorLine([])).toBe("");
  });
  it("copes with single-token names and stray spaces", () => {
    expect(authorLine(["  Plato  ", "Ada  Lovelace"])).toBe("Plato, Lovelace");
  });
});
