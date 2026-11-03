import { unzipSync } from "fflate";
import {
  MAX_BINARY_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_PROJECT,
  MAX_PROJECT_BYTES,
  extensionOf,
  isBinaryPath,
  matchesMagic,
  validateFilePath,
} from "@/lib/paths";

export type ImportedFile = { path: string; content?: string; data?: Buffer };
export type ImportResult = {
  files: ImportedFile[];
  mainFile: string;
  skipped: { path: string; reason: string }[];
};

export class ImportError extends Error {}

// Build artefacts and OS clutter that come along in Overleaf/arXiv exports.
const IGNORED =
  /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)|\.(aux|log|out|toc|synctex\.gz|fls|fdb_latexmk|bbl|blg)$/i;

/**
 * Reads a project ZIP (an Overleaf or arXiv source export). Unsupported files
 * are skipped and reported rather than failing the whole import.
 */
export function readProjectZip(zip: Uint8Array): ImportResult {
  let declared = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      // Refuse before inflating: guards against zip bombs via declared sizes.
      filter(file) {
        declared += file.originalSize;
        if (declared > MAX_PROJECT_BYTES)
          throw new ImportError("El ZIP descomprimido supera 50 MB");
        return !file.name.endsWith("/");
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("El archivo no es un ZIP válido");
  }

  const names = Object.keys(entries).filter((n) => !IGNORED.test(n));
  const prefix = commonFolder(names);
  const files: ImportedFile[] = [];
  const skipped: ImportResult["skipped"] = [];
  let total = 0;

  for (const name of names) {
    const path = name.slice(prefix.length);
    const bytes = entries[name];
    total += bytes.length; // real size, in case the declared one lied
    if (total > MAX_PROJECT_BYTES) throw new ImportError("El ZIP descomprimido supera 50 MB");
    const problem = validateFilePath(path);
    if (problem) {
      skipped.push({ path, reason: extensionOf(path) ? "formato no admitido" : "ruta no válida" });
      continue;
    }
    if (isBinaryPath(path)) {
      if (bytes.length > MAX_BINARY_BYTES) skipped.push({ path, reason: "supera 10 MB" });
      else if (!matchesMagic(path, bytes))
        skipped.push({ path, reason: "contenido no coincide con la extensión" });
      else files.push({ path, data: Buffer.from(bytes) });
      continue;
    }
    if (bytes.length > MAX_FILE_BYTES) {
      skipped.push({ path, reason: "supera 1 MB" });
      continue;
    }
    files.push({ path, content: new TextDecoder("utf-8").decode(bytes) });
  }

  if (files.length > MAX_FILES_PER_PROJECT) {
    throw new ImportError(`El ZIP tiene más de ${MAX_FILES_PER_PROJECT} archivos admitidos`);
  }
  const mainFile = findMainFile(files);
  if (!mainFile) throw new ImportError("No se encontró ningún .tex con \\documentclass");
  return { files, mainFile, skipped };
}

/** "paper/main.tex", "paper/refs.bib" -> "paper/" (exports often wrap everything in a folder). */
function commonFolder(names: string[]): string {
  if (names.length === 0) return "";
  const first = names[0].split("/");
  if (first.length < 2) return "";
  const folder = `${first[0]}/`;
  return names.every((n) => n.startsWith(folder)) ? folder : "";
}

export function findMainFile(files: ImportedFile[]): string | undefined {
  const roots = files.filter(
    (f) => f.path.endsWith(".tex") && /\\documentclass/.test(f.content ?? ""),
  );
  const preferred = ["main.tex", "paper.tex", "manuscript.tex", "thesis.tex"];
  return (
    preferred.map((p) => roots.find((f) => f.path === p)).find(Boolean)?.path ??
    roots.sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0]?.path
  );
}
