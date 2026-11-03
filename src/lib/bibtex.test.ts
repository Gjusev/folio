import { describe, expect, it } from "vitest";
import { texEscape, toBibtex } from "@/lib/bibtex";

describe("texEscape", () => {
  it("keeps math and protective braces intact", () => {
    expect(texEscape("$\\alpha$-stable")).toBe("$\\alpha$-stable");
    expect(texEscape("{Deep} Learning")).toBe("{Deep} Learning");
  });

  it("balances unbalanced braces instead of deleting them", () => {
    expect(texEscape("foo{")).toBe("foo{}");
    expect(texEscape("foo}")).toBe("{foo}");
  });

  it("escapes the BibTeX specials as before", () => {
    expect(texEscape("a&b%c#d_e~f^g")).toBe(
      "a\\&b\\%c\\#d\\_e\\textasciitilde{}f\\textasciicircum{}g",
    );
  });
});

describe("toBibtex with math in field values", () => {
  it("emits a balanced entry for a title with math and a stray brace", () => {
    const { entry } = toBibtex({
      title: "$\\alpha$-stable processes{",
      authors: ["Gennady Samorodnitsky"],
      year: 1994,
      type: "book",
    });
    expect(entry).toContain("title       = {{$\\alpha$-stable processes{}}}");
    const opens = (entry.match(/{/g) ?? []).length;
    const closes = (entry.match(/}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
