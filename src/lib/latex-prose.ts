// Extracts the prose of a LaTeX source for a grammar checker, with an exact
// map from every offset of the cleaned text back to the source. Pure: also
// runs in the browser.
//
// Design: every output character carries the index of the source character it
// came from (or -1 for synthetic padding such as the space left where a
// command was removed). Fragments are the maximal runs where those indices are
// consecutive, so the mapping is correct by construction no matter which
// extraction rules fire. Rules may drop prose; they can never shift a jump.
//
// Callers pass "\n"-normalized content (strip CRLF/BOM first): lines and
// columns are counted on that string, and the line is what the editor uses.

export type Fragment = { outStart: number; origStart: number; length: number };

/** Commands removed together with their arguments (they hold keys, paths, sizes). */
const DROP_ONE = new Set([
  "label",
  "url",
  "includegraphics",
  "input",
  "include",
  "usepackage",
  "RequirePackage",
  "bibliographystyle",
  "bibliography",
  "addbibresource",
  "documentclass",
  "hspace",
  "vspace",
  "footnotemark",
  "nocite",
]);
/** Same, with two mandatory arguments. */
const DROP_TWO = new Set(["setcounter", "addtocounter", "rule"]);
/** \cite, \citep, \parencite, \ref, \eqref, \cref, \autoref, \pageref… */
const DROP_RE = /^(?:[a-zA-Z]*cite[a-zA-Z]*|[a-z]*ref|Cref|nameref)$/;

/** Environments whose whole content is dropped. */
const MATH_ENVS = new Set([
  "equation",
  "align",
  "alignat",
  "gather",
  "displaymath",
  "math",
  "eqnarray",
  "multline",
  "flalign",
]);
const SKIP_ENVS = new Set([
  "verbatim",
  "lstlisting",
  "minted",
  "comment",
  "tabular",
  "tabularx",
  "longtable",
  "tikzpicture",
  "thebibliography",
]);
const dropsWholeEnv = (name: string) => {
  const base = name.replace(/\*$/, "");
  return MATH_ENVS.has(base) || SKIP_ENVS.has(base);
};

/** Escaped characters kept literally (\& → &). */
const LITERAL_ESCAPES = new Set(["&", "$", "%", "_", "#", "{", "}"]);
/** Spacing commands that become a space. */
const SPACE_ESCAPES = new Set([" ", ",", ";", ":", "!", ">", "\n", "\t"]);

const PAD = -1;

