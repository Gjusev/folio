import { describe, expect, it } from "vitest";
import { checkArxivPackage, type ArxivFile } from "@/lib/arxiv-check";

const byId = (checks: ReturnType<typeof checkArxivPackage>, id: string) =>
  checks.find((c) => c.id === id)!;

const MB = 1024 * 1024;

const BASE: ArxivFile[] = [
  {
    path: "main.tex",
    content: [
      "\\pdfoutput=1",
      "\\documentclass{article}",
      "\\begin{document}",
      "\\input{sections/intro}",
      "\\bibliography{references}",
      "\\end{document}",
    ].join("\n"),
  },
  {
    path: "sections/intro.tex",
    content: "Intro. \\includegraphics[width=0.5\\linewidth]{figures/cat.png}",
  },
  { path: "figures/cat.png", content: "", encoding: "base64" },
  { path: "references.bib", content: "@book{k, title={T}, author={A}, year={2020}}" },
  { path: "main.bbl", content: "\\bibitem{k} A. T. 2020." },
];

/** The clean package; `overrides` replace files by path, extras are appended. */
function pkg(overrides: ArxivFile[] = []): ArxivFile[] {
  const byPath = new Map(BASE.map((f) => [f.path, f] as const));
  for (const f of overrides) byPath.set(f.path, f);
  return [...byPath.values()];
}

describe("checkArxivPackage", () => {
  it("passes a clean package on every check", () => {
    const checks = checkArxivPackage(pkg(), "main.tex", "");
    expect(checks.map((c) => c.id)).toEqual([
      "names",
      "pdfoutput",
      "paths",
      "eps",
      "shell",
      "bbl",
      "size",
    ]);
    for (const c of checks) {
      expect(c.level).toBe("pass");
      expect(c.detail).not.toBe("");
    }
  });

  it("names: fails on spaces and non-ASCII characters in a path", () => {
    const space = byId(
      checkArxivPackage(
        pkg([{ path: "my figure.png", content: "", encoding: "base64" }]),
        "main.tex",
        "",
      ),
      "names",
    );
    expect(space.level).toBe("fail");
    expect(space.detail).toContain("my figure.png");

    const accents = byId(
      checkArxivPackage(pkg([{ path: "día.tex", content: "x" }]), "main.tex", ""),
      "names",
    );
    expect(accents.level).toBe("fail");
    expect(accents.detail).toContain("día.tex");

    // arXiv-legal punctuation stays fine.
    const plus = pkg([{ path: "fig+2.png", content: "", encoding: "base64" }]);
    expect(byId(checkArxivPackage(plus, "main.tex", ""), "names").level).toBe("pass");
  });

  it("pdfoutput: warns when the declaration is missing or arrives too late", () => {
    const late = pkg([
      {
        path: "main.tex",
        content: [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "\\pdfoutput=1",
          "\\begin{document}x\\end{document}",
        ].join("\n"),
      },
    ]);
    expect(byId(checkArxivPackage(late, "main.tex", ""), "pdfoutput").level).toBe("warn");

    const spaced = pkg([
      { path: "main.tex", content: "\\pdfoutput = 1\n\\begin{document}x\\end{document}" },
    ]);
    const check = byId(checkArxivPackage(spaced, "main.tex", ""), "pdfoutput");
    expect(check.level).toBe("pass");
    expect(check.detail).toContain("\\pdfoutput=1");
  });

  it("paths: fails absolute, ..-escaping and backslash references", () => {
    const files = pkg([
      {
        path: "sections/intro.tex",
        content: [
          "\\input{/etc/tex/shared.tex}",
          "\\include{../chapters/one}",
          "\\includegraphics{C:\\figs\\cat.png}",
          "\\includegraphics[width=1cm]{ok.png}",
        ].join("\n"),
      },
    ]);
    const paths = byId(checkArxivPackage(files, "main.tex", ""), "paths");
    expect(paths.level).toBe("fail");
    expect(paths.detail).toContain("/etc/tex/shared.tex");
    expect(paths.detail).toContain("../chapters/one");
    expect(paths.detail).toContain("C:\\figs\\cat.png");
    expect(paths.detail).not.toContain("ok.png");
  });

  it("paths: %-escaped comment lines never trip the check", () => {
    const files = pkg([
      {
        path: "sections/intro.tex",
        content: [
          "% \\input{/abs/path.tex}",
          "  %\\includegraphics{..\\fig.png}",
          "\\input{real.tex}",
        ].join("\n"),
      },
      { path: "real.tex", content: "real" },
    ]);
    expect(byId(checkArxivPackage(files, "main.tex", ""), "paths").level).toBe("pass");
  });

  it("eps: warns for an .eps file on disk and one only referenced", () => {
    const onDisk = byId(
      checkArxivPackage(
        pkg([{ path: "fig.eps", content: "", encoding: "base64" }]),
        "main.tex",
        "",
      ),
      "eps",
    );
    expect(onDisk.level).toBe("warn");
    expect(onDisk.detail).toContain("fig.eps");
    expect(onDisk.detail).toContain("epstopdf");

    const referenced = pkg([
      { path: "sections/intro.tex", content: "\\includegraphics{plots/speed.eps}" },
    ]);
    const ref = byId(checkArxivPackage(referenced, "main.tex", ""), "eps");
    expect(ref.level).toBe("warn");
    expect(ref.detail).toContain("plots/speed.eps");
  });

  it("shell: fails on \\write18 and on shell-escape (comments are not stripped)", () => {
    const w18 = byId(
      checkArxivPackage(
        pkg([{ path: "main.tex", content: "\\immediate\\write18{zip x}" }]),
        "main.tex",
        "",
      ),
      "shell",
    );
    expect(w18.level).toBe("fail");
    expect(w18.detail).toContain("write18");

    const esc = pkg([{ path: "sections/intro.tex", content: "% compile with --shell-escape" }]);
    expect(byId(checkArxivPackage(esc, "main.tex", ""), "shell").level).toBe("fail");
  });

  it("bbl: warns when \\bibliography has no .bbl, passes when it does", () => {
    const noBbl = pkg().filter((f) => !f.path.endsWith(".bbl"));
    const warn = byId(checkArxivPackage(noBbl, "main.tex", ""), "bbl");
    expect(warn.level).toBe("warn");
    expect(warn.detail).toContain("BibTeX");

    const withBbl = byId(checkArxivPackage(pkg(), "main.tex", ""), "bbl");
    expect(withBbl.level).toBe("pass");
    expect(withBbl.detail).toContain("main.bbl");
  });

  it("size: warns past 10 MB and fails past 15 MB of decoded bytes", () => {
    const warn = checkArxivPackage(
      pkg([{ path: "big.dat", content: "x".repeat(10 * MB + 1) }]),
      "main.tex",
      "",
    );
    expect(byId(warn, "size").level).toBe("warn");

    const fail = checkArxivPackage(
      pkg([{ path: "big.dat", content: "x".repeat(15 * MB + 1) }]),
      "main.tex",
      "",
    );
    expect(byId(fail, "size").level).toBe("fail");

    // A base64 file counts as its DECODED size (8 MB), not its longer
    // encoded string (~10.7 MB utf8 chars, which would wrongly warn).
    const base64 = {
      path: "fig.pdf",
      encoding: "base64" as const,
      content: Buffer.from("A".repeat(8 * MB), "utf8").toString("base64"),
    };
    expect(byId(checkArxivPackage(pkg([base64]), "main.tex", ""), "size").level).toBe("pass");
  });
});
