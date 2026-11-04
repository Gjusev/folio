"use client";

// One review of the project before submission: citation health and the
// checklist, fetched in parallel, reported together. Nothing runs until asked.

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { FileDoc } from "@/components/workspace/document-store";

type Health = {
  defined: number;
  cited: number;
  unused: string[];
  undefined: string[];
  upgrades: {
    key: string;
    title: string;
    suggestion: {
      source: "openalex";
      paperId: string;
      title: string;
      venue?: string;
      year?: number;
      doi?: string;
      citedBy: number;
    };
  }[];
};

type Check = {
  id: string;
  ok: boolean;
  detail: { code: string; vars?: Record<string, string | number> };
};

type Submission = { checks: Check[]; words: number | null };

type Report = { health: Health; submission: Submission };

const SUBMISSION_LABEL: Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
  citations: "papers.submission.citations",
  unused: "papers.submission.unused",
  todos: "papers.submission.todos",
  figures: "papers.submission.figures",
  abstract: "papers.submission.abstract",
  keywords: "papers.submission.keywords",
};

export function CheckView({
  projectId,
  flush,
  onFilesUpdated,
}: {
  projectId: string;
  flush?: () => Promise<void>;
  onFilesUpdated?: (files: FileDoc[]) => void;
}) {
  const { t, lang } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const nf = new Intl.NumberFormat(lang);

  async function run() {
    setState("loading");
    setError(null);
    try {
      const [health, submission] = await Promise.all([
        api<Health>("GET", `/api/projects/${projectId}/citations/health`),
        api<Submission>("GET", `/api/projects/${projectId}/submission-check`),
      ]);
      setReport({ health, submission });
      setState("idle");
    } catch (err) {
      setState("error");
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    }
  }

  /** Replaces an arXiv preprint entry with its published version. */
  async function upgrade(u: Health["upgrades"][number]) {
    setBusyKey(u.key);
    setError(null);
    try {
      await flush?.();
      const r = await api<{ key: string; texFiles: number; files: FileDoc[] }>(
        "POST",
        `/api/projects/${projectId}/citations/upgrade`,
        { source: u.suggestion.source, paperId: u.suggestion.paperId, oldKey: u.key },
      );
      onFilesUpdated?.(r.files);
      await run(); // the report changed: refresh it
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  const pending = report
    ? report.health.undefined.length +
      report.health.unused.length +
      report.health.upgrades.length +
      report.submission.checks.filter((c) => !c.ok).length
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="check-view">
      <div className="shrink-0 space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <h3 className="label !mb-0">{t("check.title")}</h3>
          <button
            type="button"
            className="btn btn-sm btn-primary ml-auto"
            onClick={() => void run()}
            disabled={state === "loading"}
            data-testid="check-run"
          >
            <ClipboardCheck size={13} aria-hidden />
            {state === "loading" ? t("check.running") : t("check.run")}
          </button>
        </div>
        <p className="text-xs leading-4 text-muted">{t("check.hint")}</p>
        {error && (
          <p role="alert" className="text-xs text-[var(--pill-negative-ink)]">
            {t("check.error")}: {error}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" && (
          <div className="animate-pulse space-y-3 p-3" aria-hidden>
            <div className="h-4 w-2/3 rounded bg-raised" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-line p-3">
                <div className="h-3 w-1/2 rounded bg-raised" />
                <div className="h-2.5 w-5/6 rounded bg-raised" />
              </div>
            ))}
          </div>
        )}

        {report && state !== "loading" && (
          <div className="space-y-4 p-3">
            <p
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                pending === 0
                  ? "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
                  : "bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]"
              }`}
              role="status"
              data-testid="check-verdict"
            >
              {pending === 0 ? (
                <>
                  <CheckCircle2 size={15} aria-hidden /> {t("check.verdict.ok")}
                </>
              ) : (
                <>
                  <XCircle size={15} aria-hidden /> {t("check.verdict.n", { n: String(pending) })}
                </>
              )}
            </p>

            <section aria-labelledby="check-citations">
              <h3 id="check-citations" className="label">
                {t("check.citations")}{" "}
                <span className="num font-normal text-muted">
                  ({report.health.cited}/{report.health.defined})
                </span>
              </h3>
              {report.health.undefined.length > 0 && (
                <p className="mt-1.5 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-xs text-[var(--pill-negative-ink)]">
                  {t("papers.health.undefined", { n: String(report.health.undefined.length) })}:{" "}
                  <span className="font-mono">{report.health.undefined.join(", ")}</span>
                </p>
              )}
              {report.health.unused.length > 0 && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none text-xs text-muted">
                    {t("papers.health.unused", { n: String(report.health.unused.length) })}
                  </summary>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {report.health.unused.join(", ")}
                  </p>
                </details>
              )}
              {report.health.upgrades.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {report.health.upgrades.map((u) => (
                    <li key={u.key} className="rounded-md border border-line p-2">
                      <p className="text-xs leading-4">
                        <span className="font-mono">{u.key}</span>: {t("papers.health.preprint")}
                      </p>
                      <p className="mt-0.5 flex items-start gap-1 text-xs font-medium">
                        {u.suggestion.title}
                        <ArrowUpRight
                          size={11}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-muted"
                        />
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {[u.suggestion.venue, u.suggestion.year].filter(Boolean).join(" · ")}
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm mt-1.5"
                        onClick={() => void upgrade(u)}
                        disabled={busyKey !== null}
                      >
                        {busyKey === u.key ? t("papers.adding") : t("papers.health.upgrade")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {report.health.undefined.length === 0 &&
                report.health.unused.length === 0 &&
                report.health.upgrades.length === 0 && (
                  <p className="mt-1 text-xs text-[var(--pill-positive-ink)]">
                    {t("papers.health.ok")}
                  </p>
                )}
            </section>

            <section aria-labelledby="check-submission">
              <h3 id="check-submission" className="label">
                {t("check.submission")}
              </h3>
              <ul className="mt-1 space-y-1">
                {report.submission.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5 text-xs">
                    <span aria-hidden className={c.ok ? "text-ok" : "text-danger"}>
                      {c.ok ? "✓" : "✗"}
                    </span>
                    <span className="min-w-0">
                      {t(SUBMISSION_LABEL[c.id] ?? "papers.submission.title")}{" "}
                      <span className="text-muted">
                        — {t(c.detail.code as Parameters<typeof t>[0], c.detail.vars)}
                      </span>
                    </span>
                  </li>
                ))}
                {report.submission.words !== null && (
                  <li className="num text-xs text-muted">
                    {t("papers.submission.words")}: {nf.format(report.submission.words)}
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}

        {!report && state === "idle" && (
          <p className="p-4 text-sm leading-6 text-muted">{t("check.hint")}</p>
        )}
      </div>
    </div>
  );
}
