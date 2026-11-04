import { describe, expect, it } from "vitest";
import { findInBib, normalizeTitle, parseBibEntries, surname } from "./bib-entries";

const raw = String.raw;

describe("surname", () => {
  it("takes the part before the comma in 'Family, Given' order (the template's form)", () => {
    expect(surname("Vaswani, Ashish")).toBe("Vaswani");
    expect(surname("Gomez, Aidan N.")).toBe("Gomez");
  });

  it("takes the last word in 'Given Family' order (OpenAlex's form)", () => {
    expect(surname("Ashish Vaswani")).toBe("Vaswani");
  });

  it("strips TeX braces and survives particles", () => {
    expect(surname("Kaiser, {\\L}ukasz")).toBe("Kaiser");
    expect(surname("{\\L}ukasz Kaiser")).toBe("Kaiser");
    expect(surname("de la Cruz, Juan")).toBe("de la Cruz");
  });
});

describe("parseBibEntries: fields", () => {
  it("reads every field of a plain article", () => {
    const bib = `@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam},
  journal = {NeurIPS},
  year = {2017},
  doi = {10.48550/arXiv.1706.03762}
}`;
    expect(parseBibEntries(bib)).toEqual([
      {
        key: "vaswani2017attention",
        type: "article",
        title: "Attention Is All You Need",
        authors: ["Vaswani, Ashish", "Shazeer, Noam"],
        year: 2017,
        venue: "NeurIPS",
        doi: "10.48550/arxiv.1706.03762",
        file: "references.bib",
        line: 1,
      },
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseBibEntries("")).toEqual([]);
    expect(parseBibEntries("  \n% only a comment\n")).toEqual([]);
  });

  it("lowercases the entry type", () => {
    expect(parseBibEntries("@InProceedings{k, title={T}}")[0].type).toBe("inproceedings");
  });

  it("picks the venue as journal > booktitle > publisher > howpublished, skipping empty ones", () => {
    const venue = (fields: string) => parseBibEntries(`@misc{k, ${fields}}`)[0].venue;
    expect(venue("publisher={P}, howpublished={H}, booktitle={B}, journal={J}")).toBe("J");
    expect(venue("publisher={P}, howpublished={H}, booktitle={B}")).toBe("B");
    expect(venue("publisher={P}, howpublished={H}")).toBe("P");
    expect(venue("howpublished={H}")).toBe("H");
    expect(venue("journal={}, publisher={P}")).toBe("P");
    expect(venue("title={T}")).toBeUndefined();
  });

  it("matches field names case-insensitively and keeps the first duplicate", () => {
    const [e] = parseBibEntries("@Article{c, TITLE = {First}, Title = {Second}, YEAR = 1999}");
    expect(e.title).toBe("First");
    expect(e.year).toBe(1999);
  });

  it("understands the biblatex aliases date and journaltitle", () => {
    const [e] = parseBibEntries(
      "@article{b, title={T}, date = {2019-05-03}, journaltitle = {Nature}}",
    );
    expect(e.year).toBe(2019);
    expect(e.venue).toBe("Nature");
  });

  it("has no year when the field holds no four-digit number", () => {
    expect(parseBibEntries("@misc{y, year = {in press}}")[0].year).toBeUndefined();
  });

  it("falls back to the editors when there are no authors", () => {
    expect(parseBibEntries("@book{e, editor = {Doe, Jane}}")[0].authors).toEqual(["Doe, Jane"]);
  });

  it("tags entries with the given file path", () => {
    expect(parseBibEntries("@misc{a,title={A}}", "refs/extra.bib")[0].file).toBe("refs/extra.bib");
  });
});

describe("parseBibEntries: value syntax", () => {
  it("unwraps nested protective braces", () => {
    const title = (v: string) => parseBibEntries(`@book{dl, title = ${v}}`)[0].title;
    expect(title("{{Deep} Learning}")).toBe("Deep Learning");
    expect(title("{{Deep Learning}}")).toBe("Deep Learning");
    expect(title("{A {B {C}} D}")).toBe("A B C D");
  });

  it("reads quoted values, with braces protecting inner quotes", () => {
    const [e] = parseBibEntries('@misc{q, title = "The {"}Quoted{"} Title", year = "2020"}');
    expect(e.title).toBe('The "Quoted" Title');
    expect(e.year).toBe(2020);
  });

  it("joins multiline titles and splits multiline author lists", () => {
    const [e] = parseBibEntries(`@article{ml,
  title = {A very long
           title that wraps},
  author = {Vaswani, Ashish and
            Shazeer, Noam
            and Parmar, Niki}
}`);
    expect(e.title).toBe("A very long title that wraps");
    expect(e.authors).toEqual(["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"]);
  });

  it("reads undelimited numbers and tolerates trailing commas", () => {
    const [e] = parseBibEntries("@article{n,\n  title = {T},\n  year = 2017,\n  volume = 12,\n}");
    expect(e).toMatchObject({ key: "n", title: "T", year: 2017 });
  });

  it("accepts an entry with no fields at all", () => {
    expect(parseBibEntries("@misc{lonely}")[0]).toMatchObject({ key: "lonely", title: "" });
    expect(parseBibEntries("@misc{lonely2,}")[0]).toMatchObject({ key: "lonely2", title: "" });
  });

  it("accepts keys with colon, dash, underscore, dot and slash", () => {
    const keys = parseBibEntries(
      "@article{smith:2020-a_b, title={A}}\n@misc{foo.bar/baz,title={B}}",
    );
    expect(keys.map((e) => e.key)).toEqual(["smith:2020-a_b", "foo.bar/baz"]);
  });

  it("accepts parenthesised entries", () => {
    const [e] = parseBibEntries("@article(p1, title = {Parens}, year = 2001)");
    expect(e).toMatchObject({ key: "p1", title: "Parens", year: 2001 });
  });

  it("tolerates a missing comma between fields", () => {
    const [e] = parseBibEntries("@misc{m, title = {T}\n  year = {2020}}");
    expect(e).toMatchObject({ title: "T", year: 2020 });
  });
});

describe("parseBibEntries: comments and non-entries", () => {
  it("ignores % comments and commented-out entries, but keeps % inside values", () => {
    const bib = raw`% Encoding: UTF-8
% @article{ghost, title = {Commented out}}
@article{real, % trailing comment after the key
  title = {Is 100\% enough?}, % comment between fields
  note = {50% off},
  year = 2020 % last field comment
}
`;
    const entries = parseBibEntries(bib);
    expect(entries.map((e) => e.key)).toEqual(["real"]);
    expect(entries[0].title).toBe("Is 100% enough?");
    expect(entries[0].year).toBe(2020);
  });

  it("skips @preamble, @comment and @string, and expands @string macros", () => {
    const bib = raw`@preamble{ "\newcommand{\noop}[1]{}" }
@string{jpami = "IEEE Trans. Pattern Anal. Mach. Intell."}
@comment{ @article{inside, title = {Hidden}} }
@Comment{jabref-meta: databaseType:bibtex;}
@comment just a plain note
@article{he2016,
  title = "Deep Residual " # {Learning},
  journal = jpami,
  year = 2016
}`;
    const entries = parseBibEntries(bib);
    expect(entries.map((e) => e.key)).toEqual(["he2016"]);
    expect(entries[0].title).toBe("Deep Residual Learning");
    expect(entries[0].venue).toBe("IEEE Trans. Pattern Anal. Mach. Intell.");
  });

  it("falls back to the macro name when a @string is not defined", () => {
    expect(parseBibEntries("@article{u, journal = pami}")[0].venue).toBe("pami");
  });
});

describe("parseBibEntries: lines", () => {
  it("reports the 1-based line where each entry starts", () => {
    const bib = "@article{a,\n  title = {A}\n}\n\n@book{b,\n  title = {B}\n}\n";
    expect(parseBibEntries(bib).map((e) => [e.key, e.line])).toEqual([
      ["a", 1],
      ["b", 5],
    ]);
    expect(parseBibEntries(bib.replaceAll("\n", "\r\n")).map((e) => e.line)).toEqual([1, 5]);
  });

  it("counts the lines of skipped blocks", () => {
    const bib = "% header\n@comment{\n  multi\n  line\n}\n@misc{after, title={T}}";
    expect(parseBibEntries(bib)[0].line).toBe(6);
  });
});

describe("parseBibEntries: titles", () => {
  it("keeps entries without a title and continues with the next one", () => {
    const entries = parseBibEntries(
      "@misc{notitle,\n  author = {Doe, Jane},\n  year = {2001}\n}\n@misc{next, title = {Next}}",
    );
    expect(entries.map((e) => [e.key, e.title])).toEqual([
      ["notitle", ""],
      ["next", "Next"],
    ]);
  });

  it("turns trivial TeX into plain text and leaves math alone", () => {
    const title = (v: string) => parseBibEntries(`@misc{t, title = {${v}}}`)[0].title;
    expect(title(raw`Schr{\"o}dinger and M\"{u}ller`)).toBe("Schrödinger and Müller");
    expect(title(raw`{\'E}cole, Stra{\ss}e, S{\o}ren, \c{C}elik, \'{\i}ndice`)).toBe(
      "École, Straße, Søren, Çelik, índice",
    );
    expect(title(raw`\emph{Deep}~Learning \& \textbf{Friends} -- 100\%`)).toBe(
      "Deep Learning & Friends – 100%",
    );
    expect(title(raw`The \LaTeX\ Companion`)).toBe("The LaTeX Companion");
    expect(title(raw`Note on $\alpha$-stable laws {and} $x^{2}$`)).toBe(
      raw`Note on $\alpha$-stable laws and $x^{2}$`,
    );
    expect(title(raw`Costs \$5 and \{braces\}`)).toBe("Costs $5 and {braces}");
  });
});

describe("parseBibEntries: authors", () => {
  it("splits on 'and' outside braces only", () => {
    const [e] = parseBibEntries(
      "@techreport{who, title={T}, author = {{Barnes and Noble, Inc.} and Smith, John AND Ashish Vaswani and others}}",
    );
    expect(e.authors).toEqual([
      "Barnes and Noble, Inc.",
      "Smith, John",
      "Ashish Vaswani",
      "others",
    ]);
  });

  it("reads a corporate author wrapped in braces as a single name", () => {
    const [e] = parseBibEntries("@misc{c, author = {{Corporación Larga}}, title={T}}");
    expect(e.authors).toEqual(["Corporación Larga"]);
  });

  it("does not split names that merely start with 'and'", () => {
    const [e] = parseBibEntries("@misc{c, author = {Anderson, Hans and Andrés Pérez}}");
    expect(e.authors).toEqual(["Anderson, Hans", "Andrés Pérez"]);
  });

  it("cleans TeX accents in names", () => {
    const [e] = parseBibEntries(raw`@misc{c, author = {M{\"u}ller, Hans and Sj\"{o}berg, Åsa}}`);
    expect(e.authors).toEqual(["Müller, Hans", "Sjöberg, Åsa"]);
  });

  it("has no authors when the field is missing or empty", () => {
    expect(parseBibEntries("@misc{c, title={T}}")[0].authors).toEqual([]);
    expect(parseBibEntries("@misc{c, author={}}")[0].authors).toEqual([]);
  });
});

describe("parseBibEntries: DOIs", () => {
  it("normalizes to lowercase without URL or doi: prefix, and unescapes LaTeX", () => {
    const doi = (v: string) => parseBibEntries(`@misc{d, doi = {${v}}}`)[0].doi;
    expect(doi("10.1000/ABC.def")).toBe("10.1000/abc.def");
    expect(doi("https://doi.org/10.1000/XYZ")).toBe("10.1000/xyz");
    expect(doi("http://dx.doi.org/10.1000/xyz")).toBe("10.1000/xyz");
    expect(doi("doi:10.1000/xyz")).toBe("10.1000/xyz");
    expect(doi(" {10.1000/xyz} ")).toBe("10.1000/xyz");
    expect(doi(raw`10.1000/a\_b`)).toBe("10.1000/a_b");
  });

  it("drops values that are not DOIs", () => {
    expect(parseBibEntries("@misc{d, doi = {not a doi}}")[0].doi).toBeUndefined();
    expect(parseBibEntries("@misc{d, title = {T}}")[0].doi).toBeUndefined();
  });
});

describe("parseBibEntries: broken input", () => {
  it("drops an entry whose value closes too early and keeps the next one", () => {
    const bib =
      "@article{a,\n  title = {Never closed,\n  year = 2020\n}\n@article{b,\n  title = {B title}\n}\n";
    expect(parseBibEntries(bib).map((e) => e.key)).toEqual(["b"]);
  });

  it("drops an entry whose braces never balance and keeps the next one", () => {
    const bib = "@article{a, title = {Open\n@article{b, title = {B title}}\n";
    expect(parseBibEntries(bib).map((e) => e.key)).toEqual(["b"]);
  });

  it("does not mistake an e-mail address in free text for an entry", () => {
    const bib = "some prose, write me@example.com\n@misc{ok, title={T}}";
    expect(parseBibEntries(bib).map((e) => e.key)).toEqual(["ok"]);
  });

  it("returns what it can for a truncated last entry", () => {
    expect(parseBibEntries("@misc{a, title={A}}\n@misc{b, title={B").map((e) => e.key)).toEqual([
      "a",
    ]);
  });
});

describe("parseBibEntries: real exports", () => {
  it("parses a JabRef/Zotero style file", () => {
    const bib = raw`% Encoding: UTF-8

@Article{Zhang2019,
  author    = {Zhang, Wei and M{\"u}ller, Hans},
  journal   = {Phys. Rev. Lett.},
  title     = {Quantum {Monte} {Carlo} for 100\% of cases: {A} review},
  year      = {2019},
  abstract  = {We study a < b and 5% of cases. Contact: a@b.org
               (see Eq. {1}).},
  file      = {:C$\backslash$:/Users/me/zhang.pdf:PDF},
  doi       = {10.1103/PhysRevLett.123.010401},
  keywords  = {qmc, review},
}

@Book{Goodfellow2016,
  author    = {{Goodfellow Group}},
  title     = {Deep Learning},
  publisher = {MIT Press},
  year      = 2016,
}

@Comment{jabref-meta: databaseType:bibtex;}
`;
    const entries = parseBibEntries(bib, "lib/main.bib");
    expect(entries).toEqual([
      {
        key: "Zhang2019",
        type: "article",
        title: "Quantum Monte Carlo for 100% of cases: A review",
        authors: ["Zhang, Wei", "Müller, Hans"],
        year: 2019,
        venue: "Phys. Rev. Lett.",
        doi: "10.1103/physrevlett.123.010401",
        file: "lib/main.bib",
        line: 3,
      },
      {
        key: "Goodfellow2016",
        type: "book",
        title: "Deep Learning",
        authors: ["Goodfellow Group"],
        year: 2016,
        venue: "MIT Press",
        file: "lib/main.bib",
        line: 15,
      },
    ]);
  });
});

describe("normalizeTitle", () => {
  it("lowercases, drops punctuation and collapses whitespace", () => {
    expect(normalizeTitle("  Attention Is  All You Need!  ")).toBe("attention is all you need");
    expect(normalizeTitle("State-of-the-art: a (short) survey?")).toBe(
      "state of the art a short survey",
    );
  });

  it("drops protective braces and trivial TeX", () => {
    expect(normalizeTitle(raw`{{Deep}} Learning: A \emph{Review}`)).toBe("deep learning a review");
  });

  it("gives the same result for TeX accents and their Unicode letters", () => {
    expect(normalizeTitle(raw`Schr{\"o}dinger's {C}at`)).toBe("schrodinger s cat");
    expect(normalizeTitle("Schrödinger’s Cat")).toBe("schrodinger s cat");
    expect(normalizeTitle("Café Ünïcode")).toBe("cafe unicode");
  });

  it("folds letters that Unicode does not decompose", () => {
    expect(normalizeTitle("Søren Ørsted, Straße, Łódź, Æther")).toBe(
      "soren orsted strasse lodz aether",
    );
    expect(normalizeTitle(raw`S{\o}ren, Stra{\ss}e`)).toBe("soren strasse");
  });

  it("keeps letters of other scripts", () => {
    expect(normalizeTitle("Глубокое обучение")).toBe("глубокое обучение");
  });

  it("is empty for empty input", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle(" ... ")).toBe("");
  });
});

