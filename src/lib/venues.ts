// Venue profiles for the submission checklist (phase 4a). Golden rule of the
// master plan: only rules we can verify from the venue's public author
// guidelines, each entry carrying its sourceUrl + verifiedAt. This file is
// pure (no node imports, runs in the browser too) and IS the database: no
// network calls at runtime. Bump VENUES_VERSION whenever a value changes so
// the data can be audited in one place.

export const VENUES_VERSION = 1;

export type Venue = {
  id: string;
  name: string;
  kind: "conference" | "journal" | "preprint";
  pageLimit: { value: number | null; scope: "excl-refs" | "incl"; note: string };
  anonymisation: "double" | "single" | "none" | null; // null = varies by edition
  bibStyle: string | null; // expected .sty/.bst, null = free choice
  requiredSections: string[]; // titles that must exist as \section*?{...}
  /** Caveats the UI does not translate: provenance for maintainers. */
  note: string;
  sourceUrl: string;
  verifiedAt: string; // "YYYY-MM"
};

export const VENUES: Venue[] = [
  {
    id: "neurips",
    name: "NeurIPS",
    kind: "conference",
    // FAQ 2025: "the main body of your paper must be contained in the first
    // nine pages"; references, checklist and appendices do not count.
    pageLimit: {
      value: 9,
      scope: "excl-refs",
      note: "+1 página de camera-ready según el año; checklist y apéndices no cuentan",
    },
    anonymisation: "double",
    bibStyle: "neurips_2025.sty (natbib)",
    requiredSections: [],
    note: "El paper checklist es obligatorio pero no es una sección verificable",
    sourceUrl: "https://neurips.cc/Conferences/2025/PaperInformation/NeurIPS-FAQ",
    verifiedAt: "2026-11",
  },
  {
    id: "icml",
    name: "ICML",
    kind: "conference",
    // 2025 author instructions: main body up to 8 pages, then any number of
    // pages for references and appendices; accepted finals get one extra page.
    pageLimit: {
      value: 8,
      scope: "excl-refs",
      note: "cuerpo principal; referencias y apéndices sin límite; la versión final gana +1 página",
    },
    // "All submissions must be anonymized" / "Reviewing for ICML 2025 is
    // double-blind" (AuthorInstructions); the old SubmissionInstructions URL
    // now 404s — the live page carries the same policy.
    anonymisation: "double",
    bibStyle: "icml.sty (natbib)",
    requiredSections: [],
    note: "",
    sourceUrl: "https://icml.cc/Conferences/2025/AuthorInstructions",
    verifiedAt: "2026-11",
  },
  {
    id: "acl",
    name: "ACL",
    kind: "conference",
    // ACL 2025 main conference call: long papers (8 pages), limitations
    // section required, two-way anonymized review.
    pageLimit: {
      value: 8,
      scope: "excl-refs",
      note: "Limitations y referencias no cuentan (política ARR)",
    },
    anonymisation: "double",
    bibStyle: "acl.sty",
    requiredSections: ["Limitations"],
    note: "",
    sourceUrl: "https://2025.aclweb.org/calls/main_conference_papers/",
    verifiedAt: "2026-11",
  },
  {
    id: "ieee-conf",
    name: "IEEE (conferencia)",
    kind: "conference",
    // IEEE sets no single limit: every conference's CFP decides.
    pageLimit: {
      value: null,
      scope: "incl",
      note: "varía por congreso (habitual 6+2 con cargo) — mira tu CFP",
    },
    anonymisation: "single",
    bibStyle: "IEEEtran.cls + IEEEtran.bst",
    requiredSections: [],
    note: "Algunos congresos IEEE son double-blind",
    sourceUrl: "https://www.ieee.org/conferences/publishing/templates.html",
    verifiedAt: "2026-11",
  },
  {
    id: "elsevier",
    name: "Elsevier",
    kind: "journal",
    // The LaTeX instructions state no length limit; each journal's Guide for
    // Authors decides (elsarticle.cls + elsarticle-num.bst confirmed there).
    pageLimit: {
      value: null,
      scope: "incl",
      note: "sin límite en esta guía: lo manda cada revista",
    },
    anonymisation: null,
    bibStyle: "elsarticle.cls + elsarticle-num.bst",
    requiredSections: [],
    note: "Anonimización varía por revista (Guide for Authors)",
    sourceUrl:
      "https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions",
    verifiedAt: "2026-11",
  },
  {
    id: "lncs",
    name: "Springer LNCS",
    kind: "conference",
    // Official instructions for proceedings authors: full papers 12–15+ pages
    // (no reference exclusion stated); extra-page charges are per conference.
    pageLimit: {
      value: 12,
      scope: "incl",
      note: "Springer: full papers 12–15+; muchos volúmenes venden +2/+3 páginas — mira tu CFP",
    },
    anonymisation: "single",
    bibStyle: "llncs.cls + splncs04.bst",
    requiredSections: [],
    note: "El modelo de revisión lo fija cada congreso; el manuscrito LNCS lleva autores",
    sourceUrl: "https://link.springer.com/series/558/information-for-authors-and-editors",
    verifiedAt: "2026-11",
  },
  {
    id: "arxiv",
    name: "arXiv",
    kind: "preprint",
    pageLimit: { value: null, scope: "incl", note: "sin límite de páginas" },
    anonymisation: "none",
    bibStyle: null,
    requiredSections: [],
    note: "Si el venue destino es double-blind, revisa su política sobre arXiv",
    sourceUrl: "https://info.arxiv.org/help/faq/index.html",
    verifiedAt: "2026-11",
  },
];

