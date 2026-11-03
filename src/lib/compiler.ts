import "server-only";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

export type CompileOutput = { ok: boolean; log: string; pdf?: string; timedOut?: boolean };

/** Sends sources to the isolated compiler service. LaTeX never runs in this process. */
export async function compileProject(
  mainFile: string,
  files: { path: string; content: string; encoding?: "base64" }[],
): Promise<CompileOutput> {
  const { COMPILER_URL, COMPILER_TOKEN } = env();
  let res: Response;
  try {
    res = await fetch(new URL("/compile", COMPILER_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPILER_TOKEN}` },
      body: JSON.stringify({ mainFile, files }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(
      504,
      "La compilación tardó demasiado en responder; prueba de nuevo en unos segundos",
    );
  }
  if (res.status === 429)
    throw new HttpError(503, "El compilador está ocupado, inténtalo en unos segundos");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("compiler error", res.status, detail.slice(0, 300));
    throw new HttpError(502, "El compilador rechazó la petición");
  }
  return (await res.json()) as CompileOutput;
}

/**
 * Visual diff of two project versions through the isolated compiler
 * (latexdiff --flatten + latexmk). LaTeX never runs in this process.
 */
export async function diffProject(
  mainFile: string,
  oldFiles: { path: string; content: string; encoding?: "base64" }[],
  newFiles: { path: string; content: string; encoding?: "base64" }[],
): Promise<CompileOutput> {
  const { COMPILER_URL, COMPILER_TOKEN } = env();
  let res: Response;
  try {
    res = await fetch(new URL("/diff", COMPILER_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPILER_TOKEN}` },
      body: JSON.stringify({ mainFile, oldFiles, newFiles }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new HttpError(504, "El diff tardó demasiado; prueba de nuevo en unos segundos");
  }
  if (res.status === 429)
    throw new HttpError(503, "El compilador está ocupado, inténtalo en unos segundos");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("compiler diff error", res.status, detail.slice(0, 300));
    throw new HttpError(502, "El compilador rechazó el diff");
  }
  return (await res.json()) as CompileOutput;
}

export type LintIssue = {
  file: string;
  line: number;
  col: number;
  severity: string;
  code: number;
  message: string;
};
export type LintOutput = { issues: LintIssue[]; raw: string; error?: string; timedOut?: boolean };
export type CountOutput = {
  words: number;
  headerWords: number;
  headers: number;
  floats: number;
  raw: string;
};
export type SynctexQuery =
  | { mode: "view"; line: number; col: number; file?: string }
  | { mode: "edit"; page: number; x: number; y: number };
export type SynctexOutput = {
  ok: boolean;
  result?: { file: string; line: number; col?: number; page: number; x: number; y: number };
  raw: string;
  log?: string;
  timedOut?: boolean;
};

/** Shared POST + error mapping for the auxiliary compiler endpoints. */
async function postTool<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const { COMPILER_URL, COMPILER_TOKEN } = env();
  let res: Response;
  try {
    res = await fetch(new URL(path, COMPILER_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPILER_TOKEN}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(504, `El ${what} tardó demasiado; prueba de nuevo en unos segundos`);
  }
  if (res.status === 429)
    throw new HttpError(503, "El compilador está ocupado, inténtalo en unos segundos");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`compiler ${what} error`, res.status, detail.slice(0, 300));
    throw new HttpError(502, "El compilador rechazó la petición");
  }
  return (await res.json()) as T;
}

/** Lints the main file with chktex inside the isolated service (no PDF built). */
export async function lintProject(
  mainFile: string,
  files: { path: string; content: string; encoding?: "base64" }[],
): Promise<LintOutput> {
  return postTool("/lint", { mainFile, files }, 30_000, "lint");
}

/** Word/heading/float counts via texcount inside the isolated service. */
export async function countProject(
  mainFile: string,
  files: { path: string; content: string; encoding?: "base64" }[],
): Promise<CountOutput> {
  return postTool("/count", { mainFile, files }, 30_000, "recuento");
}

/**
 * Forward/inverse sync through the isolated service. Recompiles the project
 * (that is what /synctex costs) and maps a source line to a PDF point
 * (mode "view") or a clicked PDF point to a source line (mode "edit",
 * coordinates in pt with the origin at the top-left, y downwards).
 */
export async function synctexQuery(
  mainFile: string,
  files: { path: string; content: string; encoding?: "base64" }[],
  query: SynctexQuery,
): Promise<SynctexOutput> {
  const { mode, ...input } = query;
  return postTool("/synctex", { mainFile, files, mode, input }, 120_000, "synctex");
}