describe("findInBib", () => {
  const lib = parseBibEntries(raw`
@article{vaswani, title = {Attention Is All You Need}, doi = {10.48550/arXiv.1706.03762}}
@book{goodfellow, title = {Deep Learning}}
@article{lecun, title = {Deep Learning}, doi = {10.1038/nature14539}}
@misc{short, title = {Overview}}
@misc{intro, title = {Introduction}}
@article{cat, title = {Schr{\"o}dinger's {C}at: a review}}
`);
  const key = (p: Parameters<typeof findInBib>[1]) => findInBib(lib, p)?.key;

  it("matches the DOI exactly, ignoring case and URL prefixes", () => {
    expect(key({ doi: "10.48550/ARXIV.1706.03762" })).toBe("vaswani");
    expect(key({ doi: "https://doi.org/10.1038/Nature14539" })).toBe("lecun");
    expect(key({ doi: " doi:10.1038/nature14539 " })).toBe("lecun");
  });

  it("prefers the DOI over the title", () => {
    expect(key({ doi: "10.1038/nature14539", title: "Attention Is All You Need" })).toBe("lecun");
  });

  it("falls back to the normalized title", () => {
    expect(key({ title: "attention is all YOU need!" })).toBe("vaswani");
    expect(key({ title: "Schrödinger’s Cat: A Review" })).toBe("cat");
    expect(key({ title: "Deep Learning" })).toBe("goodfellow");
  });

  it("falls back to the title when the DOI is unknown but the entry has none", () => {
    expect(key({ doi: "10.9999/other", title: "Deep Learning" })).toBe("goodfellow");
  });

  it("does not match by title when both sides carry different DOIs", () => {
    expect(key({ doi: "10.9999/other", title: "Attention Is All You Need" })).toBeUndefined();
  });

  it("ignores titles shorter than 12 normalized characters", () => {
    expect(key({ title: "Overview" })).toBeUndefined();
    expect(key({ title: "Introduction" })).toBe("intro");
  });

  it("finds nothing without usable input", () => {
    expect(key({})).toBeUndefined();
    expect(key({ doi: "garbage" })).toBeUndefined();
    expect(key({ title: "A completely unrelated title" })).toBeUndefined();
    expect(findInBib([], { doi: "10.1000/x", title: "Attention Is All You Need" })).toBeUndefined();
  });
});
