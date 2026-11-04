"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import { checkArxivPackage } from "@/lib/arxiv-check";

/** One row of the pre-submission report (see src/lib/arxiv-check.ts). */
type Check = ReturnType<typeof checkArxivPackage>[number];

type Props = {
  projectId: string;
  mainFile: string;
  /** Last compile log, if any; feeds the bbl check. */
  log?: string;
  files: { path: string; content: string; binary?: boolean }[];
  onClose: () => void;
};

const CHECK_KEY: Record<string, MsgKey> = {
  names: "arxiv.check.names",
  pdfoutput: "arxiv.check.pdfoutput",
  paths: "arxiv.check.paths",
  eps: "arxiv.check.eps",
  shell: "arxiv.check.shell",
  bbl: "arxiv.check.bbl",
  size: "arxiv.check.size",
};
const LEVEL_KEY: Record<Check["level"], MsgKey> = {
  pass: "arxiv.level.pass",
  warn: "arxiv.level.warn",
  fail: "arxiv.level.fail",
};
const LEVEL_DOT: Record<Check["level"], string> = {
  pass: "bg-ok",
  warn: "bg-warn",
  fail: "bg-danger",
};
const LEVEL_TEXT: Record<Check["level"], string> = {
  pass: "text-ok",
  warn: "text-warn",
  fail: "text-danger",
};

/** Decoded byte length: utf-8 for sources, base64 for figures. */
function byteLength(f: { content: string; binary?: boolean }) {
  if (f.binary)
    return (
      Math.floor((f.content.length * 3) / 4) -
      (f.content.endsWith("==") ? 2 : f.content.endsWith("=") ? 1 : 0)
    );
  return new TextEncoder().encode(f.content).length;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** First line of a TeX log that names an error (they all start with "!"). */
function firstLogError(log: string) {
  return log
    .split("\n")
    .find((l) => l.startsWith("!") || /error/i.test(l))
    ?.trim();
}

/** Pre-submission checks + ZIP download for an arXiv source package. */
export function ArxivExport({ projectId, mainFile, log, files, onClose }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    // Same close semantics as useOutsideClose, adapted to the overlay.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const checks = useMemo(
    () => checkArxivPackage(files, mainFile, log ?? ""),
    [files, mainFile, log],
  );
  const total = useMemo(() => files.reduce((n, f) => n + byteLength(f), 0), [files]);

  async function download() {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export/arxiv`, { method: "POST" });
      // A failed compile answers like /compile (JSON with the log) or as a
      // route() error; either way we surface its first error line, no download.
      if ((res.headers.get("content-type") ?? "").includes("application/json")) {
        const data = (await res.json().catch(() => ({}))) as { log?: string; error?: string };
        setFailure(firstLogError(data.log ?? "") ?? data.error ?? `Error ${res.status}`);
        return;
      }
      if (!res.ok) {
        setFailure(`Error ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
        "arxiv.zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("arxiv.title")}
      data-testid="arxiv-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
    >
      <div
        className="sheet max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{t("arxiv.title")}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {t("arxiv.summary", { n: files.length, size: fmtBytes(total) })}
        </p>
        <ul className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <li
              key={c.id}
              data-testid={`arxiv-row-${c.id}`}
              className="flex items-start gap-2 rounded-md border border-line p-2 text-sm"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[c.level]}`}
                aria-hidden
              />
              <span className="min-w-0">
                <span className={`font-medium ${LEVEL_TEXT[c.level]}`}>
                  {t(CHECK_KEY[c.id] ?? "arxiv.title")}
                  <span className="sr-only">: {t(LEVEL_KEY[c.level])}</span>
                </span>{" "}
                <span className="text-muted">
                  {c.level === "pass" ? t(LEVEL_KEY[c.level]) : c.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {failure && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t("arxiv.compileFailed")} <span className="block font-mono text-xs">{failure}</span>
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="arxiv-download"
            disabled={busy}
            onClick={() => void download()}
          >
            {busy ? t("arxiv.download.busy") : t("arxiv.download")}
          </button>
        </div>
      </div>
    </div>
  );
}
