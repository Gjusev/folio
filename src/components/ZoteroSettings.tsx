"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

type Collection = { key: string; name: string };
type Status = { configured: boolean; collections?: Collection[] };

export function ZoteroSettings({ sealConfigured }: { sealConfigured: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await api<Status>("GET", "/api/zotero"));
  }

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await api<Status>("GET", "/api/zotero"));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("PUT", "/api/zotero", { apiKey });
      setApiKey("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("zotero.delete") + "?")) return;
    setError(null);
    try {
      await api("DELETE", "/api/zotero");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("zotero.title")}</h2>
      <p className="max-w-2xl text-sm text-muted">{t("zotero.desc")}</p>

      {!sealConfigured && (
        <p className="rounded-lg bg-[var(--pill-warning-bg)] px-3 py-2 text-xs text-[var(--pill-warning-ink)]">
          {t("zotero.keyMissing")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}

      {status === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : status.configured ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--pill-positive-bg)] px-3 py-1 text-xs text-[var(--pill-positive-ink)]">
              {t("zotero.connected")}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()}>
              {t("zotero.delete")}
            </button>
          </div>
          <div>
            <h3 className="label">{t("zotero.collections")}</h3>
            {status.collections?.length ? (
              <>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {status.collections.map((c) => (
                    <li
                      key={c.key}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                    >
                      {c.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">{t("zotero.collections.limit")}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">{t("zotero.collections.empty")}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm sm:max-w-md">
            <span className="label">{t("zotero.apiKey")}</span>
            <input
              type="password"
              className="input font-mono text-xs"
              value={apiKey}
              autoComplete="off"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="text-xs text-muted">{t("zotero.apiKey.hint")}</span>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || apiKey.trim().length === 0}
            onClick={() => void save()}
          >
            {busy ? t("common.loading") : t("zotero.save")}
          </button>
        </div>
      )}
    </section>
  );
}
