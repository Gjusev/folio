// Pure model of the literature explorer: visual encodings (size, colour, edge
// weight), list sorting/filtering and neighbourhood lookups. No React, no
// sigma — everything here is unit-tested.

import type { GraphEdge, GraphNode, GraphSeed, OutsideWork } from "@/lib/graph-types";

/* ---------------- colour: publication year ---------------- */

/**
 * Sequential ramp with monotonically increasing luminance (dark blue → teal →
 * green → orange): unlike a constant-lightness hue sweep it survives
 * grayscale printing and colour-blind vision, and mid years stay separable.
 */
const YEAR_STOPS: [number, [number, number, number]][] = [
  [0, [47, 90, 130]],
  [0.33, [61, 145, 136]],
  [0.66, [138, 185, 111]],
  [1, [232, 169, 79]],
];

export const UNKNOWN_YEAR_COLOR = "#8a857b";
const MIN_YEAR_SPAN = 8; // a 2-year graph must not stretch the whole ramp

const hex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Colour of a year *relative to the graph's own range*, like Connected Papers. */
export function yearColor(year: number | undefined, min: number, max: number): string {
  if (!year) return UNKNOWN_YEAR_COLOR;
  const span = Math.max(max - min, MIN_YEAR_SPAN);
  const t = Math.max(0, Math.min(1, (year - min) / span));
  let lo = YEAR_STOPS[0];
  let hi = YEAR_STOPS[YEAR_STOPS.length - 1];
  for (let i = 1; i < YEAR_STOPS.length; i++) {
    if (t <= YEAR_STOPS[i][0]) {
      lo = YEAR_STOPS[i - 1];
      hi = YEAR_STOPS[i];
      break;
    }
  }
  const k = (t - lo[0]) / (hi[0] - lo[0] || 1);
  return hex(lo[1].map((v, j) => v + (hi[1][j] - v) * k));
}

export function yearRange(nodes: { year?: number }[]): { min: number; max: number } | null {
  const years = nodes.map((n) => n.year).filter((y): y is number => !!y);
  return years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;
}

/* ---------------- size: citations ---------------- */

export const NODE_MIN = 5;
export const NODE_MAX = 17;

/**
 * Node radius (px) from citations on a log scale *relative to the most-cited
 * paper of this graph*: the biggest node is NODE_MAX, uncited ones NODE_MIN,
 * and mid-field papers stay distinguishable from one another.
 */
export function makeNodeSize(maxCitedBy: number): (citedBy: number) => number {
  const top = Math.log1p(Math.max(maxCitedBy, 1));
  return (citedBy) =>
    NODE_MIN + (NODE_MAX - NODE_MIN) * Math.min(1, Math.log1p(Math.max(citedBy, 0)) / top);
}

/* ---------------- edges: similarity ---------------- */

const EDGE_LIGHT: { weak: number[]; strong: number[] } = {
  weak: [221, 217, 208],
  strong: [138, 133, 123],
};
// On a dark surface "stronger" must read as lighter, not darker.
const EDGE_DARK: { weak: number[]; strong: number[] } = {
  weak: [62, 60, 55],
  strong: [150, 145, 134],
};

/** Line weight and colour from a similarity in (0, 1]. */
export function edgeStyle(w: number, dark = false): { size: number; color: string } {
  const t = Math.max(0, Math.min(1, w));
  const { weak, strong } = dark ? EDGE_DARK : EDGE_LIGHT;
  return {
    size: 0.6 + 2.4 * t,
    color: hex(weak.map((v, i) => v + (strong[i] - v) * t)),
  };
}

/** Canvas colours that cannot come from the CSS tokens (sigma paints in WebGL). */
export type CanvasTheme = {
  dark: boolean;
  dim: string;
  dimEdge: string;
  label: string;
  focusEdge: string;
};

export function canvasTheme(dark: boolean): CanvasTheme {
  return dark
    ? { dark, dim: "#35332f", dimEdge: "#2b2a27", label: "#e8e6e1", focusEdge: "#5fb3c7" }
    : { dark, dim: "#e3e0d9", dimEdge: "#eeebe5", label: "#141413", focusEdge: "#1b6c80" };
}

