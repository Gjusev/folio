// The compiler service re-validates paths with its own copy of this rule: it
// must not trust its caller.
export const TEXT_EXTENSIONS = [
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
] as const;

// Figures pdflatex can include without shell escape. SVG and EPS need external
// converters (shell escape), so they are not accepted.
export const BINARY_EXTENSIONS = ["png", "jpg", "jpeg", "pdf"] as const;

export const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS] as const;

export const MAX_FILE_BYTES = 1_000_000; // text
export const MAX_BINARY_BYTES = 10_000_000; // one figure
export const MAX_PROJECT_BYTES = 50_000_000; // everything in a project
export const MAX_FILES_PER_PROJECT = 200;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_\-.]*$/;

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? path.slice(dot + 1).toLowerCase() : "";
}

export function isBinaryPath(path: string): boolean {
  return (BINARY_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

/** Returns an error message, or null when the path is a safe relative project path. */
export function validateFilePath(path: string): string | null {
  if (path.length === 0 || path.length > 200) return "La ruta debe tener entre 1 y 200 caracteres";
  const segments = path.split("/");
  if (segments.length > 5) return "Demasiados niveles de carpetas";
  for (const s of segments) {
    if (!SEGMENT.test(s) || s.includes("..")) {
      return "Usa solo letras, números, guiones, guiones bajos y puntos (sin '..' ni rutas absolutas)";
    }
  }
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(path))) {
    return `Extensión no admitida. Permitidas: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }
  return null;
}

/** True when the bytes really are the format the extension claims. */
export function matchesMagic(path: string, bytes: Uint8Array): boolean {
  const ext = extensionOf(path);
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (ext === "png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (ext === "jpg" || ext === "jpeg") return starts(0xff, 0xd8, 0xff);
  if (ext === "pdf") return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
  return true;
}

export const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};
