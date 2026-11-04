// Pure BibTeX reader for the project library: the entries of a .bib with the
// fields the UI needs, the line where each one starts, and the helpers that
// tell whether a paper is already in the bibliography. No dependencies; safe on
// the server and in the browser.
//
// Reading rules follow BibTeX: braces are counted literally, a field that
// appears twice keeps its first value, anything outside an entry is a comment.
// On top of that, `%` starts a comment between fields (biber/JabRef files rely
// on it) and a broken entry is dropped without taking the rest of the file
// with it: reading resumes at the next line that starts with `@`.

export type BibEntry = {
  key: string;
  type: string; // article, inproceedings, misc… (lowercase)
  title: string; // without protective braces or trivial TeX commands
  authors: string[]; // split on " and ", as written ("Vaswani, Ashish" or "Ashish Vaswani")
  year?: number;
  venue?: string; // journal | booktitle | publisher | howpublished (first one present)
  doi?: string; // lowercase, without URL prefix
  file: string; // path of the .bib this entry came from
  line: number; // 1-based line where "@type{key," starts
};

// ── TeX → plain text ────────────────────────────────────────────────────────

// Combining marks for \'e \`e \^e \"e \~n \=a \.z and \c \k \u \v \H \r \b \d.
const ACCENT = new Map([
  ["`", "̀"],
  ["'", "́"],
  ["^", "̂"],
  ['"', "̈"],
  ["~", "̃"],
  ["=", "̄"],
  [".", "̇"],
  ["c", "̧"],
  ["k", "̨"],
  ["u", "̆"],
  ["v", "̌"],
  ["H", "̋"],
  ["r", "̊"],
  ["b", "̱"],
  ["d", "̣"],
]);
const LETTER = new Map([
  ["ss", "ß"],
  ["o", "ø"],
  ["O", "Ø"],
  ["l", "ł"],
  ["L", "Ł"],
  ["ae", "æ"],
  ["AE", "Æ"],
  ["oe", "œ"],
  ["OE", "Œ"],
  ["aa", "å"],
  ["AA", "Å"],
  ["i", "i"],
  ["j", "j"],
]);
// Control words worth keeping as text; every other one is dropped (its braced
// argument stays, so \emph{Deep} becomes Deep).
const NAMED = new Map([
  ["LaTeX", "LaTeX"],
  ["TeX", "TeX"],
  ["ldots", "…"],
  ["dots", "…"],
]);

// Private-use stand-ins for \{ \} \$ while the rest of the markup is stripped.
const L_BRACE = "";
const R_BRACE = "";
const DOLLAR = "";

function compose(letter: string, accent: string): string {
  const base = letter.startsWith("\\") ? letter[1] : letter;
  return (base + ACCENT.get(accent)).normalize("NFC");
}