/* ---------------- list: sort and filter ---------------- */

export type SortKey = "sim" | "citations" | "yearDesc" | "yearAsc";

const cmp: Record<SortKey, (a: GraphNode, b: GraphNode) => number> = {
  sim: (a, b) => b.sim - a.sim || b.citedBy - a.citedBy,
  citations: (a, b) => b.citedBy - a.citedBy || b.sim - a.sim,
  yearDesc: (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.sim - a.sim,
  yearAsc: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || b.sim - a.sim,
};

/** New sorted array; the origin always stays on top. */
export function sortNodes(nodes: GraphNode[], key: SortKey): GraphNode[] {
  const rank = (n: GraphNode) => (n.role === "origin" ? 0 : 1);
  return [...nodes].sort(
    (a, b) => rank(a) - rank(b) || cmp[key](a, b) || a.title.localeCompare(b.title),
  );
}

const cmpOutside: Record<SortKey, (a: OutsideWork, b: OutsideWork) => number> = {
  // "sim" has no meaning outside the graph: rank by how many graph papers link to it.
  sim: (a, b) => b.links - a.links || b.citedBy - a.citedBy,
  citations: (a, b) => b.citedBy - a.citedBy || b.links - a.links,
  yearDesc: (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.links - a.links,
  yearAsc: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || b.links - a.links,
};

/** New sorted array for the prior / derivative lists (works outside the graph). */
export function sortOutside(list: OutsideWork[], key: SortKey): OutsideWork[] {
  return [...list].sort((a, b) => cmpOutside[key](a, b) || a.title.localeCompare(b.title));
}

/** Cache / history key of a graph origin (null = the bibliography graph). */
export function seedKey(seed: GraphSeed | null): string {
  return seed ? `${seed.source}:${seed.paperId.toLowerCase()}` : "bib";
}

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every whitespace-separated word of the query must appear in title/authors/venue/year. */
export function filterNodes<
  T extends { title: string; authors: string[]; venue?: string; year?: number },
>(nodes: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return nodes;
  return nodes.filter((n) => {
    const hay = fold([n.title, ...n.authors, n.venue ?? "", n.year ?? ""].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/* ---------------- neighbourhood ---------------- */

export type Adjacency = Map<string, Map<string, number>>;

export function buildAdjacency(edges: GraphEdge[]): Adjacency {
  const adj: Adjacency = new Map();
  const link = (a: string, b: string, w: number) => {
    let row = adj.get(a);
    if (!row) adj.set(a, (row = new Map()));
    row.set(b, w);
  };
  for (const e of edges) {
    link(e.from, e.to, e.w);
    link(e.to, e.from, e.w);
  }
  return adj;
}

export function neighborsOf(adj: Adjacency, id: string): Set<string> {
  return new Set(adj.get(id)?.keys() ?? []);
}

/* ---------------- camera ---------------- */

/**
 * Whether a node at viewport position `p` is too close to the canvas edge (or
 * outside it) to read comfortably: only then the camera glides to it, so
 * clicking a visible node never makes the whole graph jump.
 */
export function needsRecentre(
  p: { x: number; y: number },
  box: { w: number; h: number },
  margin = 0.12,
): boolean {
  return (
    p.x < box.w * margin ||
    p.x > box.w * (1 - margin) ||
    p.y < box.h * margin ||
    p.y > box.h * (1 - margin)
  );
}

/* ---------------- labels ---------------- */

/** "Vaswani, Shazeer, Parmar et al." — family names of the first three authors. */
export function authorLine(authors: string[]): string {
  const family = authors.map((a) => a.trim().split(/\s+/).at(-1) ?? "").filter(Boolean);
  return family.length > 3 ? `${family.slice(0, 3).join(", ")} et al.` : family.join(", ");
}

/** Short "FirstAuthor year" tag, the way Connected Papers labels nodes. */
export function shortLabel(n: { authors: string[]; year?: number }): string {
  const family = n.authors[0]?.trim().split(/\s+/).at(-1);
  const tag = [family, n.year].filter(Boolean).join(" ") || "?";
  return tag.length > 20 ? `${tag.slice(0, 19)}…` : tag;
}
