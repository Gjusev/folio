"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { PRESETS, type Profile, type ProfileKind } from "@/lib/llm-presets";

type Routes = { search: string | null; draft: string | null; embed: string | null };

type FormState = {
  id: string | null;
  preset: string;
  label: string;
  kind: ProfileKind;
  baseUrl: string;
  apiKey: string;
  models: string;
  extraJson: string;
  enabled: boolean;
};

type Props = { initialProfiles: Profile[]; initialRoutes: Routes; sealConfigured: boolean };

const blankForm = (): FormState => ({
  id: null,
  preset: PRESETS[0].id,
  label: "",
  kind: PRESETS[0].kind,
  baseUrl: PRESETS[0].baseUrl,
  apiKey: "",
  models: PRESETS[0].models,
  extraJson: "",
  enabled: true,
});

export function LlmSettings({ initialProfiles, initialRoutes, sealConfigured }: Props) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [routes, setRoutes] = useState(initialRoutes);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [{ profiles: list }, r] = await Promise.all([
      api<{ profiles: Profile[] }>("GET", "/api/llm/profiles"),
      api<Routes>("GET", "/api/llm/routing"),
    ]);
    setProfiles(list);
    setRoutes(r);
  }

  function openNew() {
    setError(null);
    setTest("idle");
    setForm(blankForm());
  }

  function openEdit(p: Profile) {
    setError(null);
    setTest("idle");
    setForm({
      id: p.id,
      preset: "custom",
      label: p.label,
      kind: p.kind,
      baseUrl: p.baseUrl,
      apiKey: "",
      models: p.models.join(", "),
      extraJson: Object.keys(p.extra).length ? JSON.stringify(p.extra) : "",
      enabled: p.enabled,
    });
  }

  function setPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset || !form) return;
    setForm({
      ...form,
      preset: id,
      label: form.id ? form.label : preset.id === "custom" ? "" : preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      models: form.id ? form.models : preset.models,
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        label: form.label,
        kind: form.kind,
        baseUrl: form.baseUrl,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        models: form.models,
        extraJson: form.extraJson.trim() || undefined,
        ...(form.id ? { enabled: form.enabled } : {}),
      };
      await api(
        form.id ? "PATCH" : "POST",
        form.id ? `/api/llm/profiles/${form.id}` : "/api/llm/profiles",
        body,
      );
      await refresh();
      setForm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("settings.llm.delete") + "?")) return;
    setError(null);
    try {
      await api("DELETE", `/api/llm/profiles/${id}`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runTest() {
    if (!form) return;
    setTest("busy");
    setError(null);
    try {
      await api("POST", "/api/llm/test", {
        kind: form.kind,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.models.split(",")[0]?.trim() ?? "",
      });
      setTest("ok");
    } catch (err) {
      setTest("fail");
      setError((err as Error).message);
    }
  }

  // Editing a saved profile without retyping its key would test an empty key
  // (guaranteed 401); the stored key never leaves the server.
  const canTest = !form?.id || Boolean(form.apiKey);

  async function saveRoutes(next: Routes) {
    setRoutes(next);
    setError(null);
    try {
      await api("PUT", "/api/llm/routing", next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const routeSelect = (task: "search" | "draft" | "embed", label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="label">{label}</span>
      <select
        className="input h-9"
        value={routes[task] ?? ""}
        onChange={(e) => void saveRoutes({ ...routes, [task]: e.target.value || null })}
      >
        <option value="">{t("settings.routing.default")}</option>
        {profiles
          .filter((p) => !p.readonly) // the env profile is the automatic fallback
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.models[0] ?? ""}
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("settings.llm.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{t("settings.llm.desc")}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={openNew}>
            {t("settings.llm.add")}
          </button>
        </div>

        {!sealConfigured && (
          <p className="rounded-lg bg-[var(--pill-warning-bg)] px-3 py-2 text-xs text-[var(--pill-warning-ink)]">
            {t("settings.llm.keyMissing")}
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
        {saved && (
          <p role="status" className="text-sm text-ok">
            {t("common.saved")}
          </p>
        )}

        {form && (
          <div className="sheet space-y-3 border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="label">{t("settings.llm.preset")}</span>
                <select
                  className="input h-9"
                  value={form.preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="label">{t("settings.llm.label")}</span>
                <input
                  className="input"
                  value={form.label}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="label">{t("settings.llm.baseUrl")}</span>
                <input
                  className="input font-mono text-xs"
                  value={form.baseUrl}
                  placeholder="https://…"
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="label">{t("settings.llm.apiKey")}</span>
                <input
                  type="password"
                  className="input font-mono text-xs"
                  value={form.apiKey}
                  placeholder={form.id ? t("settings.llm.apiKey.keep") : undefined}
                  autoComplete="off"
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="label">{t("settings.llm.models")}</span>
                <input
                  className="input font-mono text-xs"
                  value={form.models}
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                />
                <span className="text-xs text-muted">{t("settings.llm.modelsHint")}</span>
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="label">{t("settings.llm.extra")}</span>
                <input
                  className="input font-mono text-xs"
                  value={form.extraJson}
                  placeholder='{"provider":{"data_collection":"deny"}}'
                  onChange={(e) => setForm({ ...form, extraJson: e.target.value })}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {t("settings.llm.save")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={test === "busy" || !canTest}
                onClick={() => void runTest()}
              >
                {test === "busy" ? t("settings.llm.testing") : t("settings.llm.test")}
              </button>
              {!canTest && (
                <span className="text-xs text-muted">{t("settings.llm.test.needKey")}</span>
              )}
              {test === "ok" && <span className="text-sm text-ok">{t("settings.llm.testOk")}</span>}
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                {t("settings.llm.cancel")}
              </button>
            </div>
          </div>
        )}

        {profiles.length === 0 ? (
          <p className="text-sm text-muted">{t("settings.llm.empty")}</p>
        ) : (
          <ul className="divide-y divide-line border border-line rounded-lg bg-surface">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="min-w-[8rem] font-medium">{p.label}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {p.baseUrl}
                </span>
                <span className="font-mono text-xs">
                  {p.models[0] ?? "—"}
                  {p.models.length > 1 ? ` +${p.models.length - 1}` : ""}
                </span>
                {p.readonly ? (
                  <span className="text-xs text-muted">{t("settings.llm.env")}</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEdit(p)}
                    >
                      {t("settings.llm.edit")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void remove(p.id)}
                    >
                      {t("settings.llm.delete")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("settings.routing.title")}</h2>
        <p className="max-w-2xl text-sm text-muted">{t("settings.routing.desc")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {routeSelect("search", t("settings.routing.search"))}
          {routeSelect("draft", t("settings.routing.draft"))}
          {routeSelect("embed", t("settings.routing.embed"))}
        </div>
      </section>
    </div>
  );
}
