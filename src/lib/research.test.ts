import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addBibEntry, bibKeys, citeKey, texEscape, toBibtex } from "@/lib/bibtex";
import { ImportError, findMainFile, readProjectZip } from "@/lib/importer";
import { abstractFromIndex as abstractFrom, parseArxivFeed, searchPapers } from "@/lib/papers";
import { matchesMagic, validateFilePath } from "@/lib/paths";

describe("toBibtex", () => {
  const paper = {
    doi: "10.1038/nature14539",
    title: "Deep learning & the 100% solution_1",
    authors: ["Yann LeCun", "Yoshua Bengio", "José Ñúñez"],
    year: 2015,
    venue: "Nature",
    type: "article",
    volume: "521",
    pages: "436--444",
  };

  it("builds a clean, escaped journal entry with a conventional key", () => {
    const { key, entry } = toBibtex(paper);
    expect(key).toBe("lecun2015deep");
    expect(entry).toContain("@article{lecun2015deep,");
    expect(entry).toContain("title       = {{Deep learning \\& the 100\\% solution\\_1}}");
    expect(entry).toContain("author      = {LeCun, Yann and Bengio, Yoshua and Ñúñez, José}");
    expect(entry).toContain("journal     = {Nature}");
    expect(entry).toContain("doi         = {10.1038/nature14539}");
    expect(bibKeys(entry)).toEqual(["lecun2015deep"]);
  });

  it("maps types and falls back to the open-access URL without a DOI", () => {
    expect(toBibtex({ ...paper, type: "conference-paper" }).entry).toMatch(
      /^@inproceedings\{[\s\S]*booktitle {3}= \{Nature\}/,
    );
    const pre = toBibtex({
      ...paper,
      type: "preprint",
      doi: undefined,
      openAccessUrl: "https://arxiv.org/abs/1",
    });
    expect(pre.entry).toMatch(/^@misc/);
    expect(pre.entry).toContain("url         = {https://arxiv.org/abs/1}");
  });

  it("keys handle accents, stop words and missing data", () => {
    expect(citeKey({ authors: ["Émile Durkheim"], year: 1897, title: "On the Suicide" })).toBe(
      "durkheim1897suicide",
    );
    expect(citeKey({ authors: [], title: "A" })).toBe("anonwork");
    expect(texEscape("{\\evil} a_b ~x^2")).toBe(
      "{\\evil} a\\_b \\textasciitilde{}x\\textasciicircum{}2",
    );
  });

  it("deduplicates by title when there is no DOI", () => {
    const bib = "@misc{x,\n  title = {{Some Title}},\n}\n";
    const r = addBibEntry(bib, "@misc{y, title={Some title}}", { title: "Some  title!" });
    expect(r).toMatchObject({ added: false, key: "x" });
  });
});

describe("OpenAlex mapping", () => {
  it("rebuilds abstracts from the inverted index", () => {
    expect(abstractFrom({ world: [1], Hello: [0], again: [3], hello: [2] })).toBe(
      "Hello world hello again",
    );
    expect(abstractFrom(null)).toBeUndefined();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends AND-joined terms so arXiv intersects instead of unioning", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      url,
      text: async () => "<feed/>",
    }));
    vi.stubGlobal("fetch", fetchMock);
    await searchPapers("arxiv", {
      q: "alpha stable",
      sort: "relevance",
      openAccess: false,
      page: 1,
    });
    // Exact wire form: URLSearchParams encodes the separator space as "+",
    // which arXiv reads as AND. A literal "+" goes out as %2B and the
    // multi-word query degrades to OR.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://export.arxiv.org/api/query?max_results=15&start=0" +
        "&search_query=all%3A%22alpha%22+AND+all%3A%22stable%22" +
        "&sortBy=relevance&sortOrder=descending",
    );
  });

  it("parses arXiv Atom feeds: ids, authors, entities, DOIs", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
 <entry>
  <id>http://arxiv.org/abs/2401.12345v2</id>
  <published>2024-01-22T10:00:00Z</published>
  <title>Attention &amp; Memory in &lt;Long&gt; Documents</title>
  <summary> We study  attention.</summary>
  <author><name>Ana Núñez</name></author>
  <author><name>Bob Lee</name></author>
  <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.2401.12345</arxiv:doi>
 </entry>
 <entry>
  <id>http://arxiv.org/abs/cs/0701999v1</id>
  <published>2007-01-01T00:00:00Z</published>
  <title>Old paper</title>
  <summary>Summary</summary>
  <author><name>Carol Doe</name></author>
 </entry>
</feed>`;
    const papers = parseArxivFeed(xml);
    expect(papers).toHaveLength(2);
    expect(papers[0]).toMatchObject({
      source: "arxiv",
      id: "2401.12345",
      year: 2024,
      title: "Attention & Memory in <Long> Documents",
      authors: ["Ana Núñez", "Bob Lee"],
      doi: "10.48550/arXiv.2401.12345",
      openAccessUrl: "https://arxiv.org/abs/2401.12345",
    });
    expect(papers[0].abstract).toBe("We study attention.");
    expect(papers[1]).toMatchObject({ id: "cs/0701999", year: 2007 });
  });
});

describe("binary checks", () => {
  it("accepts figure formats and checks their signatures", () => {
    expect(validateFilePath("figures/plot.png")).toBeNull();
    expect(validateFilePath("figures/plot.svg")).not.toBeNull();
    expect(
      matchesMagic("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);
    expect(matchesMagic("a.png", strToU8("<svg>"))).toBe(false);
    expect(matchesMagic("a.pdf", strToU8("%PDF-1.5"))).toBe(true);
    expect(matchesMagic("a.jpg", strToU8("GIF89a"))).toBe(false);
  });
});

describe("readProjectZip", () => {
  it("picks the main file and strips a wrapping folder", () => {
    const r = readProjectZip(
      zipSync({
        "src/chapter.tex": strToU8("\\chapter{x}"),
        "src/thesis.tex": strToU8("\\documentclass{report}"),
      }),
    );
    expect(r.mainFile).toBe("thesis.tex");
    expect(r.files.map((f) => f.path).sort()).toEqual(["chapter.tex", "thesis.tex"]);
  });

  it("prefers main.tex, then the shallowest root", () => {
    const tex = (path: string) => ({ path, content: "\\documentclass{article}" });
    expect(findMainFile([tex("a/x.tex"), tex("main.tex")])).toBe("main.tex");
    expect(findMainFile([tex("a/b/x.tex"), tex("y.tex")])).toBe("y.tex");
    expect(findMainFile([{ path: "x.tex", content: "\\section{x}" }])).toBeUndefined();
  });

  it("refuses zip bombs before inflating them", () => {
    // 60 MB of zeros compresses to a few KB.
    const bomb = zipSync({ "main.tex": new Uint8Array(60_000_000) }, { level: 9 });
    expect(bomb.length).toBeLessThan(200_000);
    expect(() => readProjectZip(bomb)).toThrow(ImportError);
  });
});
