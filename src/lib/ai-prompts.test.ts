import { describe, expect, it } from "vitest";
import {
  buildCritiqueMessages,
  buildDraftMessages,
  citationUndefinedKeys,
  inputsInclude,
  insertDraftBeforeEnd,
  parseCritique,
  type EvidenceItem,
} from "@/lib/ai-prompts";

const evidence: EvidenceItem[] = [
  {
    key: "beltagy2020longformer",
    title: "Longformer",
    authors: ["Iz Beltagy"],
    year: 2020,
    source: "openalex",
    paperId: "W1",
    inBib: false,
  },
];

describe("buildDraftMessages: word budget", () => {
  it("states an explicit ceiling when budget is set, replacing the fuzzy target", () => {
    const messages = buildDraftMessages({
      instruction: "escribe trabajos relacionados",
      filePath: "main.tex",
      outline: [],
      bibKeys: [],
      evidence: [],
      budget: { words: 400 },
    });
    const user = messages[1].content;
    expect(user).toContain("WORD BUDGET: aim for at most 400 words");
    expect(user).not.toContain("TARGET LENGTH");
  });

  it("budget wins over the length preset", () => {
    const messages = buildDraftMessages({
      instruction: "draft",
      filePath: "main.tex",
      outline: [],
      bibKeys: [],
      evidence: [],
      length: "long",
      budget: { words: 150 },
    });
    expect(messages[1].content).toContain("aim for at most 150 words");
    expect(messages[1].content).not.toContain("700");
  });
});

describe("buildCritiqueMessages", () => {
  it("demands one JSON object and shows goal, budget, evidence and draft", () => {
    const messages = buildCritiqueMessages({
      instruction: "Write the related work section",
      goal: "Compare efficient attention methods",
      budget: 400,
      evidence,
      draft: "\\section{Related work}\nLongformer \\cite{beltagy2020longformer} scales.",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[0].content).toContain("ONE JSON object");
    for (const kind of ["evidence", "citation", "structure", "latex"]) {
      expect(messages[0].content).toContain(`"${kind}"`);
    }
    const user = messages[1].content;
    expect(user).toContain("GOAL: Compare efficient attention methods");
    expect(user).toContain("WORD BUDGET: at most 400 words");
    expect(user).toContain("- beltagy2020longformer [new]: Longformer — Iz Beltagy (2020)");
    expect(user).toContain("Longformer \\cite{beltagy2020longformer} scales.");
  });

  it("tells the critic when the draft had no evidence at all", () => {
    const messages = buildCritiqueMessages({
      instruction: "Write the intro",
      evidence: [],
      draft: "Intro text.",
    });
    expect(messages[1].content).toContain("EVIDENCE: none was provided");
    expect(messages[1].content).not.toContain("WORD BUDGET");
  });
});

describe("parseCritique", () => {
  it("parses a clean JSON reply", () => {
    const raw = JSON.stringify({
      verdict: "revise",
      issues: [
        { kind: "evidence", note: "Claims 40% gain; no evidence supports it." },
        { kind: "latex", note: "Unclosed \\begin{itemize}." },
      ],
    });
    const critique = parseCritique(raw)!;
    expect(critique.verdict).toBe("revise");
    expect(critique.issues).toHaveLength(2);
    expect(critique.issues[1]).toEqual({ kind: "latex", note: "Unclosed \\begin{itemize}." });
  });

  it("tolerates ```json fences and prose around the object", () => {
    const payload = JSON.stringify({ verdict: "ok", issues: [] });
    expect(parseCritique(`Sure!\n\`\`\`json\n${payload}\n\`\`\`\nDone.`)).toEqual({
      verdict: "ok",
      issues: [],
    });
  });

  it("returns null for junk or an unusable verdict", () => {
    expect(parseCritique("I could not review this.")).toBeNull();
    expect(parseCritique('{"verdict":"maybe","issues":[]}')).toBeNull();
  });

  it("caps at 5 issues", () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({
      kind: "structure",
      note: `issue ${i}`,
    }));
    const critique = parseCritique(JSON.stringify({ verdict: "revise", issues }))!;
    expect(critique.issues).toHaveLength(5);
    expect(critique.issues[0].note).toBe("issue 0");
  });

  it("discards unknown kinds, keeps the rest", () => {
    const critique = parseCritique(
      JSON.stringify({
        verdict: "revise",
        issues: [
          { kind: "style", note: "too formal" },
          { kind: "citation", note: "\\cite{x} does not say this" },
        ],
      }),
    )!;
    expect(critique.issues).toEqual([{ kind: "citation", note: "\\cite{x} does not say this" }]);
  });

  it("trims notes to 200 characters", () => {
    const critique = parseCritique(
      JSON.stringify({
        verdict: "revise",
        issues: [{ kind: "evidence", note: "n".repeat(300) }],
      }),
    )!;
    expect(critique.issues[0].note).toHaveLength(200);
  });
});

