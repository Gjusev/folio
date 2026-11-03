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
