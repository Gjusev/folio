// Pasted CSV / spreadsheet range → booktabs LaTeX. Pure and deterministic on
// purpose: no AI in the loop, nothing to hallucinate — the author pastes data
// and gets exactly those data as a table.

export type Delim = "," | ";" | "\t";

export type ParsedTable = {
  rows: string[][];
  /** Column count of the widest row; shorter rows are padded with "". */
  cols: number;
  /** Right-align columns whose non-empty cells all look numeric. */
  numeric: boolean[];
  delim: Delim;
};

/** Counts candidate delimiters outside quotes and picks the most frequent. */
function sniffDelim(sample: string): Delim {
  let inQuotes = false;
  const counts: Record<Delim, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < sample.length && i < 4000; i++) {
    const c = sample[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === "," || c === ";" || c === "\t")) counts[c]++;
  }
  const best = (Object.entries(counts) as [Delim, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/**
 * RFC-4180-ish field parser: double quotes wrap fields, "" is a literal
 * quote, newlines inside quotes are kept, \r\n and \r count as row breaks.
 * Ragged rows are padded to the widest; a trailing empty line is dropped.
 */
export function parseDelimited(raw: string, opts?: { delim?: Delim }): ParsedTable {
  const text = raw.replace(/^\uFEFF/, "");
  const delim = opts?.delim ?? sniffDelim(text);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let any = false; // current row has content (fields can be empty strings)
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      any = true; // a quoted field, even ""v"", is content
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      any = true;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      any = false;
      continue;
    }
    field += c;
    any = true;
  }
  if (any || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows.at(-1)!.every((c) => c.trim() === "") && rows.at(-1)!.length <= 1)
    rows.pop(); // trailing blank line

  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const padded = rows.map((r) =>
    r.length >= cols ? r : [...r, ...Array(cols - r.length).fill("")],
  );
  // Alignment detection skips the first row: it is usually a header, and its
  // text would otherwise mark every column as non-numeric.
  const considered = padded.length > 1 ? padded.slice(1) : padded;
  const numeric = Array.from({ length: cols }, (_, j) => {
    const vals = considered.map((r) => r[j].trim()).filter((v) => v !== "");
    return vals.length > 0 && vals.every((v) => /^-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/.test(v));
  });
  return { rows: padded, cols, numeric, delim };
}

/** Escape the LaTeX specials a spreadsheet cell may contain. A raw backslash
 *  goes through a placeholder so the escapes introduced for other specials
 *  are not themselves re-escaped (bibtex's texEscape balances braces instead —
 *  wrong for table cells, where stray braces must be literal). */
export function texCell(value: string): string {
  const BS = "\u0000";
  return value
    .trim()
    .replace(/\\/g, BS)
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}");
}

export type BooktabsOptions = {
  /** First row is the header (default true). */
  header?: boolean;
  /** Fixed alignment ("l"|"c"|"r") or "auto": numeric columns right, text left. */
  align?: "auto" | "l" | "c" | "r";
  caption?: string;
  label?: string;
};

/** Renders parseDelimited output as a booktabs table ready to insert. */
export function toBooktabs(t: ParsedTable, opts: BooktabsOptions = {}): string {
  const { header = true, align = "auto", caption, label } = opts;
  if (t.rows.length === 0) return "";
  const colSpec = Array.from({ length: t.cols }, (_, j) =>
    align === "auto" ? (t.numeric[j] ? "r" : "l") : align,
  ).join("");
  const rows = t.rows.map((r) => "    " + r.map(texCell).join(" & ") + " \\\\");
  const head = header ? rows.shift() : undefined;
  return (
    [
      "\\begin{table}[t]",
      "  \\centering",
      ...(caption ? [`  \\caption{${texCell(caption)}}`] : []),
      ...(label ? [`  \\label{${label.replace(/[^A-Za-z0-9:_-]/g, "")}}`] : []),
      `  \\begin{tabular}{${colSpec}}`,
      "    \\toprule",
      ...(head ? [head, "    \\midrule"] : []),
      ...rows,
      "    \\bottomrule",
      "  \\end{tabular}",
      "\\end{table}",
    ].join("\n") + "\n"
  );
}