describe("insertDraftBeforeEnd", () => {
  it("inserts the draft just before the LAST \\end{document}", () => {
    // A commented-out or verbatim \end{document} must not win.
    const main = "A\n\\end{document}\nB\n\\end{document}";
    const out = insertDraftBeforeEnd(main, "\\section{New}\nFresh text.");
    expect(out).toBe("A\n\\end{document}\nB\n\n\\section{New}\nFresh text.\n\n\\end{document}");
  });

  it("returns null when there is no \\end{document}", () => {
    expect(insertDraftBeforeEnd("Just a fragment.", "draft")).toBeNull();
  });
});

describe("citationUndefinedKeys", () => {
  it("collects keys from BibTeX and LaTeX warning flavours, deduplicated", () => {
    const log = [
      "This is BibTeX, Version 5.2 (TeX Live 2025)",
      "Warning--Citation 'smith2020unresolved' undefined",
      "LaTeX Warning: Citation 'jones2021missing' on page 1 undefined on input line 3.",
      "LaTeX Warning: Citation 'smith2020unresolved' on page 2 undefined on input line 9.",
      "Package natbib Warning: Citation 'doe1999later' on page 4 undefined on input line 21.",
    ].join("\n");
    expect(citationUndefinedKeys(log)).toEqual([
      "smith2020unresolved",
      "jones2021missing",
      "doe1999later",
    ]);
  });

  it("ignores reference warnings and citations that resolved", () => {
    const log = [
      "LaTeX Warning: Reference 'fig:1' on page 1 undefined on input line 12.",
      "LaTeX Warning: Citation 'good2019key' on page 3 on input line 40.",
      "LaTeX Warning: There were undefined references.",
    ].join("\n");
    expect(citationUndefinedKeys(log)).toEqual([]);
  });

  it("composes as the route does: merged draft, real log with 2 undefined and 1 resolved", () => {
    const main = "\\documentclass{article}\n\\begin{document}\nIntro.\n\\end{document}";
    const merged = insertDraftBeforeEnd(
      main,
      "\\section{Related work}\nA \\cite{smith2020}, B \\cite{jones2021}, C \\cite{doe2019}.",
    );
    expect(merged).toBe(
      "\\documentclass{article}\n\\begin{document}\nIntro.\n\n" +
        "\\section{Related work}\nA \\cite{smith2020}, B \\cite{jones2021}, C \\cite{doe2019}.\n\n" +
        "\\end{document}",
    );
    const log = [
      "This is BibTeX, Version 5.2 (TeX Live 2025)",
      "Warning--Citation 'smith2020' undefined",
      "",
      "This is pdfTeX, Version 5.0.0",
      "LaTeX Warning: Citation 'jones2021' on page 1 undefined on input line 42.",
      "LaTeX Warning: Citation 'doe2019' on page 1 on input line 43.",
    ].join("\n");
    const undefinedKeys = citationUndefinedKeys(log);
    expect(undefinedKeys).toEqual(["smith2020", "jones2021"]);
    // Same split the verify event reports: resolved = used - undefined.
    const undefinedSet = new Set(undefinedKeys);
    expect(["smith2020", "jones2021", "doe2019"].filter((k) => !undefinedSet.has(k))).toEqual([
      "doe2019",
    ]);
  });
});

describe("inputsInclude", () => {
  const files = [
    {
      path: "main.tex",
      content: "\\documentclass{article}\\begin{document}\\input{chapters/a}\\end{document}",
    },
    { path: "chapters/a.tex", content: "text\\input{b}" },
    { path: "chapters/b.tex", content: "\\include{../notes}text" },
    { path: "notes.tex", content: "orphan text" },
    { path: "island.tex", content: "\\begin{document}\\end{document}" },
  ];

  it("reaches files through chains of \\input/\\include, with or without extension", () => {
    expect(inputsInclude(files, "main.tex", "main.tex")).toBe(true);
    expect(inputsInclude(files, "main.tex", "chapters/a.tex")).toBe(true);
    expect(inputsInclude(files, "main.tex", "chapters/b.tex")).toBe(true);
    expect(inputsInclude(files, "main.tex", "notes.tex")).toBe(true); // ../ from chapters/
  });

  it("a file outside the tree is honestly unreachable", () => {
    expect(inputsInclude(files, "main.tex", "island.tex")).toBe(false);
  });
});
