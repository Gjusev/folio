import { describe, expect, it } from "vitest";
import { citationHealth, citedKeys, titleSimilarity } from "./citation-health";

const bib = `@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam},
  year = {2017},
  doi = {10.48550/arXiv.1706.03762},
}
@misc{mikolov2013efficient,
  title = {Efficient Estimation of Word Representations in Vector Space},
  doi = {10.48550/arxiv.1301.3781},
}
@book{goodfellow2016deep, title = {Deep Learning},}
`;

const tex = (body: string) => ({ path: "main.tex", content: body });

describe("citationHealth", () => {
  it("flags unused and undefined keys", () => {
    const h = citationHealth([
      { path: "references.bib", content: bib },
      tex("uno~\\cite{vaswani2017attention} y otro~\\citep{ghost2020key}"),
    ]);
    expect(h.defined).toEqual([
      "vaswani2017attention",
      "mikolov2013efficient",
      "goodfellow2016deep",
    ]);
    expect(h.undefined).toEqual(["ghost2020key"]);
    expect(h.unused).toEqual(["mikolov2013efficient", "goodfellow2016deep"]);
  });

  it("collects multi-key cites and biblatex variants", () => {
    const keys = citedKeys([
      tex("\\parencite{a2015x, b2016y} y \\textcite*[see][p.3]{c2017z} y \\citeauthor{d2018w}"),
    ]);
    expect(keys).toEqual(["a2015x", "b2016y", "c2017z", "d2018w"]);
  });

  it("ignores cites inside comments", () => {
    const keys = citedKeys([tex("% \\cite{commented2020out}\nreal \\cite{real2020in}")]);
    expect(keys).toEqual(["real2020in"]);
  });

  it("does not read .bib files as tex or .tex as bib", () => {
    const h = citationHealth([
      { path: "main.tex", content: "\\cite{x}" },
      { path: "references.bib", content: "title = {No at, no entry}" },
    ]);
    expect(h.defined).toEqual([]);
    expect(h.undefined).toEqual(["x"]);
  });

  it("lists arXiv-DOI entries as upgrade candidates with their titles", () => {
    const h = citationHealth([{ path: "references.bib", content: bib }]);
    expect(h.arxiv.map((a) => a.key)).toEqual(["vaswani2017attention", "mikolov2013efficient"]);
    expect(h.arxiv[0].doi).toBe("10.48550/arXiv.1706.03762");
    expect(h.arxiv[0].title).toBe("Attention Is All You Need");
    expect(h.arxiv[0].family).toBe("vaswani");
    expect(h.arxiv[0].year).toBe(2017);
  });
});

describe("titleSimilarity", () => {
  it("is 1 for the same title modulo punctuation and case", () => {
    expect(titleSimilarity("Attention Is All You Need", "attention is all you need!")).toBe(1);
  });

  it("separates different titles", () => {
    expect(titleSimilarity("Deep Residual Learning", "Attention Is All You Need")).toBeLessThan(
      0.5,
    );
  });
});
