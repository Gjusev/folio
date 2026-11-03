import dynamic from "next/dynamic";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { useOutsideClose } from "./useOutsideClose";
import type { LogIssue } from "@/lib/latex-log";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted">Cargando el visor…</p>,
});

export type CompileState = {
  status: "idle" | "running" | "done" | "failed";
  ok?: boolean;
  pdf?: Uint8Array<ArrayBuffer>;
  pdfUrl?: string;
  log?: string;
  errors: LogIssue[];
  warnings: LogIssue[];
  message?: string;
  timedOut?: boolean;
  seconds?: number;
};

type Props = {
  state: CompileState;
  fileName: string;
  onCompile: () => void;
  onReveal: (issue: LogIssue) => void;
  onTextClick: (text: string) => void;
  /** Click point in PDF pt for exact SyncTeX sync (falls back to text search). */
  onPointClick?: (p: { page: number; x: number; y: number; text: string }) => void;
  /** Body word count from texcount, if already fetched. */
  words?: number | null;
  /** chktex issues over the current sources. */
  lint?: LogIssue[] | null;
  lintBusy?: boolean;
  onLint?: () => void;
};

export function PdfPanel({
  state,
  fileName,
  onCompile,
  onReveal,
  onTextClick,
  onPointClick,
  words,
  lint,
  lintBusy,
  onLint,
}: Props) {
  const { t, lang } = useI18n();
  const { status, errors, warnings } = state;
  const [scale, setScale] = useState<number | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const logRef = useOutsideClose();
  const failed = state.ok === false || Boolean(state.message);
  const zoom = (d: number) => setScale((s) => Math.max(0.4, Math.min(3, (s ?? 1) + d)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-sm">
        <h2 className="font-medium">PDF</h2>
        <span className="num text-xs text-muted" aria-live="polite">
          {status === "running"
            ? t("ws.compile.busy")
            : state.pdf
              ? t("pdf.page", { page, pages })
              : failed
                ? t("pdf.noPdf")
                : t("pdf.notCompiled")}
        </span>
        {words != null && !failed && (
          <span className="num text-xs text-muted">
            {t("pdf.words", { n: words.toLocaleString(lang) })}
          </span>
        )}
        {state.seconds !== undefined && status !== "running" && !failed && (
          <span className="num hidden text-xs text-muted lg:inline">
            {t("pdf.seconds", { s: state.seconds.toFixed(1) })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {state.pdf && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => zoom(-0.15)}
                aria-label={t("pdf.zoomOut")}
              >
                −
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm num w-14"
                onClick={() => setScale(null)}
                title={t("pdf.fit.title")}
              >
                {scale === null ? "Ajustar" : `${Math.round(scale * 100)} %`}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => zoom(0.15)}
                aria-label={t("pdf.zoomIn")}
              >
                +
              </button>
              <a className="btn btn-ghost btn-sm" href={state.pdfUrl} download={`${fileName}.pdf`}>
                {t("pdf.download")}
              </a>
            </>
          )}
        </div>
      </div>

      {(failed ||
        errors.length > 0 ||
        (warnings.length > 0 && showLog) ||
        (lint != null && (lint.length > 0 || errors.length === 0))) && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-line px-4 py-3">
          <p role="alert" className={`text-sm font-medium ${failed ? "text-danger" : "text-ink"}`}>
            {state.message ??
              (state.timedOut
                ? t("pdf.timeout")
                : failed
                  ? t("pdf.failed", { stale: state.pdf ? t("pdf.failed.stale") : "" })
                  : warnings.length === 1
                    ? t("pdf.warnings.one")
                    : warnings.length > 1
                      ? t("pdf.warnings", { n: warnings.length })
                      : t("pdf.lint"))}
          </p>
          <IssueList issues={errors} tone="text-danger" onReveal={onReveal} />
          {errors.length === 0 && (
            <>
              <IssueList issues={warnings} tone="text-warn" onReveal={onReveal} />
              {lint && lint.length > 0 && (
                <IssueList issues={lint} tone="text-warn" onReveal={onReveal} />
              )}
              {lint && lint.length === 0 && (
                <p className="mt-2 text-xs text-muted">{t("pdf.lint.none")}</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {state.pdf ? (
          <PdfViewer
            data={state.pdf}
            scale={scale}
            onScale={setScale}
            onPages={setPages}
            onPageInView={setPage}
            onTextClick={onTextClick}
            onPointClick={onPointClick}
          />
        ) : (
          <div className="flex h-full flex-col items-start justify-center gap-3 bg-[var(--pdf-desk)] p-8">
            <p className="text-base font-medium">{t("pdf.empty.head")}</p>
            <p className="max-w-xs text-sm text-muted">
              {t("pdf.empty.body", { kbd: "Ctrl + Enter" })}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCompile}
              disabled={status === "running"}
            >
              {status === "running" ? t("ws.compile.busy") : t("pdf.empty.cta")}
            </button>
          </div>
        )}
      </div>

      {(state.log || warnings.length > 0) && (
        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-3 text-xs text-muted">
          {warnings.length > 0 && errors.length === 0 && (
            <button type="button" className="hover:text-ink" onClick={() => setShowLog((v) => !v)}>
              {warnings.length === 1
                ? t("pdf.warnings.one")
                : t("pdf.warnings", { n: warnings.length })}
            </button>
          )}
          {onLint && (
            <button type="button" className="hover:text-ink" onClick={onLint} disabled={lintBusy}>
              {lintBusy ? t("common.loading") : t("pdf.lint")}
              {lint && lint.length > 0 ? ` (${lint.length})` : ""}
            </button>
          )}
          {state.log && (
            <details className="relative" ref={logRef}>
              <summary className="cursor-pointer list-none hover:text-ink">{t("pdf.log")}</summary>
              <pre
                className="absolute bottom-7 left-0 z-10 max-h-80 w-[min(640px,80vw)] overflow-auto rounded-lg border border-line bg-surface p-3 font-mono /* taste-skill-ignore mono: compiler log is literal output */ text-[11px] leading-snug whitespace-pre-wrap text-ink shadow-[0_8px_24px_rgba(0,0,0,0.12)]" /* taste-skill-ignore shadow: floating log popover */
              >
                {state.log}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function IssueList({
  issues,
  tone,
  onReveal,
}: {
  issues: LogIssue[];
  tone: string;
  onReveal: (i: LogIssue) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {issues.map((i, n) => (
        <li key={n}>
          <button
            type="button"
            className="flex w-full gap-3 rounded px-1 py-1 text-left text-sm hover:bg-raised disabled:cursor-default disabled:hover:bg-transparent"
            onClick={() => onReveal(i)}
            disabled={!i.line}
          >
            <span
              className={`num shrink-0 font-mono text-xs leading-5 ${tone}`} /* taste-skill-ignore mono: file:line locators are code positions */
            >
              {i.line ? `${i.file ?? "l."}${i.file ? ":" : ""}${i.line}` : "·"}
            </span>
            <span>{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
