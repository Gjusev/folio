import { describe, expect, it } from "vitest";
import { parseDelimited, texCell, toBooktabs } from "./csv-to-latex";

describe("parseDelimited", () => {
  it("splits rows and columns, sniffing the delimiter by frequency", () => {
    const t = parseDelimited("a;b;c\n1;2;3");
    expect(t.delim).toBe(";");
    expect(t.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(t.cols).toBe(3);
  });

  it("honours quotes: wrapped fields, doubled quotes, commas and newlines inside", () => {
    const t = parseDelimited('"x, y","he said ""hi""","line\nbreak"\n1,2,3');
    expect(t.rows[0]).toEqual(["x, y", 'he said "hi"', "line\nbreak"]);
    expect(t.rows).toHaveLength(2);
  });

  it("CRLF and a trailing blank line behave", () => {
    const t = parseDelimited("a,b\r\n1,2\r\n");
    expect(t.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("pads ragged rows to the widest and marks numeric columns", () => {
    const t = parseDelimited("model,accuracy,params\nA,92.5,1e6\nB,91,2e6");
    expect(t.rows[2]).toEqual(["B", "91", "2e6"]);
    expect(t.numeric).toEqual([false, true, true]);
  });

  it("explicit delimiter wins over sniffing; tabs supported", () => {
    expect(parseDelimited("a,b\tc", { delim: "," }).rows[0]).toEqual(["a", "b\tc"]);
    expect(parseDelimited("a\tb", { delim: "\t" }).rows[0]).toEqual(["a", "b"]);
  });

  it("European decimal commas stay numeric (column is ; separated)", () => {
    const t = parseDelimited("name;score\nA;92,5\nB;88,0");
    expect(t.numeric).toEqual([false, true]);
  });

  it("empty input yields no rows", () => {
    expect(parseDelimited("").rows).toEqual([]);
    expect(parseDelimited("\n").rows).toEqual([]);
  });
});

describe("texCell", () => {
  it("escapes every special exactly once, in the right order", () => {
    expect(texCell("50%")).toBe("50\\%");
    expect(texCell("a_b")).toBe("a\\_b");
    expect(texCell("{x}")).toBe("\\{x\\}");
    expect(texCell("$c^2$")).toBe("\\$c\\textasciicircum{}2\\$");
    expect(texCell("path\\to")).toBe("path\\textbackslash{}to");
    expect(texCell("x~y")).toBe("x\\textasciitilde{}y");
    // Inserted escapes are not re-escaped: one pass, one backslash each.
    expect(texCell("100% & more").split("\\%")[0]).toBe("100");
  });
});

describe("toBooktabs", () => {
  const t = () => parseDelimited("model,accuracy\nA,92.5\nB,91");

  it("emits a booktabs table: header between \\toprule and \\midrule, auto alignment", () => {
    const tex = toBooktabs(t());
    expect(tex).toContain("\\begin{tabular}{lr}");
    expect(tex.indexOf("\\toprule")).toBeLessThan(tex.indexOf("model & accuracy"));
    expect(tex.indexOf("model & accuracy")).toBeLessThan(tex.indexOf("\\midrule"));
    expect(tex.indexOf("A & 92.5")).toBeLessThan(tex.indexOf("\\bottomrule"));
    expect(tex).toContain("\\end{table}");
  });

  it("header=false puts every row below \\toprule with no \\midrule", () => {
    const tex = toBooktabs(t(), { header: false });
    expect(tex).not.toContain("\\midrule");
    expect(tex).toContain("model & accuracy \\\\");
  });

  it("caption, label and fixed alignment", () => {
    const tex = toBooktabs(t(), { caption: "Accuracies (%, test)", label: "tab:acc!", align: "c" });
    expect(tex).toContain("\\caption{Accuracies (\\%, test)}");
    expect(tex).toContain("\\label{tab:acc}");
    expect(tex).toContain("{cc}"); // two columns, both fixed to c
  });

  it("escapes cell content in the emitted table", () => {
    const tex = toBooktabs(parseDelimited('name,note\n"R&D", "50%_done"'));
    expect(tex).toContain("R\\&D & 50\\%\\_done \\\\");
  });

  it("empty table yields the empty string", () => {
    expect(toBooktabs(parseDelimited(""))).toBe("");
  });
});
