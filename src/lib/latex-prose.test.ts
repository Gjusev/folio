import { describe, expect, it } from "vitest";
import { extractProse, lineOf, mapOffset, type Fragment } from "@/lib/latex-prose";

const raw = String.raw;

/** Every fragment must copy its source verbatim (bar the ~ and dash rewrites). */
function assertHonest(content: string, text: string, fragments: Fragment[]) {
  let lastOut = -1;
  for (const f of fragments) {
    expect(f.length).toBeGreaterThan(0);
    expect(f.outStart).toBeGreaterThan(lastOut);
    lastOut = f.outStart + f.length - 1;
    for (let k = 0; k < f.length; k++) {
      const out = text[f.outStart + k];
      const src = content[f.origStart + k];
      const rewritten = (src === "~" && out === " ") || (src === "-" && /[–—]/.test(out));
      if (!rewritten) expect(out, `fragment ${JSON.stringify(f)} @${k}`).toBe(src);
    }
  }
}

function prose(content: string) {
  const r = extractProse(content);
  assertHonest(content, r.text, r.fragments);
  return r;
}

/** Where `word` (n-th occurrence in the cleaned text) lands in the source. */
function locate(content: string, word: string, nth = 0) {
  const { text, fragments } = prose(content);
  let at = -1;
  for (let k = 0; k <= nth; k++) at = text.indexOf(word, at + 1);
  expect(at, `"${word}" in ${JSON.stringify(text)}`).toBeGreaterThanOrEqual(0);
  const { index } = mapOffset(fragments, content, at);
  expect(content.slice(index, index + word.length)).toBe(word);
  return lineOf(content, index);
}

describe("extractProse — comments", () => {
  it("drops a trailing comment and keeps the line break", () => {
    expect(prose("Hello world % a note\nNext line.").text).toBe("Hello world\nNext line.");
  });
  it("keeps an escaped \\% and its following text", () => {
    const content = raw`Up 50\% más rápido.`;
    expect(prose(content).text).toBe("Up 50% más rápido.");
    expect(locate(content, "%")).toEqual({ line: 1, column: 7 });
    expect(locate(content, "más")).toEqual({ line: 1, column: 9 });
  });
  it("treats \\\\% as a line break followed by a comment", () => {
    expect(prose(raw`One\\% gone` + "\nTwo").text).toBe("One\nTwo");
  });
  it("removes pure comment lines without leaving blank paragraphs", () => {
    expect(prose("First.\n% c1\n  % c2\nSecond.").text).toBe("First.\nSecond.");
  });
  it("a comment does not glue words of different lines", () => {
    const content = "alpha% c\nbeta";
    expect(prose(content).text).toBe("alpha\nbeta");
    expect(locate(content, "beta")).toEqual({ line: 2, column: 1 });
  });
  it("a $ inside a comment does not open math", () => {
    expect(prose("Price % costs $5\nis fine $x$ here.").text).toBe("Price\nis fine here.");
  });
  it("a % inside \\url or \\href is part of the URL, not a comment", () => {
    const content = raw`See \url{http://x.org/a%20b} or \href{http://y.org/%7E}{the site} now.`;
    expect(prose(content).text).toBe("See or the site now.");
    expect(locate(content, "now")).toEqual({ line: 1, column: 67 });
  });
});

describe("extractProse — math", () => {
  it("drops inline $..$ and display $$..$$", () => {
    expect(prose("Let $x^2$ be big. Also $$y = 1$$ ok.").text).toBe("Let be big. Also ok.");
  });
  it("drops \\(..\\) and \\[..\\]", () => {
    expect(prose(raw`A \(a+b\) and \[c\] end.`).text).toBe("A and end.");
  });
  it("ignores an escaped \\$ when looking for the closing $", () => {
    expect(prose(raw`Cost $a\$b$ done.`).text).toBe("Cost done.");
    expect(prose(raw`It costs \$5 today.`).text).toBe("It costs $5 today.");
  });
  it("keeps an unclosed $ as written", () => {
    const content = "Pay 5$ now please.";
    expect(prose(content).text).toBe(content);
  });
  it("drops a multi-line align (content included) and keeps the text after it on its line", () => {
    const content = [
      "We have", // 1
      raw`\begin{align}`, // 2
      raw`  a &= b \\`, // 3
      "  c &= d", // 4
      raw`\end{align} where the rest`, // 5
      "follows here.", // 6
    ].join("\n");
    const { text } = prose(content);
    expect(text).not.toMatch(/a &= b|c &= d|align/);
    expect(text).toBe("We have\nwhere the rest\nfollows here.");
    expect(locate(content, "where")).toEqual({ line: 5, column: 13 });
    expect(locate(content, "follows")).toEqual({ line: 6, column: 1 });
  });
  it("starred math environments are dropped too", () => {
    expect(prose(raw`Text \begin{equation*}E=mc^2\end{equation*} more.`).text).toBe("Text more.");
  });
});

