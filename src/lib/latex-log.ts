export type LogIssue = { file?: string; line?: number; message: string };

// The compiler runs with -file-line-error and max_print_line=1000, so errors look
// like "./main.tex:12: Undefined control sequence." on a single line.
const ERROR_RE = /^(?:\.\/)?([\w\-./]+\.\w+):(\d+): (.+)$/gm;
const WARNING_RE =
  /^(?:LaTeX|Package [\w-]+|Class [\w-]+) Warning: (.+?)(?: on input line (\d+))?\.?$/gm;

export function parseLatexLog(log: string): { errors: LogIssue[]; warnings: LogIssue[] } {
  const errors: LogIssue[] = [];
  for (const m of log.matchAll(ERROR_RE)) {
    errors.push({ file: m[1], line: Number(m[2]), message: m[3].trim() });
  }
  if (errors.length === 0) {
    // Fallback for errors raised without file context (e.g. "! Emergency stop.").
    for (const m of log.matchAll(/^! (.+)$/gm)) errors.push({ message: m[1].trim() });
  }
  const warnings: LogIssue[] = [];
  const seen = new Set<string>();
  for (const m of log.matchAll(WARNING_RE)) {
    const key = `${m[1]}|${m[2] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({ message: m[1].trim(), line: m[2] ? Number(m[2]) : undefined });
  }
  return { errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) };
}
