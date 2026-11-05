import { describe, expect, it } from "vitest";
import { findTemplate } from "@/lib/templates";
import type { Review } from "@/lib/review";
import {
  LETTER_PREAMBLE,
  buildResponseLetter,
  escapeLatex,
  itemsFromFolioReview,
  parseDrafts,
  parsePastedReview,
} from "@/lib/letter";

describe("escapeLatex", () => {
  it("escapes every special, backslash first", () => {
    expect(escapeLatex("a\\b%c$d&e#f_g{h}i~j^k")).toBe(
      "a\\textbackslash{}b\\%c\\$d\\&e\\#f\\_g\\{h\\}i\\textasciitilde{}j\\textasciicircum{}k",
    );
  });
  it("keeps a trailing backslash well-formed", () => {
    expect(escapeLatex("trailing\\")).toBe("trailing\\textbackslash{}");
  });
});

describe("parsePastedReview", () => {
  it("splits plain numbering: 1. / 1) / (1)", () => {
    for (const text of ["1. One.\n2. Two.", "1) One.\n2) Two.", "(1) One.\n(2) Two."]) {
      const items = parsePastedReview(text);
      expect(items.map((i) => i.id)).toEqual(["P1", "P2"]);
      expect(items.map((i) => i.comment)).toEqual(["One.", "Two."]);
    }
  });

  it("keeps code labels (R1.2 / W2.3) as ids and word labels as C-numbers", () => {
    const items = parsePastedReview(
      "R1.2: The abstract is vague.\nW2.3: Units missing.\nComment 3: Typos.\nPunto 2: Grave issue.",
    );
    expect(items.map((i) => i.id)).toEqual(["R1.2", "W2.3", "C3", "C2"]);
  });

  it("splits blocks on Reviewer headers (English, markdown-tolerant)", () => {
    const items = parsePastedReview(
      "Reviewer 1:\n1. First point.\n\n## Reviewer #2 general\n1) Their point.",
    );
    expect(items.map((i) => i.reviewer)).toEqual(["Reviewer 1", "Reviewer 2"]);
    expect(items.map((i) => i.id)).toEqual(["P1", "P1"]); // counters restart per block
  });

  it("treats bullets as points", () => {
    const items = parsePastedReview("- first\n* second\n- third");
    expect(items.map((i) => i.id)).toEqual(["P1", "P2", "P3"]);
  });

  it("does not cut a point on blank lines (multi-paragraph points)", () => {
    const items = parsePastedReview(
      "1. First paragraph.\n\nSecond paragraph of the same point.\n2. Next.",
    );
    expect(items).toHaveLength(2);
    expect(items[0].comment).toBe("First paragraph. Second paragraph of the same point.");
  });

  it("guesses severity from words in English and Spanish", () => {
    const items = parsePastedReview(
      "1. This must be fixed; it is critical.\n2. Menor: solo un typo.\n3. Something else entirely.",
    );
    expect(items.map((i) => i.severity)).toEqual(["major", "minor", null]);
  });

  it('drops dangling markers with no text (trailing "3. " or "- ")', () => {
    const items = parsePastedReview("1. Real point.\n2. Other.\n3. ");
    expect(items.map((i) => [i.id, i.comment])).toEqual([
      ["P1", "Real point."],
      ["P2", "Other."],
    ]);
    expect(parsePastedReview("- only point\n- ")).toHaveLength(1);
  });

  it("returns one point for marker-free prose and nothing for empty input", () => {
    const prose = parsePastedReview("The paper is fine but the figures need work.");
    expect(prose).toHaveLength(1);
    expect(prose[0]).toMatchObject({ id: "P1", reviewer: "Reviewers" });
    expect(prose[0].comment).toContain("figures");
    expect(parsePastedReview("   \n  ")).toEqual([]);
  });
});

describe("itemsFromFolioReview", () => {
  it("maps comments to F-numbered Folio items, keeping locations and quotes", () => {
    const review = {
      summary: "s",
      scores: {},
      comments: [
        {
          aspect: "clarity",
          severity: "major",
          file: "main.tex",
          line: 12,
          quote: "vague sentence",
          comment: "Too vague.",
          suggestion: null,
        },
        {
          aspect: "format",
          severity: "nit",
          file: null,
          line: null,
          quote: null,
          comment: "Spacing.",
          suggestion: "fix",
        },
      ],
    } as unknown as Review;
    const items = itemsFromFolioReview(review);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "F1",
      reviewer: "Folio",
      severity: "major",
      quote: "vague sentence",
      file: "main.tex",
      line: 12,
      response: "",
      aiDraft: false,
    });
    expect(items[1]).toMatchObject({ id: "F2", file: null, line: null, quote: null });
  });
});

