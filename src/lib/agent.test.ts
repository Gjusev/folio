import { describe, expect, it } from "vitest";
import {
  buildDraftMessages,
  buildPlanMessages,
  enforceCiteKeys,
  parsePlan,
} from "@/lib/ai-prompts";

describe("enforceCiteKeys (STORM-style structural contract)", () => {
  it("keeps allowed keys, drops invented ones, remembers what was used", () => {
    const latex =
      "Attention \\cite{vaswani2017attention} improved NLP. " +
      "Fake claims \\cite{invented2024fake} persist. " +
      "Mixed \\cite{vaswani2017attention, another2024lie} survives filtered.";
    const { latex: out, used } = enforceCiteKeys(latex, ["vaswani2017attention"]);
    expect(out).toContain("\\cite{vaswani2017attention}");
    expect(out).not.toContain("invented2024fake");
    expect(out).toContain("\\cite{vaswani2017attention}");
    expect(out).not.toContain("another2024lie");
    expect(out).not.toMatch(/Fake claims \\\\cite/); // a cite with no valid keys vanishes
    expect(used).toEqual(["vaswani2017attention"]);
  });

  it("handles citep/citet variants and optional arguments", () => {
    const { latex: out, used } = enforceCiteKeys(
      "\\citep[p.~5]{good2020key} and \\citet{bad2020key}",
      ["good2020key"],
    );
    expect(out).toBe("\\citep[p.~5]{good2020key} and ");
    expect(used).toEqual(["good2020key"]);
  });

  it("builds the draft prompt with the allowed-keys contract", () => {
    const messages = buildDraftMessages({
      instruction: "escribe trabajos relacionados sobre atención eficiente",
      filePath: "main.tex",
      outline: ["\\section{Introduction}", "\\section{Method}"],
      bibKeys: ["vaswani2017attention"],
      evidence: [
        {
          key: "beltagy2020longformer",
          title: "Longformer",
          authors: ["Iz Beltagy"],
          year: 2020,
          source: "openalex",
          paperId: "W1",
          inBib: false,
        },
      ],
      instructions: "Escribe en primera persona plural y sé conciso.",
      styleSample: "Nosotros proponemos un método novedoso.",
      length: "long",
    });
    const user = messages[1].content;
    expect(user).toContain("ALLOWED KEYS");
    expect(user).toContain("vaswani2017attention, beltagy2020longformer");
    expect(user).toContain("- beltagy2020longformer [new]: Longformer — Iz Beltagy (2020)");
    expect(messages[0].content).toContain("Cite ONLY");
    // Steering: persistent instructions, style sample and target length.
    expect(user).toContain("USER INSTRUCTIONS");
    expect(user).toContain("primera persona plural");
    expect(user).toContain("WRITING SAMPLE");
    expect(user).toContain("Nosotros proponemos");
    expect(user).toContain("TARGET LENGTH: about 700 words");
  });

  it("falls back to the author's own document as the style sample", () => {
    const messages = buildDraftMessages({
      instruction: "draft the results section",
      filePath: "main.tex",
      outline: [],
      bibKeys: [],
      evidence: [],
      documentExcerpt: "Our approach beats all baselines by a wide margin.",
    });
    expect(messages[1].content).toContain("WRITING SAMPLE");
    expect(messages[1].content).toContain("beats all baselines");
  });
});

describe("parsePlan (section plan agent)", () => {
  const keys = ["vaswani2017attention", "mikolov2013efficient"];

  it("parses a clean plan and keeps only real bibliography keys", () => {
    const raw = JSON.stringify({
      title: "Efficient attention",
      sections: [
        {
          title: "Introduction",
          goal: "Set the problem",
          points: ["why it matters", "our contribution"],
          cite: ["vaswani2017attention", "madeup2024key"],
        },
      ],
    });
    const plan = parsePlan(raw, keys)!;
    expect(plan.title).toBe("Efficient attention");
    expect(plan.sections[0].cite).toEqual(["vaswani2017attention"]);
  });

  it("extracts JSON from a fenced or chatty reply", () => {
    const plan = parsePlan(
      'Sure! Here is the plan:\n```json\n{"title":"T","sections":[{"title":"S","goal":"g","points":[],"cite":[]}]}\n```',
      keys,
    );
    expect(plan?.sections[0].title).toBe("S");
  });

  it("returns null for junk", () => {
    expect(parsePlan("no plan here", keys)).toBeNull();
    expect(parsePlan('{"title":"T","sections":[]}', keys)).toBeNull();
  });

  it("caps sections, points and field lengths", () => {
    const sections = Array.from({ length: 20 }, (_, i) => ({
      title: `S${i}`,
      goal: "g".repeat(500),
      points: Array.from({ length: 10 }, () => "p".repeat(300)),
      cite: [],
    }));
    const plan = parsePlan(JSON.stringify({ title: "T", sections }), keys)!;
    expect(plan.sections.length).toBe(10);
    expect(plan.sections[0].goal.length).toBe(400);
    expect(plan.sections[0].points.length).toBe(4);
    expect(plan.sections[0].points[0].length).toBe(200);
  });

  it("builds the plan prompt with the allowed-keys contract", () => {
    const messages = buildPlanMessages({
      instruction: "plan a survey on efficient attention",
      outline: ["\\section{Introduction}"],
      bibKeys: keys,
    });
    expect(messages[0].content).toContain("ONE JSON object");
    expect(messages[1].content).toContain("ALLOWED KEYS: vaswani2017attention");
    expect(messages[1].content).toContain("DOCUMENT OUTLINE");
  });
});
