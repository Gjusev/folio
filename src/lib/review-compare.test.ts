import { describe, expect, it } from "vitest";
import { compareReviews } from "@/lib/review-compare";
import type { Review, ReviewComment } from "@/lib/review";

const c = (over: Partial<ReviewComment>): ReviewComment => ({
  aspect: "clarity",
  severity: "minor",
  file: "main.tex",
  line: 10,
  quote: "the model was trained for days",
  comment: "Say how many.",
  suggestion: null,
  ...over,
});

const rev = (...comments: ReviewComment[]): Review => ({
  summary: "s",
  scores: {},
  comments,
});

describe("compareReviews", () => {
  it("a comment moved at most 5 lines in the same file is the same comment", () => {
    const oldRev = rev(c({ line: 10, quote: "quote of the old comment" }));
    expect(compareReviews(oldRev, rev(c({ line: 14, quote: "same spot" })))).toEqual({
      resolved: 0,
      added: 0,
      open: 0,
    });
    // 6 lines apart with a different quote: the old one counts as resolved and the new one as added
    expect(compareReviews(oldRev, rev(c({ line: 16, quote: "somewhere else" })))).toEqual({
      resolved: 1,
      added: 1,
      open: 1,
    });
  });

  it("matches by quote prefix even when the line moved far or the file changed", () => {
    const oldRev = rev(c({ line: 10, quote: "attention is all you need" }));
    expect(
      compareReviews(
        oldRev,
        rev(c({ file: "intro.tex", line: 400, quote: "attention is all you need, say" })),
      ),
    ).toEqual({ resolved: 0, added: 0, open: 0 });
  });

  it("never matches across aspects", () => {
    const oldRev = rev(c({ aspect: "clarity" }));
    expect(compareReviews(oldRev, rev(c({ aspect: "evidence" })))).toEqual({
      resolved: 1,
      added: 1,
      open: 1,
    });
  });

  it("empty quotes never match when the line rule cannot apply", () => {
    // Far apart, so only the quote prefix could save the match.
    const oldRev = rev(c({ line: 10, quote: null }));
    expect(compareReviews(oldRev, rev(c({ line: 200, quote: null })))).toEqual({
      resolved: 1,
      added: 1,
      open: 1,
    });
    // "" is as good as null
    expect(compareReviews(oldRev, rev(c({ line: 200, quote: "" })))).toEqual({
      resolved: 1,
      added: 1,
      open: 1,
    });
  });

  it("counts mixed results and ignores dismissed states (the UI layers them)", () => {
    const oldRev = rev(
      c({ line: 10, quote: "alpha quote text" }),
      c({ line: 40, quote: "beta quote text" }),
      c({ line: 80, quote: "gamma quote text" }),
    );
    const newRev = rev(
      c({ line: 12, quote: "alpha quote text" }), // continues the first
      c({ line: 41, quote: "beta quote text" }), // continues the second
      c({ line: 200, quote: "delta quote text", comment: "brand new" }),
    );
    expect(compareReviews(oldRev, newRev)).toEqual({ resolved: 1, added: 1, open: 1 });
  });
});
