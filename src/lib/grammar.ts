import { extractProse, lineOf, mapOffset } from "@/lib/latex-prose";

export type GrammarIssue = {
  file: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  replacements: string[];
  context: string;
};

export type GrammarResult =
  | { off: true }
  | { off: false; error: "unreachable" }
  | { off: false; issues: GrammarIssue[]; filesChecked: number; truncated: boolean };

const MAX_FILES = 30;
const MAX_ISSUES = 100;
const MIN_PROSE = 40;
const TIMEOUT_MS = 25_000;
// The whole run's budget: thirty slow-but-alive files must not hold one
// request for 30 x 25 s. Files past the budget are reported as truncated.
const BUDGET_MS = 60_000;

type LtMatch = {
  message?: unknown;
  offset?: unknown;
  length?: unknown;
  replacements?: unknown;
  context?: { text?: unknown };
  rule?: { id?: unknown };
};

/** One file's prose through LanguageTool; null on any network/shape failure. */
async function check(url: string, text: string, timeoutMs: number): Promise<LtMatch[] | null> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/v2/check`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "auto", enabledOnly: "false" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { matches?: unknown };
    return Array.isArray(body.matches) ? (body.matches as LtMatch[]) : null;
  } catch {
    return null;
  }
}

/**
 * Grammar issues over the project's .tex prose, mapped back to source lines.
 * Files go one by one (main first); the first failure stops the run, and if
 * nothing was checked yet the whole result is "unreachable" — a down server
 * costs one timeout, not thirty. A later failure returns what was checked,
 * flagged truncated.
 */
export async function checkGrammar(
  url: string,
  mainFile: string,
  files: { path: string; content: string; data?: unknown }[],
  budgetMs = BUDGET_MS,
): Promise<GrammarResult> {
  if (!url) return { off: true };
  const tex = files
    .filter((f) => f.path.endsWith(".tex") && f.data == null)
    .sort((a, b) => Number(b.path === mainFile) - Number(a.path === mainFile));
  let truncated = tex.length > MAX_FILES;
  const issues: GrammarIssue[] = [];
  let filesChecked = 0;
  const deadline = performance.now() + budgetMs;

  for (const file of tex.slice(0, MAX_FILES)) {
    // Lines are counted on the "\n" form; CRLF files keep the same line numbers.
    const content = file.content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const { text, fragments } = extractProse(content);
    if (text.length < MIN_PROSE) continue;
    // AbortSignal.timeout throws ERR_OUT_OF_RANGE on a fractional delay.
    const left = Math.floor(deadline - performance.now());
    if (left <= 0) {
      truncated = true;
      break;
    }
    const matches = await check(url, text, Math.min(TIMEOUT_MS, left));
    if (!matches) {
      if (filesChecked === 0) return { off: false, error: "unreachable" };
      truncated = true;
      break;
    }
    filesChecked++;
    for (const m of matches) {
      const offset = typeof m.offset === "number" ? m.offset : -1;
      const length = typeof m.length === "number" ? m.length : 0;
      if (offset < 0 || offset >= text.length) continue;
      const { index, padding } = mapOffset(fragments, content, offset);
      // A match on the gap a removed command left is about the removal, not the prose.
      if (padding && length <= 1) continue;
      const { line, column } = lineOf(content, index);
      issues.push({
        file: file.path,
        line,
        column,
        ruleId: typeof m.rule?.id === "string" ? m.rule.id : "",
        message: typeof m.message === "string" ? m.message : "",
        replacements: (Array.isArray(m.replacements) ? m.replacements : [])
          .slice(0, 3)
          .map((r: { value?: unknown }) => (typeof r?.value === "string" ? r.value : ""))
          .filter(Boolean),
        context: typeof m.context?.text === "string" ? m.context.text : "",
      });
    }
  }

  // Stable sort keeps the file order (main first); lines ascend within a file.
  const order = new Map(tex.map((f, k) => [f.path, k]));
  issues.sort(
    (a, b) => order.get(a.file)! - order.get(b.file)! || a.line - b.line || a.column - b.column,
  );
  if (issues.length > MAX_ISSUES) truncated = true;
  return { off: false, issues: issues.slice(0, MAX_ISSUES), filesChecked, truncated };
}
