"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { ago, useI18n } from "@/lib/i18n/client";

/** One comment as served by GET /api/projects/[id]/comments. */
export type CommentDto = {
  id: string;
  fileId: string;
  filePath: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

/** Prefilled composer opened by the “Comment on selection” button. */
export type CommentDraft = {
  fileId: string;
  anchor: { start: number; end: number; quote: string };
};

type Props = {
  projectId: string;
  /** Access of the current user; resolve/reopen needs owner or editor. */
  role: "owner" | "editor" | "viewer";
  /** Author id of the current user (learned from their own posts). */
  myId: string | null;
  comments: CommentDto[] | null;
  error: string | null;
  draft: CommentDraft | null;
  /** Thread to scroll to after a gutter-marker click; cleared once shown. */
  focusId: string | null;
  /** Lands pending editor edits before an anchored comment is posted. */
  flush: () => Promise<unknown>;
  onClose: () => void;
  onMutated: () => void;
  onPosted: (c: CommentDto) => void;
  onDraftDone: () => void;
  onFocusHandled: () => void;
};

/**
 * Side drawer with every comment thread of the project, grouped open and
 * resolved. Data and permissions live in the API; this only renders and
 * mutates through it.
 */
export function CommentsDrawer({
  projectId,
  role,
  myId,
  comments,
  error,
  draft,
  focusId,
  flush,
  onClose,
  onMutated,
  onPosted,
  onDraftDone,
  onFocusHandled,
}: Props) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!focusId) return;
    list.current
      ?.querySelector(`[data-thread="${CSS.escape(focusId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    onFocusHandled();
  }, [focusId, onFocusHandled]);

  const canModerate = role === "owner" || role === "editor";
  const canDelete = (c: CommentDto) => role === "owner" || c.authorId === myId;

  /** Runs one API mutation, then refetches; failures surface inline. */
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      onMutated();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function post(payload: Record<string, unknown>) {
    // The server validates anchors against the stored content; flush first.
    await flush();
    const r = await api<{ comment: CommentDto }>(
      "POST",
      `/api/projects/${projectId}/comments`,
      payload,
    );
    return r.comment;
  }

  function sendNew() {
    if (!draft) return;
    void run(async () => {
      onPosted(await post({ fileId: draft.fileId, body, anchor: draft.anchor }));
      setBody("");
      onDraftDone();
    });
  }

  function sendReply(root: CommentDto) {
    void run(async () => {
      onPosted(await post({ fileId: root.fileId, body: replyBody, parentId: root.id }));
      setReplyBody("");
      setReplyTo(null);
    });
  }

  function toggleResolve(c: CommentDto) {
    void run(() =>
      api(
        "POST",
        `/api/projects/${projectId}/comments/${c.id}/${c.resolvedAt ? "reopen" : "resolve"}`,
      ),
    );
  }

  function remove(c: CommentDto) {
    void run(() => api("DELETE", `/api/projects/${projectId}/comments/${c.id}`));
  }

  const all = comments ?? [];
  const threads = all
    .filter((c) => !c.parentId)
    .map((root) => ({ root, replies: all.filter((c) => c.parentId === root.id) }))
    .sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt));
  const open = threads.filter((x) => !x.root.resolvedAt);
  const resolved = threads.filter((x) => x.root.resolvedAt);

  function thread({ root, replies }: (typeof threads)[number]) {
    return (
      <li key={root.id} data-thread={root.id} className="rounded-lg border border-line p-2.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{root.authorName}</span>
          <time className="shrink-0 text-xs text-muted" dateTime={root.createdAt}>
            {ago(root.createdAt, lang)}
          </time>
          {canDelete(root) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto shrink-0"
              aria-label={t("cm.delete")}
              disabled={busy}
              onClick={() => remove(root)}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          )}
        </div>
        {root.anchorQuote && (
          <p
            className="mt-1 truncate border-l-2 border-line pl-2 italic text-muted"
            title={root.anchorQuote}
          >
            «{root.anchorQuote}»
          </p>
        )}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{root.body}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              setReplyTo(replyTo === root.id ? null : root.id);
              setReplyBody("");
            }}
          >
            {t("cm.reply")}
          </button>
          {canModerate && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => toggleResolve(root)}
            >
              {root.resolvedAt ? t("cm.reopen") : t("cm.resolve")}
            </button>
          )}
          <span
            className="ml-auto max-w-32 truncate font-mono text-[10px] text-muted"
            title={root.filePath}
          >
            {root.filePath}
          </span>
        </div>
        {replyTo === root.id && (
          <form
            className="mt-1.5 space-y-1"
            onSubmit={(e) => {
              e.preventDefault();
              sendReply(root);
            }}
          >
            <textarea
              className="input h-14 py-1.5"
              placeholder={t("cm.ph.reply")}
              value={replyBody}
              maxLength={4000}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReplyTo(null)}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-sm" disabled={busy || !replyBody.trim()}>
                {busy ? t("cm.sending") : t("cm.send")}
              </button>
            </div>
          </form>
        )}
        {replies.length > 0 && (
          <ul className="mt-2 space-y-2 border-l border-line pl-2.5">
            {replies.map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{r.authorName}</span>
                  <time className="shrink-0 text-xs text-muted" dateTime={r.createdAt}>
                    {ago(r.createdAt, lang)}
                  </time>
                  {canDelete(r) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm ml-auto shrink-0"
                      aria-label={t("cm.delete")}
                      disabled={busy}
                      onClick={() => remove(r)}
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      role="dialog"
      aria-label={t("cm.title")}
      data-testid="comments-drawer"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:w-96" /* taste-skill-ignore shadow: floating drawer */
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t("cm.title")}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {draft && (
        <form
          className="shrink-0 space-y-1.5 border-b border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendNew();
          }}
        >
          <p
            className="truncate border-l-2 border-line pl-2 italic text-muted"
            title={draft.anchor.quote}
          >
            «{draft.anchor.quote}»
          </p>
          <textarea
            className="input h-16 py-1.5"
            placeholder={t("cm.ph.new")}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDraftDone}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !body.trim()}
            >
              {busy ? t("cm.sending") : t("cm.send")}
            </button>
          </div>
        </form>
      )}

      {(error ?? actionError) && (
        <p
          role="alert"
          className="shrink-0 bg-[var(--pill-negative-bg)] px-3 py-1.5 text-xs text-[var(--pill-negative-ink)]"
        >
          {error ?? actionError}
        </p>
      )}

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-3">
        {comments === null ? (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted">{t("cm.empty")}</p>
        ) : (
          <>
            {open.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  {t("cm.open")}
                </h3>
                <ul className="space-y-2">{open.map(thread)}</ul>
              </section>
            )}
            {resolved.length > 0 && (
              <section className={open.length ? "mt-4" : undefined}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  {t("cm.resolved")}
                </h3>
                <ul className="space-y-2 opacity-75">{resolved.map(thread)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
