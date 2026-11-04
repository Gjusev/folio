// Strings of the arXiv package export (dialog + checks). `es` is the source
// of truth; `en` and `de` are typed against it.

const es = {
  "ws.export.arxiv": "Paquete arXiv…",
  "arxiv.title": "Paquete para arXiv",
  "arxiv.level.pass": "Correcto",
  "arxiv.level.warn": "Aviso",
  "arxiv.level.fail": "Error",
  "arxiv.check.names": "Nombres de archivo",
  "arxiv.check.pdfoutput": "Salida PDF (\\pdfoutput)",
  "arxiv.check.paths": "Rutas en \\input/\\include",
  "arxiv.check.eps": "Figuras EPS",
  "arxiv.check.shell": "Shell-escape",
  "arxiv.check.bbl": "Bibliografía (.bbl)",
  "arxiv.check.size": "Tamaño del paquete",
  "arxiv.summary": "{n:archivo|archivos} · {size}",
  "arxiv.download": "Descargar paquete",
  "arxiv.download.busy": "Preparando…",
  "arxiv.compileFailed": "No se pudo generar el paquete:",
} as const;

const en: Record<keyof typeof es, string> = {
  "ws.export.arxiv": "arXiv package…",
  "arxiv.title": "arXiv package",
  "arxiv.level.pass": "Pass",
  "arxiv.level.warn": "Warning",
  "arxiv.level.fail": "Fail",
  "arxiv.check.names": "File names",
  "arxiv.check.pdfoutput": "PDF output (\\pdfoutput)",
  "arxiv.check.paths": "Paths in \\input/\\include",
  "arxiv.check.eps": "EPS figures",
  "arxiv.check.shell": "Shell-escape",
  "arxiv.check.bbl": "Bibliography (.bbl)",
  "arxiv.check.size": "Package size",
  "arxiv.summary": "{n:file|files} · {size}",
  "arxiv.download": "Download package",
  "arxiv.download.busy": "Preparing…",
  "arxiv.compileFailed": "Could not build the package:",
};

const de: Record<keyof typeof es, string> = {
  "ws.export.arxiv": "arXiv-Paket…",
  "arxiv.title": "arXiv-Paket",
  "arxiv.level.pass": "OK",
  "arxiv.level.warn": "Warnung",
  "arxiv.level.fail": "Fehler",
  "arxiv.check.names": "Dateinamen",
  "arxiv.check.pdfoutput": "PDF-Ausgabe (\\pdfoutput)",
  "arxiv.check.paths": "Pfade in \\input/\\include",
  "arxiv.check.eps": "EPS-Abbildungen",
  "arxiv.check.shell": "Shell-escape",
  "arxiv.check.bbl": "Literaturverzeichnis (.bbl)",
  "arxiv.check.size": "Paketgröße",
  "arxiv.summary": "{n:Datei|Dateien} · {size}",
  "arxiv.download": "Paket herunterladen",
  "arxiv.download.busy": "Wird vorbereitet…",
  "arxiv.compileFailed": "Paket konnte nicht erstellt werden:",
};

export const arxivDict = { es, en, de };
