// Folio LaTeX compiler: runs untrusted LaTeX in a throwaway directory.
// Zero dependencies; executed directly by Node >= 24 (type stripping).
// Container-level isolation (no network, read-only rootfs, dropped caps,
// memory/pid limits) is configured in docker-compose.yml.
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { release, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const TOKEN = process.env.COMPILER_TOKEN ?? "";
const MAX_JOBS = Number(process.env.MAX_CONCURRENT_JOBS ?? 2);
const TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 45_000);
const MAX_BODY = 96 * 1024 * 1024; // 96 MB of sources, base64-encoded figures included
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
export type ArxivPackageFile = { path: string; encoding: "utf8" | "base64"; content: string };
export type ArxivResult = CompileResult & { package?: { files: ArxivPackageFile[] } };
export type LintIssue = {
  file: string;
  line: number;
  col: number;
  severity: string;
  code: number;
  message: string;
};
export type LintResult = { issues: LintIssue[]; raw: string; error?: string; timedOut?: boolean };
export type CountResult = {
  words: number;
  headerWords: number;
  headers: number;
  floats: number;
  raw: string;
};
export type SynctexHit = {
  file: string;
  line: number;
  col?: number;
  page: number;
  x: number;
  y: number;
};
export type SynctexResult = {
  ok: boolean;
  result?: SynctexHit;
  raw: string;
  log?: string;
  timedOut?: boolean;
};
export type SynctexRequest = {
  mainFile: string;
  files: CompileRequest["files"];
  mode: "view" | "edit";
  input: { line: number; col: number; file: string } | { page: number; x: number; y: number };
};

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

/**
 * /synctex body: the same source validation as /compile, plus a query.
 * view = source -> pdf, input {line, col, file?} (file defaults to mainFile and
 * must pass the same path checks as any uploaded file).
 * edit = pdf -> source, input {page, x, y} with the origin at the top-left
 * corner, y growing downwards, in pt (1/72 in) — the synctex CLI convention.
 */
export function parseSynctexRequest(body: unknown): SynctexRequest | string {
  const base = parseRequest(body);
  if (typeof base === "string") return base;
  const { mode, input } = body as Record<string, unknown>;
  if (mode !== "view" && mode !== "edit") return "mode must be 'view' or 'edit'";
  if (typeof input !== "object" || input === null) return "invalid input";
  const i = input as Record<string, unknown>;
  if (mode === "view") {
    const { line, col, file } = i;
    if (
      typeof line !== "number" ||
      !Number.isInteger(line) ||
      line < 1 ||
      typeof col !== "number" ||
      !Number.isInteger(col) ||
      col < 0
    )
      return "invalid input: line and col must be positive integers";
    const f = typeof file === "string" ? file : base.mainFile;
    if (!safePath(f) || !f.endsWith(".tex")) return "invalid input: file";
    return { ...base, mode, input: { line, col, file: f } };
  }
  const { page, x, y } = i;
  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 1 ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    x < 0 ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    y < 0
  )
    return "invalid input: page, x and y must be positive numbers";
  return { ...base, mode, input: { page, x, y } };
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

// ---- Per-job sandbox (bubblewrap) ----
// Every tool spawn can run inside its own user+mount namespace: the job
// directory is the only writable path and the only part of /tmp that
// exists, so one job cannot even SEE another job's files — namespace
// isolation on top of the permission-level rules (openin/openout_any).
// Self-adapting: probed once at boot; when the host (kernel or container
// seccomp) does not allow user namespaces, jobs keep today's behavior.
// Compilation must never break because the sandbox is unavailable.

export type IsolationMode = "bwrap" | "none";

let SANDBOX: IsolationMode = "none";

/**
 * The exact bwrap argv. Order matters: mounts apply in sequence and later
 * mounts win — / / is read-only, /tmp becomes a fresh private tmpfs, and
 * the job dir (bound after it) is re-exposed as the only writable real
 * path. --unshare-all includes the network namespace (no TeX tool needs
 * network) and IPC; if a tool ever turns out to need IPC, drop only
 * --unshare-ipc here. --die-with-parent + --new-session keep the existing
 * process-group kill working: killing bwrap reaps the sandboxed tree.
 */
