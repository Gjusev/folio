import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { componentsOf, layoutIslands } from "@/lib/graph-islands";

describe("componentsOf", () => {
  it("orders components by size desc and keeps nodes in appearance order", () => {
    const nodes = ["a", "b", "c", "d", "e", "f", "g"];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
      { from: "e", to: "f" },
    ];
    expect(componentsOf(nodes, edges)).toEqual([
      ["a", "b", "c", "d"],
      ["e", "f"],
      ["g"], // isolated nodes count as their own component
    ]);
  });

  it("breaks size ties by first node appearance", () => {
    const edges = [
      { from: "c", to: "d" },
      { from: "a", to: "b" },
    ];
    expect(componentsOf(["a", "b", "c", "d"], edges)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("ignores edges with endpoints outside the node set and is deterministic", () => {
    const nodes = ["x", "y", "z"];
    const edges = [
      { from: "x", to: "y" },
      { from: "x", to: "nope" },
    ];
    const once = componentsOf(nodes, edges);
    expect(once).toEqual([["x", "y"], ["z"]]);
    expect(componentsOf(nodes, edges)).toEqual(once);
  });
});

/** Three islands — a 6-ring, a 3-triangle, a lone node — all stacked at (0,0). */
function threeIslands(): Graph {
  const g = new Graph({ multi: false });
  for (const n of ["a", "b", "c", "d", "e", "f", "p", "q", "r", "s"]) {
    g.addNode(n, { label: n, size: 4, x: 0, y: 0 });
  }
  const pairs: [string, string][] = [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
    ["d", "e"],
    ["e", "f"],
    ["f", "a"],
    ["p", "q"],
    ["q", "r"],
    ["r", "p"],
  ];
  for (const [u, v] of pairs) g.addEdge(u, v);
  return g;
}

type Extent = { minX: number; maxX: number; minY: number; maxY: number };

function extent(g: Graph, nodes: string[]): Extent {
  const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const n of nodes) {
    const { x, y } = g.getNodeAttributes(n);
    e.minX = Math.min(e.minX, x);
    e.maxX = Math.max(e.maxX, x);
    e.minY = Math.min(e.minY, y);
    e.maxY = Math.max(e.maxY, y);
  }
  return e;
}

/** Axis-aligned gap: ≥ 0 in an axis means separated in that axis. */
function gap(a: Extent, b: Extent): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
  return Math.max(dx, dy);
}

describe("layoutIslands", () => {
  const ISLANDS = [["a", "b", "c", "d", "e", "f"], ["p", "q", "r"], ["s"]];

  it("lays out each island and keeps their bounding boxes margin apart", () => {
    const g = threeIslands();
    const margin = 40;
    layoutIslands(g, { iterations: 20, margin });

    for (const n of g.nodes()) {
      const { x, y } = g.getNodeAttributes(n);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
    const boxes = ISLANDS.map((nodes) => extent(g, nodes));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(gap(boxes[i], boxes[j])).toBeGreaterThanOrEqual(margin - 1e-6);
  });

  it("is deterministic: same graph and seed produce identical coordinates", () => {
    const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const a = threeIslands();
    const b = threeIslands();
    layoutIslands(a, { iterations: 20, rng: lcg(7) });
    layoutIslands(b, { iterations: 20, rng: lcg(7) });
    for (const n of a.nodes()) {
      const pa = a.getNodeAttributes(n);
      const pb = b.getNodeAttributes(n);
      expect(pb.x).toBe(pa.x);
      expect(pb.y).toBe(pa.y);
    }
  });
});