function plainSegment(s: string): string {
  return (
    s
      // \'e  \"{o}  \'{\i}
      .replace(
        /\\([`'^"~=.])(?:\{\s*(\\[ij]|[A-Za-z])\s*\}|(\\[ij]|[A-Za-z]))/g,
        (_, accent: string, a?: string, b?: string) => compose((a ?? b)!, accent),
      )
      // \c{c}  \v s  \H{o}
      .replace(
        /\\([cdbkruvH])(?:\s*\{\s*([A-Za-z])\s*\}|\s+([A-Za-z]))/g,
        (_, accent: string, a?: string, b?: string) => compose((a ?? b)!, accent),
      )
      // \ss  \o  \ae …: TeX swallows the blanks after a control word
      .replace(/\\(ss|ae|AE|oe|OE|aa|AA|[oOlLij])(?![A-Za-z])\s*/g, (_, w: string) =>
        LETTER.get(w)!,
      )
      .replace(/\\\\|\\[ ,;:]/g, " ")
      .replace(/\\[-/!]/g, "")
      .replace(/\\([A-Za-z]+)\*?/g, (_, w: string) => NAMED.get(w) ?? "")
      .replace(/[{}]/g, "")
      .replace(/~/g, " ")
      .replace(/---/g, "—")
      .replace(/--/g, "–")
  );
}

/**
 * Display text for a TeX field value: protective braces, accents (`{\"o}`),
 * special letters (`\ss`), escapes (`\&`) and formatting commands (`\emph{}`)
 * become plain Unicode; whitespace collapses. Math (`$…$`) is kept verbatim.
 */
// ponytail: covers what real .bib titles and names use. A macro outside this
// table is dropped (its braced argument stays); grow NAMED/LETTER if one matters.
function texToText(raw: string): string {
  const s = raw
    .replace(/\\\{/g, L_BRACE)
    .replace(/\\\}/g, R_BRACE)
    .replace(/\\\$/g, DOLLAR)
    .replace(/\\([&%#_])/g, "$1");
  const parts = s.split("$");
  // An odd number of `$` means a stray one: then nothing is treated as math.
  const text =
    parts.length % 2 === 1
      ? parts.map((p, i) => (i % 2 ? p : plainSegment(p))).join("$")
      : plainSegment(s);
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll(L_BRACE, "{")
    .replaceAll(R_BRACE, "}")
    .replaceAll(DOLLAR, "$")
    .normalize("NFC");
}

// ── Reading ─────────────────────────────────────────────────────────────────

type Hit<T> = [T, number] | null; // value and the index just after it
type RawEntry = { type: string; key: string; fields: Map<string, string> };

const TYPE = /[A-Za-z][\w-]*/y;
const KEY = /[^\s,{}()"#%=]+/y;
const WORD = /[^\s{}"(),=#%@]+/y; // field names and bare values (numbers, @string macros)

/** Index after blanks and `%` comments. Only ever called between tokens, never inside a value. */
function skip(s: string, i: number): number {
  while (i < s.length) {
    if (s[i] === "%") {
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl + 1;
    } else if (/\s/.test(s[i])) i++;
    else break;
  }
  return i;
}

/** s[i] is "{": the text up to its matching "}", or null if it never closes. */
function braced(s: string, i: number): Hit<string> {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return null;
}

/** s[i] is `"`: the closing quote must sit outside any braces ({"} protects a quote). */
function quoted(s: string, i: number): Hit<string> {
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") depth = Math.max(0, depth - 1);
    else if (s[j] === '"' && depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return null;
}

/** A field value: braced, quoted, number or @string macro, joined with `#`. */
function value(s: string, i: number, macros: Map<string, string>): Hit<string> {
  let out = "";
  for (;;) {
    i = skip(s, i);
    let part: Hit<string>;
    if (s[i] === "{") part = braced(s, i);
    else if (s[i] === '"') part = quoted(s, i);
    else {
      WORD.lastIndex = i;
      const m = WORD.exec(s);
      part = m ? [macros.get(m[0].toLowerCase()) ?? m[0], WORD.lastIndex] : null;
    }
    if (!part) return null;
    out += part[0];
    i = skip(s, part[1]);
    if (s[i] !== "#") return [out, i];
    i++;
  }
}

/** Index just after the delimiter that closes the {…} or (…) block opened at s[i]. */
function blockEnd(s: string, i: number): number | null {
  if (s[i] === "{") return braced(s, i)?.[1] ?? null;
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") depth--;
    else if (s[j] === ")" && depth <= 0) return j + 1;
  }
  return null;
}

/**
 * Reads whatever starts with the "@" at s[at]. Returns where it ends and, for a
 * real entry, its raw fields; null when it is malformed (the caller resyncs).
 * @string definitions land in `macros`; @comment and @preamble are skipped.
 */
function parseAt(
  s: string,
  at: number,
  macros: Map<string, string>,
): { end: number; entry?: RawEntry } | null {
  TYPE.lastIndex = skip(s, at + 1);
  const t = TYPE.exec(s);
  if (!t) return null;
  const type = t[0].toLowerCase();
  let i = skip(s, TYPE.lastIndex);
  const open = s[i];
  if (open !== "{" && open !== "(") {
    if (type !== "comment") return null;
    const nl = s.indexOf("\n", i); // "@comment free text": ignored to the end of the line
    return { end: nl < 0 ? s.length : nl };
  }
  if (type === "comment" || type === "preamble") {
    const end = blockEnd(s, i);
    return end === null ? null : { end };
  }
  const close = open === "{" ? "}" : ")";
  i = skip(s, i + 1);
  let key = "";
  if (type !== "string") {
    KEY.lastIndex = i;
    const k = KEY.exec(s);
    if (!k) return null;
    key = k[0];
    i = skip(s, KEY.lastIndex);
  }
  const fields = new Map<string, string>();
  for (;;) {
    while (s[i] === ",") i = skip(s, i + 1);
    if (i >= s.length) return null;
    if (s[i] === close) break;
    WORD.lastIndex = i;
    const n = WORD.exec(s);
    if (!n) return null;
    i = skip(s, WORD.lastIndex);
    if (s[i] !== "=") return null;
    const v = value(s, i + 1, macros);
    if (!v) return null;
    const name = n[0].toLowerCase();
    if (type === "string") macros.set(name, v[0]);
    else if (!fields.has(name)) fields.set(name, v[0]); // BibTeX keeps the first duplicate
    i = v[1];
  }
  return type === "string" ? { end: i + 1 } : { end: i + 1, entry: { type, key, fields } };
}

/** Index of the next "@" that is not inside a `%` comment, or -1. */
function nextAt(s: string, from: number): number {
  const re = /[@%]/g;
  re.lastIndex = from;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0] === "@") return m.index;
    const nl = s.indexOf("\n", m.index);
    if (nl < 0) return -1;
    re.lastIndex = nl + 1;
  }
  return -1;
}

/** Index of the next "@" that opens a line: where to resume after a broken entry. */
function nextEntryLine(s: string, from: number): number {
  const re = /^[ \t]*@/gm;
  re.lastIndex = from;
  const m = re.exec(s);
  return m ? m.index + m[0].length - 1 : -1;
}

// ── Fields ──────────────────────────────────────────────────────────────────

const VENUE_FIELDS = ["journal", "journaltitle", "booktitle", "publisher", "howpublished"];

/** Names split on " and " outside braces, so {Barnes and Noble} stays one author. */
function splitAuthors(raw: string): string[] {
  const s = raw.replace(/\s+/g, " ");
  const names: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && s[i] === " " && s.slice(i, i + 5).toLowerCase() === " and ") {
      names.push(s.slice(from, i));
      from = i + 5;
      i += 4;
    }
  }
  names.push(s.slice(from));
  return names.map(texToText).filter(Boolean);
}

function yearIn(v?: string): number | undefined {
  const y = /(?<!\d)(\d{4})(?!\d)/.exec(v ?? "")?.[1];
  return y ? Number(y) : undefined;
}

/** "https://doi.org/10.1000/ABC", "doi:10.1000/abc" or "{10.1000/a\_b}" → "10.1000/abc"; null if not a DOI. */
function cleanDoi(raw?: string): string | undefined {
  const d = (raw ?? "")
    .replace(/[{}]/g, "")
    .replace(/\\([_&%#$])/g, "$1")
    .trim()
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d : undefined;
}

function toEntry({ type, key, fields }: RawEntry, file: string, line: number): BibEntry {
  const text = (name: string) => texToText(fields.get(name) ?? "");
  return {
    key,
    type,
    title: text("title"),
    // An edited volume has editors instead of authors; they head the citation.
    authors: splitAuthors(fields.get("author") ?? fields.get("editor") ?? ""),
    year: yearIn(fields.get("year")) ?? yearIn(fields.get("date")),
    venue: VENUE_FIELDS.map(text).find(Boolean),
    doi: cleanDoi(fields.get("doi")),
    file,
    line,
  };
}

/** Every entry of one .bib file, in file order. Never throws: junk is skipped. */
export function parseBibEntries(content: string, file = "references.bib"): BibEntry[] {
  const entries: BibEntry[] = [];
  const macros = new Map<string, string>();
  let line = 1;
  let counted = 0;
  const lineAt = (pos: number) => {
    for (; counted < pos; counted++) if (content.charCodeAt(counted) === 10) line++;
    return line;
  };
  let at = nextAt(content, 0);
  while (at >= 0) {
    const parsed = parseAt(content, at, macros);
    if (parsed?.entry) entries.push(toEntry(parsed.entry, file, lineAt(at)));
    at = parsed ? nextAt(content, parsed.end) : nextEntryLine(content, at + 1);
  }
  return entries;
}

// ── Matching ────────────────────────────────────────────────────────────────

// Letters Unicode does not decompose, folded to their ASCII spelling.
const FOLD = new Map([
  ["ß", "ss"],
  ["ø", "o"],
  ["æ", "ae"],
  ["œ", "oe"],
  ["ł", "l"],
  ["đ", "d"],
  ["ð", "d"],
  ["þ", "th"],
  ["ı", "i"],
]);

/**
 * Comparison key for titles: lowercase, no accents, TeX, HTML tags or
 * punctuation, single spaces. A .bib title (`Schr{\"o}dinger's {C}at`) and the
 * same title from a search API (`Schrödinger’s Cat`) normalize to the same string.
 */
export function normalizeTitle(s: string): string {
  return texToText(s.replace(/<\/?[a-z][^>]*>/gi, "").replaceAll("&amp;", "&")) // OpenAlex titles carry <i>…</i>
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßøæœłđðþı]/g, (c) => FOLD.get(c)!)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Family name of ONE raw author string, in either BibTeX order: "Family, Given"
 * (before the first comma) or "Given Family" (last word). Braces are stripped,
 * so "{\L}ukasz Kaiser" and "Kaiser, {\L}ukasz" both give "Kaiser".
 */
export function surname(author: string): string {
  const a = author.replace(/[{}]/g, "").trim();
  const comma = a.indexOf(",");
  return (comma > 0 ? a.slice(0, comma) : (a.split(/\s+/).at(-1) ?? "")).trim();
}

const MIN_TITLE = 12; // shorter titles ("Overview", "Introduction") collide between unrelated works
const titles = new WeakMap<BibEntry, string>(); // callers match many results against the same entries

function titleOf(e: BibEntry): string {
  let t = titles.get(e);
  if (t === undefined) titles.set(e, (t = normalizeTitle(e.title)));
  return t;
}

/**
 * The entry for this work, if the bibliography already has it: same DOI, or
 * failing that the same normalized title (at least 12 characters). A title match
 * is not accepted when both sides carry a DOI and the DOIs differ: those are two
 * records (a preprint and its published version, or two works sharing a title).
 */
export function findInBib(
  entries: BibEntry[],
  p: { doi?: string; title?: string },
): BibEntry | undefined {
  const doi = cleanDoi(p.doi);
  if (doi) {
    const byDoi = entries.find((e) => e.doi?.toLowerCase() === doi);
    if (byDoi) return byDoi;
  }
  const title = p.title ? normalizeTitle(p.title) : "";
  if (title.length < MIN_TITLE) return undefined;
  return entries.find(
    (e) => titleOf(e) === title && !(doi && e.doi && e.doi.toLowerCase() !== doi),
  );
}
