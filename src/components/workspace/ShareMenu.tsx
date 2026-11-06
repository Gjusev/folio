"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { tourEvent } from "@/components/onboarding/tasks";
import { useOutsideClose } from "./useOutsideClose";

type Member = {
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

type Props = { projectId: string };

/** Share the project with co-authors (editor) or readers (viewer). Owner only. */
export function ShareMenu({ projectId }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [owner, setOwner] = useState<{ email: string; name: string } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const detailsRef = useOutsideClose();

  useEffect(() => {
    if (!open || members) return;
    api<{ owner: { email: string; name: string } | null; members: Member[] }>(
      "GET",
      `/api/projects/${projectId}/members`,
    )
      .then((r) => {
        setOwner(r.owner);
        setMembers(r.members);
      })
      .catch((err) => setError((err as Error).message));
  }, [open, members, projectId]);

  async function invite() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { emailed } = await api<{ emailed?: boolean }>(
        "POST",
        `/api/projects/${projectId}/members`,
        { email: email.trim(), role },
      );
      tourEvent("share-or-token");
      setMembers(null); // reload on next open/effect run
      setEmail("");
      setNote(emailed ? `${t("share.invited")} · ${t("share.emailed")}` : t("share.invited"));
      const r = await api<{ owner: { email: string; name: string } | null; members: Member[] }>(
        "GET",
        `/api/projects/${projectId}/members`,
      );
      setOwner(r.owner);
      setMembers(r.members);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await api("DELETE", `/api/projects/${projectId}/members/${userId}`);
      setMembers((m) => (m ?? []).filter((x) => x.userId !== userId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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
        title={t("share.title")}
        aria-label={t("share.title")}
      >
        <Share2 size={14} aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-line bg-surface p-3 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <p className="label">{t("share.title")}</p>
        <div className="mt-1.5 flex gap-1.5">
          <input
            className="input h-7 min-w-0 flex-1 text-xs"
            placeholder={t("share.email.ph")}
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && email.includes("@") && void invite()}
          />
          <select
            className="select h-7 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            aria-label={t("share.role")}
          >
            <option value="editor">{t("share.role.editor")}</option>
            <option value="viewer">{t("share.role.viewer")}</option>
          </select>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            disabled={busy || !email.includes("@")}
            onClick={() => void invite()}
          >
            {t("share.invite")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-muted">{t("share.hint")}</p>
        {error && (
          <p role="alert" className="mt-1.5 text-danger">
            {error}
          </p>
        )}
        {note && <p className="mt-1.5 text-ok">{note}</p>}
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {owner && (
            <li className="flex items-center justify-between gap-2 rounded-md border border-line p-1.5">
              <span className="min-w-0 truncate">
                {owner.name} <span className="text-muted">({owner.email})</span>
              </span>
              <span className="pill shrink-0">{t("share.role.owner")}</span>
            </li>
          )}
          {(members ?? []).map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-2 rounded-md border border-line p-1.5"
            >
              <span className="min-w-0 truncate">
                {m.name} <span className="text-muted">({m.email})</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="pill">
                  {m.role === "editor" ? t("share.role.editor") : t("share.role.viewer")}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void remove(m.userId)}
                  aria-label={t("share.remove")}
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {members && members.length === 0 && <li className="text-muted">{t("share.empty")}</li>}
          {members === null && (
            <li className="animate-pulse rounded-md border border-line p-1.5">
              <div className="h-3 w-2/3 rounded bg-raised" />
            </li>
          )}
        </ul>
      </div>
    </details>
  );
}
