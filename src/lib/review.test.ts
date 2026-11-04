import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  buildExcerpt,
  buildReviewMessages,
  parseReview,
  parseSections,
  projectSections,
  reviewToMarkdown,
} from "./review";

const MAIN = String.raw`\documentclass{article}
\title{T}
\begin{document}
\maketitle
\begin{abstract}
We study things and report results of the study.
\end{abstract}

\section{Introduction}
Transformers are great~\cite{a}.
Second line.

\subsection{Background}
Some background.

\section{Method}
We do it.
\label{sec:m}

\bibliography{refs}
\end{document}
`;
const FILES = [
  { path: "main.tex", content: MAIN },
  { path: "refs.bib", content: "@article{a, title={A}}" },
];

describe("parseSections", () => {
  const s = parseSections("main.tex", MAIN);

  it("splits at headings, keeping the pre-heading text (abstract) as its own section", () => {
    expect(s.map((x) => [x.title, x.level])).toEqual([
      ["", 0],
      ["Introduction", 1],
      ["Background", 2],
      ["Method", 1],
    ]);
  });

  it("gives 1-based inclusive line ranges that stop before the next heading and at the bibliography", () => {
    const intro = s.find((x) => x.title === "Introduction")!;
    expect(MAIN.split("\n")[intro.start - 1]).toMatch(/\\section\{Introduction\}/);
    expect(MAIN.split("\n")[intro.end]).toMatch(/\\subsection\{Background\}/);
    const method = s.find((x) => x.title === "Method")!;
    expect(
      MAIN.split("\n")
        .slice(method.start - 1, method.end)
        .join("\n"),
    ).not.toMatch(/bibliography|end\{document\}/);
  });

  it("ignores non-tex files in projectSections and ids are unique", () => {
    const all = projectSections(FILES);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(all.every((x) => x.file === "main.tex")).toBe(true);
  });

  it("a document without headings yields nothing instead of crashing", () => {
    expect(parseSections("a.tex", "just text\n")).toEqual([]);
  });

  it("skips fragments that are not prose (a TikZ figure has no headings or document body)", () => {
    const tikz =
      "\\begin{tikzpicture}\n\\node {a};\n\\node {b};\n\\node {c};\n\\end{tikzpicture}\n";
    expect(parseSections("figures/f.tex", tikz)).toEqual([]);
  });
});

describe("buildExcerpt", () => {
  it("numbers lines with their real line numbers and reports the ranges shown", () => {
    const intro = projectSections(FILES).find((x) => x.title === "Introduction")!;
    const ex = buildExcerpt(FILES, [intro.id]);
    expect(ex.ranges).toHaveLength(1);
    expect(ex.text).toContain("=== main.tex — Introduction ===");
    expect(ex.text).toContain(`${intro.start}| \\section{Introduction}`);
    expect(ex.text).not.toContain("We do it.");
    expect(ex.truncated).toBe(false);
  });

  it("clips to the character budget and says so", () => {
    const ex = buildExcerpt(FILES, "all", 120);
    expect(ex.truncated).toBe(true);
    expect(ex.text.length).toBeLessThanOrEqual(220); // header lines are not counted in the budget
    expect(ex.ranges.length).toBeGreaterThan(0);
  });

  it("an unknown scope id selects nothing", () => {
    expect(buildExcerpt(FILES, ["nope#9"]).ranges).toEqual([]);
  });
});

describe("buildReviewMessages", () => {
  it("states persona, aspects, language and the untrusted-text rule", () => {
    const [sys, user] = buildReviewMessages({
      excerpt: "1| hi",
      aspects: ["clarity", "math"],
      rigor: "strict",
      lang: "de",
      focus: "overclaiming in the abstract",
      bibKeys: ["a", "b"],
      truncated: false,
    });
    expect(sys.content).toMatch(/Reviewer 2/);
    expect(sys.content).toMatch(/clarity, math/);
    expect(sys.content).toMatch(/German/);
    expect(sys.content).toMatch(/untrusted data/);
    expect(sys.content).toMatch(/Known bibliography keys: a, b/);
    expect(sys.content).not.toMatch(/citations: FORM/); // aspect not requested
    expect(user.content).toMatch(/overclaiming in the abstract/);
  });
});

