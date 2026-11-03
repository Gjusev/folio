"use client";

import { createContext, useCallback, useContext } from "react";
import {
  DICTS,
  LANGS,
  LANG_COOKIE,
  format,
  type Dict,
  type Lang,
  type MsgKey,
} from "./dictionaries";

// Native names, always shown in their own language (WCAG language-of-parts friendly).
const NATIVE: Record<Lang, string> = { es: "Español", en: "English", de: "Deutsch" };

const I18nContext = createContext<{ lang: Lang; dict: Dict } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <I18nContext value={{ lang, dict: DICTS[lang] }}>{children}</I18nContext>;
}

/** t("pdf.page", { page: 2, pages: 10 }) inside client components. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n without I18nProvider");
  const t = useCallback(
    (key: MsgKey, vars?: Record<string, string | number>) => format(ctx.dict, key, vars),
    [ctx.dict],
  );
  return { t, lang: ctx.lang };
}

/** Small select that switches language by cookie + full refresh. */
export function LangSwitcher() {
  const { lang } = useI18n();
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      <span className="sr-only">Language</span>
      <select
        className="h-7 rounded-md border border-control bg-surface px-1 text-xs text-ink"
        value={lang}
        onChange={(e) => {
          document.cookie = `${LANG_COOKIE}=${e.target.value}; max-age=31536000; samesite=lax; path=/`;
          // A full reload re-renders server components with the new language.
          window.location.reload();
        }}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {NATIVE[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
