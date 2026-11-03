// Folio LaTeX compiler: runs untrusted LaTeX in a throwaway directory.
// Zero dependencies; executed directly by Node >= 24 (type stripping).
// Container-level isolation (no network, read-only rootfs, dropped caps,
// memory/pid limits) is configured in docker-compose.yml.
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const TOKEN = process.env.COMPILER_TOKEN ?? "";
const MAX_JOBS = Number(process.env.MAX_CONCURRENT_JOBS ?? 2);
const TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 45_000);
const MAX_BODY = 96 * 1024 * 1024; // 50 MB of sources, base64-encoded figures included
const MAX_FILES = 200;
const MAX_BINARY_BYTES = 10_000_000; // parity with the web app's per-figure cap

class InvalidFile extends Error {}
const MAX_PDF = 25 * 1024 * 1024;
const LOG_TAIL = 60_000;

const ALLOWED_EXT = new Set([
  "tex",
  "bib",
  "sty",
  "cls",
  "bst",
  "bbx",
  "cbx",
  "txt",
  "md",
  "csv",
  "dat",
  // figures, sent base64-encoded
  "png",
  "jpg",
  "jpeg",
  "pdf",
]);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_\-.]*$/;

export type CompileRequest = {
  mainFile: string;
  files: { path: string; content: string; encoding?: "base64" }[];
};
export type DiffRequest = {
  mainFile: string;
  oldFiles: { path: string; content: string; encoding?: "base64" }[];
  newFiles: { path: string; content: string; encoding?: "base64" }[];
};
export type CompileResult = { ok: boolean; log: string; pdf?: string; timedOut?: boolean };

export function safePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > 200) return false;
  const segs = p.split("/");
  if (segs.length > 5 || segs.some((s) => !SEGMENT.test(s) || s.includes(".."))) return false;
  const dot = p.lastIndexOf(".");
  return dot > p.lastIndexOf("/") && ALLOWED_EXT.has(p.slice(dot + 1).toLowerCase());
}

export function parseRequest(body: unknown): CompileRequest | string {
  const files = validateFiles(body);
  if (typeof files === "string") return files;
  const { mainFile } = body as Record<string, unknown>;
  if (
    typeof mainFile !== "string" ||
    !safePath(mainFile) ||
    !mainFile.endsWith(".tex") ||
    !files.some((f) => f.path === mainFile)
  )
    return "invalid mainFile";
  return { mainFile, files };
}

export function parseDiffRequest(body: unknown): DiffRequest | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const { mainFile, oldFiles, newFiles } = body as Record<string, unknown>;
  const oldV = validateFiles({ files: oldFiles });
  if (typeof oldV === "string") return `oldFiles: ${oldV}`;
  const newV = validateFiles({ files: newFiles });
  if (typeof newV === "string") return `newFiles: ${newV}`;
  if (
    typeof mainFile !== "string" ||
    !safePath(mainFile) ||
    !mainFile.endsWith(".tex") ||
    !oldV.some((f) => f.path === mainFile) ||
    !newV.some((f) => f.path === mainFile)
  )
    return "invalid mainFile";
  return { mainFile, oldFiles: oldV, newFiles: newV };
}

function validateFiles(
  body: unknown,
): { path: string; content: string; encoding?: "base64" }[] | string {
  const files = (body as Record<string, unknown> | null)?.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES)
    return "invalid files";
  const seen = new Set<string>();
  for (const f of files) {
    if (typeof f !== "object" || f === null) return "invalid file";
    const { path, content, encoding } = f as Record<string, unknown>;
    if (!safePath(path) || typeof content !== "string" || (encoding ?? "base64") !== "base64")
      return `invalid file entry: ${String(path)}`;
    if (seen.has(path)) return `duplicate path: ${String(path)}`;
    seen.add(path);
  }
  return files as CompileRequest["files"];
}

async function writeFiles(
  dir: string,
  files: { path: string; content: string; encoding?: "base64" }[],
) {
  for (const f of files) {
    const target = join(dir, f.path);
    await mkdir(dirname(target), { recursive: true });
    if (f.encoding === "base64") {
      // Validate instead of trusting the caller: undici-size and format.
      const buf = Buffer.from(f.content, "base64");
      if (buf.toString("base64").replace(/=+$/, "") !== f.content.replace(/=+$/, "")) {
        throw new InvalidFile(`invalid base64: ${f.path}`);
      }
      if (buf.length > MAX_BINARY_BYTES) throw new InvalidFile(`too large: ${f.path}`);
      await writeFile(target, buf);
    } else {
      await writeFile(target, f.content);
    }
  }
}