export function getVenue(id: string | null | undefined): Venue | undefined {
  return id ? VENUES.find((v) => v.id === id) : undefined;
}

/** "Output written on main.pdf (3 pages, 12345 bytes)." → 3, else null. */
export function pagesFromLog(log: string): number | null {
  const m = /Output written on \S+ \((\d+) pages?/.exec(log);
  return m ? Number(m[1]) : null;
}

/** LaTeX metacharacters escaped so a section title can feed a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Required section titles that appear nowhere as \section*?{Title}. */
export function missingRequiredSections(
  files: { path: string; content: string }[],
  venue: Venue,
): string[] {
  const tex = files
    .filter((f) => f.path.endsWith(".tex"))
    .map((f) => f.content)
    .join("\n");
  return venue.requiredSections.filter(
    (title) => !new RegExp(`\\\\section\\*?\\s*\\{\\s*${escapeRe(title)}\\s*\\}`, "i").test(tex),
  );
}

export type BlindSignal = {
  file: string;
  kind: "author-block" | "thanks" | "acknowledgements" | "grant";
  evidence: string;
};

const ANON_AUTHOR = /^(anon\w*|anonymous(\s+(authors?|submission))?)$/i;

/**
 * Possible de-anonymisation signals for double-blind venues. An honest
 * heuristic, not a verdict: the UI presents them as "possible signals".
 */
export function blindSignals(
  files: { path: string; content: string }[],
  venue: Venue,
): BlindSignal[] {
  if (venue.anonymisation !== "double") return [];
  const out: BlindSignal[] = [];
  for (const f of files.filter((x) => x.path.endsWith(".tex"))) {
    const c = f.content;
    for (const m of c.matchAll(/\\author\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
      // "Anonymous Author(s)" and friends are placeholders, not authors.
      const who = m[1]
        .replace(/\(\s*s\s*\)/gi, "")
        .replace(/[().]/g, " ")
        .trim();
      if (who && !ANON_AUTHOR.test(who))
        out.push({ file: f.path, kind: "author-block", evidence: snippet(c, m.index) });
    }
    if (/\\thanks\s*\{/.test(c))
      out.push({ file: f.path, kind: "thanks", evidence: snippet(c, c.indexOf("\\thanks")) });
    const ack = /\\begin\{acknowledgements?\}|\\section\*?\s*\{\s*Acknowledg/i.exec(c);
    if (ack) out.push({ file: f.path, kind: "acknowledgements", evidence: snippet(c, ack.index) });
    const grant = /grant (no|number)|acknowledg(e|ments)? (support|funding)|funded by/i.exec(c);
    if (grant) out.push({ file: f.path, kind: "grant", evidence: snippet(c, grant.index) });
  }
  return out;
}

/** ~60 chars around a match, whitespace-normalised, as the signal evidence. */
function snippet(content: string, index: number): string {
  return content
    .slice(Math.max(0, index), Math.max(0, index) + 60)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compares \bibliographystyle{X} of the main file with the venue expectation.
 * null = fine (match, or the venue leaves the style free); "missing" when no
 * \bibliographystyle exists; otherwise the found style name. ponytail: only
 * \bibliographystyle is compared — biblatex (\printbibliography) users get
 * "missing"; show it informatively if that ever bites.
 */
export function bibStyleMismatch(
  mainContent: string,
  venue: Venue,
): { expected: string; found: string } | null {
  if (!venue.bibStyle) return null;
  const m = /\\bibliographystyle\s*\{([^}]*)\}/.exec(mainContent);
  if (!m) return { expected: venue.bibStyle, found: "missing" };
  const found = m[1].trim();
  const expected = venue.bibStyle.toLowerCase();
  const got = found.toLowerCase();
  return expected.includes(got) || got.includes(expected)
    ? null
    : { expected: venue.bibStyle, found };
}
