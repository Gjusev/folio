"use client";

// The "Search" view of the Papers tab: one box, filters tucked in a popover,
// results as cards. Suggestions for the project live here too, as the idle state.

import { useRef, useState, type SubmitEvent } from "react";
import { Lightbulb, SlidersHorizontal } from "lucide-react";
import { useOutsideClose } from "@/components/workspace/useOutsideClose";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { GraphSeed } from "@/lib/graph-types";
import type { Paper, Source } from "@/lib/papers";
import { PaperCard } from "./PaperCard";

type Page = { results: Paper[]; hasMore: boolean };

export function SearchView({
  projectId,
  bibKeyOf,
  canCite,
  adding,
  onCite,
  onExplore,
}: {
  projectId: string;
  bibKeyOf: (item: { doi?: string; title: string }) => string | undefined;
  canCite: boolean;
  /** Id of the paper being cited right now. */
  adding: string | null;
  onCite: (p: Paper) => void;
  onExplore: (seed: GraphSeed) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | Source>("all");
  const [sort, setSort] = useState("relevance");
  const [oa, setOa] = useState(false);
  const [from, setFrom] = useState("");
  const [results, setResults] = useState<Paper[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "loadingMore" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [recs, setRecs] = useState<{ engine: string; results: Paper[] } | null>(null);
  const [recState, setRecState] = useState<"idle" | "loading">("idle");
  const lastQuery = useRef<{ q: string; page: number } | null>(null);
  const filtersRef = useOutsideClose();

  const activeFilters =
    (source !== "all" ? 1 : 0) + (sort !== "relevance" ? 1 : 0) + (oa ? 1 : 0) + (from ? 1 : 0);

  async function runQuery(query: string, page: number, mode: "search" | "more"): Promise<boolean> {
    setState(mode === "more" ? "loadingMore" : "loading");
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query,
        source,
        sort,
        oa: oa && source !== "arxiv" ? "1" : "0",
        page: String(page),
      });
      if (Number(from)) params.set("from", from);
      const r = await api<Page>("GET", `/api/papers/search?${params}`);
      setResults((old) => (mode === "more" ? [...(old ?? []), ...r.results] : r.results));
      setHasMore(r.hasMore);
      setState("idle");
      return true;
    } catch (err) {
      setState("error");
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
      return false;
    }
  }

  function search(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    if (filtersRef.current) filtersRef.current.open = false;
    lastQuery.current = { q: query, page: 1 };
    setRecs(null);
    void runQuery(query, 1, "search");
  }

  function loadMore() {
    const prev = lastQuery.current;
    if (!prev) return;
    const next = prev.page + 1;
    // The counter only advances on success: a failed page retries the same page.
    void runQuery(prev.q, next, "more").then((ok) => {
      if (ok && lastQuery.current === prev) prev.page = next;
    });
  }

  async function loadSuggestions() {
    setRecState("loading");
    setError(null);
    try {
      const r = await api<{ engine: string; results: Paper[] }>(
        "POST",
        `/api/projects/${projectId}/recommendations`,
        { limit: 15 },
      );
      setRecs(r);
      setResults(null);
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    } finally {
      setRecState("idle");
    }
  }

  const explore = (p: Paper) => onExplore({ source: p.source, paperId: p.id, title: p.title });
  const card = (p: Paper) => (
    <PaperCard
      key={`${p.source}:${p.id}`}
      p={p}
      bibKey={bibKeyOf(p)}
      canCite={canCite}
      adding={adding === p.id}
      onCite={onCite}
      onExplore={explore}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form onSubmit={search} className="shrink-0 space-y-2 border-b border-line p-3" role="search">
        <label htmlFor="paper-q" className="sr-only">
          {t("papers.search")}
        </label>
        <div className="flex gap-2">
          <input
            id="paper-q"
            name="q"
            className="input"
            placeholder={t("papers.placeholder")}
            minLength={2}
            maxLength={300}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-primary shrink-0" disabled={state === "loading"}>
            {state === "loading" ? t("common.loading") : t("papers.button")}
          </button>
        </div>

        <details className="relative" ref={filtersRef}>
          <summary className="btn btn-ghost btn-sm inline-flex cursor-pointer list-none">
            <SlidersHorizontal size={13} aria-hidden /> {t("ps.filters")}
            {activeFilters > 0 && (
              <span className="num rounded-full bg-accent px-1.5 text-[11px] leading-4 text-white">
                {activeFilters}
              </span>
            )}
          </summary>
          <div className="absolute left-0 z-20 mt-1 w-[min(18rem,calc(100vw-24px))] space-y-2.5 rounded-lg border border-line bg-surface p-3 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <label className="flex items-center justify-between gap-2">
              {t("papers.source")}
              <select
                className="select h-7 text-[13px]"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as "all" | Source);
                  setResults(null);
                  setHasMore(false);
                }}
              >
                <option value="all">{t("papers.source.all")}</option>
                <option value="openalex">{t("papers.source.openalex")}</option>
                <option value="s2">{t("papers.source.s2")}</option>
                <option value="arxiv">{t("papers.source.arxiv")}</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              {t("papers.sort")}
              <select
                className="select h-7 text-[13px]"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="relevance">{t("papers.sort.relevance")}</option>
                {source !== "s2" && <option value="cited">{t("papers.sort.cited")}</option>}
                <option value="recent">{t("papers.sort.recent")}</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              {t("papers.from")}
              <input
                type="number"
                min={1900}
                max={2100}
                className="select num h-7 w-20 text-[13px]"
                placeholder="2020"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            {source !== "arxiv" && (
              <label className="flex items-center gap-2 py-1 [@media(hover:none)]:min-h-11">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={oa}
                  onChange={(e) => setOa(e.target.checked)}
                />
                {t("papers.oa")}
              </label>
            )}
          </div>
        </details>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={state === "loading"}>
        {error && (
          <p
            role="alert"
            className="mx-3 mt-3 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-xs text-[var(--pill-negative-ink)]"
          >
            {error}
          </p>
        )}

        {state === "loading" && (
          <div className="space-y-2 p-3" aria-label={t("papers.searching")}>
            {[64, 40, 52, 36, 58].map((w, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-line p-2.5">
                <div className="h-3 rounded bg-raised" style={{ width: `${w}%` }} />
                <div className="mt-2 h-2 w-1/3 rounded bg-raised" />
              </div>
            ))}
          </div>
        )}

        {recs && state !== "loading" && (
          <section aria-labelledby="recs-title">
            <h3 id="recs-title" className="label border-b border-line px-3 py-2">
              {t("ps.suggest.title")}{" "}
              <span className="font-normal text-muted">
                (
                {recs.engine === "s2-list"
                  ? t("papers.rec.engine.s2")
                  : t("papers.rec.engine.related")}
                )
              </span>
            </h3>
            <ul className="divide-y divide-rule">{recs.results.map(card)}</ul>
          </section>
        )}

        {results && state !== "loading" && (
          <ul aria-label={t("papers.results")} className="divide-y divide-rule">
            {results.length === 0 && <li className="p-4 text-sm text-muted">{t("papers.none")}</li>}
            {results.map(card)}
          </ul>
        )}

        {hasMore && results && state !== "loading" && (
          <div className="p-3">
            <button
              type="button"
              className="btn w-full"
              onClick={loadMore}
              disabled={state !== "idle"}
            >
              {state === "loadingMore" ? t("common.loading") : t("papers.more")}
            </button>
          </div>
        )}

        {!results && !recs && state === "idle" && (
          <div className="space-y-4 p-4">
            <p className="text-sm text-muted">{t("papers.idle")}</p>
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb size={14} aria-hidden className="text-accent" /> {t("ps.suggest.title")}
              </p>
              <p className="mt-1 text-xs leading-4 text-muted">{t("ps.suggest.body")}</p>
              <button
                type="button"
                className="btn btn-sm mt-2"
                onClick={() => void loadSuggestions()}
                disabled={recState === "loading"}
                data-testid="suggestions"
              >
                {recState === "loading" ? t("common.loading") : t("ps.suggest.button")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
