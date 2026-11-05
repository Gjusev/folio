/*
 * Minimal safe markdown: fenced code blocks, inline `code`, **bold**, *italic*,
 * [text](https://…) links, paragraphs and single newlines. Pure data out —
 * the caller renders React nodes, so React escapes every string and no HTML
 * is ever assembled here. LaTeX passes through untouched: none of the tokens
 * (\frac{a}{b}, \%, \cite{x}) match the inline grammar.
 */

export type MdInline =
  | { text: string }
  | { code: string }
  | { bold: string }
  | { italic: string }
  | { link: { href: string; text: string } }
  /** A single newline inside a paragraph. */
  | { br: true };

export type MdBlock = { p: MdInline[] } | { pre: { lang?: string; code: string } };

/** Inline tokens; content of code/bold/italic is never re-parsed (no nesting). */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

function inlineOf(src: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    const raw = m[0];
    if (m[1] !== undefined) out.push({ code: raw.slice(1, -1) });
    else if (m[2] !== undefined) out.push({ bold: raw.slice(2, -2) });
    else if (m[3] !== undefined) out.push({ italic: raw.slice(1, -1) });
    else {
      const parts = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(raw)!;
      out.push({ link: { href: parts[2], text: parts[1] } });
    }
    last = m.index + raw.length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

function pushParagraphs(blocks: MdBlock[], chunk: string) {
  for (const para of chunk.split(/\n{2,}/)) {
    // Newlines hugging a fence belong to the fence, not the paragraph.
    const lines = para.replace(/^\n+|\n+$/g, "").split("\n");
    if (!lines.some((l) => l.trim())) continue;
    const nodes: MdInline[] = [];
    lines.forEach((line, i) => {
      if (i > 0) nodes.push({ br: true });
      nodes.push(...inlineOf(line));
    });
    blocks.push({ p: nodes });
  }
}

/** A trailing unclosed fence renders the rest as code, like chat UIs do. */
export function parseMarkdown(src: string): MdBlock[] {
  const s = src.replace(/\r\n/g, "\n");
  const blocks: MdBlock[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const m of s.matchAll(fence)) {
    pushParagraphs(blocks, s.slice(last, m.index));
    blocks.push({ pre: { lang: m[1].trim() || undefined, code: m[2].replace(/\n$/, "") } });
    last = m.index + m[0].length;
  }
  pushParagraphs(blocks, s.slice(last));
  return blocks;
}
