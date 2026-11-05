"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ago, useI18n } from "@/lib/i18n/client";
import { tourEvent } from "@/components/onboarding/tasks";
import type { MsgKey } from "@/lib/i18n/dictionaries";

// api-tokens.ts is server-only; the client hardcodes its scope list.
const SCOPES = ["read", "write", "compile", "literature"] as const;
type Scope = (typeof SCOPES)[number];

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

const scopeLabel: Record<Scope, MsgKey> = {
  read: "settings.tokens.scope.read",
  write: "settings.tokens.scope.write",
  compile: "settings.tokens.scope.compile",
  literature: "settings.tokens.scope.literature",
};
const scopeHint: Record<Scope, MsgKey> = {
  read: "settings.tokens.scope.read.hint",
  write: "settings.tokens.scope.write.hint",
  compile: "settings.tokens.scope.compile.hint",
  literature: "settings.tokens.scope.literature.hint",
};

export function ApiTokensSettings() {
  const { t, lang } = useI18n();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(["read" as Scope]));
  const [created, setCreated] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { tokens: list } = await api<{ tokens: TokenRow[] }>("GET", "/api/tokens");
    setTokens(list);
  }

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  function toggleScope(s: Scope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const row = await api<{ token: string }>("POST", "/api/tokens", {
        name: name.trim(),
        scopes: [...scopes],
      });
      setCreated(row);
      setCopied(false);
      setName("");
      tourEvent("share-or-token");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api("DELETE", `/api/tokens/${id}`);
      setConfirmId(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("settings.tokens.title")}</h2>
      <p className="max-w-2xl text-sm text-muted">{t("settings.tokens.desc")}</p>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}

      {created && (
        <div className="sheet space-y-2 border-line p-4">
          <p className="text-sm font-medium">{t("settings.tokens.created")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs">
              {created.token}
            </code>
            <button type="button" className="btn btn-sm shrink-0" onClick={() => void copy()}>
              {copied ? t("settings.tokens.copied") : t("ai.copy")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("settings.tokens.copyNote")}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm sm:max-w-md">
          <span className="label mb-0">{t("settings.tokens.name")}</span>
          <input
            className="input"
            value={name}
            maxLength={60}
            placeholder={t("settings.tokens.name.ph")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || name.trim().length === 0 || scopes.size === 0}
          onClick={() => void create()}
        >
          {busy ? t("common.loading") : t("settings.tokens.create")}
        </button>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="label">{t("settings.tokens.scopes")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SCOPES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-1.5 py-1 text-sm [@media(hover:none)]:min-h-11"
              title={t(scopeHint[s])}
            >
              <input
                type="checkbox"
                className="size-4"
                checked={scopes.has(s)}
                onChange={() => toggleScope(s)}
              />
              {t(scopeLabel[s])}
            </label>
          ))}
        </div>
      </fieldset>

      {tokens === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted">{t("settings.tokens.empty")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {tokens.map((tok) => (
            <li
              key={tok.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
            >
              <span className="min-w-[8rem] font-medium">{tok.name}</span>
              <span className="font-mono text-xs text-muted">{tok.prefix}…</span>
              <span className="flex flex-wrap gap-1">
                {tok.scopes.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-[var(--pill-neutral-bg)] px-2 py-0.5 text-[10px] text-[var(--pill-neutral-ink)]"
                  >
                    {(SCOPES as readonly string[]).includes(s) ? t(scopeLabel[s as Scope]) : s}
                  </span>
                ))}
              </span>
              <span className="text-xs text-muted">
                {t("settings.tokens.lastUse")}:{" "}
                {tok.lastUsedAt ? ago(tok.lastUsedAt, lang) : t("settings.tokens.never")}
              </span>
              {confirmId === tok.id ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm ml-auto"
                  onClick={() => void remove(tok.id)}
                >
                  {t("settings.tokens.confirm")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm ml-auto"
                  onClick={() => setConfirmId(tok.id)}
                >
                  {t("settings.tokens.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