describe("extractProse — commands", () => {
  it("\\emph keeps its argument, \\cite is dropped with no gap before punctuation", () => {
    const content = raw`An \emph{important} result~\cite[p.~3]{knuth84}.`;
    expect(prose(content).text).toBe("An important result.");
    expect(locate(content, "important")).toEqual({ line: 1, column: 10 });
  });
  it("drops refs, labels, urls and graphics", () => {
    expect(
      prose(
        raw`See Fig.~\ref{f}\label{x} and \url{http://a.b} or \includegraphics[width=2cm]{f.png} now.`,
      ).text,
    ).toBe("See Fig. and or now.");
  });
  it("\\href drops the URL and keeps the link text", () => {
    const content = raw`Visit \href{https://ex.org}{our site} today.`;
    expect(prose(content).text).toBe("Visit our site today.");
    expect(locate(content, "our site")).toEqual({ line: 1, column: 29 });
  });
  it("sections, captions and footnotes keep their text, options go", () => {
    expect(prose(raw`\section[Short]{Long title} Body\footnote{A note.} end.`).text).toBe(
      "Long title Body A note. end.",
    );
  });
  it("unknown commands lose only the token and options", () => {
    expect(prose(raw`The \mycmd[opt]{kept words} stay.`).text).toBe("The kept words stay.");
  });
  it("drops two-argument commands entirely", () => {
    expect(prose(raw`A \setcounter{page}{3}B \rule{1pt}{2pt}C`).text).toBe("A B C");
  });
  it("rewrites ~, \\\\, dashes and escaped specials", () => {
    expect(prose(raw`a~b\\c --- d -- e \& \_ \#`).text).toBe("a b c — d – e & _ #");
  });
  it("drops \\verb spans", () => {
    expect(prose(raw`Use \verb|x%y| here.`).text).toBe("Use here.");
  });
});

describe("extractProse — environments", () => {
  it("verbatim is dropped whole", () => {
    const content = [
      "Before.",
      raw`\begin{verbatim}`,
      "code $ { here",
      raw`\end{verbatim}`,
      "After.",
    ].join("\n");
    expect(prose(content).text).toBe("Before.\nAfter.");
    expect(locate(content, "After.")).toEqual({ line: 5, column: 1 });
  });
  it("tabular is dropped, abstract and itemize keep their prose", () => {
    const content = [
      raw`\begin{abstract}`,
      "We study things.",
      raw`\end{abstract}`,
      raw`\begin{tabular}{lc}`,
      raw`cell & other \\`,
      raw`\end{tabular}`,
      raw`\begin{itemize}`,
      raw`\item First point.`,
      raw`\end{itemize}`,
    ].join("\n");
    const { text } = prose(content);
    expect(text).toBe("We study things.\nFirst point.");
    expect(locate(content, "First")).toEqual({ line: 8, column: 7 });
  });
  it("figure options are dropped and the caption kept", () => {
    expect(
      prose(raw`\begin{figure}[htbp]\includegraphics{a}\caption{A cat.}\end{figure}`).text,
    ).toBe("A cat.");
  });
  it("thebibliography is dropped whole", () => {
    expect(
      prose(raw`End.\begin{thebibliography}{9}\bibitem{a} A. Book.\end{thebibliography}`).text,
    ).toBe("End.");
  });
  it("skips the preamble and anything after \\end{document}", () => {
    const content = [
      raw`\documentclass{article}`,
      raw`\usepackage{amsmath}`,
      raw`\newcommand{\foo}{bar}`,
      raw`\begin{document}`,
      "Real prose.",
      raw`\end{document}`,
      "trailing junk",
    ].join("\n");
    expect(prose(content).text).toBe("Real prose.");
    expect(locate(content, "prose")).toEqual({ line: 5, column: 6 });
  });
  it("an unclosed math environment drops only its \\begin token", () => {
    expect(prose(raw`Hi \begin{equation} x there`).text).toBe("Hi x there");
  });
  it("collapses runs of blank lines into one paragraph break", () => {
    expect(prose("One.\n\n\n\nTwo.").text).toBe("One.\n\nTwo.");
  });
});

