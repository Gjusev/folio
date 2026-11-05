"use client";

// Literature explorer, the Connected Papers way: papers list on the left, the
// similarity graph in the middle, the selected paper's full card on the right.
// Click a node for its card, double-click (or "Use as origin") to rebuild the
// graph around it — the previous graph stays on screen while the new one loads.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { graphToTikz } from "@/lib/graph-tikz";
import { useI18n } from "@/lib/i18n/client";
import { tourEvent } from "@/components/onboarding/tasks";
import type {
  CitationGraph,
  GraphNode,
  GraphSeed,
  OutsideWork,
  PaperDetail as PaperDetailData,
} from "@/lib/graph-types";
import { buildSigmaGraph } from "./graph-build";
import { GraphCanvas } from "./GraphCanvas";
import { GraphList, type ListTab } from "./GraphList";
import {
  buildAdjacency,
  canvasTheme,
  islandLabels,
  seedKey,
  yearColor,
  yearFilter,
  yearRange,
  type YearRange,
} from "./graph-model";
import { PaperDetail, type DetailItem } from "./PaperDetail";

type View = { seed: GraphSeed | null; key: string; graph: CitationGraph };
type Toast = { kind: "ok" | "error"; msg: string };

export type GraphExplorerProps = {
  projectId: string;
  /** null = the graph of the project's whole bibliography. */
  seed: GraphSeed | null;
  /** Citation key when the paper is already in the project's .bib. */
  bibKeyOf: (item: { doi?: string; title: string }) => string | undefined;
  onClose: () => void;
  /** Adds the paper to the .bib (and \cite at the cursor when possible); throws on failure. */
  onCite: (paperId: string) => Promise<{ key: string; added: boolean }>;
};

const graphUrl = (projectId: string, seed: GraphSeed | null) =>
  seed
    ? `/api/papers/graph?${new URLSearchParams({ source: seed.source, paperId: seed.paperId })}`
    : `/api/projects/${projectId}/graph`;

// The canvas follows the applied theme (data-theme, resolved from "system"),
// so a user-chosen theme also recolors the graph.
const subscribeDark = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};

