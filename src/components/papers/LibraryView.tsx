"use client";

// The project's own bibliography: every .bib entry with its citation state,
// one click to insert, explore or reveal in the editor.

import { useMemo, useState } from "react";
import { Check, FileCode, Network, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { surname, type BibEntry } from "@/lib/bib-entries";

type Sort = "bib" | "year" | "title" | "unused";

const family = (a: string[]) => {
  const names = a.map(surname).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
};

export function LibraryView({
  entries,
  citedKeys,
  canCite,
  onInsert,
  onExplore,
  onOpenEntry,
  onOpenGraph,
}: {
  entries: BibEntry[];
  citedKeys: Set<string>;
  canCite: boolean;
  onInsert: (key: string) => void;
  onExplore: (entry: BibEntry) => void;
  onOpenEntry: (entry: BibEntry) => void;
  onOpenGraph: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("bib");

  const withDoi = useMemo(() => entries.filter((e) => e.doi).length, [entries]);
  const unused = useMemo(
    () => entries.filter((e) => !citedKeys.has(e.key)).length,
    [entries, citedKeys],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q
      ? entries.filter((e) =>
          `${e.title} ${e.authors.join(" ")} ${e.key}`.toLowerCase().includes(q),
        )
      : entries;
    const by: Record<Sort, (a: BibEntry, b: BibEntry) => number> = {
      bib: () => 0,
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      title: (a, b) => a.title.localeCompare(b.title),
      unused: (a, b) => Number(citedKeys.has(a.key)) - Number(citedKeys.has(b.key)),
    };
    return [...hit].sort(by[sort]);
  }, [entries, query, sort, citedKeys]);

  if (entries.length === 0) {
    return (
      <div className="p-4">
        <h3 className="label">{t("lib.title")}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{t("lib.none")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="library-view">
      <div className="shrink-0 space-y-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="label !mb-0">{t("lib.title")}</h3>
          <p className="num text-xs text-muted">
            {t("lib.summary", {
              n: entries.length,
              cited: entries.length - unused,
              unused,
            })}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm w-full"
          disabled={withDoi === 0}
          onClick={onOpenGraph}
          title={withDoi === 0 ? t("lib.explore.off") : t("lib.graph.hint")}
          data-testid="lib-graph"
        >
          <Network size={13} aria-hidden /> {t("lib.graph")}
          <span className="num ml-auto text-[11px] font-normal text-muted">
            {t("lib.inGraph", { n: withDoi })}
          </span>
        </button>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("lib.filter.ph")}</span>
            <Search
              size={13}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted"
            />
            <input
              className="input h-7 pl-7 text-[13px]"
              placeholder={t("lib.filter.ph")}
              value={query}
              maxLength={80}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">{t("lib.sort")}</span>
            <select
              className="select h-7 text-[13px]"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="bib">{t("lib.sort.bib")}</option>
              <option value="year">{t("lib.sort.year")}</option>
              <option value="title">{t("lib.sort.title")}</option>
              <option value="unused">{t("lib.sort.unused")}</option>
            </select>
          </label>
        </div>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
        {visible.map((e) => {
          const cited = citedKeys.has(e.key);
          return (
            <li key={`${e.file}:${e.key}`} className="px-3 py-2.5" data-testid="lib-entry">
              <p className="line-clamp-2 text-[13px] leading-[18px] font-medium">
                {e.title || e.key}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                {/* the venue must survive: the meta line wraps instead of
                    truncating everything after the authors */}
                <span className="min-w-0">
                  {[family(e.authors), e.year, e.venue].filter(Boolean).join(" · ")}
                </span>
                <code className="rounded border border-line px-1 py-px font-mono text-[11px]">
                  {e.key}
                </code>
                {cited ? (
                  <span className="flex items-center gap-0.5 text-ok">
                    <Check size={11} aria-hidden />
                    <span className="sr-only">{t("lib.cited")}</span>
                    {t("lib.cited")}
                  </span>
                ) : (
                  <span className="pill bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]">
                    {t("lib.unused")}
                  </span>
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!canCite}
                  title={canCite ? undefined : t("lib.insert.off")}
                  onClick={() => onInsert(e.key)}
                >
                  {t("lib.insert")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!e.doi}
                  title={e.doi ? undefined : t("lib.explore.off")}
                  onClick={() => onExplore(e)}
                >
                  <Network size={12} aria-hidden /> {t("lib.explore")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onOpenEntry(e)}
                >
                  <FileCode size={12} aria-hidden /> {t("lib.open")}
                </button>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && <li className="p-4 text-sm text-muted">{t("lib.nomatch")}</li>}
      </ul>
    </div>
  );
}
