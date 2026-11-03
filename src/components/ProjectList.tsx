"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

type Item = { id: string; name: string; files: number; updatedAt: string };

const RTF = {
  es: new Intl.RelativeTimeFormat("es"),
  en: new Intl.RelativeTimeFormat("en"),
  de: new Intl.RelativeTimeFormat("de"),
};

function ago(iso: string, lang: keyof typeof RTF) {
  let v = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Infinity],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return RTF[lang].format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

export function ProjectList({ initial, templateIds }: { initial: Item[]; templateIds: string[] }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  async function create(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim() || t("projects.name.placeholder");
    setBusy("create");
    setError(null);
    try {
      const { project } = await api<{ project: { id: string } }>("POST", "/api/projects", {
        name,
        template: String(form.get("template") ?? "article"),
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function importZip(file: File) {
    setBusy("import");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/projects/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      const skipped = (data.skipped as { path: string }[]).length;
      if (skipped) {
        const msg =
          lang === "en"
            ? `Imported. ${skipped} unsupported files were skipped.`
            : lang === "de"
              ? `Importiert. ${skipped} nicht unterstützte Dateien wurden übersprungen.`
              : `Importado. Se omitieron ${skipped} archivos no admitidos.`;
        sessionStorage.setItem(`folio:import:${data.project.id}`, msg);
      }
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
      setBusy(null);
    }
  }

  async function remove(item: Item) {
    if (!confirm(t("projects.delete.confirm", { name: item.name }))) return;
    try {
      await api("DELETE", `/api/projects/${item.id}`);
      setItems((xs) => xs.filter((x) => x.id !== item.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const tplName = (id: string) => t(`tpl.${id}.name` as MsgKey);
  const tplDesc = (id: string) => t(`tpl.${id}.desc` as MsgKey);

  return (
    <section aria-labelledby="projects-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="projects-title" className="text-[22px] leading-7 font-semibold">
            {t("projects.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {items.length === 0
              ? t("projects.empty.hint")
              : items.length === 1
                ? t("projects.count.one")
                : t("projects.count", { n: items.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importZip(f);
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => zipInput.current?.click()}
            disabled={busy !== null}
          >
            {busy === "import" ? t("projects.import.busy") : t("projects.import")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dialog.current?.showModal()}
          >
            {t("projects.new")}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-control px-6 py-14">
          <p className="text-base font-medium">{t("projects.empty.head")}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t("projects.empty.body")}</p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => dialog.current?.showModal()}
          >
            {t("projects.empty.cta")}
          </button>
        </div>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-4 font-medium">{t("projects.title")}</th>
              <th className="num hidden py-2 pr-4 text-right font-medium sm:table-cell">
                {t("projects.files")}
              </th>
              <th className="py-2 pr-4 font-medium">{t("projects.edited")}</th>
              <th className="py-2">
                <span className="sr-only">{t("projects.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="group border-b border-rule hover:bg-raised">
                <td className="max-w-0 py-0 pr-4">
                  <Link href={`/projects/${p.id}`} className="block truncate py-3 font-medium">
                    {p.name}
                  </Link>
                </td>
                <td className="num hidden py-3 pr-4 text-right text-muted sm:table-cell">
                  {p.files}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-muted">{ago(p.updatedAt, lang)}</td>
                <td className="w-0 py-2 text-right">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    onClick={() => remove(p)}
                    aria-label={`${t("projects.delete")} ${p.name}`}
                  >
                    {t("projects.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dialog
        ref={dialog}
        className="m-auto w-[min(640px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop:bg-black/30 /* taste-skill-ignore shadow: modal dialog = real overlay */"
        aria-labelledby="new-project-title"
      >
        <form onSubmit={create} className="p-5">
          <h2 id="new-project-title" className="text-base font-semibold">
            {t("projects.new")}
          </h2>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
            >
              {error}
            </p>
          )}
          <label htmlFor="new-project" className="label mt-4">
            {t("projects.name")}
          </label>
          <input
            id="new-project"
            name="name"
            className="input"
            placeholder={t("projects.name.placeholder")}
            maxLength={120}
            autoFocus
          />
          <fieldset className="mt-4">
            <legend className="label">{t("projects.template")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {templateIds.map((id, i) => (
                <label
                  key={id}
                  className="flex cursor-pointer gap-2.5 rounded-lg border border-line p-3 hover:bg-raised has-[:checked]:border-accent has-[:checked]:bg-accent-soft sm:[&:last-child:nth-child(odd)]:col-span-2"
                >
                  <input
                    type="radio"
                    name="template"
                    value={id}
                    defaultChecked={i === 0}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{tplName(id)}</span>
                    <span className="block text-xs text-muted">{tplDesc(id)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              {t("projects.cancel")}
            </button>
            <button className="btn btn-primary" disabled={busy !== null}>
              {busy === "create" ? t("projects.create.busy") : t("projects.create")}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