export function GraphExplorer({ projectId, seed, bibKeyOf, onClose, onCite }: GraphExplorerProps) {
  const { t, lang } = useI18n();
  const dark = useSyncExternalStore(
    subscribeDark,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  const theme = useMemo(() => canvasTheme(dark), [dark]);

  const [view, setView] = useState<View | null>(null);
  const [trail, setTrail] = useState<View[]>([]);
  const [building, setBuilding] = useState<GraphSeed | null | undefined>(undefined); // undefined = idle
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("graph");
  const [mobile, setMobile] = useState<"list" | "graph" | "detail">("graph");
  const [focusReq, setFocusReq] = useState({ id: "", n: 0 });
  const [range, setRange] = useState<YearRange | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [citingId, setCitingId] = useState<string | null>(null);
  const [details, setDetails] = useState<
    Record<string, { status: "ready" | "error"; data?: PaperDetailData }>
  >({});

  const cache = useRef(new Map<string, CitationGraph>());
  const inflight = useRef(new Set<string>());
  const viewRef = useRef<View | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);

  // Mounted = opened: the tour counts one look at any graph (bibliography or paper).
  useEffect(() => tourEvent("graph"), []);

  const flash = useCallback((next: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  /** Makes `v` the current graph; the origin (if any) becomes the selection. */
  const commit = useCallback((v: View, push: boolean) => {
    const prev = viewRef.current;
    if (push && prev && prev.key !== v.key) setTrail((tr) => [...tr.slice(-9), prev]);
    viewRef.current = v;
    setView(v);
    setSelected(v.graph.seed);
    setHovered(null);
    setTab("graph");
    setFocusReq({ id: "", n: 0 });
    setRange(null); // another origin, another years
  }, []);

  // Initial load: one per mount (the parent keys the explorer by seed).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const key = seedKey(seed);
        const graph = await api<CitationGraph>("GET", graphUrl(projectId, seed));
        if (cancelled) return;
        cache.current.set(key, graph);
        commit({ seed, key, graph }, false);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof TypeError ? t("offline") : (err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on retry
  }, [attempt]);

  /** Rebuilds the graph around another paper without dropping the current one. */
  const navigate = useCallback(
    async (next: GraphSeed | null) => {
      const key = seedKey(next);
      if (viewRef.current?.key === key) return;
      setBuilding(next);
      try {
        const graph =
          cache.current.get(key) ?? (await api<CitationGraph>("GET", graphUrl(projectId, next)));
        cache.current.set(key, graph);
        commit({ seed: next, key, graph }, true);
      } catch (err) {
        flash({
          kind: "error",
          msg: t("graph.error.keep", {
            msg: err instanceof TypeError ? t("offline") : (err as Error).message,
          }),
        });
      } finally {
        setBuilding(undefined);
      }
    },
    [projectId, commit, flash, t],
  );

  const back = useCallback(
    (to?: number) => {
      setTrail((tr) => {
        const idx = to ?? tr.length - 1;
        const target = tr[idx];
        if (!target) return tr;
        queueMicrotask(() => commit(target, false));
        return tr.slice(0, idx);
      });
    },
    [commit],
  );

  // Close on Escape, lock page scroll, put focus in the dialog and give it
  // back on the way out.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const graph = view?.graph ?? null;
  const bibMode = view ? view.seed === null : seed === null;
  const nodeMap = useMemo(
    () => new Map<string, GraphNode>((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  );
  const outsideMap = useMemo(
    () =>
      new Map<string, OutsideWork & { kind: "prior" | "derivative" }>([
        ...(graph?.prior ?? []).map((w) => [w.id, { ...w, kind: "prior" as const }] as const),
        ...(graph?.derivative ?? []).map(
          (w) => [w.id, { ...w, kind: "derivative" as const }] as const,
        ),
      ]),
    [graph],
  );
  const years = useMemo(() => (graph ? yearRange(graph.nodes) : null), [graph]);
  const adjacency = useMemo(() => buildAdjacency(graph?.edges ?? []), [graph]);
  const sigmaGraph = useMemo(
    () => (view ? buildSigmaGraph(view.graph, theme, view.key) : null),
    [view, theme],
  );
  const filtered = useMemo(
    () => (graph ? yearFilter(graph.nodes, graph.edges, range) : null),
    [graph, range],
  );
  const hidden = filtered?.hidden ?? new Set<string>();
  // Island names only make sense when the graph really has islands: the
  // bibliography view. One Connected-Papers-style origin graph is connected.
  const labels = useMemo(() => {
    if (!sigmaGraph || !graph || !bibMode) return [];
    const pos = new Map<string, { x: number; y: number }>();
    sigmaGraph.forEachNode((id, a) => pos.set(id, { x: a.x, y: a.y }));
    return islandLabels(graph.nodes, graph.edges, pos);
  }, [sigmaGraph, graph, bibMode]);

  // Details of the card on screen (the origin when nothing is selected).
  const cardId = selected || graph?.seed || "";
  useEffect(() => {
    if (!cardId || details[cardId] || inflight.current.has(cardId)) return;
    inflight.current.add(cardId);
    api<PaperDetailData>("GET", `/api/papers/detail?${new URLSearchParams({ id: cardId })}`)
      .then((d) => setDetails((m) => ({ ...m, [cardId]: { status: "ready", data: d } })))
      .catch(() => setDetails((m) => ({ ...m, [cardId]: { status: "error" } })))
      .finally(() => inflight.current.delete(cardId));
  }, [cardId, details]);

  const retryDetail = (id: string) =>
    setDetails((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));

  const item: DetailItem | null = useMemo(() => {
    const n = nodeMap.get(cardId);
    if (n) return n;
    const w = outsideMap.get(cardId);
    return w ? { ...w, outside: w.kind } : null;
  }, [cardId, nodeMap, outsideMap]);

  const selectFromList = useCallback((id: string) => {
    setSelected(id);
    setFocusReq((r) => ({ id, n: r.n + 1 }));
    setMobile("detail");
  }, []);
  const selectFromCanvas = useCallback((id: string) => setSelected(id), []);
  const hover = useCallback(
    (id: string | null) => setHovered(id && nodeMap.has(id) ? id : null),
    [nodeMap],
  );

  const makeOrigin = useCallback(
    (id: string) => {
      const n = nodeMap.get(id) ?? outsideMap.get(id);
      if (!n || id === viewRef.current?.graph.seed) return;
      setMobile("graph");
      void navigate({ source: "openalex", paperId: id, title: n.title });
    },
    [nodeMap, outsideMap, navigate],
  );

  const cite = async (id: string) => {
    setCitingId(id);
    try {
      const r = await onCite(id);
      flash({
        kind: "ok",
        msg: t(r.added ? "graph.detail.cited.toast" : "graph.detail.existing.toast", {
          key: r.key,
        }),
      });
    } catch (err) {
      flash({
        kind: "error",
        msg: err instanceof TypeError ? t("offline") : (err as Error).message,
      });
    } finally {
      setCitingId(null);
    }
  };

  /** Saves the laid-out graph as a TikZ figure inside the project. */
  async function exportTikz() {
    if (!graph || !sigmaGraph || !view) return;
    const makeTikz = (figLabel?: string) =>
      graphToTikz({
        seedId: graph.seed,
        seedTitle: view.seed
          ? view.seed.title || (nodeMap.get(graph.seed)?.title ?? "")
          : t("graph.bib"),
        nodes: graph.nodes.map((n) => {
          const a = sigmaGraph.getNodeAttributes(n.id);
          return { id: n.id, x: a.x, y: a.y, size: a.size, color: a.color, label: a.label };
        }),
        edges: graph.edges.map((e) => ({ from: e.from, to: e.to })),
        figLabel,
      });
    const base = "figures/citation-graph";
    let path = `${base}.tex`;
    try {
      const r = await api<{ file: { path: string } }>("POST", `/api/projects/${projectId}/files`, {
        path,
        content: makeTikz(),
      });
      path = r.file.path;
    } catch {
      const suffix = Date.now() % 100000;
      try {
        const r = await api<{ file: { path: string } }>(
          "POST",
          `/api/projects/${projectId}/files`,
          {
            path: `${base}-${suffix}.tex`,
            content: makeTikz(`citation-graph-${suffix}`),
          },
        );
        path = r.file.path;
      } catch (err) {
        flash({ kind: "error", msg: (err as Error).message });
        return;
      }
    }
    flash({ kind: "ok", msg: t("papers.graph.tikzSaved", { path }) });
    await navigator.clipboard.writeText(`\\input{${path.replace(/\.tex$/, "")}}`).catch(() => {});
  }

  const title = bibMode
    ? t("graph.bib")
    : (nodeMap.get(graph?.seed ?? "")?.title ?? seed?.title ?? "");
  const originNode = graph ? nodeMap.get(graph.seed) : undefined;
  const buildingTitle = building ? building.title : building === null ? t("graph.bib") : "";
  const isBuilding = building !== undefined;
  const empty = !!graph && (graph.nodes.length <= 1 || graph.edges.length === 0);
  const legendBar = years
    ? `linear-gradient(to right, ${yearColor(years.min, years.min, years.max)}, ${yearColor(
        Math.round((years.min + years.max) / 2),
        years.min,
        years.max,
      )}, ${yearColor(years.max, years.min, years.max)})`
    : "";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("graph.title")}
      data-testid="graph-explorer"
      className="fixed inset-0 z-50 flex flex-col bg-surface text-ink"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        {trail.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => back()}
            title={t("graph.back")}
            aria-label={t("graph.back")}
            data-testid="graph-back"
          >
            <ArrowLeft size={14} aria-hidden />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="label !mb-0 shrink-0">{bibMode ? "" : t("graph.origin")}</span>
          <h1
            className="min-w-0 truncate text-sm font-semibold"
            title={title}
            data-testid="graph-title"
          >
            {title}
          </h1>
          {originNode?.year && (
            <span className="num shrink-0 text-xs text-muted">{originNode.year}</span>
          )}
          {trail.length > 0 && (
            <nav
              aria-label={t("graph.origin")}
              className="hidden min-w-0 items-center gap-1 text-xs text-muted xl:flex"
            >
              {trail.slice(-3).map((v, i, arr) => {
                const idx = trail.length - arr.length + i;
                const label = v.seed?.title || t("graph.bib");
                return (
                  <button
                    key={v.key}
                    type="button"
                    className="max-w-40 truncate rounded px-1.5 py-0.5 hover:bg-active hover:text-ink"
                    onClick={() => back(idx)}
                    title={label}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
        {graph && (
          <p className="num hidden shrink-0 text-xs text-muted md:block">
            {t("graph.stats", {
              n: nf.format(graph.nodes.length),
              m: nf.format(graph.edges.length),
            })}
          </p>
        )}
        {graph?.truncated && (
          <span
            className="pill hidden bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] md:inline-flex"
            title={t("graph.partial")}
          >
            {t("graph.partial")}
          </span>
        )}
        {graph && graph.edges.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void exportTikz()}
            title={t("graph.tikz.title")}
          >
            {t("graph.tikz")}
          </button>
        )}
        <button
          ref={closeRef}
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          aria-label={t("common.close")}
          title={`${t("common.close")} (Esc)`}
          data-testid="graph-close"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {toast && (
        <p
          role={toast.kind === "error" ? "alert" : "status"}
          className={`absolute bottom-16 left-1/2 z-[60] max-w-[min(90vw,560px)] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-[0_6px_24px_rgba(0,0,0,0.18)] lg:bottom-6 ${
            toast.kind === "error"
              ? "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
              : "bg-ink text-surface"
          }`}
        >
          {toast.msg}
        </p>
      )}

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(320px,380px)]">
        <aside
          className={`${mobile === "list" ? "flex" : "hidden"} h-full min-h-0 flex-col border-r border-line lg:flex`}
        >
          {graph ? (
            <GraphList
              nodes={graph.nodes}
              prior={graph.prior}
              derivative={graph.derivative}
              years={years}
              selected={selected}
              tab={tab}
              onTab={setTab}
              onSelect={selectFromList}
              onHover={hover}
              inBib={(x) => !!bibKeyOf(x)}
            />
          ) : (
            <div className="animate-pulse space-y-4 p-4" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-5/6 rounded bg-raised" />
                  <div className="h-2.5 w-1/2 rounded bg-raised" />
                </div>
              ))}
            </div>
          )}
        </aside>

        <main
          className={`${mobile === "graph" ? "block" : "hidden"} relative h-full min-h-0 lg:block`}
        >
          {sigmaGraph && graph && !empty && (
            <GraphCanvas
              key={view?.key}
              graph={sigmaGraph}
              nodes={nodeMap}
              adjacency={adjacency}
              originId={graph.seed}
              selected={selected}
              hovered={hovered}
              theme={theme}
              focusRequest={focusReq}
              fitSignal={0}
              ariaLabel={t("graph.canvas", { title })}
              hidden={hidden}
              labels={labels}
              onSelect={selectFromCanvas}
              onHover={hover}
              onMakeOrigin={makeOrigin}
            />
          )}

          {empty && (
            <p className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-muted">
              {bibMode ? t("graph.empty.bib") : t("graph.empty")}
            </p>
          )}

          {!graph && !loadError && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center" role="status">
              <div>
                <Loader2 className="mx-auto animate-spin text-accent" size={26} aria-hidden />
                <p className="mt-3 text-sm font-medium">
                  {bibMode
                    ? t("graph.loading.bib")
                    : t("graph.loading", { title: seed?.title ?? "" })}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                  {t("graph.loading.hint")}
                </p>
              </div>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center" role="alert">
              <div>
                <p className="text-sm font-medium">{t("graph.error")}</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{loadError}</p>
                <button
                  type="button"
                  className="btn mt-3"
                  onClick={() => {
                    setLoadError(null);
                    setAttempt((a) => a + 1);
                  }}
                >
                  {t("graph.retry")}
                </button>
              </div>
            </div>
          )}

          {isBuilding && (
            <div
              className="absolute inset-0 z-30 grid place-items-center bg-surface/75 p-8 text-center backdrop-blur-[2px]"
              role="status"
              data-testid="graph-building"
            >
              <div>
                <Loader2 className="mx-auto animate-spin text-accent" size={26} aria-hidden />
                <p className="mt-3 text-sm font-medium">
                  {t("graph.loading", { title: buildingTitle })}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                  {t("graph.loading.hint")}
                </p>
              </div>
            </div>
          )}

          {graph && !empty && (
            <>
              <Timeline
                years={years}
                range={range}
                shown={graph.nodes.length - hidden.size}
                total={graph.nodes.length}
                onChange={setRange}
              />
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 space-y-1 rounded-lg bg-surface/85 px-3 py-2 text-[11px] text-muted backdrop-blur-sm">
                {years && (
                  <p className="flex items-center gap-2">
                    <span>{t("graph.legend.color")}</span>
                    <span
                      className="h-1.5 w-20 rounded-full border border-line"
                      style={{ background: legendBar }}
                    />
                    <span className="num">
                      {years.min}–{years.max}
                    </span>
                  </p>
                )}
                <p>
                  {t("graph.legend.size")} · {t("graph.legend.edge")}
                </p>
              </div>
              <p className="pointer-events-none absolute right-3 bottom-3 z-10 hidden text-[11px] text-muted lg:block">
                {t("graph.hint")}
              </p>
            </>
          )}
        </main>

        <aside
          className={`${mobile === "detail" ? "flex" : "hidden"} h-full min-h-0 flex-col border-l border-line lg:flex`}
        >
          <PaperDetail
            item={item}
            detail={cardId ? details[cardId] : undefined}
            isOrigin={!!graph && cardId === graph.seed && !bibMode}
            bibMode={bibMode}
            bibKey={item ? bibKeyOf(item) : undefined}
            citing={citingId === cardId}
            onCite={() => void cite(cardId)}
            onMakeOrigin={() => makeOrigin(cardId)}
            onRetry={() => retryDetail(cardId)}
          />
        </aside>
      </div>

      <nav className="flex shrink-0 border-t border-line lg:hidden" role="tablist">
        {(["list", "graph", "detail"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mobile === m}
            className={`flex-1 py-3 text-sm ${mobile === m ? "font-semibold text-ink" : "text-muted"}`}
            onClick={() => setMobile(m)}
          >
            {t(m === "list" ? "graph.m.list" : m === "graph" ? "graph.m.graph" : "graph.m.detail")}
          </button>
        ))}
      </nav>
    </div>,
    document.body,
  );
}

