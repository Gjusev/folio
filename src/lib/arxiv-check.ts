// arXiv source-package lint (pure: no node imports, runs in the browser too).
// The checks mirror what arXiv's automated TeX processing documents at
// https://info.arxiv.org/help/faq/mistakes.html. Comment stripping is
// deliberately NOT attempted anywhere (verbatim/%-escaping risk); the only
// concession is that whole comment lines are skipped by the paths check.

export type Check = {
  id: string;
  level: "pass" | "warn" | "fail";
  detail: string;
};

export type ArxivFile = { path: string; content: string; encoding?: "base64" };

// arXiv's help pages no longer publish explicit MB thresholds for source
// packages (https://info.arxiv.org/help/sizes.html and
// https://info.arxiv.org/help/submit/index.html, checked 2026-11: only
// figure-efficiency guidance and admin exceptions). The classic guidance is
// kept: warn past 10 MB, refuse past 15 MB.
const SIZE_WARN_BYTES = 10 * 1024 * 1024;
const SIZE_FAIL_BYTES = 15 * 1024 * 1024;

/** \input/\include/\includegraphics references (optional argument included). */
const REF = /\\(?:input|include|includegraphics)\*?(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
const GRAPHICS = /\\includegraphics\*?(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

const MB = 1024 * 1024;

/** Decoded byte length of a package file (utf8 or base64). */
function byteLength(f: ArxivFile): number {
  if (f.encoding === "base64") {
    try {
      return atob(f.content.replace(/\s+/g, "")).length;
    } catch {
      return Math.floor((f.content.length * 3) / 4);
    }
  }
  return new TextEncoder().encode(f.content).length;
}

/** "a, b, c y 2 más" — details stay readable on packages with many problems. */
function list(items: string[]): string {
  const shown = items.slice(0, 10).join(", ");
  return items.length > 10 ? `${shown} y ${items.length - 10} más` : shown;
}

function checkNames(files: ArxivFile[]): Check {
  // Anything outside printable ASCII — spaces, accents, control chars — is
  // rejected by arXiv's filename rule.
  const bad = files.filter((f) => /[^\x21-\x7e]/.test(f.path)).map((f) => f.path);
  return bad.length
    ? { id: "names", level: "fail", detail: `Caracteres no admitidos en: ${list(bad)}` }
    : { id: "names", level: "pass", detail: "Nombres de archivo ASCII sin espacios" };
}

function checkPdfOutput(main: string, mainFile: string): Check {
  const first5 = main.split("\n").slice(0, 5);
  return first5.some((l) => /\\pdfoutput\s*=\s*1(?!\d)/.test(l))
    ? { id: "pdfoutput", level: "pass", detail: "\\pdfoutput=1 presente" }
    : {
        id: "pdfoutput",
        level: "warn",
        detail: `${mainFile} no declara \\pdfoutput=1 en sus primeras 5 líneas; arXiv podría procesarlo como DVI`,
      };
}

function checkPaths(tex: ArxivFile[]): Check {
  const bad: string[] = [];
  for (const f of tex)
    for (const line of f.content.split("\n")) {
      if (/^\s*%/.test(line)) continue; // a %-escaped comment line is not a reference
      for (const m of line.matchAll(REF)) {
        const arg = m[1];
        if (arg.startsWith("/") || arg.includes("..") || arg.includes("\\"))
          bad.push(`${f.path}: ${arg}`);
      }
    }
  return bad.length
    ? {
        id: "paths",
        level: "fail",
        detail: `Rutas absolutas, con .. o con barra invertida en: ${list(bad)}`,
      }
    : { id: "paths", level: "pass", detail: "Todas las rutas referenciadas son relativas" };
}

function checkEps(files: ArxivFile[], tex: ArxivFile[]): Check {
  const found = new Set(files.filter((f) => /\.eps$/i.test(f.path)).map((f) => f.path));
  for (const f of tex)
    for (const m of f.content.matchAll(GRAPHICS))
      if (/\.eps$/i.test(m[1])) found.add(`${f.path}: ${m[1]}`);
  return found.size
    ? {
        id: "eps",
        level: "warn",
        detail: `pdfLaTeX necesita epstopdf para: ${list([...found])}`,
      }
    : { id: "eps", level: "pass", detail: "Sin figuras EPS" };
}

function checkShell(tex: ArxivFile[]): Check {
  for (const f of tex) {
    const m = /\\write18|shell[- ]?escape/i.exec(f.content);
    if (m)
      return {
        id: "shell",
        level: "fail",
        detail: `${f.path}: ${m[0]} (arXiv compila sin shell-escape)`,
      };
  }
  return { id: "shell", level: "pass", detail: "Sin \\write18 ni shell-escape" };
}

function checkBbl(files: ArxivFile[], tex: ArxivFile[]): Check {
  const usesBibtex = tex.some((f) => /\\bibliography\{[^}]*\}/.test(f.content));
  if (!usesBibtex)
    return { id: "bbl", level: "pass", detail: "Sin \\bibliography: no hace falta .bbl" };
  const bbl = files.filter((f) => /\.bbl$/i.test(f.path)).map((f) => f.path);
  return bbl.length
    ? { id: "bbl", level: "pass", detail: `Incluido: ${list(bbl)}` }
    : {
        id: "bbl",
        level: "warn",
        detail: "Se usa \\bibliography pero el paquete no lleva .bbl; arXiv no ejecuta BibTeX",
      };
}

function checkSize(files: ArxivFile[]): Check {
  const bytes = files.reduce((n, f) => n + byteLength(f), 0);
  const mb = (bytes / MB).toFixed(1);
  if (bytes > SIZE_FAIL_BYTES)
    return { id: "size", level: "fail", detail: `${mb} MB: supera el límite de 15 MB` };
  if (bytes > SIZE_WARN_BYTES)
    return { id: "size", level: "warn", detail: `${mb} MB: por encima de 10 MB` };
  return { id: "size", level: "pass", detail: `${mb} MB en total` };
}

/**
 * One Check per arXiv acceptance rule, in display order. `log` is the compile
 * log the package was built from; no current check reads it (kept in the
 * signature so log-driven checks can be added without breaking callers).
 */
export function checkArxivPackage(files: ArxivFile[], mainFile: string, log: string): Check[] {
  void log;
  const tex = files.filter((f) => /\.tex$/i.test(f.path));
  const main = files.find((f) => f.path === mainFile)?.content ?? "";
  return [
    checkNames(files),
    checkPdfOutput(main, mainFile),
    checkPaths(tex),
    checkEps(files, tex),
    checkShell(tex),
    checkBbl(files, tex),
    checkSize(files),
  ];
}