describe("parseReview", () => {
  const ranges = [{ file: "main.tex", title: "Introduction", start: 9, end: 14 }];
  const good = {
    summary: "Solid draft; tighten the claims.",
    scores: { clarity: 4, math: 9, bogus: 3 },
    comments: [
      {
        aspect: "clarity",
        severity: "minor",
        file: "main.tex",
        line: 10,
        quote: "Transformers are great",
        comment: "Vague claim.",
        suggestion: "Say what they are good at.",
      },
      {
        aspect: "evidence",
        severity: "major",
        file: "main.tex",
        line: 999, // outside every range the model was shown
        quote: "invented",
        comment: "Unsupported.",
        suggestion: "",
      },
      {
        aspect: "style-guide",
        severity: "major",
        comment: "wrong aspect",
        file: "main.tex",
        line: 10,
      },
      {
        aspect: "clarity",
        severity: "minor",
        file: "main.tex",
        line: 10,
        quote: "nonsense",
        comment: "Vague claim.",
      },
    ],
  };
  const parse = (o: unknown, wrap = (s: string) => s) =>
    parseReview(wrap(JSON.stringify(o)), ranges, ["clarity", "evidence", "math"], FILES);

  it("keeps verified locations and quotes, sorts by severity, clamps scores", () => {
    const r = parse(good)!;
    expect(r.comments.map((c) => c.severity)).toEqual(["major", "minor"]);
    const minor = r.comments[1];
    expect(minor).toMatchObject({ file: "main.tex", line: 10, quote: "Transformers are great" });
    expect(r.scores).toEqual({ clarity: 4, math: 5 });
  });

  it("downgrades an out-of-range location to a general comment instead of trusting it", () => {
    const major = parse(good)!.comments[0];
    expect(major).toMatchObject({ file: null, line: null, quote: null, aspect: "evidence" });
  });

  it("drops comments of aspects that were not requested and exact duplicates", () => {
    const r = parse(good)!;
    expect(r.comments.some((c) => (c.aspect as string) === "style-guide")).toBe(false);
    expect(r.comments).toHaveLength(2); // the 4th is a duplicate of the 1st (same key)
  });

  it("tolerates fences/prose and rejects junk or a wrong shape", () => {
    expect(parse(good, (s) => "Here you go:\n```json\n" + s + "\n```")).not.toBeNull();
    expect(parseReview("not json", ranges, ASPECTS, FILES)).toBeNull();
    expect(parseReview('{"summary": 3}', ranges, ASPECTS, FILES)).toBeNull();
  });

  it("caps the comment count and the text lengths", () => {
    const many = {
      summary: "x".repeat(2000),
      comments: Array.from({ length: 40 }, (_, i) => ({
        aspect: "clarity",
        severity: "nit",
        file: "main.tex",
        line: 10,
        comment: `c${i} ` + "y".repeat(900),
      })),
    };
    const r = parse(many)!;
    expect(r.comments.length).toBe(20);
    expect(r.comments[0].comment.length).toBeLessThanOrEqual(400);
    expect(r.summary.length).toBeLessThanOrEqual(700);
  });
});

describe("reviewToMarkdown", () => {
  it("lists severity, aspect, location, quote and suggestion", () => {
    const md = reviewToMarkdown(
      {
        summary: "S",
        scores: {},
        comments: [
          {
            aspect: "math",
            severity: "major",
            file: "main.tex",
            line: 3,
            quote: "q",
            comment: "c",
            suggestion: "s",
          },
        ],
      },
      "Review",
    );
    expect(md).toContain("**[major] math** (main.tex:3): c");
    expect(md).toContain("> q");
  });
});
