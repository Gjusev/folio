import { describe, expect, it } from "vitest";
import type { CitationGraph, GraphNode } from "@/lib/graph-types";
import { buildSigmaGraph } from "./graph-build";
import { canvasTheme } from "./graph-model";

const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  title: `Paper ${id}`,
  authors: ["Ada Lovelace"],
  year: 2017,
  citedBy: 10,
  role: "related",
  sim: 0.5,
  shared: 1,
  cocited: 1,
  inGraphCitedBy: 0,
  inGraphRefs: 0,
  ...over,
});

describe("buildSigmaGraph", () => {
  it("survives a duplicated node id instead of throwing (OpenAlex batch hiccup)", () => {
    const data: CitationGraph = {
      seed: "W1",
      nodes: [node("W1", { role: "origin", sim: 1 }), node("W2"), node("W2")],
      edges: [
        { from: "W1", to: "W2", w: 0.5 },
        { from: "W1", to: "W2", w: 0.4 }, // duplicate edge is skipped too
      ],
      prior: [],
      derivative: [],
      truncated: false,
    };
    const g = buildSigmaGraph(data, canvasTheme(false), "test");
    expect(g.nodes()).toEqual(["W1", "W2"]);
    expect(g.edges().length).toBe(1);
  });
});