export function bwrapArgs(jobDir: string, cmd: string, args: string[]): string[] {
  return [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    "/",
    "/",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--bind",
    jobDir,
    jobDir,
    "--chdir",
    jobDir,
    "--",
    cmd,
    ...args,
  ];
}

/** Formats the one boot log line (pure; unit-tested). */
export function probeLogLine(
  mode: IsolationMode,
  reason: string,
  kernel: string,
  userns: string,
): string {
  return mode === "bwrap"
    ? `isolation=bwrap kernel=${kernel} userns=${userns}`
    : `isolation=none reason=${reason} kernel=${kernel} userns=${userns}`;
}

/**
 * One-shot boot probe: the EXACT production wrap (a fresh temp job dir,
 * /usr/bin/true as the payload) under a 5 s timeout. Anything but a clean
 * exit 0 — bwrap missing, seccomp blocking user namespaces, no kernel
 * support — leaves the service in today's unsandboxed mode.
 */
async function probeSandbox(): Promise<{ mode: IsolationMode; reason: string }> {
  const dir = await mkdtemp(join(tmpdir(), "probe-"));
  try {
    return await new Promise((resolve) => {
      const child = spawn("bwrap", bwrapArgs(dir, "/usr/bin/true", []), {
        cwd: dir,
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          NODE_ENV: "production",
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: dir,
        },
      });
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => {
        stderr += c;
      });
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* already gone */
        }
        resolve({ mode: "none", reason: "bwrap probe timed out after 5s" });
      }, 5_000);
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          mode: "none",
          reason: `bwrap unavailable (${(err as NodeJS.ErrnoException).code ?? err.message})`,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve({ mode: "bwrap", reason: "" });
        const head = stderr.split("\n")[0]?.slice(0, 120);
        resolve({ mode: "none", reason: `bwrap exit ${code}${head ? `: ${head}` : ""}` });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Routes a tool spawn through the sandbox when the boot probe succeeded. */
