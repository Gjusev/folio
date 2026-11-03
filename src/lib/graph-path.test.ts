import { describe, expect, it } from "vitest";
import { shortestPath } from "./graph-path";

describe("shortestPath", () => {
  it("returns just the node when from === to", () => {
    expect(shortestPath({ edges: [] }, "a", "a")).toEqual(["a"]);
  });

  it("walks a direct edge", () => {
    const g = { edges: [{ from: "a", to: "b" }] };
    expect(shortestPath(g, "a", "b")).toEqual(["a", "b"]);
  });

  it("treats edges as undirected", () => {
    const g = { edges: [{ from: "a", to: "b" }] };
    expect(shortestPath(g, "b", "a")).toEqual(["b", "a"]);
  });

  it("finds the shortest of two routes", () => {
    const g = {
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "a", to: "d" },
      ],
    };
    expect(shortestPath(g, "a", "d")).toEqual(["a", "d"]);
  });

  it("traverses a chain across hops", () => {
    const g = {
      edges: [
        { from: "seed", to: "x" },
        { from: "x", to: "y" },
        { from: "y", to: "sel" },
      ],
    };
    expect(shortestPath(g, "sel", "seed")).toEqual(["sel", "y", "x", "seed"]);
  });

  it("returns null when disconnected", () => {
    const g = {
      edges: [
        { from: "a", to: "b" },
        { from: "c", to: "d" },
      ],
    };
    expect(shortestPath(g, "a", "d")).toBeNull();
  });

  it("returns null when a node is absent from the edge set", () => {
    expect(shortestPath({ edges: [] }, "a", "b")).toBeNull();
  });
});