describe("mapOffset", () => {
  // "ab $x$ cd" → "ab cd": fragment "ab " (0..2 ↔ 0..2), padding none, "cd"…
  const content = "ab $x$ cd";
  const { text, fragments } = extractProse(content);

  it("produces the expected fragments", () => {
    expect(text).toBe("ab cd");
    expect(fragments).toEqual([
      { outStart: 0, origStart: 0, length: 3 },
      { outStart: 3, origStart: 7, length: 2 },
    ]);
  });
  it("offset 0 maps to the source start", () => {
    expect(mapOffset(fragments, content, 0)).toEqual({ index: 0, padding: false });
  });
  it("last character of a fragment and first of the next", () => {
    expect(mapOffset(fragments, content, 2)).toEqual({ index: 2, padding: false });
    expect(mapOffset(fragments, content, 3)).toEqual({ index: 7, padding: false });
  });
  it("final offset (end of text) snaps just past the last fragment", () => {
    expect(mapOffset(fragments, content, 5)).toEqual({ index: 9, padding: true });
  });
  it("padding snaps to the next fragment", () => {
    const c = raw`one\cite{x}two`; // "one two": the space is synthetic padding
    const r = extractProse(c);
    expect(r.text).toBe("one two");
    const pad = r.text.indexOf(" ");
    expect(mapOffset(r.fragments, c, pad)).toEqual({ index: c.indexOf("two"), padding: true });
  });
  it("no fragments maps to 0", () => {
    expect(mapOffset([], "", 4)).toEqual({ index: 0, padding: true });
  });
});

describe("lineOf", () => {
  const content = "l1\nline2\n\nfour";
  it("counts 1-based lines and columns", () => {
    expect(lineOf(content, 0)).toEqual({ line: 1, column: 1 });
    expect(lineOf(content, 2)).toEqual({ line: 1, column: 3 }); // the "\n" itself
    expect(lineOf(content, 3)).toEqual({ line: 2, column: 1 });
    expect(lineOf(content, 7)).toEqual({ line: 2, column: 5 });
    expect(lineOf(content, 9)).toEqual({ line: 3, column: 1 });
    expect(lineOf(content, 10)).toEqual({ line: 4, column: 1 });
    expect(lineOf(content, 99)).toEqual({ line: 4, column: 5 });
  });
});

describe("random token soup", () => {
  it("fragments stay honest whatever the input", () => {
    const tokens = [
      "word ",
      "x",
      " ",
      "\n",
      "\n\n",
      "%c\n",
      "\\%",
      "$",
      "$$",
      "\\(",
      "\\)",
      "\\[",
      "\\]",
      "{",
      "}",
      "[",
      "]",
      "~",
      "--",
      "---",
      "\\\\",
      "\\emph{",
      "\\cite{k}",
      "\\href{u}{t}",
      "\\begin{align}",
      "\\end{align}",
      "\\begin{itemize}",
      "\\item ",
      "\\end{itemize}",
      "\\verb|a|",
      "\\'",
      "\\&",
      ".",
      ",",
      "\\unknown[o]",
      "\\begin{document}",
      "\\end{document}",
    ];
    let seed = 42;
    const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    for (let n = 0; n < 300; n++) {
      let content = "";
      for (let k = 0; k < 40; k++) content += tokens[Math.floor(rand() * tokens.length)];
      const { text, fragments } = prose(content);
      for (let off = 0; off <= text.length; off++) {
        const { index } = mapOffset(fragments, content, off);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(content.length);
      }
    }
  });
});

describe("mapping across a realistic document", () => {
  it("every word of the cleaned text points at the same word in the source", () => {
    const content = [
      raw`\documentclass{article}`,
      raw`\begin{document}`,
      raw`\section{Introduction}\label{sec:intro}`,
      raw`Large language models~\cite{brown2020} are \emph{very} useful. % todo`,
      "% removed line",
      raw`They cost 50\% less than $n^2$ methods \citep{x}.`,
      raw`\begin{equation}`,
      "  f(x) = x",
      raw`\end{equation}`,
      raw`Hence, see Table~\ref{t} --- it works.`,
      raw`\end{document}`,
    ].join("\n");
    const { text, fragments } = prose(content);
    expect(text).toBe(
      "Introduction\nLarge language models are very useful.\nThey cost 50% less than methods.\nHence, see Table — it works.",
    );
    for (const m of text.matchAll(/[A-Za-z]+/g)) {
      const { index } = mapOffset(fragments, content, m.index);
      expect(content.slice(index, index + m[0].length)).toBe(m[0]);
    }
    expect(locate(content, "Hence")).toEqual({ line: 10, column: 1 });
    expect(locate(content, "methods")).toEqual({ line: 6, column: 32 });
  });
});
