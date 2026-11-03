import nextDynamic from "next/dynamic";
import { useRef, useState, useSyncExternalStore, type SubmitEvent } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { FileDoc } from "./document-store";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import type { GraphSeed } from "./GraphPanel";

// sigma touches WebGL2RenderingContext at import time: must never enter the SSR bundle.
const GraphPanel = nextDynamic(() => import("./GraphPanel"), { ssr: false });

type Source = "openalex" | "s2" | "arxiv";

type Paper = {
  source: Source;
  id: string;
  doi?: string;
  arxivId?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedBy: number;
  openAccessUrl?: string;
  abstract?: string;
};

type Upgrade = {
  key: string;
  title: string;
  suggestion: {
    source: "openalex";
    paperId: string;
    title: string;
    venue?: string;
    year?: number;
    doi?: string;
    citedBy: number;
  };
};

type Health = {
  defined: number;
  cited: number;
  unused: string[];
  undefined: string[];
  upgrades: Upgrade[];
};

type Props = {
  projectId: string;
  keys: string[];
  canCite: boolean;
  onCite: (key: string) => void;
  onBibUpdated: (file: FileDoc, key: string, added: boolean) => void;
  /** Syncs several server-side file changes (citation upgrades) into the editor. */
  onFilesUpdated?: (files: FileDoc[]) => void;
  /** Persists pending local edits before the server reads/rewrites the .bib. */
  flush?: () => Promise<void>;
};

function authorLine(a: string[]) {
  const family = a.map((n) => n.split(/\s+/).at(-1));
  return family.length > 3 ? `${family.slice(0, 3).join(", ")} et al.` : family.join(", ");
}

/** Which graph the panel shows: one paper's, or the whole bibliography's. */
type GraphView = { kind: "paper"; seed: GraphSeed } | { kind: "bib" } | null;

const SUBMISSION_KEYS: Record<string, MsgKey> = {
  citations: "papers.submission.citations",
  unused: "papers.submission.unused",
  todos: "papers.submission.todos",
  figures: "papers.submission.figures",
  abstract: "papers.submission.abstract",
  keywords: "papers.submission.keywords",
};