function wrap(cmd: string, args: string[], jobDir: string): { cmd: string; args: string[] } {
  return SANDBOX === "bwrap" ? { cmd: "bwrap", args: bwrapArgs(jobDir, cmd, args) } : { cmd, args };
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

const GRAPHIC_EXT = ["pdf", "png", "jpg", "jpeg"];

/**
 * The arXiv source package, collected from the uploaded file CONTENTS:
 * the \input/\include closure of the main file (extension optional, relative
 * to the including file, then by bare name the way kpathsea searches the
 * tree), every \includegraphics figure, the .bib files behind
 * \bibliography/\addbibresource, and — when a bibliography is used — the
 * .bbl latexmk generated next to the main file. Referenced-but-missing files
 * are simply left out (TeX would have errored on them). No aux garbage.
 */
async function collectPackage(jobDir: string, req: CompileRequest): Promise<ArxivPackageFile[]> {
  const byPath = new Map(req.files.map((f) => [f.path, f]));
  const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");
  const normalize = (p: string) => {
    const out: string[] = [];
    for (const part of p.split("/")) {
      if (part === "..") out.pop();
      else if (part !== "." && part !== "") out.push(part);
    }
    return out.join("/");
  };
  // TeX resolution: as written (if it already carries a known extension),
  // else with each candidate extension appended; relative to the including
  // file, then relative to the MAIN file's directory (latexmk runs with -cd,
  // so that is TeX's working directory), then the bare name from the tree
  // root. For root-level mains the main-relative and bare candidates
  // coincide, which is harmless.
  const candidates = (from: string, name: string, exts: string[]) => {
    const hasExt = exts.some((e) => name.toLowerCase().endsWith(`.${e}`));
    const names = hasExt ? [name] : exts.map((e) => `${name}.${e}`);
    return names.flatMap((n) => {
      const rel = normalize(dirOf(from) + n);
      if (byPath.has(rel)) return [rel];
      const fromMain = normalize(dirOf(req.mainFile) + n);
      if (byPath.has(fromMain)) return [fromMain];
      return byPath.has(n) ? [n] : [];
    });
  };

  const texClosure: CompileRequest["files"] = [];
  const bibs = new Set<string>();
  const figures = new Set<string>();
  let usesBibliography = false;
  const seen = new Set<string>();
  const queue = [req.mainFile];
  // \s* and \*? matter: "\input {a}" and "\includegraphics*{x}" are legal TeX
  // and must not silently drop the file from the package.
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue; // loop-safe
    seen.add(path);
    const f = byPath.get(path);
    if (!f) continue;
    texClosure.push(f); // base64 .tex still ships, just not scanned
    if (f.encoding === "base64") continue;
    for (const m of f.content.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g))
      for (const p of candidates(path, m[1]!.trim(), ["tex"])) queue.push(p);
    for (const m of f.content.matchAll(/\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g))
      for (const p of candidates(path, m[1]!.trim(), GRAPHIC_EXT)) figures.add(p);
    for (const m of f.content.matchAll(/\\bibliography\s*\{([^}]+)\}/g)) {
      usesBibliography = true;
      for (const name of m[1]!.split(",")) {
        const n = name.trim();
        if (n) for (const p of candidates(path, n, ["bib"])) bibs.add(p);
      }
    }
    for (const m of f.content.matchAll(/\\addbibresource\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
      usesBibliography = true;
      for (const p of candidates(path, m[1]!.trim(), ["bib"])) bibs.add(p);
    }
  }

  const files: ArxivPackageFile[] = texClosure.map((f) =>
    f.encoding === "base64"
      ? { path: f.path, encoding: "base64", content: f.content }
      : { path: f.path, encoding: "utf8", content: f.content },
  );
  for (const paths of [bibs, figures])
    for (const p of paths) {
      const f = byPath.get(p)!;
      files.push(
        f.encoding === "base64"
          ? { path: p, encoding: "base64", content: f.content }
          : { path: p, encoding: "utf8", content: f.content },
      );
    }
  // arXiv recompiles bibliographies from the .bbl, not the .bib toolchain.
  if (usesBibliography) {
    const bblPath = `${req.mainFile.slice(0, -4)}.bbl`;
    const bbl = await readFile(join(jobDir, bblPath), "utf8").catch(() => null);
    if (bbl !== null) files.push({ path: bblPath, encoding: "utf8", content: bbl });
  }
  return files;
}

/** /arxiv: a full compile; on success the response also carries the source package. */
export async function arxiv(req: CompileRequest): Promise<ArxivResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(dir, req.files);
    const result = await render(dir, req.mainFile);
    if (!result.ok) return result; // exactly what /compile answers
    return { ...result, package: { files: await collectPackage(dir, req) } };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const LATEXDIFF_TIMEOUT_MS = 20_000;

function latexdiff(dir: string, oldMain: string, newMain: string, outPath: string) {
  return new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const tool = wrap(
      "latexdiff",
      ["--flatten", "--encoding=UTF8", join("old", oldMain), join("new", newMain)],
      dir,
    );
    const child = spawn(tool.cmd, tool.args, {
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
    });
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

const TOOL_TIMEOUT_MS = 20_000;

/**
 * Spawns a TeX auxiliary tool (chktex, texcount, synctex) in a job directory:
 * detached with its own process group so a timeout kills the whole tree,
 * stdout captured, stderr discarded (these tools chat on it).
 */
function runTool(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number | null; out: string; timedOut: boolean }>((resolve) => {
    const tool = wrap(cmd, args, cwd);
    const child = spawn(tool.cmd, tool.args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: cwd,
        openin_any: "p",
        openout_any: "p",
        shell_escape: "f",
      },
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c;
    });
    child.stderr.on("data", () => {});
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, TOOL_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, out, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut });
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

/**
 * chktex -f placeholders: %f file, %l line, %c column, %d line length,
 * %k Warning/Error, %n warning number, %m message. Fields are colon-separated;
 * the message is everything after the sixth colon (messages may contain colons).
 */
