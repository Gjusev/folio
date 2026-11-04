// Turns the API's CitationGraph into a laid-out graphology graph that sigma
// renders and TikZ export serialises. Same data + same seed → same figure.

import Graph from "graphology";
import type { ForceAtlas2Settings } from "graphology-layout-forceatlas2";
import { layoutIslands } from "@/lib/graph-islands";
import type { CitationGraph } from "@/lib/graph-types";
import {
  edgeStyle,
  makeNodeSize,
  shortLabel,
  yearColor,
  yearRange,
  type CanvasTheme,
} from "./graph-model";

export const ACCENT = "#1b6c80";

/** Deterministic PRNG so the same graph lays out the same way every visit. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Similarity layout: edges pull in proportion to their weight, so clusters of
// co-cited / bibliographically coupled papers form and unrelated groups drift
// apart — the Connected Papers look. Sizes are px, not layout units, so
// `adjustSizes` would only distort the picture.
const FA2_SIMILARITY: ForceAtlas2Settings = {
  gravity: 1,
  scalingRatio: 14,
  slowDown: 2,
  edgeWeightInfluence: 1,
  adjustSizes: false,
  barnesHutOptimize: false,
  strongGravityMode: false,
  linLogMode: false,
};

/** Biggest-cited papers that always get a label, besides origin / user's own. */
const LABELLED_TOP = 8;

export function buildSigmaGraph(data: CitationGraph, theme: CanvasTheme, seedKey: string): Graph {
  const g = new Graph({ multi: false });
  const years = yearRange(data.nodes);
  const size = makeNodeSize(Math.max(0, ...data.nodes.map((n) => n.citedBy)));
  const rng = mulberry32(hashString(seedKey));
  const labelled = new Set(
    [...data.nodes]
      .sort((a, b) => b.citedBy - a.citedBy)
      .slice(0, LABELLED_TOP)
      .map((n) => n.id),
  );

  // Start from rings by similarity (origin / closest papers inside, weak
  // relatives outside): FA2 then only refines the structure, so the result is
  // stable and converges fast.
  const ordered = [...data.nodes].sort((a, b) => b.sim - a.sim);
  const rank = new Map(ordered.map((n, i) => [n.id, i]));
  const n = data.nodes.length || 1;

  for (const node of data.nodes) {
    if (g.hasNode(node.id)) continue; // upstream data hiccup: never crash the page
    const focal = node.role === "origin" || node.role === "mine";
    const i = rank.get(node.id) ?? 0;
    const angle = (2 * Math.PI * i * 0.618033988749895) % (2 * Math.PI); // golden-angle spread
    const radius = node.role === "origin" ? 0 : 40 + 220 * (1 - node.sim) + (80 * i) / n;
    const base = size(node.citedBy);
    g.addNode(node.id, {
      label: shortLabel(node),
      size: node.role === "origin" ? Math.max(base, 13) : base,
      color: focal ? ACCENT : yearColor(node.year, years?.min ?? 0, years?.max ?? 0),
      x: radius * Math.cos(angle) + rng(),
      y: radius * Math.sin(angle) + rng(),
      force: focal || labelled.has(node.id), // read by the canvas nodeReducer
      role: node.role,
    });
  }

  for (const e of data.edges) {
    if (
      !g.hasNode(e.from) ||
      !g.hasNode(e.to) ||
      g.hasEdge(e.from, e.to) ||
      g.hasEdge(e.to, e.from)
    )
      continue;
    const style = edgeStyle(e.w, theme.dark);
    g.addEdge(e.from, e.to, { weight: e.w, size: style.size, color: style.color });
  }

  layoutIslands(g, { rng, iterations: 300, settings: FA2_SIMILARITY });
  return g;
}
