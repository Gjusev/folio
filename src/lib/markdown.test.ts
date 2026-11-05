import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/lib/markdown";

describe("parseMarkdown", () => {
  it("keeps hostile HTML as plain text (React escapes it at render time)", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>hello <b>bold</b>");
    // No HTML string is ever produced — only data nodes with the raw text.
    expect(blocks).toEqual([{ p: [{ text: "<script>alert(1)</script>hello <b>bold</b>" }] }]);
  });

  it("leaves LaTeX untouched", () => {
    const src = String.raw`The mass is \frac{a}{b} of 50\% and \cite{x} says so.`;
    expect(parseMarkdown(src)).toEqual([{ p: [{ text: src }] }]);
  });

  it("fenced code blocks keep their content verbatim, markdown unparsed", () => {
    const blocks = parseMarkdown("before\n```latex\n**not bold** $x$\n\\label{eq}\n```\nafter");
    expect(blocks).toEqual([
      { p: [{ text: "before" }] },
      { pre: { lang: "latex", code: "**not bold** $x$\n\\label{eq}" } },
      { p: [{ text: "after" }] },
    ]);
  });

  it("renders an unclosed fence as code (streaming mid-answer)", () => {
    expect(parseMarkdown("```latex\n\\frac{1}{2}")).toEqual([
      { pre: { lang: "latex", code: "\\frac{1}{2}" } },
    ]);
  });

  it("inline code, bold and italic", () => {
    expect(parseMarkdown("a `x**y**` b **bold** c *it*")).toEqual([
      {
        p: [
          { text: "a " },
          { code: "x**y**" },
          { text: " b " },
          { bold: "bold" },
          { text: " c " },
          { italic: "it" },
        ],
      },
    ]);
  });

  it("links only over http(s); other schemes stay literal text", () => {
    expect(
      parseMarkdown("[ok](https://example.org/a?b=1) [x](javascript:alert(1)) [y](ftp://z)"),
    ).toEqual([
      {
        p: [
          { link: { href: "https://example.org/a?b=1", text: "ok" } },
          { text: " [x](javascript:alert(1)) [y](ftp://z)" },
        ],
      },
    ]);
  });

  it("paragraphs on blank lines, single newlines as br", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { p: [{ text: "one" }, { br: true }, { text: "two" }] },
      { p: [{ text: "three" }] },
    ]);
  });
});
