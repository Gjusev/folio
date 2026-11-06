import { describe, expect, it } from "vitest";
import {
  VENUES,
  bibStyleMismatch,
  blindSignals,
  getVenue,
  missingRequiredSections,
  pagesFromLog,
} from "./venues";

const tex = (content: string) => ({ path: "main.tex", content });

describe("VENUES data", () => {
  it("has 7 venues with unique ids, https sources and verifiedAt", () => {
    expect(VENUES).toHaveLength(7);
    const ids = new Set(VENUES.map((v) => v.id));
    expect(ids.size).toBe(VENUES.length);
    for (const v of VENUES) {
      expect(v.sourceUrl).toMatch(/^https:\/\//);
      expect(v.verifiedAt).toMatch(/^\d{4}-\d{2}$/);
      expect(["conference", "journal", "preprint"]).toContain(v.kind);
      expect(["double", "single", "none", null]).toContain(v.anonymisation);
      expect(typeof v.pageLimit.note).toBe("string");
      expect(Array.isArray(v.requiredSections)).toBe(true);
    }
  });

  it("getVenue finds known ids and rejects unknown or missing ones", () => {
    expect(getVenue("acl")?.id).toBe("acl");
    expect(getVenue("nope")).toBeUndefined();
    expect(getVenue(undefined)).toBeUndefined();
    expect(getVenue("")).toBeUndefined();
  });

  it("pins the review models verified from the official pages", () => {
    expect(getVenue("icml")?.anonymisation).toBe("double"); // 2025: "double-blind"
    expect(getVenue("neurips")?.anonymisation).toBe("double");
    expect(getVenue("lncs")?.anonymisation).toBe("single");
  });
});

describe("pagesFromLog", () => {
  it("reads plural and singular page counts from compiler logs", () => {
    expect(pagesFromLog("Output written on main.pdf (3 pages, 12345 bytes).")).toBe(3);
    expect(pagesFromLog("Output written on main.pdf (1 page, 123 bytes).")).toBe(1);
  });

  it("returns null when the log carries no page count", () => {
    expect(pagesFromLog("! LaTeX Error: File `x.sty' not found.")).toBeNull();
    expect(pagesFromLog("")).toBeNull();
  });
});

describe("missingRequiredSections", () => {
  const acl = getVenue("acl")!;

  it("reports a required section that is nowhere in the .tex files", () => {
    expect(missingRequiredSections([tex("\\section{Introduction}\nbody")], acl)).toEqual([
      "Limitations",
    ]);
  });

  it("accepts \\section*{Limitations} with spacing and case differences", () => {
    expect(missingRequiredSections([tex("\\section*{ limitations }")], acl)).toEqual([]);
    expect(missingRequiredSections([tex("\\SECTION*{Limitations}")], acl)).toEqual([]);
  });

  it("ignores .bib files and venues without required sections", () => {
    expect(
      missingRequiredSections([{ path: "references.bib", content: "Limitations" }], acl),
    ).toEqual(["Limitations"]);
    expect(missingRequiredSections([tex("no sections at all")], getVenue("neurips")!)).toEqual([]);
  });
});

describe("blindSignals", () => {
  const acl = getVenue("acl")!; // double-blind
  const single = getVenue("lncs")!; // single-blind → never any signal

  it("flags a named author block", () => {
    const s = blindSignals([tex("\\author{Ana Pérez}")], acl);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ file: "main.tex", kind: "author-block" });
    expect(s[0].evidence).toContain("Ana");
  });

  it("accepts empty and anonymised author blocks", () => {
    expect(blindSignals([tex("\\author{}")], acl)).toEqual([]);
    expect(blindSignals([tex("\\author{Anonymous}")], acl)).toEqual([]);
    expect(blindSignals([tex("\\author[1]{Anonymous Authors}")], acl)).toEqual([]);
    expect(blindSignals([tex("\\author{Anonymous Author(s)}")], acl)).toEqual([]);
    expect(blindSignals([tex("\\author{Ana \\and Luis}")], acl).map((s) => s.kind)).toEqual([
      "author-block",
    ]);
  });

  it("flags thanks, acknowledgements and funding mentions", () => {
    expect(blindSignals([tex("\\thanks{Work done at X.}")], acl).map((x) => x.kind)).toEqual([
      "thanks",
    ]);
    expect(
      blindSignals([tex("\\begin{acknowledgements}x\\end{acknowledgements}")], acl),
    ).toHaveLength(1);
    expect(blindSignals([tex("\\section*{Acknowledgements}")], acl)).toHaveLength(1);
    expect(blindSignals([tex("Supported by grant no. 123.")], acl).map((x) => x.kind)).toEqual([
      "grant",
    ]);
    expect(blindSignals([tex("This work was funded by the EU.")], acl)).toHaveLength(1);
  });

  it("reports nothing for venues that are not double-blind", () => {
    expect(blindSignals([tex("\\author{Ana Pérez}\\thanks{x}")], single)).toEqual([]);
  });
});

describe("bibStyleMismatch", () => {
  const acl = getVenue("acl")!;
  const arxiv = getVenue("arxiv")!; // free style

  it("returns null on match (either direction of the contains check)", () => {
    expect(bibStyleMismatch("\\bibliographystyle{acl}", acl)).toBeNull();
    expect(bibStyleMismatch("\\bibliographystyle{acl.sty}", acl)).toBeNull();
    expect(bibStyleMismatch("\\bibliographystyle{neurips_2025}", getVenue("neurips")!)).toBeNull();
  });

  it("reports the found style on mismatch", () => {
    expect(bibStyleMismatch("\\bibliographystyle{plain}", acl)).toEqual({
      expected: "acl.sty",
      found: "plain",
    });
  });

  it("reports 'missing' when there is no \\bibliographystyle", () => {
    expect(bibStyleMismatch("\\printbibliography", acl)).toEqual({
      expected: "acl.sty",
      found: "missing",
    });
  });

  it("returns null for venues with a free style", () => {
    expect(bibStyleMismatch("\\bibliographystyle{plain}", arxiv)).toBeNull();
    expect(bibStyleMismatch("whatever", arxiv)).toBeNull();
  });
});