export function parseChktex(raw: string): LintIssue[] {
  const issues: LintIssue[] = [];
  // chktex expands the "\n" of -f itself; also split on a literal "\n" in case
  // a build prints it unexpanded.
  for (const line of raw.split(/\\n|\n/)) {
    const parts = line.split(":");
    if (parts.length < 7) continue;
    const [file, lineNo, col, , severity, code, ...message] = parts;
    const lineN = Number(lineNo);
    const codeN = Number(code);
    if (!Number.isFinite(lineN) || !Number.isFinite(codeN)) continue;
    const colN = Number(col);
    issues.push({
      file,
      line: lineN,
      col: Number.isFinite(colN) ? colN : 0,
      severity: severity || "Warning",
      code: codeN,
      message: message.join(":").trim(),
    });
  }
  return issues;
}

/** Lints the main file with chktex. It does not follow \input, and no PDF is built. */
export async function lint(req: CompileRequest): Promise<LintResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(dir, req.files);
    const { code, out, timedOut } = await runTool(
      "chktex",
      ["-q", "-f", "%f:%l:%c:%d:%k:%n:%m\\n", req.mainFile],
      dir,
    );
    if (timedOut) return { issues: [], raw: out, timedOut: true };
    if (code === -1)
      return { issues: [], raw: out, error: "chktex no pudo ejecutarse (¿falta el paquete?)" };
    return { issues: parseChktex(out), raw: out };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * With -total -sum, texcount repeats the metric lines once per included file
 * and once more for the grand total, so the LAST occurrence of each label is
 * the number we want (the only file's counts when there are no includes).
 */
export function parseTexcount(raw: string): Omit<CountResult, "raw"> {
  const last = (re: RegExp) => {
    const found = [...raw.matchAll(re)];
    return found.length ? Number(found[found.length - 1][1]) || 0 : 0;
  };
  return {
    words: last(/Words in text:\s*(\d+)/g),
    headerWords: last(/Words in headers:\s*(\d+)/g),
    headers: last(/Number of headers:\s*(\d+)/g),
    floats: last(/Number of floats\/tables\/figures:\s*(\d+)/g),
  };
}

/** Word/heading/float counts with texcount; no PDF is built. */
export async function count(req: CompileRequest): Promise<CountResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(dir, req.files);
    const { out } = await runTool("texcount", ["-total", "-sum", req.mainFile], dir);
    return { ...parseTexcount(out), raw: out };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Reads the first Input/Output block of a synctex answer: for "view" that is
 * the first PDF location for the source position; for "edit" the first source
 * position for the clicked point.
 */
export function parseSynctex(
  raw: string,
  query?: { file: string; line: number },
): SynctexHit | null {
  const grab = (key: string) => raw.match(new RegExp(`^${key}:(.*)$`, "m"))?.[1]?.trim();
  const page = Number(grab("Page"));
  // "synctex view" (forward) emits only Output/Page/x/y blocks — no Input
  // records; the source file/line are the query itself. "synctex edit"
  // (inverse) emits Input:/Line:/Column: records instead.
  const file = grab("Input") ?? query?.file;
  if (!page || !file) return null;
  const col = grab("Column");
  const line = Number(grab("Line")) || query?.line || 0;
  return {
    file,
    line,
    ...(col !== undefined && col !== "" ? { col: Number(col) || 0 } : {}),
    page,
    x: Number(grab("x")) || 0,
    y: Number(grab("y")) || 0,
  };
}

/**
 * Forward/inverse sync. Costs a full recompile (same as /compile) in a fresh
 * job dir, because latexmk now always passes -synctex=1; then it queries the
 * produced .synctex.gz. Best effort for sources in subfolders: synctex matches
 * the -i file name against the names recorded at compile time.
 */
export async function synctex(req: SynctexRequest): Promise<SynctexResult> {
  const dir = await mkdtemp(join(tmpdir(), "job-"));
  try {
    await writeFiles(dir, req.files);
    const { code, timedOut } = await run(dir, req.mainFile);
    if (timedOut) return { ok: false, raw: "", timedOut: true };
    const base = req.mainFile.slice(0, -4);
    const log = await readFile(join(dir, `${base}.log`), "utf8").catch(() => "");
    const pdf = join(dir, `${base}.pdf`);
    const built =
      code === 0 &&
      (await stat(pdf).then(
        (s) => s.size > 0,
        () => false,
      ));
    if (!built)
      return { ok: false, raw: "", log: log.slice(-LOG_TAIL) || "[folio] LaTeX produced no PDF." };
    const i = req.input;
    // "edit" coordinates: page:x:y with the origin at the top-left corner and
    // y growing downwards, in pt — as printed by `synctex view` (x:/y: lines).
    const args =
      "line" in i
        ? ["view", "-i", `${i.line}:${i.col}:${i.file}`, "-o", pdf]
        : ["edit", "-o", `${i.page}:${i.x}:${i.y}:${pdf}`];
    const { out } = await runTool("synctex", args, dirname(pdf));
    const hit = parseSynctex(out, "line" in i ? { file: i.file, line: i.line } : undefined);
    return { ok: hit !== null, result: hit ?? undefined, raw: out };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(cwd: string, mainFile: string): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const tool = wrap(
      "latexmk",
      [
        "-norc",
        "-pdf",
        "-cd", // run from the main file's directory: outputs land next to it
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-synctex=1", // pass-through option: produces <job>.synctex.gz next to the PDF
        "-no-shell-escape",
        mainFile,
      ],
      cwd,
    );
    const child = spawn(tool.cmd, tool.args, {
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
    });
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

const ROUTES = new Set(["/compile", "/diff", "/lint", "/count", "/synctex", "/arxiv"]);

let active = 0;

export const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health")
    return send(res, 200, { ok: true, active, isolation: SANDBOX });
  if (req.method !== "POST" || !ROUTES.has(String(req.url)))
    return send(res, 404, { error: "not found" });
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
  if (active >= MAX_JOBS) return send(res, 429, { error: "compiler busy" });
  // Reserve the slot BEFORE the first await: readBody yields to the event loop,
  // so checking above and incrementing after it let N concurrent requests in
  // with active=0 (MAX_JOBS was never enforced). The try/finally releases the
  // slot on every exit path, error returns included.
  active++;
  try {
    const raw = await readBody(req);
    if (raw === null) return send(res, 413, { error: "request too large" });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "invalid json" });
    }
    // Parse per route and dispatch; the url both selects the parser and the
    // handler, so no extra narrowing of the parsed union is needed.
    if (req.url === "/diff") {
      const parsed = parseDiffRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await diff(parsed));
    } else if (req.url === "/synctex") {
      const parsed = parseSynctexRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await synctex(parsed));
    } else if (req.url === "/lint") {
      const parsed = parseRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await lint(parsed));
    } else if (req.url === "/count") {
      const parsed = parseRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await count(parsed));
    } else if (req.url === "/arxiv") {
      const parsed = parseRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await arxiv(parsed));
    } else {
      const parsed = parseRequest(body);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      send(res, 200, await compile(parsed));
    }
  } catch (err) {
    if (err instanceof InvalidFile) return send(res, 400, { error: err.message });
    console.error(err);
    send(res, 500, { error: "internal error" });
  } finally {
    active--;
  }
});

if (process.argv[1]?.endsWith("server.ts")) {
  if (TOKEN.length < 16) {
    console.error("COMPILER_TOKEN must be set (>= 16 chars)");
    process.exit(1);
  }
  // A SIGKILL mid-compile leaks job (and probe) dirs; sweep them on boot.
  for (const d of readdirSync(tmpdir()).filter((d) => /^(job|probe)-/.test(d))) {
    rmSync(join(tmpdir(), d), { recursive: true, force: true });
  }
  // Probe the sandbox BEFORE listening, so the mode is decided (and logged)
  // before the first job arrives.
  const userns = await readFile("/proc/sys/user/max_user_namespaces", "utf8")
    .then((s) => s.trim())
    .catch(() => "?");
  const probe = await probeSandbox();
  SANDBOX = probe.mode;
  console.log(probeLogLine(SANDBOX, probe.reason, release(), userns));
  server.listen(PORT, () =>
    console.log(`latex-compiler listening on :${PORT} (max ${MAX_JOBS} jobs)`),
  );
}
