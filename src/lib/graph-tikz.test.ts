import { describe, expect, it } from "vitest";
import { graphToTikz } from "@/lib/graph-tikz";

describe("graphToTikz", () => {
  const g = {
    seedId: "W1",
    seedTitle: 'Attention & Memory: 100% "free" lunch',
    nodes: [
      { id: "W1", x: 0, y: 0, size: 18, color: "1b6c80", label: "Vaswani 2017" },
      { id: "W2", x: 100, y: 50, size: 6, color: "4a6fa5", label: "Beltagy 2020" },
      { id: "W3", x: -50, y: 80, size: 4, color: "8a857b", label: "Mikolov 2013" },
    ],
    edges: [
      { from: "W1", to: "W2" },
      { from: "W1", to: "W3" },
      { from: "W9", to: "W1" }, // unknown endpoints are dropped
    ],
  };

  it("emits a standalone figure with escaped caption, named nodes and edges", () => {
    const tikz = graphToTikz(g);
    expect(tikz).toContain("\\begin{tikzpicture}");
    expect(tikz).toContain("\\end{figure}");
    // Caption text is LaTeX-escaped (quotes need no escaping in text mode).
    expect(tikz).toContain('Attention \\& Memory: 100\\% "free" lunch');
    // Nodes are addressed by generated names, both edges drawn, bogus one gone.
    expect(tikz.match(/\\draw\[gray!55, thin\] \(n\d+\) -- \(n\d+\);/g)).toHaveLength(2);
    expect(tikz).toContain("(n1) at (");
    // Seed keeps its accent colour via a named xcolor; others get gray borders.
    expect(tikz).toContain("\\definecolor{cg1}{RGB}{27,108,128}");
    expect(tikz).toContain("fill=cg1");
    expect(tikz).toContain("draw=cg1"); // seed border in accent
    expect(tikz.match(/draw=gray!70/g)).toHaveLength(2);
    expect(tikz).toContain("minimum size=");
  });

  it("scales coordinates into the canvas with flipped y and preserved aspect", () => {
    const tikz = graphToTikz(g, 14, 9.5);
    const coords = [...tikz.matchAll(/\(n\d\) at \(([\d.]+),([\d.]+)\)/g)].map((m) => [
      +m[1],
      +m[2],
    ]);
    expect(coords).toHaveLength(3);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(14);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(9.5);
    }
  });
});