/** Pass 1: drops comments (unescaped % to end of line). Pure-comment lines vanish whole. */
function stripComments(content: string): { s: string; o: number[] } {
  let s = "";
  const o: number[] = [];
  let lineStart = 0;
  while (lineStart <= content.length) {
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    let cut = lineEnd;
    for (let i = lineStart; i < lineEnd; i++) {
      // \verb|50%| is literal: its % opens no comment.
      if (content.startsWith("\\verb", i) && !/[a-zA-Z]/.test(content[i + 5] ?? "a")) {
        const d = content[i + 5] === "*" ? i + 6 : i + 5;
        const close = content.indexOf(content[d], d + 1);
        if (close !== -1 && close < lineEnd) i = close;
        continue;
      }
      // \url{a%20b} and \href{a%20b}{..} take % literally too.
      if (content.startsWith("\\url{", i) || content.startsWith("\\href{", i)) {
        const close = content.indexOf("}", i);
        if (close !== -1 && close < lineEnd) i = close;
        continue;
      }
      if (content[i] !== "%") continue;
      let slashes = 0;
      for (let j = i - 1; j >= lineStart && content[j] === "\\"; j--) slashes++;
      if (slashes % 2 === 0) {
        cut = i;
        break;
      }
    }
    const pureComment = cut < lineEnd && content.slice(lineStart, cut).trim() === "";
    if (!pureComment) {
      for (let i = lineStart; i < cut; i++) {
        s += content[i];
        o.push(i);
      }
      if (nl !== -1) {
        s += "\n";
        o.push(nl);
      }
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  return { s, o };
}

/** Index just past the group opened at s[i] (`{` or `[`), or -1 if unbalanced. */
function skipGroup(s: string, i: number): number {
  const open = s[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let braces = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (open === "[") {
      if (c === "{") braces++;
      else if (c === "}") braces--;
      else if (c === "]" && braces === 0) return j + 1;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j + 1;
  }
  return -1;
}

/** Skips adjacent [..] options starting at i. */
function skipOptions(s: string, i: number): number {
  while (s[i] === "[") {
    const end = skipGroup(s, i);
    if (end === -1) break;
    i = end;
  }
  return i;
}

/** Skips options plus `n` mandatory {..} arguments (spaces allowed between). */
function skipArgs(s: string, i: number, n: number): number {
  let j = i;
  for (let k = 0; k < n; k++) {
    let p = j;
    while (s[p] === " " || s[p] === "\t") p++;
    p = skipOptions(s, p);
    while (s[p] === " " || s[p] === "\t") p++;
    if (s[p] !== "{") return j;
    const end = skipGroup(s, p);
    if (end === -1) return j;
    j = end;
  }
  return j;
}

/** Index of the first unescaped `delim` at or after i, or -1. */
function findClose(s: string, i: number, delim: string): number {
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") {
      if (s.startsWith(delim, j)) return j;
      j++;
      continue;
    }
    if (s.startsWith(delim, j)) return j;
  }
  return -1;
}

export function extractProse(content: string): { text: string; fragments: Fragment[] } {
  const { s, o } = stripComments(content);
  const chars: string[] = [];
  const orig: number[] = [];
  const emit = (c: string, at: number) => {
    chars.push(c);
    orig.push(at);
  };
  const pad = () => emit(" ", PAD);

  // Preamble and anything after \end{document} are configuration, not prose.
  let i = 0;
  let end = s.length;
  const docStart = s.indexOf("\\begin{document}");
  if (docStart !== -1) {
    i = docStart + "\\begin{document}".length;
    const docEnd = s.indexOf("\\end{document}", i);
    if (docEnd !== -1) end = docEnd;
  }

  while (i < end) {
    const c = s[i];
    if (c === "$") {
      const display = s[i + 1] === "$";
      const delim = display ? "$$" : "$";
      const close = findClose(s, i + delim.length, delim);
      if (close === -1 || close >= end) {
        emit(c, o[i]); // unclosed math: keep the character as written
        i++;
        continue;
      }
      pad();
      i = close + delim.length;
      continue;
    }
    if (c === "{" || c === "}") {
      i++;
      continue;
    }
    if (c === "~") {
      emit(" ", o[i]);
      i++;
      continue;
    }
    if (c === "-" && s[i + 1] === "-") {
      const triple = s[i + 2] === "-";
      emit(triple ? "—" : "–", o[i]);
      i += triple ? 3 : 2;
      continue;
    }
    if (c !== "\\") {
      emit(c, o[i]);
      i++;
      continue;
    }

    // Backslash: escapes, math delimiters, commands.
    const next = s[i + 1] ?? "";
    if (next === "\\") {
      pad(); // forced line break
      i = skipOptions(s, i + 2);
      continue;
    }
    if (next === "(" || next === "[") {
      const close = findClose(s, i + 2, next === "(" ? "\\)" : "\\]");
      if (close === -1 || close >= end) {
        emit(next, o[i + 1]);
        i += 2;
        continue;
      }
      pad();
      i = close + 2;
      continue;
    }
    if (LITERAL_ESCAPES.has(next)) {
      emit(next, o[i + 1]);
      i += 2;
      continue;
    }
    if (SPACE_ESCAPES.has(next)) {
      pad();
      i += 2;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i += 2; // accents and other symbols: drop the token, keep the letter after it
      continue;
    }

    let j = i + 1;
    while (j < end && /[a-zA-Z]/.test(s[j])) j++;
    const name = s.slice(i + 1, j);
    if (s[j] === "*") j++;

    if (name === "begin" || name === "end") {
      const m = /^\s*\{([a-zA-Z*]+)\}/.exec(s.slice(j, j + 64));
      if (!m) {
        i = j;
        continue;
      }
      const env = m[1];
      const after = j + m[0].length;
      if (name === "begin" && dropsWholeEnv(env)) {
        const closeTag = `\\end{${env}}`;
        const close = s.indexOf(closeTag, after);
        if (close === -1 || close >= end) {
          i = after; // unclosed: drop only the \begin token
        } else {
          pad();
          i = close + closeTag.length;
        }
        continue;
      }
      pad();
      i = name === "begin" ? skipOptions(s, after) : after;
      continue;
    }
    if (name === "verb") {
      const delim = s[j];
      const close = delim ? s.indexOf(delim, j + 1) : -1;
      pad();
      i = close === -1 ? j : close + 1;
      continue;
    }
    if (name === "href") {
      // Drop the URL, keep the link text (the next {..} flows on as prose).
      pad();
      i = skipArgs(s, j, 1);
      continue;
    }
    if (DROP_ONE.has(name) || DROP_RE.test(name)) {
      pad();
      i = skipArgs(s, j, 1);
      continue;
    }
    if (DROP_TWO.has(name)) {
      pad();
      i = skipArgs(s, j, 2);
      continue;
    }
    // Text and unknown commands: drop the token and its [options]; the
    // {argument} is kept as prose (losing prose is worse than a false alarm).
    pad();
    i = skipOptions(s, j);
  }

  return collapse(chars, orig);
}

/** Whitespace runs → one space, one newline or one blank line; trims the ends. */
function collapse(chars: string[], orig: number[]): { text: string; fragments: Fragment[] } {
  const outChars: string[] = [];
  const outOrig: number[] = [];
  const isWs = (c: string) => c === " " || c === "\t" || c === "\n";
  let k = 0;
  while (k < chars.length) {
    if (!isWs(chars[k])) {
      outChars.push(chars[k]);
      outOrig.push(orig[k]);
      k++;
      continue;
    }
    let r = k;
    let newlines = 0;
    let padded = false;
    // A blank line is a paragraph break only when nothing was removed on it:
    // a line emptied by extraction (an environment, a label) just vanishes.
    let blank = false;
    let padSinceNewline = false;
    const realSpaces: number[] = [];
    const realNewlines: number[] = [];
    while (r < chars.length && isWs(chars[r])) {
      if (orig[r] === PAD) {
        padded = true;
        padSinceNewline = true;
      } else if (chars[r] === " ") realSpaces.push(orig[r]);
      else if (chars[r] === "\n") realNewlines.push(orig[r]);
      if (chars[r] === "\n") {
        if (newlines > 0 && !padSinceNewline) blank = true;
        newlines++;
        padSinceNewline = false;
      }
      r++;
    }
    const atEdge = outChars.length === 0 || r === chars.length;
    // "results \cite{x}." would read "results ." — drop the gap a removal left.
    const beforePunct = padded && newlines === 0 && /[.,;:!?)]/.test(chars[r] ?? "");
    if (!atEdge && !beforePunct) {
      // Output whitespace reuses the index of a real source character of the
      // same kind when there is one, so fragments stay long; else it is padding.
      if (blank) {
        outChars.push("\n", "\n");
        outOrig.push(realNewlines[0] ?? PAD, realNewlines[1] ?? PAD);
      } else if (newlines > 0) {
        outChars.push("\n");
        outOrig.push(realNewlines[0] ?? PAD);
      } else {
        outChars.push(" ");
        outOrig.push(realSpaces[0] ?? PAD);
      }
    }
    k = r;
  }

  const fragments: Fragment[] = [];
  for (let n = 0; n < outOrig.length; n++) {
    const at = outOrig[n];
    if (at === PAD) continue;
    const last = fragments[fragments.length - 1];
    if (last && last.outStart + last.length === n && last.origStart + last.length === at) {
      last.length++;
    } else {
      fragments.push({ outStart: n, origStart: at, length: 1 });
    }
  }
  return { text: outChars.join(""), fragments };
}

/**
 * Source index of an offset in the cleaned text. An offset on padding snaps to
 * the start of the next fragment (or just past the previous one at the end);
 * `padding` tells the caller it did.
 */
export function mapOffset(
  fragments: Fragment[],
  content: string,
  offset: number,
): { index: number; padding: boolean } {
  let prev: Fragment | undefined;
  for (const f of fragments) {
    if (offset < f.outStart) return { index: f.origStart, padding: true };
    if (offset < f.outStart + f.length) {
      return { index: f.origStart + (offset - f.outStart), padding: false };
    }
    prev = f;
  }
  const index = prev ? prev.origStart + prev.length : 0;
  return { index: Math.min(index, content.length), padding: true };
}

/** 1-based line and column of a source index ("\n" line breaks). */
export function lineOf(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  const stop = Math.min(index, content.length);
  for (let i = 0; i < stop; i++) {
    if (content[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: stop - lineStart + 1 };
}