describe("buildResponseLetter", () => {
  const items = parsePastedReview(
    "Reviewer 1:\n1. Major: fix the claim.\n2. Minor typo in the title.\nReviewer 2:\nR2.1: Method unclear.",
  );

  it("renders one subsection per item, grouped by reviewer in first-appearance order", () => {
    const tex = buildResponseLetter(items, { lang: "en" });
    expect(tex.match(/\\subsection\*/g)).toHaveLength(3);
    const first = tex.indexOf("\\section*{Reviewer 1}");
    const second = tex.indexOf("\\section*{Reviewer 2}");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(tex.indexOf("fix the claim")).toBeGreaterThan(first);
    expect(tex.indexOf("Method unclear")).toBeGreaterThan(second);
  });

  it("escapes LaTeX specials coming from comments", () => {
    const tex = buildResponseLetter(parsePastedReview("1. 100% of $5 & #1 _great_ {yes}"), {
      lang: "en",
    });
    expect(tex).toContain("100\\% of \\$5 \\& \\#1 \\_great\\_ \\{yes\\}");
    expect(tex).not.toMatch(/[^\\]%/); // no unescaped comment start
  });

  it("adds Location only for located items and an empty response stays a placeholder", () => {
    const withFile = [
      {
        id: "F1",
        reviewer: "Folio",
        severity: null,
        quote: null,
        comment: "c",
        file: "main.tex",
        line: 42,
        response: "",
        aiDraft: false,
      },
    ];
    const tex = buildResponseLetter(withFile, { lang: "en" });
    expect(tex).toContain("\\textbf{Location.} main.tex, line 42");
    expect(tex).toContain("\\textbf{Response.} ---");
    const noFile = buildResponseLetter([{ ...withFile[0], file: null, line: null }], {
      lang: "en",
    });
    expect(noFile).not.toContain("Location");
  });

  it("marks AI-drafted responses with a localized comment", () => {
    const tex = buildResponseLetter(
      [
        {
          id: "P1",
          reviewer: "Reviewers",
          severity: null,
          quote: null,
          comment: "c",
          file: null,
          line: null,
          response: "Thanks, fixed.",
          aiDraft: true,
        },
      ],
      { lang: "en" },
    );
    expect(tex).toContain("% AI DRAFT");
  });

  it("adds the appendix only with a snapshot label, and names it", () => {
    const base = buildResponseLetter(items, { lang: "es" });
    expect(base).not.toContain("Apéndice");
    const withSnap = buildResponseLetter(items, {
      lang: "es",
      snapshotLabel: "v1 enviada al journal",
    });
    expect(withSnap).toContain("Apéndice: cambios en el manuscrito");
    expect(withSnap).toContain("v1 enviada al journal");
  });

  it("uses the exact preamble of the response-letter template", () => {
    const template = findTemplate("response-letter")!.files[0].content;
    expect(template.split("\\begin{document}")[0]).toBe(LETTER_PREAMBLE);
    const tex = buildResponseLetter(items, { lang: "en" });
    expect(tex.startsWith(LETTER_PREAMBLE)).toBe(true);
  });
});

describe("parseDrafts", () => {
  it("tolerates fences and prose, and discards ids the author did not send", () => {
    const raw =
      'Sure, here you go:\n```json\n{"drafts":[{"id":"P1","response":"Fixed."},{"id":"EVIL","response":"Nope"}]}\n```';
    expect(parseDrafts(raw, ["P1", "P2"])).toEqual([{ id: "P1", response: "Fixed." }]);
  });

  it("drops empty responses and caps the rest at 1500 characters", () => {
    const raw = JSON.stringify({
      drafts: [
        { id: "P1", response: "x".repeat(2000) },
        { id: "P2", response: "   " },
      ],
    });
    const out = parseDrafts(raw, ["P1", "P2"]);
    expect(out).toHaveLength(1);
    expect(out[0].response).toHaveLength(1500);
  });

  it("returns [] when there is no usable JSON", () => {
    expect(parseDrafts("I cannot do that.", ["P1"])).toEqual([]);
  });
});
