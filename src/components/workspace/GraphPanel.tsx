"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { SigmaContainer, useRegisterEvents, useSigma } from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import Graph from "graphology";
import { api } from "@/lib/client/api";
import { graphToTikz } from "@/lib/graph-tikz";
import { shortestPath } from "@/lib/graph-path";
import { useI18n } from "@/lib/i18n/client";

/** A WebGL failure must degrade to a message, never unmount the workspace. */
class CanvasBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message };
  }
  render() {
    if (this.state.err)
      return (
        <p
          role="alert"
          className="m-3 rounded-md bg-[var(--pill-warning-bg)] px-3 py-2 text-xs text-[var(--pill-warning-ink)]"
        >
          {this.state.err}
        </p>
      );
    return this.props.children;
  }
}

export type GraphSeed = { source: "openalex" | "s2" | "arxiv"; paperId: string; title: string };

type GraphNode = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedBy: number;
  doi?: string;
  ring: number;
};

type GraphData = {
  seed: string;
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
  truncated: boolean;
};

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const byte = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`;
}

/** Older papers run cold-blue, recent ones warm-orange; the seed keeps the accent. */
function yearColor(year: number | undefined): string {
  if (!year) return "#8a857b";
  const t = Math.max(0, Math.min(1, (year - 1985) / 40));
  return hslToHex(Math.round(210 - t * 185), 48, 42);
}

// Sizes are pixels at zoom 1; the panel is ~270px wide, so nodes must stay
// modest there — the fullscreen view scales them up via the camera instead.
const nodeSize = (citedBy: number) => Math.max(3, Math.min(10, 2 + Math.sqrt(citedBy) / 6));

/** One row of the Prior/Derivative works lists; clicking selects the node. */
function WorkRow({
  node,
  active,
  onSelect,
}: {
  node: GraphNode;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`w-full truncate py-1 text-left text-xs ${
          active ? "text-accent" : "text-ink hover:text-accent"
        }`}
        title={node.title}
      >
        {node.title} <span className="num text-muted">({node.year ?? "?"})</span>
      </button>
    </li>
  );
}

/** Short "Family year" tag, the way Connected Papers labels nodes. */
function shortLabel(node: GraphNode): string {
  const tag = `${node.authors.at(-1)?.split(/\s+/).at(-1) ?? "?"} ${node.year ?? ""}`.trim();
  return tag.length > 20 ? `${tag.slice(0, 19)}…` : tag;
}

function buildGraph(data: GraphData, mode: "paper" | "bib"): Graph {
  const g = new Graph({ multi: false });
  const n = data.nodes.length || 1;
  data.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n; // circle start position; FA2 reshapes it
    // In bibliography mode the user's own papers (ring 0) take the accent.
    const focal = mode === "bib" ? node.ring === 0 : node.id === data.seed;
    g.addNode(node.id, {
      label: shortLabel(node),
      size: focal ? nodeSize(node.citedBy) + 2 : nodeSize(node.citedBy),
      color: focal ? "#1b6c80" : yearColor(node.year),
      x: 100 * Math.cos(angle) + (Math.random() - 0.5),
      y: 100 * Math.sin(angle) + (Math.random() - 0.5),
    });
  });
  for (const e of data.edges) {
    if (!g.hasNode(e.from) || !g.hasNode(e.to) || g.hasEdge(e.from, e.to)) continue;
    g.addEdge(e.from, e.to, { size: 0.5, color: "#cfcac2" });
  }
  return g;
}

/** Sorted node-pair keys for the consecutive hops of a path. */
function pathEdgeKeys(path: string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]].sort();
    keys.add(`${a}|${b}`);
  }
  return keys;
}

/**
 * Runs the layout and wires node selection; must live inside SigmaContainer.
 * When a path to the seed is set, its nodes and edges are painted with the
 * accent color the way Connected Papers highlights the chain to the origin.
 */
function GraphControls({
  onSelect,
  path,
}: {
  onSelect: (id: string) => void;
  path: string[] | null;
}) {
  const sigma = useSigma();
  const { assign } = useLayoutForceAtlas2({
    iterations: 150,
    settings: { adjustSizes: true, gravity: 0.6, slowDown: 8, barnesHutOptimize: true },
  });
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    assign();
    sigma.refresh();
  }, [assign, sigma]);

  // Sections below the canvas (works lists, selection card) resize it after
  // sigma first measured itself; sigma has no container observer, so a stale
  // mouse captor would otherwise overlay the lists and swallow their clicks.
  useEffect(() => {
    const ro = new ResizeObserver(() => sigma.resize());
    ro.observe(sigma.getContainer());
    return () => ro.disconnect();
  }, [sigma]);

  useEffect(
    () =>
      registerEvents({
        clickNode: ({ node }) => onSelect(node),
        clickStage: () => onSelect(""), // click on empty canvas clears selection
      }),
    [registerEvents, onSelect],
  );

  useEffect(() => {
    const g = sigma.getGraph();
    const keys = path ? pathEdgeKeys(path) : null;
    const onPath = new Set(path ?? []);
    g.forEachNode((node) => g.setNodeAttribute(node, "highlighted", onPath.has(node)));
    g.forEachEdge((edge, _attrs, source, target) => {
      const [a, b] = [source, target].sort();
      const hit = keys?.has(`${a}|${b}`) ?? false;
      g.setEdgeAttribute(edge, "color", hit ? "#1b6c80" : "#cfcac2");
      g.setEdgeAttribute(edge, "size", hit ? 2.5 : 0.5);
    });
    sigma.refresh();
  }, [path, sigma]);

  return null;
}

type Props = {
  projectId: string;
  seed: GraphSeed;
  /** "bib" renders the whole-bibliography graph instead of one paper's. */
  mode?: "paper" | "bib";
  onBack: () => void;
  onCite: (paperId: string) => void;
  /** Re-seeds the graph around the selected paper (node click → its own graph). */
  onReseed?: (seed: GraphSeed) => void;
  adding: boolean;
};

/** Connected-Papers-style citation graph from OpenAlex (CC0) around one paper. */
export function GraphPanel({
  projectId,
  seed,
  mode = "paper",
  onBack,
  onCite,
  onReseed,
  adding,
}: Props) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<GraphData | null>(null);
  const [state, setState] = useState<"loading" | "error" | "done">("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [big, setBig] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The parent mounts this component with a key per view, so the effect runs
  // once per graph and no synchronous state resets are needed.
  useEffect(() => {
    let cancelled = false;
    const url =
      mode === "bib"
        ? `/api/projects/${projectId}/graph`
        : `/api/papers/graph?${new URLSearchParams({ source: seed.source, paperId: seed.paperId })}`;
    api<GraphData>("GET", url)
      .then((g) => {
        if (cancelled) return;
        setData(g);
        setState("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof TypeError ? t("offline") : (err as Error).message);
        setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view is fixed per mount (keyed); t only rewords errors
  }, []);

  const graph = useMemo(() => (data ? buildGraph(data, mode) : null), [data, mode]);
  const nf = new Intl.NumberFormat(lang);
  const sel = data?.nodes.find((n) => n.id === selected);

  // Connected Papers highlights the chain from the selected node back to the
  // origin paper; BFS over the undirected view of the citation graph.
  const path = useMemo(() => {
    if (!data || !selected || selected === data.seed) return null;
    return shortestPath({ edges: data.edges }, selected, data.seed);
  }, [data, selected]);

  // Prior works: what the seed cites. Derivative works: what cites the seed.
  const { prior, derivative } = useMemo(() => {
    if (!data) return { prior: [] as GraphNode[], derivative: [] as GraphNode[] };
    const p = new Set<string>();
    const d = new Set<string>();
    for (const e of data.edges) {
      if (e.from === data.seed) p.add(e.to);
      if (e.to === data.seed) d.add(e.from);
    }
    const byCitations = (ids: Set<string>) =>
      data.nodes.filter((n) => ids.has(n.id)).sort((a, b) => b.citedBy - a.citedBy);
    return { prior: byCitations(p), derivative: byCitations(d) };
  }, [data]);

  // The selected-node card, shared by the stacked and three-column layouts.
  const selCard = sel ? (
    <div className="shrink-0 border-t border-line p-3">
      <p className="text-sm leading-5 font-medium">{sel.title}</p>
      <p className="mt-0.5 text-xs text-muted">
        {[sel.authors.at(-1), sel.year, sel.venue].filter(Boolean).join(" · ")}
      </p>
      <p className="num mt-1 text-xs text-muted">
        {nf.format(sel.citedBy)}{" "}
        {sel.citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn btn-sm"
          disabled={adding}
          onClick={() => onCite(sel.id)}
        >
          {adding ? t("papers.adding") : t("papers.cite")}
        </button>
        {onReseed && sel.id !== data?.seed && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onReseed({ source: "openalex", paperId: sel.id, title: sel.title })}
          >
            {t("papers.graph.reseed")}
          </button>
        )}
        {sel.doi && (
          <a
            className="btn btn-ghost btn-sm"
            href={`https://doi.org/${sel.doi}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            DOI
          </a>
        )}
      </div>
    </div>
  ) : null;

  /** Serializes the laid-out graph into a TikZ figure inside the project. */
  async function exportTikz() {
    if (!graph || !data) return;
    setNote(null);
    const positions = new Map<string, { x: number; y: number }>();
    graph.forEachNode((id, attrs) =>
      positions.set(id, { x: attrs.x as number, y: attrs.y as number }),
    );
    const tikz = graphToTikz({
      seedId: data.seed,
      seedTitle: mode === "bib" ? t("papers.graph.bibShort") : seed.title,
      nodes: data.nodes.map((n) => {
        const focal = mode === "bib" ? n.ring === 0 : n.id === data.seed;
        return {
          id: n.id,
          x: positions.get(n.id)?.x ?? 0,
          y: positions.get(n.id)?.y ?? 0,
          size: nodeSize(n.citedBy) + (focal ? 2 : 0),
          color: focal ? "#1b6c80" : yearColor(n.year),
          label: shortLabel(n),
        };
      }),
      edges: data.edges,
    });
    const base = "figures/citation-graph";
    let path = `${base}.tex`;
    try {
      const r = await api<{ file: { path: string } }>("POST", `/api/projects/${projectId}/files`, {
        path,
        content: tikz,
      });
      path = r.file.path;
    } catch (err) {
      // Already exists: retry with a timestamped name.
      try {
        const r = await api<{ file: { path: string } }>(
          "POST",
          `/api/projects/${projectId}/files`,
          {
            path: `${base}-${Date.now() % 100000}.tex`,
            content: tikz,
          },
        );
        path = r.file.path;
      } catch {
        setNote((err as Error).message);
        return;
      }
    }
    setNote(t("papers.graph.tikzSaved", { path }));
    await navigator.clipboard.writeText(`\\input{${path.replace(/\.tex$/, "")}}`).catch(() => {});
  }

  return (
    <div
      className={
        big
          ? "fixed inset-2 z-30 flex flex-col rounded-lg border border-line bg-surface sm:inset-6"
          : "flex h-full min-h-0 flex-col"
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← {t("papers.graph.back")}
        </button>
        <p
          className="min-w-0 flex-1 truncate text-xs text-muted"
          title={mode === "bib" ? t("papers.graph.bibTitle") : seed.title}
        >
          {mode === "bib" ? t("papers.graph.bibTitle") : seed.title}
        </p>
        {graph && data && data.edges.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void exportTikz()}
            >
              TikZ
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-expanded={big}
              onClick={() => setBig(!big)}
            >
              {big ? "⤡" : "⤢"}
            </button>
          </>
        )}
      </div>
      {note && (
        <p role="status" className="shrink-0 px-3 pt-2 text-xs text-ok">
          {note}
        </p>
      )}

      {state === "loading" && <p className="p-4 text-sm text-muted">{t("common.loading")}</p>}
      {state === "error" && (
        <p
          role="alert"
          className="m-3 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-xs text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}

      {state === "done" && data && (
        <>
          {(data.nodes.length <= 1 || data.edges.length === 0) && (
            <p className="p-4 text-sm text-muted">
              {mode === "bib" ? t("papers.graph.bibEmpty") : t("papers.graph.empty")}
            </p>
          )}
          {big && mode === "paper" && data.edges.length > 0 && graph ? (
            // Connected-Papers layout: prior works left, graph centre,
            // derivative works right.
            <div className="grid min-h-0 flex-1 grid-cols-[clamp(150px,17vw,230px)_minmax(0,1fr)_clamp(150px,17vw,230px)]">
              <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-line px-2 py-2">
                <h3 className="label shrink-0">
                  {t("papers.graph.prior")} <span className="num">({prior.length})</span>
                </h3>
                <ul className="mt-1">
                  {prior.map((n) => (
                    <WorkRow
                      key={n.id}
                      node={n}
                      active={n.id === selected}
                      onSelect={setSelected}
                    />
                  ))}
                </ul>
              </aside>
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="relative min-h-0 flex-1">
                  <CanvasBoundary>
                    <SigmaContainer
                      graph={graph}
                      style={{ position: "absolute", inset: 0 }}
                      options={{
                        settings: {
                          minCameraRatio: 0.05,
                          maxCameraRatio: 8,
                          labelRenderedSizeThreshold: 6,
                          labelDensity: 0.4,
                          renderEdgeLabels: false,
                        },
                      }}
                    >
                      <GraphControls onSelect={setSelected} path={path} />
                    </SigmaContainer>
                  </CanvasBoundary>
                  <p className="pointer-events-none absolute bottom-1 left-2 right-2 flex justify-between text-[10px] text-muted">
                    <span>{t("papers.graph.legend")}</span>
                    {data.truncated && <span>{t("papers.graph.truncated")}</span>}
                  </p>
                </div>
                {sel && selCard}
              </div>
              <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-line px-2 py-2">
                <h3 className="label shrink-0">
                  {t("papers.graph.derivative")} <span className="num">({derivative.length})</span>
                </h3>
                <ul className="mt-1">
                  {derivative.map((n) => (
                    <WorkRow
                      key={n.id}
                      node={n}
                      active={n.id === selected}
                      onSelect={setSelected}
                    />
                  ))}
                </ul>
              </aside>
            </div>
          ) : (
            <>
              {data.edges.length > 0 && graph && (
                <div className="relative min-h-0 flex-1">
                  <CanvasBoundary>
                    <SigmaContainer
                      graph={graph}
                      style={{ position: "absolute", inset: 0 }}
                      options={{
                        settings: {
                          minCameraRatio: 0.05,
                          maxCameraRatio: 8,
                          labelRenderedSizeThreshold: 6,
                          labelDensity: 0.4,
                          renderEdgeLabels: false,
                        },
                      }}
                    >
                      <GraphControls onSelect={setSelected} path={path} />
                    </SigmaContainer>
                  </CanvasBoundary>
                  <p className="pointer-events-none absolute bottom-1 left-2 right-2 flex justify-between text-[10px] text-muted">
                    <span>{t("papers.graph.legend")}</span>
                    {data.truncated && <span>{t("papers.graph.truncated")}</span>}
                  </p>
                </div>
              )}

              {(prior.length > 0 || derivative.length > 0) && (
                <div className="shrink-0 space-y-1 border-t border-line px-3 py-2">
                  {prior.length > 0 && (
                    <details>
                      <summary className="cursor-pointer select-none text-xs font-medium text-muted">
                        {t("papers.graph.prior")} ({prior.length})
                      </summary>
                      <ul className="mt-1 max-h-36 overflow-y-auto">
                        {prior.map((n) => (
                          <WorkRow
                            key={n.id}
                            node={n}
                            active={n.id === selected}
                            onSelect={setSelected}
                          />
                        ))}
                      </ul>
                    </details>
                  )}
                  {derivative.length > 0 && (
                    <details>
                      <summary className="cursor-pointer select-none text-xs font-medium text-muted">
                        {t("papers.graph.derivative")} ({derivative.length})
                      </summary>
                      <ul className="mt-1 max-h-36 overflow-y-auto">
                        {derivative.map((n) => (
                          <WorkRow
                            key={n.id}
                            node={n}
                            active={n.id === selected}
                            onSelect={setSelected}
                          />
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {sel && selCard}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default GraphPanel;
