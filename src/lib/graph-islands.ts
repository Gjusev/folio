import Graph from "graphology";
import forceAtlas2, { type ForceAtlas2Settings } from "graphology-layout-forceatlas2";

/**
 * Connected components of an undirected view of the graph, via union-find.
 * Stable order: nodes keep their input order inside a component, and
 * components are sorted by size (desc) then by first node appearance.
 */
export function componentsOf(nodes: string[], edges: { from: string; to: string }[]): string[][] {
  const parent = new Map<string, string>(nodes.map((n) => [n, n]));
  const find = (node: string): string => {
    let root = node;
    for (;;) {
      const p = parent.get(root);
      if (p === undefined || p === root) return root;
      root = p;
    }
  };
  for (const { from, to } of edges) {
    if (!parent.has(from) || !parent.has(to)) continue; // endpoints outside the node set
    const ra = find(from);
    const rb = find(to);
    if (ra !== rb) parent.set(ra, rb);
  }

  const groups = new Map<string, { members: string[]; first: number }>();
  nodes.forEach((n, i) => {
    const root = find(n);
    const group = groups.get(root);
    if (group) group.members.push(n);
    else groups.set(root, { members: [n], first: i });
  });
  return [...groups.values()]
    .sort((a, b) => b.members.length - a.members.length || a.first - b.first)
    .map((g) => g.members);
}

export type IslandLayoutOptions = {
  /** ForceAtlas2 iterations per island (and for a connected graph). */
  iterations?: number;
  settings?: ForceAtlas2Settings;
  /** Grid gap between islands, in graph units. */
  margin?: number;
  /** Optional seeded PRNG used as initial-position jitter. */
  rng?: () => number;
};

// Same settings GraphPanel ran through the react-sigma hook before islands
// were packed, so a connected graph keeps its exact previous look.
const FA2_SETTINGS: ForceAtlas2Settings = {
  adjustSizes: true,
  gravity: 0.6,
  slowDown: 8,
  barnesHutOptimize: true,
};
// Island extent = sqrt(n) * NODE_SPACING, so a component's area ∝ its node
// count: big islands read as big, but don't dwarf the singles.
const NODE_SPACING = 60;

type IslandBox = {
  comp: string[];
  positions: Map<string, { x: number; y: number }>;
  w: number;
  h: number;
};

/**
 * In-place layout of a graph that may hold several disconnected components
 * (multi-seed bibliography graphs): runs ForceAtlas2 on each component's
 * induced subgraph, then packs the islands on a self-sizing grid with a fixed
 * margin — no overlap, no gravity-driven pile-up in the centre. A connected
 * graph gets plain ForceAtlas2 over the whole graph, exactly as before.
 * Deterministic: same graph + same rng → same figure.
 */
export function layoutIslands(g: Graph, opts: IslandLayoutOptions = {}): void {
  const { iterations = 150, settings = FA2_SETTINGS, margin = 150, rng } = opts;
  if (g.order < 2) return;

  const nodes = g.nodes();
  const edges: { from: string; to: string }[] = [];
  g.forEachEdge((_e, _attrs, source, target) => edges.push({ from: source, to: target }));
  const components = componentsOf(nodes, edges);

  if (components.length === 1) {
    forceAtlas2.assign(g, { iterations, settings });
    return;
  }

  const boxes: IslandBox[] = components.map((comp) => {
    // Induced subgraph: copy node attributes (size feeds adjustSizes), start
    // from a deterministic circle so FA2 always sees the same initial state.
    const sub = new Graph({ multi: false });
    const members = new Set(comp);
    comp.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / comp.length;
      sub.addNode(node, {
        ...g.getNodeAttributes(node),
        x: 100 * Math.cos(angle) + (rng?.() ?? 0),
        y: 100 * Math.sin(angle) + (rng?.() ?? 0),
      });
    });
    for (const { from, to } of edges)
      if (members.has(from) && members.has(to) && !sub.hasEdge(from, to)) sub.addEdge(from, to);

    forceAtlas2.assign(sub, { iterations, settings });

    // Normalize: recentre on the bbox, rescale uniformly so the larger extent
    // lands on sqrt(n) * NODE_SPACING.
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    sub.forEachNode((_n, a) => {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y);
    });
    const scale =
      (Math.sqrt(comp.length) * NODE_SPACING) / Math.max(maxX - minX, maxY - minY, 1e-6);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const positions = new Map<string, { x: number; y: number }>();
    sub.forEachNode((n, a) => positions.set(n, { x: (a.x - cx) * scale, y: (a.y - cy) * scale }));
    return { comp, positions, w: (maxX - minX) * scale, h: (maxY - minY) * scale };
  });

  // Row-major grid (~sqrt(n_islands) columns); each column/row is as wide/tall
  // as its largest island, so same-row and same-column neighbours keep at
  // least `margin` units of separation. Biggest islands come first.
  const cols = Math.ceil(Math.sqrt(boxes.length));
  const colW = Array.from({ length: cols }, () => 0);
  const rowH: number[] = [];
  boxes.forEach((b, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c], b.w);
    rowH[r] = Math.max(rowH[r] ?? 0, b.h);
  });
  const offX = (c: number) => colW.slice(0, c).reduce((sum, w) => sum + w + margin, 0);
  const offY = (r: number) => rowH.slice(0, r).reduce((sum, h) => sum + h + margin, 0);

  boxes.forEach((b, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x0 = offX(c) + (colW[c] - b.w) / 2;
    const y0 = offY(r) + (rowH[r] - b.h) / 2;
    for (const node of b.comp) {
      const p = b.positions.get(node) ?? { x: 0, y: 0 };
      g.setNodeAttribute(node, "x", x0 + p.x);
      g.setNodeAttribute(node, "y", y0 + p.y);
    }
  });
}
