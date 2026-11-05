"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ClipboardCheck, ClipboardCopy, Eye, EyeOff, Wand2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { tourEvent } from "@/components/onboarding/tasks";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import { itemsFromFolioReview, parsePastedReview, type LetterItem } from "@/lib/letter";
import { compareReviews, type CompareResult } from "@/lib/review-compare";
import type { CommentState, ReviewStates, SavedReview, SavedReviewMeta } from "@/lib/reviews-store";
import {
  ASPECTS,
  RIGORS,
  SEVERITIES,
  projectSections,
  reviewToMarkdown,
  type Aspect,
  type Review,
  type ReviewComment,
  type Rigor,
  type Severity,
  type SourceFile,
} from "@/lib/review";

type Saved = { review: Review; sections: number; truncated: boolean; savedId?: string };

// The last result is kept per project in this browser (a review costs tokens;
// losing it on reload would be a poor trade). useSyncExternalStore keeps SSR
// and hydration consistent: the server snapshot is always "nothing saved".
const listeners = new Set<() => void>();
const key = (id: string) => `folio:review:${id}`;
const read = (id: string) => localStorage.getItem(key(id));
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function write(id: string, value: Saved | null) {
  if (value) localStorage.setItem(key(id), JSON.stringify(value));
  else localStorage.removeItem(key(id));
  listeners.forEach((l) => l());
}

const SEV_PILL: Record<Severity, string> = {
  major: "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]",
  minor: "bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]",
  nit: "bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]",
};

