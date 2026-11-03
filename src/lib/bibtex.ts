const KEY_RE = /@\s*\w+\s*[{(]\s*([^,\s]+)\s*,/g;

export function bibKeys(bib: string): string[] {
  return [...bib.matchAll(KEY_RE)].map((m) => m[1]);
}

/** DOIs found in doi = {…} fields; strips a doi.org prefix if pasted as URL. */
export function bibDois(bib: string): string[] {
  const dois = new Set<string>();
  for (const m of bib.matchAll(/\bdoi\s*=\s*[{"]([^}"]+?)[}"]/gi)) {
    const doi = m[1]
      .trim()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
      .replace(/^doi:/i, "");
    if (/^10\.\d{4,9}\/\S+$/.test(doi)) dois.add(doi);
  }
  return [...dois];
}

function entries(bib: string): string[] {
  return bib.split(/(?=^\s*@)/m).filter((e) => e.trim().startsWith("@"));
}

/** Drops the entry with this key, keeping the rest byte-for-byte. */
export function removeBibEntry(bib: string, key: string): string {
  return entries(bib)
    .filter((e) => bibKeys(e)[0] !== key)
    .join("")
    .trimEnd();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Adds a BibTeX entry unless the same work is already there (same DOI, or the
 * same title when there is no DOI). Renames the key if it clashes.
 */
export function addBibEntry(
  bib: string,
  entry: string,
  match: { doi?: string; title?: string },
): { content: string; key: string; added: boolean } {
  // The emitted entry escapes LaTeX specials, so match the DOI as it will
  // appear there, not as it came from the API.
  const doiRe = match.doi
    ? new RegExp(`doi\\s*=\\s*[{"]\\s*${escapeRe(texEscape(match.doi))}\\s*[}"]`, "i")
    : null;
  const title = match.title ? norm(match.title) : "";
  const existing = entries(bib).find((e) => {
    if (doiRe) return doiRe.test(e);
    // Line-anchored so "booktitle" never matches; greedy so nested braces in
    // the value ({{...}}) are captured whole.
    const t = /^[ \t]*title[ \t]*=[ \t]*[{"](.+)[}"][ \t]*,$/im.exec(e)?.[1];
    return Boolean(title && t && norm(t) === title);
  });
  if (existing) return { content: bib, key: bibKeys(existing)[0], added: false };

  const original = bibKeys(entry)[0];
  if (!original) throw new Error("entry without key");
  const taken = new Set(bibKeys(bib));
  let key = original;
  for (let i = 0; taken.has(key); i++) key = `${original}${String.fromCharCode(98 + i)}`; // b, c, ...
  const renamed = entry.trim().replace(original, key);
  const sep = bib.trim() ? (bib.endsWith("\n") ? "\n" : "\n\n") : "";
  return { content: `${bib}${sep}${renamed}\n`, key, added: true };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type BibSource = {
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  type: string;
  openAccessUrl?: string;
  volume?: string;
  issue?: string;
  pages?: string;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "on",
  "of",
  "in",
  "for",
  "and",
  "to",
  "with",
  "towards",
  "toward",
]);
const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** "Ashish Vaswani" -> "Vaswani, Ashish". Names already in "Last, First" form are kept. */
function bibName(name: string) {
  if (name.includes(",")) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
}

/** Escapes the characters that break BibTeX/LaTeX; keeps Unicode letters. */
export function texEscape(s: string) {
  return s
    .replace(/[\\{}]/g, "")
    .replace(/([&%$#_])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Key in the common "familyYEARfirstword" form, e.g. vaswani2017attention. */
export function citeKey(src: Pick<BibSource, "authors" | "year" | "title">) {
  const family = src.authors[0] ? ascii(bibName(src.authors[0]).split(",")[0]) : "anon";
  const word =
    src.title
      .split(/\s+/)
      .map(ascii)
      .find((w) => w.length > 2 && !STOP.has(w)) ?? "work";
  return `${family || "anon"}${src.year ?? ""}${word}`;
}

export function toBibtex(src: BibSource): { key: string; entry: string } {
  const key = citeKey(src);
  const venue = src.venue ? texEscape(src.venue) : undefined;
  let type = "misc";
  const fields: [string, string | undefined][] = [
    ["title", `{${texEscape(src.title)}}`],
    ["author", src.authors.slice(0, 50).map(bibName).map(texEscape).join(" and ") || undefined],
    ["year", src.year?.toString()],
  ];
  if (src.type === "article" || src.type === "journal-article" || src.type === "review") {
    type = "article";
    fields.push(
      ["journal", venue],
      ["volume", src.volume ? texEscape(src.volume) : undefined],
      ["number", src.issue ? texEscape(src.issue) : undefined],
      ["pages", src.pages ? texEscape(src.pages) : undefined],
    );
  } else if (src.type === "proceedings-article" || src.type === "conference-paper") {
    type = "inproceedings";
    fields.push(["booktitle", venue], ["pages", src.pages ? texEscape(src.pages) : undefined]);
  } else if (src.type === "book") {
    type = "book";
    fields.push(["publisher", venue]);
  } else if (src.type === "book-chapter") {
    type = "incollection";
    fields.push(["booktitle", venue], ["pages", src.pages ? texEscape(src.pages) : undefined]);
  } else {
    fields.push(["howpublished", venue]);
  }
  fields.push(
    ["doi", src.doi ? texEscape(src.doi) : undefined],
    ["url", src.doi ? undefined : src.openAccessUrl ? texEscape(src.openAccessUrl) : undefined],
  );
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k.padEnd(12)}= {${v}}`)
    .join(",\n");
  return { key, entry: `@${type}{${key},\n${body}\n}` };
}
