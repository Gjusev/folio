// Shortest path in the citation graph, used to highlight the chain from a
// selected node back to the seed the way Connected Papers does.

export type PathGraph = { edges: { from: string; to: string }[] };

/**
 * BFS over the undirected view of the citation graph. Returns the node ids of
 * one shortest path from `from` to `to` (inclusive), or null when disconnected.
 */
export function shortestPath(g: PathGraph, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let step = to;
        while (prev.get(step) !== step) {
          step = prev.get(step)!;
          path.push(step);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
