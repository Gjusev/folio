"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { tourEvent } from "@/components/onboarding/tasks";
import { useOutsideClose } from "./useOutsideClose";
import type { CompileState } from "./PdfPanel";

type Snapshot = { id: string; label: string; createdAt: string; files: number };

type Props = {
  projectId: string;
  /** Hands a compiled diff PDF (same shape as a compile) to the PDF panel. */
  onDiff: (state: Partial<CompileState> & Pick<CompileState, "errors" | "warnings">) => void;
  onRestored: () => void;
  /** Opens the menu when the counter grows (the tour's «Show me»); 0 = never. */
  openRequest?: number;
};

/** Saved versions of the project: create, visual latexdiff, restore, delete. */
export function SnapshotsMenu({ projectId, onDiff, onRestored, openRequest }: Props) {
  const { t, lang } = useI18n();
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const detailsRef = useOutsideClose();

  // The tour's «Show me» opens this menu: prop change → state, during render.
  const [lastRequest, setLastRequest] = useState(openRequest);
  if (openRequest !== lastRequest) {
    setLastRequest(openRequest);
    if (openRequest) setOpen(true);
  }

  useEffect(() => {
    if (!open || snapshots) return;
    api<{ snapshots: Snapshot[] }>("GET", `/api/projects/${projectId}/snapshots`)
      .then((r) => setSnapshots(r.snapshots))
      .catch((err) => setError((err as Error).message));
  }, [open, snapshots, projectId]);

  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const r = await api<{ snapshot: Snapshot }>("POST", `/api/projects/${projectId}/snapshots`, {
        label: label.trim() || undefined,
      });
      setSnapshots((s) => [r.snapshot, ...(s ?? [])]);
      setLabel("");
      tourEvent("snapshot");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function diff(s: Snapshot) {
    setBusy(s.id);
    setError(null);
    try {
      const r = await api<{
        ok: boolean;
        pdf?: string;
        log: string;
        timedOut?: boolean;
        errors: CompileState["errors"];
        warnings: CompileState["warnings"];
      }>("POST", `/api/projects/${projectId}/snapshots/${s.id}/diff`);
      let pdf: Uint8Array<ArrayBuffer> | undefined;
      if (r.ok && r.pdf) pdf = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
      onDiff({
        status: r.ok ? "done" : "failed",
        ok: r.ok,
        pdf,
        log: r.log,
        errors: r.errors,
        warnings: r.warnings,
        timedOut: r.timedOut,
        message: r.ok
          ? t("snap.diff.ok", { label: s.label || fmt.format(new Date(s.createdAt)) })
          : undefined,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function restore(s: Snapshot) {
    setBusy(s.id);
    setError(null);
    try {
      await api("POST", `/api/projects/${projectId}/snapshots/${s.id}/restore`);
      onRestored();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      setConfirmId(null);
    }
  }

  async function remove(s: Snapshot) {
    setBusy(s.id);
    try {
      await api("DELETE", `/api/projects/${projectId}/snapshots/${s.id}`);
      setSnapshots((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <details
      className="relative"
      ref={detailsRef}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className="btn btn-ghost btn-sm cursor-pointer list-none"
        title={t("snap.title")}
        aria-label={t("snap.title")}
      >
        <Clock size={14} aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-[min(18rem,calc(100vw-24px))] rounded-lg border border-line bg-surface p-3 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <p className="label">{t("snap.title")}</p>
        <div className="mt-1.5 flex gap-1.5">
          <input
            className="input h-7 min-w-0 flex-1 text-xs"
            placeholder={t("snap.label.ph")}
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm shrink-0"
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" ? t("common.loading") : t("snap.save")}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-danger">
            {error}
          </p>
        )}
        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
          {snapshots === null &&
            [0, 1].map((i) => (
              <li key={i} className="animate-pulse rounded-md border border-line p-1.5">
                <div className="h-3 w-2/3 rounded bg-raised" />
                <div className="mt-1.5 h-2 w-1/2 rounded bg-raised" />
              </li>
            ))}
          {(snapshots ?? []).map((s) => (
            <li key={s.id} className="rounded-md border border-line p-1.5">
              <p className="truncate font-medium" title={s.label}>
                {s.label || fmt.format(new Date(s.createdAt))}
              </p>
              <p className="num mt-0.5 text-[11px] text-muted">
                {fmt.format(new Date(s.createdAt))} · {s.files}
              </p>
              {confirmId === s.id ? (
                <div className="mt-1 flex items-center gap-1">
                  <span
                    className="min-w-0 flex-1"
                    title={t("snap.restore.confirm", { label: s.label })}
                  >
                    {t("snap.restore.confirm", {
                      label: s.label || fmt.format(new Date(s.createdAt)),
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm shrink-0"
                    disabled={busy !== null}
                    onClick={() => void restore(s)}
                  >
                    {t("common.confirm")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => setConfirmId(null)}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy !== null}
                    onClick={() => void diff(s)}
                  >
                    {busy === s.id ? t("common.loading") : t("snap.diff")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy !== null}
                    onClick={() => setConfirmId(s.id)}
                  >
                    {t("snap.restore")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy !== null}
                    onClick={() => void remove(s)}
                    aria-label={t("snap.delete")}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
          {snapshots && snapshots.length === 0 && <li className="text-muted">{t("snap.empty")}</li>}
        </ul>
      </div>
    </details>
  );
}