/** The Connected-Papers year timeline: two handles over the graph's own range. */
function Timeline({
  years,
  range,
  shown,
  total,
  onChange,
}: {
  years: { min: number; max: number } | null;
  range: YearRange | null;
  shown: number;
  total: number;
  onChange: (r: YearRange | null) => void;
}) {
  const { t } = useI18n();
  if (!years || years.max - years.min < 2) return null; // nothing to slide
  const lo = range?.min ?? years.min;
  const hi = range?.max ?? years.max;
  const active = range !== null;
  return (
    <div
      className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-[min(420px,70%)] -translate-x-1/2 items-center gap-2.5 rounded-lg border border-line bg-surface/90 px-3 py-1.5 text-[11px] text-muted shadow-[0_2px_8px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      data-testid="graph-timeline"
    >
      <span className="shrink-0">{t("graph.timeline")}</span>
      <label className="flex min-w-0 flex-1 items-center gap-1">
        <span className="sr-only">{t("graph.timeline.from")}</span>
        <input
          type="range"
          min={years.min}
          max={years.max}
          value={lo}
          onChange={(e) => onChange({ min: Math.min(Number(e.target.value), hi), max: hi })}
          className="h-1 w-full accent-[var(--accent)]"
        />
        <span className="num w-9 shrink-0 text-right" aria-hidden>
          {lo}
        </span>
      </label>
      <label className="flex min-w-0 flex-1 items-center gap-1">
        <span className="sr-only">{t("graph.timeline.to")}</span>
        <input
          type="range"
          min={years.min}
          max={years.max}
          value={hi}
          onChange={(e) => onChange({ min: lo, max: Math.max(Number(e.target.value), lo) })}
          className="h-1 w-full accent-[var(--accent)]"
        />
        <span className="num w-9 shrink-0 text-right" aria-hidden>
          {hi}
        </span>
      </label>
      <span
        className="num shrink-0"
        title={t("graph.timeline.count", { shown: String(shown), total: String(total) })}
      >
        {shown}/{total}
      </span>
      {active && (
        <button
          type="button"
          className="btn btn-ghost btn-sm pointer-events-auto shrink-0 !h-6 !px-1.5 !text-[11px]"
          onClick={() => onChange(null)}
        >
          {t("graph.timeline.reset")}
        </button>
      )}
    </div>
  );
}

export default GraphExplorer;