function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-[13px] transition-colors [@media(hover:none)]:min-h-11 [@media(hover:none)]:px-4 ${
        on
          ? "bg-primary text-primary-ink"
          : "border border-control bg-raised text-ink hover:bg-active"
      }`}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

// No-op subscription: the value is read once per render from localStorage.
const subscribeNone = () => () => {};

export function ReviewPanel({
  projectId,
  enabled,
  active,
  getFiles,
  flush,
  onOpenAt,
  onRequestFix,
  onOpenFile,
}: {
  projectId: string;
  enabled: boolean;
  /** True while this tab is visible: the section list is re-read from the editor then. */
  active: boolean;
  getFiles: () => SourceFile[];
  flush: () => Promise<void>;
  onOpenAt: (path: string, line: number) => void;
  /** Hands an instruction to the assistant tab ("Fix with the assistant"). */
  onRequestFix: (instruction: string) => void;
  /** Opens a file the server just created (the response letter) in the editor. */
  onOpenFile: (file: { id: string; path: string; content: string; version: number }) => void;
}) {
  const { t, lang } = useI18n();
  const raw = useSyncExternalStore(
    subscribe,
    () => read(projectId),
    () => null,
  );
  const saved = useMemo<Saved | null>(() => {
    try {
      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  }, [raw]);

  const [mode, setMode] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = everything
  const [aspects, setAspects] = useState<Set<Aspect>>(
    new Set<Aspect>(["clarity", "structure", "argument", "evidence"]),
  );
  const [rigor, setRigor] = useState<Rigor>("reviewer");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sevOff, setSevOff] = useState<Set<Severity>>(new Set());
  const [aspectOff, setAspectOff] = useState<Set<Aspect>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  // Clearing the whole report is destructive: it asks twice like the library
  // delete instead of sitting one mis-tap away from "Copy report".
  const [confirmClear, setConfirmClear] = useState(false);

  // v2: saved history + per-comment states. `states` is the map the server
  // persists (key = comment index); without a savedId it stays local.
  const [hist, setHist] = useState<SavedReviewMeta[] | null>(null);
  const [loaded, setLoaded] = useState<SavedReview | null>(null);
  const [states, setStates] = useState<ReviewStates>({});
  const [compareId, setCompareId] = useState("");
  const [compare, setCompare] = useState<{ id: string; counts: CompareResult } | null>(null);
  // Response letter: sources (a saved review plus pasted text), per-item
  // responses keyed by `${index}|${id}`, an optional snapshot for the appendix.
  const [letterOpen, setLetterOpen] = useState(false);
  // null = nothing explicitly picked: the review on screen is preselected.
  const [letterPicked, setLetterPicked] = useState<string | null>(null);
  const [letterDetail, setLetterDetail] = useState<SavedReview | null>(null);
  const [letterSrc, setLetterSrc] = useState("");
  const [letterSnaps, setLetterSnaps] = useState<
    { id: string; label: string; createdAt: string }[] | null
  >(null);
  const [letterSnapId, setLetterSnapId] = useState("");
  const [responses, setResponses] = useState<
    Record<string, { response: string; aiDraft: boolean }>
  >({});
  const [letterBusy, setLetterBusy] = useState<"drafts" | "create" | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterDone, setLetterDone] = useState<{
    path: string;
    fileId: string;
    version: number;
    content: string;
    pages?: number;
  } | null>(null);
  // Best-effort own-user id (the comments drawer caches it after posting one):
  // decides whether history rows offer a delete button. The server enforces
  // authorship anyway; useSyncExternalStore keeps the read SSR-safe.
  const uid = useSyncExternalStore(
    subscribeNone,
    () => localStorage.getItem("folio:uid"),
    () => null,
  );

  const refreshHist = useCallback(() => {
    api<{ reviews: SavedReviewMeta[] }>("GET", `/api/projects/${projectId}/reviews`)
      .then((r) => setHist(r.reviews ?? []))
      .catch(() => setHist([])); // no history (or route) yet: honest empty state
  }, [projectId]);
  useEffect(() => {
    refreshHist();
  }, [refreshHist]);

  // Snapshots are only needed once the letter section is open.
  useEffect(() => {
    if (!letterOpen || letterSnaps !== null) return;
    api<{ snapshots: { id: string; label: string; createdAt: string }[] }>(
      "GET",
      `/api/projects/${projectId}/snapshots`,
    )
      .then((r) => setLetterSnaps(r.snapshots ?? []))
      .catch(() => setLetterSnaps([]));
  }, [letterOpen, letterSnaps, projectId]);

  // Preselection: whatever review is on screen (the history one or the
  // localStorage fallback) until the author picks another source.
  const letterSel = letterPicked ?? loaded?.id ?? saved?.savedId ?? (saved?.review ? "local" : "");

  async function pickLetterReview(id: string) {
    setLetterPicked(id);
    setLetterDetail(null);
    if (!id || id === "local" || id === loaded?.id) return;
    try {
      setLetterDetail(await fetchDetail(id));
    } catch (err) {
      setLetterError((err as Error).message);
    }
  }

  const folioReview =
    letterSel === "local"
      ? (saved?.review ?? null)
      : letterDetail && letterDetail.id === letterSel
        ? letterDetail.result
        : loaded && loaded.id === letterSel
          ? loaded.result
          : saved && saved.savedId === letterSel
            ? saved.review
            : null;
  // Folio items first, then the pasted ones; edits live in `responses` so the
  // derived list can rebuild (typing in the paste box) without losing them.
  const letterDerived = useMemo<LetterItem[]>(
    () => [
      ...(folioReview ? itemsFromFolioReview(folioReview) : []),
      ...parsePastedReview(letterSrc),
    ],
    [folioReview, letterSrc],
  );
  const keyOf = (i: number, it: LetterItem) => `${i}|${it.id}`;
  const letterItems = letterDerived.map((it, i) => ({ ...it, ...responses[keyOf(i, it)] }));
  const letterHasEmpty = letterItems.some((it) => !it.response.trim());

  function setResponse(key: string, text: string) {
    setResponses((r) => ({ ...r, [key]: { response: text, aiDraft: false } }));
  }

  /** AI drafts: filled into the EMPTY slots only, marked as drafts. */
  async function letterDrafts() {
    setLetterBusy("drafts");
    setLetterError(null);
    try {
      const r = await api<{ drafts: { id: string; response: string }[] }>(
        "POST",
        `/api/projects/${projectId}/letter/drafts`,
        {
          items: letterItems.slice(0, 40).map(({ id, comment, quote }) => ({
            id,
            comment,
            quote: quote ?? undefined,
          })),
          lang,
        },
      );
      setResponses((prev) => {
        const next = { ...prev };
        for (const d of r.drafts)
          letterItems.forEach((it, i) => {
            if (it.id === d.id && !it.response.trim())
              next[keyOf(i, it)] = { response: d.response, aiDraft: true };
          });
        return next;
      });
    } catch (err) {
      setLetterError((err as Error).message);
    } finally {
      setLetterBusy(null);
    }
  }

  /** Creates response-letter.tex, compiles it and offers it in the editor. */
  async function createLetter() {
    setLetterBusy("create");
    setLetterError(null);
    setLetterDone(null);
    try {
      const snap = (letterSnaps ?? []).find((s) => s.id === letterSnapId);
      const created = await api<{
        path: string;
        fileId: string;
        version: number;
        content: string;
      }>("POST", `/api/projects/${projectId}/letter`, {
        items: letterItems.slice(0, 40),
        lang,
        snapshotLabel: snap ? snap.label || fmtDate(snap.createdAt) : undefined,
      });
      const compiled = await api<{ ok: boolean; pages?: number }>(
        "POST",
        `/api/projects/${projectId}/compile`,
        { mainFile: created.path },
      ).catch(() => null);
      if (!compiled?.ok) return setLetterError(t("letter.failCompile"));
      setLetterDone({ ...created, pages: compiled.pages });
    } catch (err) {
      setLetterError(`${t("letter.failCreate")}: ${(err as Error).message}`);
    } finally {
      setLetterBusy(null);
    }
  }

  // The displayed review: a saved one opened from the history wins over the
  // localStorage copy, which stays as the offline fallback.
  const review = loaded?.result ?? saved?.review ?? null;
  const savedId = loaded?.id ?? saved?.savedId ?? null;
  const dismissed = useMemo(
    () =>
      new Set(
        Object.entries(states)
          .filter(([, v]) => v === "dismissed")
          .map(([k]) => Number(k)),
      ),
    [states],
  );
  const ownUid =
    uid ?? (saved?.savedId ? hist?.find((h) => h.id === saved.savedId)?.userId : undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the tab becomes visible
  const sections = useMemo(() => projectSections(getFiles()), [getFiles, active]);
  const chosen = picked ?? new Set(sections.map((s) => s.id));
  const selected = sections.filter((s) => chosen.has(s.id));
  const sectionLabel = (title: string) => title || t("rv.scope.start");

  const files = useMemo(() => [...new Set(sections.map((s) => s.file))], [sections]);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

  /** One saved review with its result and states (flat, or wrapped in {review}). */
  async function fetchDetail(id: string): Promise<SavedReview> {
    const r = await api<SavedReview & { review?: SavedReview }>(
      "GET",
      `/api/projects/${projectId}/reviews/${id}`,
    );
    return r.result ? r : (r.review as SavedReview);
  }

  async function run() {
    setError(null);
    if (aspects.size === 0) return setError(t("rv.need.aspect"));
    if (mode === "pick" && selected.length === 0) return setError(t("rv.need.section"));
    setBusy(true);
    try {
      await flush();
      const res = await api<{
        review: Review;
        meta: { sections: number; truncated: boolean };
        savedId?: string;
      }>("POST", `/api/projects/${projectId}/review`, {
        lang,
        aspects: ASPECTS.filter((a) => aspects.has(a)),
        rigor,
        focus,
        scope: mode === "all" ? "all" : selected.map((s) => s.id),
      });
      write(projectId, {
        review: res.review,
        sections: res.meta.sections,
        truncated: res.meta.truncated,
        savedId: res.savedId,
      });
      tourEvent("review");
      setLoaded(null);
      setStates({});
      setSevOff(new Set());
      setAspectOff(new Set());
      refreshHist();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Sets/toggles one comment's state; persists it when the review is saved. */
  function markState(i: number, value: CommentState) {
    const k = String(i);
    const next = { ...states };
    if (next[k] === value) delete next[k];
    else next[k] = value;
    setStates(next);
    if (!savedId) return; // local-only until the review lives on the server
    void api("PATCH", `/api/projects/${projectId}/reviews/${savedId}/states`, {
      states: next,
    }).catch((err) => setError((err as Error).message));
  }

  async function loadReview(id: string) {
    setError(null);
    try {
      const detail = await fetchDetail(id);
      setLoaded(detail);
      setStates(detail.states ?? {});
      setSevOff(new Set());
      setAspectOff(new Set());
      setShowDismissed(false);
      setCompareId("");
      setCompare(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeReview(id: string) {
    try {
      await api("DELETE", `/api/projects/${projectId}/reviews/${id}`);
      setHist((h) => (h ? h.filter((x) => x.id !== id) : h));
      if (loaded?.id === id) {
        setLoaded(null);
        setStates({});
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /** Chips "X resueltos, Y nuevos, Z abiertos" against an older saved review. */
  async function runCompare(id: string) {
    setCompareId(id);
    setCompare(null);
    if (!id || !review) return;
    try {
      const detail = await fetchDetail(id);
      setCompare({ id, counts: compareReviews(detail.result, review) });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const present = review ? ASPECTS.filter((a) => review.comments.some((c) => c.aspect === a)) : [];
  const visible = review
    ? review.comments
        .map((c, i) => ({ c, i }))
        .filter(
          ({ c, i }) =>
            !sevOff.has(c.severity) &&
            !aspectOff.has(c.aspect) &&
            (showDismissed || !dismissed.has(i)),
        )
    : [];

  async function copyReport() {
    if (!review) return;
    await navigator.clipboard.writeText(reviewToMarkdown(review, t("rv.report")));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  /** The instruction handed to the assistant tab; nothing is applied automatically. */
  function fixInstruction(c: ReviewComment) {
    const lines = [c.comment];
    if (c.suggestion) lines.push(t("rv.fix.suggestion", { s: c.suggestion }));
    if (c.quote) lines.push(t("rv.fix.quote", { q: c.quote }));
    return lines.join("\n");
  }

  // Children never shrink: the scroll container scrolls instead of compressing
  // the Focus input and the run button.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3 text-sm [&>*]:shrink-0">
      <p className="text-xs leading-5 text-muted">{t("rv.note")}</p>

      {!enabled && (
        <p className="mt-3 rounded-md bg-[var(--pill-warning-bg)] px-3 py-2 text-xs text-[var(--pill-warning-ink)]">
          {t("rv.off")}{" "}
          <Link
            href="/settings"
            className="mt-2 inline-flex font-medium underline [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center"
          >
            {t("rv.off.link")}
          </Link>
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="label">{t("rv.scope")}</legend>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={mode === "all"} onClick={() => setMode("all")}>
            {t("rv.scope.all")}
          </Chip>
          <Chip on={mode === "pick"} onClick={() => setMode("pick")}>
            {t("rv.scope.pick")}
          </Chip>
        </div>
        {mode === "pick" && (
          <div className="mt-2 rounded-lg border border-line bg-surface p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{t("rv.sel.count", { n: selected.length })}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => setPicked(new Set(sections.map((s) => s.id)))}
                >
                  {t("rv.sel.all")}
                </button>
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => setPicked(new Set())}
                >
                  {t("rv.sel.none")}
                </button>
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {files.map((f) => (
                <div key={f} className="mb-1">
                  {files.length > 1 && <p className="px-1 py-0.5 text-xs font-medium">{f}</p>}
                  {sections
                    .filter((s) => s.file === f)
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-start gap-2 rounded px-1 py-2 hover:bg-raised [@media(hover:none)]:min-h-11"
                        style={{ paddingLeft: `${0.25 + Math.max(0, s.level - 1) * 0.9}rem` }}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-[var(--accent)]"
                          checked={chosen.has(s.id)}
                          onChange={() => setPicked(toggle(chosen, s.id))}
                        />
                        <span className={s.title ? "" : "text-muted"}>{sectionLabel(s.title)}</span>
                        <span
                          className="num ml-auto shrink-0 text-xs text-muted"
                          title={t("rv.lines", { n: s.end - s.start + 1 })}
                        >
                          {s.end - s.start + 1}
                        </span>
                      </label>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="label">{t("rv.aspects")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((a) => (
            <Chip key={a} on={aspects.has(a)} onClick={() => setAspects(toggle(aspects, a))}>
              {t(`rv.a.${a}` as MsgKey)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="label">{t("rv.rigor")}</legend>
        <div className="grid gap-1.5">
          {RIGORS.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer gap-2 rounded-lg border border-line p-2 hover:bg-raised has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="rigor"
                className="mt-0.5 accent-[var(--accent)]"
                checked={rigor === r}
                onChange={() => setRigor(r)}
              />
              <span>
                <span className="block text-sm font-medium">{t(`rv.rigor.${r}` as MsgKey)}</span>
                <span className="block text-xs text-muted">{t(`rv.rigor.${r}.d` as MsgKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="rv-focus" className="label mt-4">
        {t("rv.focus")}
      </label>
      <input
        id="rv-focus"
        className="input"
        value={focus}
        maxLength={300}
        placeholder={t("rv.focus.ph")}
        onChange={(e) => setFocus(e.target.value)}
      />

      {error && (
        <p
          role="alert"
          data-testid="review-error"
          className="mt-3 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-xs text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        disabled={busy || !enabled}
        onClick={() => void run()}
      >
        <ClipboardCheck aria-hidden className="h-4 w-4" />
        {busy ? t("rv.run.busy") : review ? t("rv.again") : t("rv.run")}
      </button>

      {review && (
        <section className="mt-6" aria-label={t("rv.report")} data-testid="review-result">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("rv.summary")}</h2>
            <span className="text-xs text-muted">
              {loaded
                ? `${loaded.userName} · ${fmtDate(loaded.createdAt)}`
                : saved
                  ? t("rv.sections.reviewed", { n: saved.sections })
                  : ""}
            </span>
          </div>
          <p className="mt-1 leading-6">{review.summary}</p>
          {saved?.truncated && (
            <p className="mt-2 text-xs text-[var(--warning)]">{t("rv.truncated")}</p>
          )}

          {Object.keys(review.scores).length > 0 && (
            <div className="mt-3">
              <p className="label">{t("rv.scores")}</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {ASPECTS.filter((a) => review.scores[a] !== undefined).map((a) => (
                  <li key={a} className="flex items-center justify-between text-xs">
                    <span>{t(`rv.a.${a}` as MsgKey)}</span>
                    <span className="num font-medium">{review.scores[a]}/5</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("rv.filter.sev")}
            >
              {SEVERITIES.map((s) => (
                <Chip key={s} on={!sevOff.has(s)} onClick={() => setSevOff(toggle(sevOff, s))}>
                  {t(`rv.sev.${s}` as MsgKey)} ·{" "}
                  {review.comments.filter((c) => c.severity === s).length}
                </Chip>
              ))}
            </div>
            {present.length > 1 && (
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("rv.filter.aspect")}
              >
                {present.map((a) => (
                  <Chip
                    key={a}
                    on={!aspectOff.has(a)}
                    onClick={() => setAspectOff(toggle(aspectOff, a))}
                  >
                    {t(`rv.a.${a}` as MsgKey)}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted">
            <span>{t("rv.count", { n: visible.length })}</span>
            <span className="flex items-center gap-3">
              {dismissed.size > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 py-1 hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center"
                  onClick={() => setShowDismissed((v) => !v)}
                >
                  {showDismissed ? (
                    <EyeOff aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <Eye aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {t("rv.dismissed", { n: dismissed.size })}
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 py-1 hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center"
                onClick={() => void copyReport()}
              >
                <ClipboardCopy aria-hidden className="h-3.5 w-3.5" />
                {copied ? t("rv.copied") : t("rv.copy")}
              </button>
              <button
                type="button"
                className={`inline-flex items-center py-1 hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center ${
                  confirmClear ? "text-danger" : ""
                }`}
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    return;
                  }
                  setConfirmClear(false);
                  write(projectId, null);
                  setLoaded(null);
                  setStates({});
                }}
                onBlur={() => setConfirmClear(false)}
              >
                {confirmClear ? t("common.confirm") : t("rv.clear")}
              </button>
            </span>
          </div>

          {visible.length === 0 ? (
            <p className="mt-4 text-xs text-muted">{t("rv.none")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {visible.map(({ c, i }) => (
                <li
                  key={i}
                  data-testid="review-comment"
                  className={`rounded-lg border border-line bg-surface p-3 ${
                    states[String(i)] ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className={`rounded-full px-2 py-0.5 ${SEV_PILL[c.severity]}`}>
                      {t(`rv.sev.${c.severity}` as MsgKey)}
                    </span>
                    <span className="text-muted">{t(`rv.a.${c.aspect}` as MsgKey)}</span>
                    {states[String(i)] === "resolved" && (
                      <span className="rounded-full bg-[var(--pill-neutral-bg)] px-2 py-0.5 text-[var(--pill-neutral-ink)]">
                        {t("rv.state.resolved")}
                      </span>
                    )}
                    {c.file && c.line ? (
                      <button
                        type="button"
                        className="num ml-auto rounded px-1.5 py-1 text-accent hover:bg-accent-soft [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center"
                        title={t("rv.go")}
                        onClick={() => onOpenAt(c.file!, c.line!)}
                      >
                        {c.file}:{c.line}
                      </button>
                    ) : (
                      <span className="ml-auto text-muted">{t("rv.general")}</span>
                    )}
                    <button
                      type="button"
                      className={`rounded p-1.5 hover:bg-raised hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11 ${
                        states[String(i)] === "resolved" ? "text-ok" : "text-muted"
                      }`}
                      aria-label={t("rv.state.resolve")}
                      title={
                        states[String(i)] === "resolved"
                          ? t("rv.state.resolved")
                          : t("rv.state.resolve")
                      }
                      onClick={() => markState(i, "resolved")}
                    >
                      <Check aria-hidden className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted hover:bg-raised hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
                      aria-label={dismissed.has(i) ? t("rv.restore") : t("rv.dismiss")}
                      title={dismissed.has(i) ? t("rv.restore") : t("rv.dismiss")}
                      onClick={() => markState(i, "dismissed")}
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {c.quote && (
                    <p className="mt-2 border-l-2 border-control pl-2 text-xs text-muted italic">
                      {c.quote}
                    </p>
                  )}
                  <p className="mt-2 leading-6">{c.comment}</p>
                  {c.suggestion && (
                    <p className="mt-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-[13px] leading-5">
                      <span className="font-medium">{t("rv.suggest")}: </span>
                      {c.suggestion}
                    </p>
                  )}
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onRequestFix(fixInstruction(c))}
                    >
                      <Wand2 aria-hidden className="h-3.5 w-3.5" />
                      {t("rv.fix.button")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {review && (
        <section className="mt-6" aria-label={t("rv.history.title")} data-testid="review-history">
          <h2 className="text-sm font-semibold">{t("rv.history.title")}</h2>
          {hist === null ? null : hist.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("rv.history.empty")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {hist.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-2 text-[13px]"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate py-1 text-left hover:text-ink"
                    aria-label={t("rv.history.load")}
                    aria-current={loaded?.id === h.id || undefined}
                    onClick={() => void loadReview(h.id)}
                  >
                    <span className="font-medium">{h.userName}</span>
                    <span className="text-muted">
                      {" "}
                      · {fmtDate(h.createdAt)} · {t("rv.history.aspects", { n: h.aspects.length })}
                    </span>
                  </button>
                  {ownUid === h.userId && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-1.5 text-muted hover:bg-raised hover:text-ink [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
                      aria-label={t("rv.history.delete")}
                      title={t("rv.history.delete")}
                      onClick={() => void removeReview(h.id)}
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hist && hist.filter((h) => h.id !== savedId).length > 0 && (
            <div className="mt-3">
              <label htmlFor="rv-compare" className="label">
                {t("rv.compare.title")}
              </label>
              <select
                id="rv-compare"
                className="select h-7 text-xs"
                value={compareId}
                onChange={(e) => void runCompare(e.target.value)}
              >
                <option value="">{t("rv.compare.pick")}</option>
                {hist
                  .filter((h) => h.id !== savedId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.userName} · {fmtDate(h.createdAt)}
                    </option>
                  ))}
              </select>
              {compare && (
                <p
                  className="mt-2 flex flex-wrap gap-1.5 text-xs"
                  data-testid="review-compare"
                  aria-live="polite"
                >
                  <span className="rounded-full bg-[var(--pill-neutral-bg)] px-2.5 py-1 text-[var(--pill-neutral-ink)]">
                    {t("rv.compare.resolved", { n: compare.counts.resolved })}
                  </span>
                  <span className="rounded-full bg-[var(--pill-neutral-bg)] px-2.5 py-1 text-[var(--pill-neutral-ink)]">
                    {t("rv.compare.added", { n: compare.counts.added })}
                  </span>
                  <span className="rounded-full bg-[var(--pill-neutral-bg)] px-2.5 py-1 text-[var(--pill-neutral-ink)]">
                    {t("rv.compare.open", { n: compare.counts.open })}
                  </span>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-6" aria-label={t("letter.title")} data-testid="letter-section">
        <details open={letterOpen} onToggle={(e) => setLetterOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer select-none py-1 text-sm font-semibold">
            {t("letter.title")}
          </summary>
          <div className="mt-2 space-y-3">
            <div>
              <label htmlFor="letter-review" className="label">
                {t("letter.review")}
              </label>
              <select
                id="letter-review"
                className="select h-7 text-xs"
                value={letterSel}
                onChange={(e) => void pickLetterReview(e.target.value)}
              >
                <option value="">{t("letter.review.none")}</option>
                {saved?.review && !saved.savedId && (
                  <option value="local">{t("letter.review.current")}</option>
                )}
                {(hist ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.userName} · {fmtDate(h.createdAt)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="letter-pasted" className="label">
                {t("letter.pasted")}
              </label>
              <textarea
                id="letter-pasted"
                className="input min-h-[6.5rem] resize-y text-xs"
                rows={8}
                placeholder={t("letter.pasted.ph")}
                value={letterSrc}
                onChange={(e) => setLetterSrc(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="letter-snapshot" className="label">
                {t("letter.snapshot")}
              </label>
              <select
                id="letter-snapshot"
                className="select h-7 text-xs"
                value={letterSnapId}
                onChange={(e) => setLetterSnapId(e.target.value)}
              >
                <option value="">{t("letter.snapshot.none")}</option>
                {(letterSnaps ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || fmtDate(s.createdAt)}
                  </option>
                ))}
              </select>
            </div>

            {letterError && (
              <p
                role="alert"
                data-testid="letter-error"
                className="rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-xs text-[var(--pill-negative-ink)]"
              >
                {letterError}
              </p>
            )}

            {letterItems.length === 0 ? (
              <p className="text-xs text-muted">{t("letter.empty")}</p>
            ) : (
              <>
                <p className="text-xs text-muted">{t("letter.count", { n: letterItems.length })}</p>
                <ul className="space-y-2" data-testid="letter-items">
                  {letterItems.map((it, i) => {
                    const key = keyOf(i, it);
                    return (
                      <li
                        key={key}
                        data-testid="letter-item"
                        className="rounded-lg border border-line bg-surface p-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          <span className="num font-medium">{it.id}</span>
                          <span className="text-muted">{it.reviewer}</span>
                          {it.severity && (
                            <span className={`rounded-full px-2 py-0.5 ${SEV_PILL[it.severity]}`}>
                              {t(`rv.sev.${it.severity}` as MsgKey)}
                            </span>
                          )}
                          {it.aiDraft && (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                              {t("letter.aiBadge")}
                            </span>
                          )}
                          {it.file && it.line != null && (
                            <button
                              type="button"
                              className="num ml-auto rounded px-1.5 py-1 text-accent hover:bg-accent-soft [@media(hover:none)]:min-h-11 [@media(hover:none)]:items-center"
                              title={t("rv.go")}
                              onClick={() => onOpenAt(it.file!, it.line!)}
                            >
                              {it.file}:{it.line}
                            </button>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {it.comment}
                        </p>
                        <label className="sr-only" htmlFor={`letter-r-${key}`}>
                          {it.id}
                        </label>
                        <textarea
                          id={`letter-r-${key}`}
                          className="input mt-1 min-h-[2.5rem] resize-y text-xs"
                          rows={2}
                          maxLength={4000}
                          placeholder={t("letter.response.ph")}
                          value={it.response}
                          onChange={(e) => setResponse(key, e.target.value)}
                        />
                      </li>
                    );
                  })}
                </ul>
                <div className="grid gap-1.5">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={letterBusy !== null || !enabled || !letterHasEmpty}
                    onClick={() => void letterDrafts()}
                  >
                    <Wand2 aria-hidden className="h-3.5 w-3.5" />
                    {letterBusy === "drafts" ? t("letter.drafts.busy") : t("letter.drafts")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={letterBusy !== null}
                    onClick={() => void createLetter()}
                  >
                    {letterBusy === "create" ? t("letter.create.busy") : t("letter.create")}
                  </button>
                </div>
              </>
            )}

            {letterDone && (
              <p
                role="status"
                data-testid="letter-done"
                className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--pill-neutral-bg)] px-3 py-2 text-xs text-[var(--pill-neutral-ink)]"
              >
                <span>
                  {t("letter.created", { path: letterDone.path })}
                  {letterDone.pages ? ` · ${t("letter.pages", { n: letterDone.pages })}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-sm shrink-0"
                  onClick={() =>
                    onOpenFile({
                      id: letterDone.fileId,
                      path: letterDone.path,
                      content: letterDone.content,
                      version: letterDone.version,
                    })
                  }
                >
                  {t("letter.open")}
                </button>
              </p>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
