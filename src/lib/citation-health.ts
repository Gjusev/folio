// Pure cross-check between the bibliography and the \cite commands of a
// project: unused entries, undefined keys, and arXiv preprints that may have
// a published version worth upgrading to.

import { bibKeys } from "./bibtex";

export type HealthInput = { path: string; content: string }[];

export type ArxivCandidate = {
  key: string;
  file: string;
  doi: string; // 10.48550/arXiv.…
  title: string;
  /** First author's family name and year, for safe upgrade matching. */
  family?: string;
  year?: number;
};

export type CitationHealth = {
  defined: string[]; // keys present in some .bib
  cited: string[]; // keys used in some \cite-family command
  unused: string[]; // defined but never cited
  undefined: string[]; // cited but not defined
  arxiv: ArxivCandidate[];
};

/** Strips LaTeX comments (unescaped % to end of line) before scanning. */
function stripComments(tex: string): string {
  return tex
    .split("\n")
    .map((l) => l.replace(/(?<!\\)%.*$/, ""))
    .join("\n");
}

// \cite, \citep, \citet, \parencite, \textcite, \autocite, \footcite, …
const CITE_RE = /\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\]){0,2}\{([^}]*)\}/g;

/** Keys cited anywhere in the project's .tex files, in first-use order. */
export function citedKeys(texFiles: HealthInput): string[] {
  const seen = new Set<string>();
  for (const f of texFiles) {
    if (!f.path.endsWith(".tex")) continue;
    const src = stripComments(f.content);
    for (const m of src.matchAll(CITE_RE)) {
      for (const key of m[1].split(",")) {
        const k = key.trim();
        if (k) seen.add(k);
      }
    }
  }
  return [...seen];
}

function entryTitle(entry: string): string {
  return (
    /^[ \t]*title[ \t]*=[ \t]*[{"](.+)[}"][ \t]*,$/im.exec(entry)?.[1]?.replace(/[{}]/g, "") ?? ""
  );
}

/** First author's family name: "Family, Given" or "Given Family" → "Family". */
function entryFamily(entry: string): string | undefined {
  const authors =
    /^[ \t]*author[ \t]*=[ \t]*[{"](.+)[}"][ \t]*,$/im.exec(entry)?.[1]?.replace(/[{}]/g, "") ?? "";
  const first = authors.split(/\s+and\s+/)[0]?.trim();
  if (!first) return undefined;
  return first.includes(",")
    ? first.split(",")[0].trim().toLowerCase()
    : (first.split(/\s+/).at(-1) ?? "").toLowerCase() || undefined;
}

function entryYear(entry: string): number | undefined {
  const y = /year\s*=\s*[{"]?(\d{4})/.exec(entry)?.[1];
  return y ? Number(y) : undefined;
}

const ARXIV_DOI = /\bdoi\s*=\s*[{"]\s*(10\.48550\/arxiv\.[^}"]+?)\s*[}"]/i;

export function citationHealth(files: HealthInput): CitationHealth {
  const defined: string[] = [];
  const arxiv: ArxivCandidate[] = [];
  for (const f of files) {
    if (!f.path.endsWith(".bib")) continue;
    for (const entry of f.content.split(/(?=^\s*@)/m)) {
      const key = bibKeys(entry)[0];
      if (!key) continue;
      if (!defined.includes(key)) defined.push(key);
      const doi = ARXIV_DOI.exec(entry)?.[1];
      if (doi)
        arxiv.push({
          key,
          file: f.path,
          doi,
          title: entryTitle(entry),
          family: entryFamily(entry),
          year: entryYear(entry),
        });
    }
  }
  const texFiles = files.filter((f) => f.path.endsWith(".tex"));
  const cited = citedKeys(texFiles);
  const defSet = new Set(defined);
  const citedSet = new Set(cited);
  return {
    defined,
    cited,
    unused: defined.filter((k) => !citedSet.has(k)),
    undefined: cited.filter((k) => !defSet.has(k)),
    arxiv,
  };
}

/** Token-level title similarity in [0,1]; punctuation and case ignored. */
export function titleSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

/**
 * Rewrites `from` → `to` inside \cite-family lists, leaving every other key
 * and the surrounding text untouched.
 */
export function replaceCiteKey(tex: string, from: string, to: string): string {
  return tex.replace(CITE_RE, (whole, inner: string) => {
    if (!inner.split(",").some((k) => k.trim() === from)) return whole;
    const rebuilt = inner
      .split(",")
      .map((k) => (k.trim() === from ? k.replace(from, to) : k))
      .join(",");
    return whole.replace(inner, rebuilt);
  });
}
