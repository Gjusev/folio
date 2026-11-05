import { describe, expect, it } from "vitest";
import { diffWords, type DiffOp } from "@/lib/text-diff";

/** The exactness property: same+del rebuilds a, same+ins rebuilds b. */
function reconstruct(ops: DiffOp[]) {
  return {
    a: ops
      .filter((o) => o.type !== "ins")
      .map((o) => o.text)
      .join(""),
    b: ops
      .filter((o) => o.type !== "del")
      .map((o) => o.text)
      .join(""),
  };
}

function expectExact(a: string, b: string) {
  const ops = diffWords(a, b);
  const { a: ra, b: rb } = reconstruct(ops);
  expect(ra).toBe(a);
  expect(rb).toBe(b);
  // Adjacent ops of the same type are merged.
  for (let i = 1; i < ops.length; i++) expect(ops[i].type).not.toBe(ops[i - 1].type);
  return ops;
}

describe("diffWords: exactness", () => {
  it("reconstructs both sides on the edge cases", () => {
    expectExact("", "");
    expectExact("", "inserted text");
    expectExact("deleted text", "");
    const same = "The result is significant.";
    expectExact(same, same);
  });

  it("reconstructs on rewrites, LaTeX and unicode", () => {
    expectExact(
      "The model improves accuracy by a large margin.",
      "The model improves accuracy by a small margin.",
    );
    expectExact("El niño medía la señal ºØ.", "El niño mide la señal ºØ.");
    expectExact(
      String.raw`\emph{Important} result~\cite{a}`,
      String.raw`\textbf{Important} result~\cite{a,b}`,
    );
    expectExact(
      String.raw`\begin{equation} x = y \end{equation}`,
      String.raw`\begin{align} x &= y \\ z &= w \end{align}`,
    );
    // Changed text on both sides plus shared prefix and suffix.
    expectExact(
      "prefix We propose a novel method suffix",
      "prefix We propose a boring method suffix",
    );
    // Whitespace-only change.
    expectExact("a  b\tc", "a b c");
  });

  it("reconstructs on long inputs (property sweep)", () => {
    const words = "alpha beta gamma delta epsilon zeta eta theta".split(" ");
    const a = Array.from({ length: 300 }, (_, i) => words[i % words.length]).join(" ");
    for (const b of [a, "", `${a} tail`, `head ${a}`, a.replace(/gamma/g, "GAAMMA")]) {
      const ops = diffWords(a, b);
      expect(reconstruct(ops).a).toBe(a);
      expect(reconstruct(ops).b).toBe(b);
    }
  });
});

describe("diffWords: shape", () => {
  it("marks a pure insertion as one ins op", () => {
    const ops = diffWords("keep this", "keep this and that");
    expect(ops).toEqual([
      { type: "same", text: "keep this" },
      { type: "ins", text: " and that" },
    ]);
  });

  it("marks a pure deletion as one del op", () => {
    const ops = diffWords("keep this and that", "keep this");
    expect(ops).toEqual([
      { type: "same", text: "keep this" },
      { type: "del", text: " and that" },
    ]);
  });

  it("replaces a word instead of del+ins of everything", () => {
    const ops = diffWords("large margin", "small margin");
    expect(ops.some((o) => o.type === "del" && o.text.trim() === "large")).toBe(true);
    expect(ops.some((o) => o.type === "ins" && o.text.trim() === "small")).toBe(true);
    expect(ops.some((o) => o.type === "same" && o.text.includes("margin"))).toBe(true);
  });

  it("falls back to a coarse whole-text replace above the token ceiling", () => {
    const a = "word ".repeat(6_001); // 12 002 tokens: over the 6000 ceiling
    const b = "other ".repeat(6_001);
    expect(diffWords(a, b)).toEqual([
      { type: "del", text: a },
      { type: "ins", text: b },
    ]);
    // The coarse result is still exact.
    expectExact(a, b);
  });
});