/** Runs latexmk on `mainFile` inside `dir` and packages the outcome. */
async function render(dir: string, mainFile: string): Promise<CompileResult> {
  const { code, timedOut } = await run(dir, mainFile);
  const base = mainFile.slice(0, -4);
  const log = await readFile(join(dir, `${base}.log`), "utf8").catch(() => "");
  const tail = log.length > LOG_TAIL ? log.slice(-LOG_TAIL) : log;
  if (timedOut)
    return {
      ok: false,
      timedOut: true,
      log: `${tail}\n\n[folio] Compilation timed out after ${TIMEOUT_MS / 1000}s.`,
    };
  const pdfPath = join(dir, `${base}.pdf`);
  const size = await stat(pdfPath).then(
    (s) => s.size,
    () => 0,
  );
  if (code !== 0 || size === 0) return { ok: false, log: tail || "[folio] LaTeX produced no log." };
  if (size > MAX_PDF) return { ok: false, log: `${tail}\n\n[folio] PDF exceeds ${MAX_PDF} bytes.` };
  return { ok: true, log: tail, pdf: (await readFile(pdfPath)).toString("base64") };
}

export async function compile(req: CompileRequest): Promise<CompileResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(dir, req.files);
    return await render(dir, req.mainFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const LATEXDIFF_TIMEOUT_MS = 20_000;

function latexdiff(dir: string, oldMain: string, newMain: string, outPath: string) {
  return new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const child = spawn(
      "latexdiff",
      ["--flatten", "--encoding=UTF8", join("old", oldMain), join("new", newMain)],
      {
        cwd: dir,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          NODE_ENV: "production",
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: dir,
          openin_any: "p",
          openout_any: "p",
          shell_escape: "f",
        },
      },
    );
    let out = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c;
    });
    child.stderr.on("data", () => {}); // latexdiff chats on stderr; ignore
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, LATEXDIFF_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) void writeFile(outPath, out).catch(() => {});
      resolve({ code, timedOut });
    });
  });
}

/**
 * Visual diff of two versions: latexdiff --flatten merges each tree into one
 * document and marks changes (\DIFadd/\DIFdel); latexmk renders the result so
 * additions/deletions show up coloured in the PDF.
 */
export async function diff(req: DiffRequest): Promise<CompileResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(join(dir, "old"), req.oldFiles);
    await writeFiles(join(dir, "new"), req.newFiles);
    // The flattened diff keeps \bibliography and \includegraphics references:
    // lay the new tree (bib files, figures) at the top level so they resolve.
    await writeFiles(dir, req.newFiles);
    const diffTex = `diff-${req.mainFile}`;
    const ld = await latexdiff(dir, req.mainFile, req.mainFile, join(dir, diffTex));
    if (ld.timedOut) return { ok: false, timedOut: true, log: "[folio] latexdiff timed out." };
    if (ld.code !== 0) return { ok: false, log: "[folio] latexdiff failed on these versions." };
    return await render(dir, diffTex);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(cwd: string, mainFile: string): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(
      "latexmk",
      [
        "-norc",
        "-pdf",
        "-cd", // run from the main file's directory: outputs land next to it
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-no-shell-escape",
        mainFile,
      ],
      {
        cwd,
        detached: true, // own process group, so the whole tree can be killed
        stdio: "ignore",
        env: {
          NODE_ENV: "production",
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: cwd,
          // TeX may only read/write inside the job directory; no \write18.
          openin_any: "p",
          openout_any: "p",
          shell_escape: "f",
          max_print_line: "1000",
        },
      },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    });
  });
}

function authorized(req: IncomingMessage): boolean {
  const got = Buffer.from(req.headers.authorization ?? "");
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return TOKEN.length >= 16 && got.length === want.length && timingSafeEqual(got, want);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

let active = 0;

export const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, active });
  if (req.method !== "POST" || (req.url !== "/compile" && req.url !== "/diff"))
    return send(res, 404, { error: "not found" });
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
  if (active >= MAX_JOBS) return send(res, 429, { error: "compiler busy" });
  try {
    const raw = await readBody(req);
    if (raw === null) return send(res, 413, { error: "request too large" });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "invalid json" });
    }
    const parsed = req.url === "/diff" ? parseDiffRequest(body) : parseRequest(body);
    if (typeof parsed === "string") return send(res, 400, { error: parsed });
    // The slot is held only for actual compilation, not while reading the body.
    active++;
    try {
      if (req.url === "/diff" && "oldFiles" in parsed) send(res, 200, await diff(parsed));
      else if ("files" in parsed) send(res, 200, await compile(parsed));
      else send(res, 400, { error: "invalid request" });
    } finally {
      active--;
    }
  } catch (err) {
    if (err instanceof InvalidFile) return send(res, 400, { error: err.message });
    console.error(err);
    send(res, 500, { error: "internal error" });
  }
});

if (process.argv[1]?.endsWith("server.ts")) {
  if (TOKEN.length < 16) {
    console.error("COMPILER_TOKEN must be set (>= 16 chars)");
    process.exit(1);
  }
  // A SIGKILL mid-compile leaks job dirs; sweep them on boot.
  for (const d of readdirSync(tmpdir()).filter((d) => d.startsWith("job-"))) {
    rmSync(join(tmpdir(), d), { recursive: true, force: true });
  }
  server.listen(PORT, () =>
    console.log(`latex-compiler listening on :${PORT} (max ${MAX_JOBS} jobs)`),
  );
}