/** One search box; free engines (OpenAlex, Semantic Scholar, arXiv) as filters. */
export function PaperSearch({
  projectId,
  keys,
  canCite,
  onCite,
  onBibUpdated,
  onFilesUpdated,
  flush,
}: Props) {
  const { t, lang } = useI18n();
  const [source, setSource] = useState<"all" | Source>("all");
  const [results, setResults] = useState<Paper[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "loadingMore" | "error">("idle");
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // One paper's graph, or the whole bibliography's; "back" walks the chain.
  const [graphView, setGraphView] = useState<GraphView>(null);
  const [graphHistory, setGraphHistory] = useState<GraphView[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthState, setHealthState] = useState<"idle" | "loading" | "error">("idle");
  const [sub, setSub] = useState<{
    checks: { id: string; ok: boolean; detail: string }[];
    words: number | null;
  } | null>(null);
  const [subState, setSubState] = useState<"idle" | "loading" | "error">("idle");
  const [upgrading, setUpgrading] = useState<string | null>(null);
  // WebGL cannot render during SSR: false on the server, true after hydration.
  const graphReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [recs, setRecs] = useState<{ engine: string; results: Paper[] } | null>(null);
  const [recState, setRecState] = useState<"idle" | "loading" | "error">("idle");
  const lastQuery = useRef<{
    q: string;
    sort: string;
    oa: boolean;
    from?: number;
    page: number;
  } | null>(null);
  const nf = new Intl.NumberFormat(lang);

  async function runQuery(
    q: string,
    sort: string,
    oa: boolean,
    from: number | undefined,
    page: number,
    mode: "search" | "more",
  ): Promise<boolean> {
    setState(mode === "more" ? "loadingMore" : "loading");
    setMessage(null);
    try {
      const params = new URLSearchParams({
        q,
        source,
        sort,
        oa: oa ? "1" : "0",
        page: String(page),
      });
      if (from) params.set("from", String(from));
      const r = await api<{ results: Paper[]; hasMore: boolean }>(
        "GET",
        `/api/papers/search?${params}`,
      );
      setResults((old) => (mode === "more" ? [...(old ?? []), ...r.results] : r.results));
      setHasMore(r.hasMore);
      setState("idle");
      return true;
    } catch (err) {
      setState("error");
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
      return false;
    }
  }

  async function search(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const q = String(form.get("q") ?? "").trim();
    if (q.length < 2) return;
    const query = {
      q,
      sort: String(form.get("sort") ?? "relevance"),
      oa: Boolean(form.get("oa")) && source !== "arxiv",
      from: Number(form.get("from")) || undefined,
      page: 1,
    };
    lastQuery.current = query;
    void runQuery(query.q, query.sort, query.oa, query.from, 1, "search");
  }

  function loadMore() {
    const prev = lastQuery.current;
    if (!prev) return;
    const next = prev.page + 1;
    // The page counter only advances on success; a failed page must retry the
    // same page instead of silently skipping it.
    void runQuery(prev.q, prev.sort, prev.oa, prev.from, next, "more").then((ok) => {
      if (ok && lastQuery.current === prev) prev.page = next;
    });
  }

  function changeSource(next: "all" | Source) {
    setSource(next);
    setResults(null);
    setHasMore(false);
    setState("idle");
    setMessage(null);
  }

  async function citeById(source: Source, paperId: string, cite: boolean) {
    setAdding(paperId);
    setMessage(null);
    try {
      // The server appends to the stored .bib; land our pending edits first
      // or its response would clobber them (see replaceFromServer).
      await flush?.();
      const r = await api<{ key: string; added: boolean; file: FileDoc }>(
        "POST",
        `/api/projects/${projectId}/citations`,
        { source, paperId },
      );
      onBibUpdated(r.file, r.key, r.added);
      if (cite && canCite) onCite(r.key);
      setMessage({
        text: r.added
          ? t("papers.cited.inserted", { file: r.file.path, key: r.key })
          : t("papers.cited.existing", { file: r.file.path, key: r.key }),
      });
    } catch (err) {
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    } finally {
      setAdding(null);
    }
  }

  async function add(p: Paper, cite: boolean) {
    await citeById(p.source, p.id, cite);
  }

  async function loadRecommendations() {
    setRecState("loading");
    setMessage(null);
    try {
      const r = await api<{ engine: string; results: Paper[] }>(
        "POST",
        `/api/projects/${projectId}/recommendations`,
        { limit: 15 },
      );
      setRecs(r);
      setRecState("idle");
    } catch (err) {
      setRecState("error");
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    }
  }

  /** Cross-checks the bibliography against the \cite commands actually used. */
  async function loadHealth() {
    setHealthState("loading");
    setMessage(null);
    try {
      const r = await api<Health>("GET", `/api/projects/${projectId}/citations/health`);
      setHealth(r);
      setHealthState("idle");
    } catch (err) {
      setHealthState("error");
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    }
  }

  /** Honest pre-submission checks: citations, TODOs, figures, words. */
  async function loadSubmission() {
    setSubState("loading");
    setMessage(null);
    try {
      const r = await api<{
        checks: { id: string; ok: boolean; detail: string }[];
        words: number | null;
      }>("GET", `/api/projects/${projectId}/submission-check`);
      setSub(r);
      setSubState("idle");
    } catch (err) {
      setSubState("error");
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    }
  }

  /** Replaces an arXiv preprint entry with its published version. */
  async function upgrade(u: Upgrade) {
    setUpgrading(u.key);
    setMessage(null);
    try {
      // The server rewrites the .bib and every \cite; land local edits first.
      await flush?.();
      const r = await api<{ key: string; texFiles: number; files: FileDoc[] }>(
        "POST",
        `/api/projects/${projectId}/citations/upgrade`,
        { source: u.suggestion.source, paperId: u.suggestion.paperId, oldKey: u.key },
      );
      onFilesUpdated?.(r.files);
      setMessage({
        text: t("papers.health.upgraded", { old: u.key, key: r.key, n: String(r.texFiles) }),
      });
      void loadHealth(); // the list changed: refresh it
    } catch (err) {
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    } finally {
      setUpgrading(null);
    }
  }

  const sources: {
    id: Source;
    key: "papers.source.openalex" | "papers.source.s2" | "papers.source.arxiv";
  }[] = [
    { id: "openalex", key: "papers.source.openalex" },
    { id: "s2", key: "papers.source.s2" },
    { id: "arxiv", key: "papers.source.arxiv" },
  ];

  if (graphView && graphReady) {
    const keyOf = (v: NonNullable<GraphView>) =>
      v.kind === "bib" ? "bib" : `${v.seed.source}:${v.seed.paperId}`;
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Cite feedback must survive the view switch: the banner lives here. */}
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`shrink-0 px-3 pt-2 text-xs ${
              message.error ? "text-[var(--pill-negative-ink)]" : "text-[var(--pill-positive-ink)]"
            }`}
          >
            {message.text}
          </p>
        )}
        <div className="min-h-0 flex-1">
          <GraphPanel
            key={keyOf(graphView)}
            projectId={projectId}
            mode={graphView.kind === "bib" ? "bib" : "paper"}
            seed={
              graphView.kind === "paper"
                ? graphView.seed
                : { source: "openalex", paperId: "", title: "" }
            }
            onBack={() => {
              // Walk back through re-seeds; the last back exits to the search.
              setGraphView(graphHistory.at(-1) ?? null);
              setGraphHistory((h) => h.slice(0, -1));
            }}
            onCite={(paperId) => void citeById("openalex", paperId, true)}
            onReseed={(next) => {
              setGraphHistory((h) => [...h.slice(-9), graphView]);
              setGraphView({ kind: "paper", seed: next });
            }}
            adding={adding !== null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadRecommendations()}
            disabled={recState === "loading"}
            title={t("papers.rec.engine.s2")}
          >
            {recState === "loading" ? t("common.loading") : t("papers.rec.button")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setGraphHistory([]);
              setGraphView({ kind: "bib" });
            }}
            disabled={!graphReady}
            title={t("papers.graph.bibButton.title")}
          >
            {t("papers.graph.bibButton")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadHealth()}
            disabled={healthState === "loading"}
          >
            {healthState === "loading" ? t("common.loading") : t("papers.health.button")}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={subState === "loading"}
            onClick={() => void loadSubmission()}
          >
            {subState === "loading" ? t("common.loading") : t("papers.submission.button")}
          </button>
        </div>
      </div>

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
          />
          <button className="btn btn-primary shrink-0" disabled={state === "loading"}>
            {state === "loading" ? t("common.loading") : t("papers.button")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <label htmlFor="paper-source" className="sr-only">
            {t("papers.source")}
          </label>
          <select
            id="paper-source"
            value={source}
            className="select h-7 text-xs"
            onChange={(e) => changeSource(e.target.value as "all" | Source)}
          >
            <option value="all">{t("papers.source.all")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.key)}
              </option>
            ))}
          </select>
          <label htmlFor="paper-sort" className="sr-only">
            {t("papers.sort")}
          </label>
          <select id="paper-sort" name="sort" className="select h-7 text-xs">
            <option value="relevance">{t("papers.sort.relevance")}</option>
            {source !== "s2" && <option value="cited">{t("papers.sort.cited")}</option>}
            <option value="recent">{t("papers.sort.recent")}</option>
          </select>
          {source !== "arxiv" && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="oa" className="accent-[var(--accent)]" />{" "}
              {t("papers.oa")}
            </label>
          )}
          <label className="flex items-center gap-1.5">
            {t("papers.from")}
            <input
              name="from"
              type="number"
              min={1900}
              max={2100}
              className="select num h-7 w-20 text-xs"
              placeholder="2020"
            />
          </label>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={state === "loading"}>
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`mx-3 mt-3 rounded-md px-3 py-2 text-xs ${
              message.error
                ? "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
                : "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
            }`}
          >
            {message.text}
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
          <section aria-labelledby="recs-title" className="border-b border-line px-3 py-3">
            <h3 id="recs-title" className="label">
              {t("papers.rec.title")}{" "}
              <span className="text-muted">
                (
                {recs.engine === "s2-list"
                  ? t("papers.rec.engine.s2")
                  : t("papers.rec.engine.related")}
                )
              </span>
            </h3>
            <ul className="mt-1 divide-y divide-rule">
              {recs.results.map((p) => (
                <li key={`${p.source}:${p.id}`} className="py-2">
                  <p className="text-sm leading-5 font-medium">{p.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[authorLine(p.authors), p.year, p.venue].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => add(p, true)}
                      disabled={adding !== null}
                    >
                      {adding === p.id
                        ? t("papers.adding")
                        : canCite
                          ? t("papers.cite")
                          : t("papers.add")}
                    </button>
                    <span className="num text-xs text-muted">
                      {p.citedBy > 0 &&
                        `${nf.format(p.citedBy)} ${p.citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results && state !== "loading" && (
          <ul aria-label={t("papers.results")} className="divide-y divide-rule">
            {results.length === 0 && <li className="p-4 text-sm text-muted">{t("papers.none")}</li>}
            {results.map((p) => (
              <li key={`${p.source}:${p.id}`} className="px-3 py-3">
                <p className="text-sm leading-5 font-medium">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {[authorLine(p.authors), p.year, p.venue].filter(Boolean).join(" · ")}
                </p>
                <p className="num mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {p.citedBy > 0 && (
                    <span>
                      {nf.format(p.citedBy)}{" "}
                      {p.citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}
                    </span>
                  )}
                  {p.openAccessUrl && (
                    <span className="pill bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]">
                      {t("papers.oaBadge")}
                    </span>
                  )}
                  {p.source === "s2" && (
                    <span className="pill bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]">
                      S2
                    </span>
                  )}
                  {p.source === "arxiv" && (
                    <span className="pill bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]">
                      {p.arxivId ?? p.id}
                    </span>
                  )}
                </p>
                {p.abstract && (
                  <p
                    className={`mt-1.5 text-xs leading-[18px] text-muted ${open === p.id ? "" : "line-clamp-2"}`}
                  >
                    {p.abstract}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => add(p, true)}
                    disabled={adding !== null}
                    title={canCite ? t("papers.cite.title.on") : t("papers.cite.title.off")}
                  >
                    {adding === p.id
                      ? t("papers.adding")
                      : canCite
                        ? t("papers.cite")
                        : t("papers.add")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setGraphHistory([]);
                      setGraphView({
                        kind: "paper",
                        seed: { source: p.source, paperId: p.id, title: p.title },
                      });
                    }}
                    disabled={!graphReady}
                  >
                    {t("papers.graph")}
                  </button>
                  {p.abstract && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                    >
                      {open === p.id ? t("papers.abstract.hide") : t("papers.abstract")}
                    </button>
                  )}
                  {(p.openAccessUrl || p.doi) && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={p.openAccessUrl ?? `https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {p.openAccessUrl ? t("papers.read") : "DOI"}
                    </a>
                  )}
                </div>
              </li>
            ))}
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

        {!results && state === "idle" && (
          <p className="p-4 text-sm text-muted">{t("papers.idle")}</p>
        )}

        {sub && subState === "idle" && (
          <div className="shrink-0 border-b border-line p-3">
            <h3 className="label">{t("papers.submission.title")}</h3>
            <ul className="space-y-1">
              {sub.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-1.5 text-xs">
                  <span aria-hidden className={c.ok ? "text-ok" : "text-danger"}>
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <span className="min-w-0">
                    {t(SUBMISSION_KEYS[c.id] ?? "papers.submission.title")}{" "}
                    <span className="text-muted">— {c.detail}</span>
                  </span>
                </li>
              ))}
              {sub.words !== null && (
                <li className="num text-xs text-muted">
                  {t("papers.submission.words")}: {sub.words.toLocaleString(lang)}
                </li>
              )}
            </ul>
          </div>
        )}

        {health && healthState === "idle" && (
          <section aria-labelledby="health-title" className="border-b border-line px-3 py-3">
            <h3 id="health-title" className="label">
              {t("papers.health.title")}{" "}
              <span className="num text-muted">
                ({health.cited}/{health.defined})
              </span>
            </h3>
            {health.undefined.length > 0 && (
              <p className="mt-1.5 text-xs text-[var(--pill-negative-ink)]">
                {t("papers.health.undefined", { n: String(health.undefined.length) })}:{" "}
                <span className="font-mono">{health.undefined.join(", ")}</span>
              </p>
            )}
            {health.unused.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-xs text-muted">
                  {t("papers.health.unused", { n: String(health.unused.length) })}
                </summary>
                <p className="mt-1 font-mono text-[11px] text-muted">{health.unused.join(", ")}</p>
              </details>
            )}
            {health.upgrades.length > 0 && (
              <ul className="mt-2 space-y-2">
                {health.upgrades.map((u) => (
                  <li key={u.key} className="rounded-md border border-line p-2">
                    <p className="text-xs leading-4">
                      <span className="font-mono">{u.key}</span>: {t("papers.health.preprint")}
                    </p>
                    <p className="mt-0.5 text-xs font-medium">{u.suggestion.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[u.suggestion.venue, u.suggestion.year].filter(Boolean).join(" · ")}
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm mt-1.5"
                      onClick={() => void upgrade(u)}
                      disabled={upgrading !== null}
                    >
                      {upgrading === u.key ? t("papers.adding") : t("papers.health.upgrade")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {health.undefined.length === 0 &&
              health.unused.length === 0 &&
              health.upgrades.length === 0 && (
                <p className="mt-1 text-xs text-[var(--pill-positive-ink)]">
                  {t("papers.health.ok")}
                </p>
              )}
          </section>
        )}

        <section className="border-t border-line p-3" aria-labelledby="bib-keys">
          <h3 id="bib-keys" className="label">
            {t("papers.keys")} <span className="num">({keys.length})</span>
          </h3>
          {keys.length === 0 ? (
            <p className="text-xs text-muted">{t("papers.keys.empty")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {keys.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] hover:border-accent hover:text-accent disabled:opacity-50" /* taste-skill-ignore mono: cite keys are IDs */
                    onClick={() => onCite(k)}
                    disabled={!canCite}
                    title={
                      canCite ? t("papers.key.title.on", { key: k }) : t("papers.key.title.off")
                    }
                  >
                    {k}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
