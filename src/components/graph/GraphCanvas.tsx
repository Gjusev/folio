"use client";

// The sigma canvas of the explorer: click selects, double-click makes the
// origin, hovering/selecting dims everything but the neighbourhood, and the
// camera only moves when the target would be off-centre.

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SigmaContainer, useRegisterEvents, useSigma } from "@react-sigma/core";
import type Graph from "graphology";
import { DEFAULT_STYLES } from "sigma";
import type { SigmaOptions } from "sigma/types";
import { Maximize, Minus, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { GraphNode } from "@/lib/graph-types";
import { ACCENT } from "./graph-build";
import {
  needsRecentre,
  neighborsOf,
  type Adjacency,
  type CanvasTheme,
  type IslandLabel,
} from "./graph-model";

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

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  return reduce;
}

/** Debug/test handle: lets e2e tests click real canvas nodes by projecting them. */
type FolioHandle = {
  ids: () => string[];
  title: (id: string) => string;
  /** Node position in PAGE coordinates (viewport position + element offset). */
  project: (id: string) => { x: number; y: number };
  box: () => { width: number; height: number };
  camera: () => { x: number; y: number; ratio: number };
};
declare global {
  interface Window {
    __folioGraph?: FolioHandle;
  }
}

/* ---------- inner components (live inside SigmaContainer) ---------- */

function Events({
  onSelect,
  onHover,
  onMakeOrigin,
}: {
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onMakeOrigin: (id: string) => void;
}) {
  const register = useRegisterEvents();
  useEffect(
    () =>
      register({
        clickNode: ({ node }) => onSelect(node),
        clickStage: () => onSelect(""),
        // A double click on a paper rebuilds the graph around it; sigma's own
        // double-click-to-zoom would fight that.
        doubleClickNode: ({ node, preventSigmaDefault }) => {
          preventSigmaDefault();
          onMakeOrigin(node);
        },
        enterNode: ({ node }) => onHover(node),
        leaveNode: () => onHover(null),
      }),
    [register, onSelect, onHover, onMakeOrigin],
  );
  return null;
}

/**
 * What the reducers read at paint time: the focused paper with its
 * neighbourhood, plus the timeline's hidden set (years filtered out).
 */
type FocusState = {
  id: string;
  near: Set<string> | null;
  theme: CanvasTheme;
  hidden: Set<string>;
};

/**
 * Pushes the focus (hover wins over selection) into the ref the reducers read
 * and repaints. Recreating sigma on every hover would reset the camera and
 * flicker; mutating a ref + refresh() is free.
 */
function Highlight({
  focus,
  adjacency,
  theme,
  hidden,
  focusRef,
}: {
  focus: string;
  adjacency: Adjacency;
  theme: CanvasTheme;
  hidden: Set<string>;
  focusRef: { current: FocusState };
}) {
  const sigma = useSigma();
  useEffect(() => {
    focusRef.current = {
      id: focus,
      near: focus ? neighborsOf(adjacency, focus) : null,
      theme,
      hidden,
    };
    sigma.refresh({ skipIndexation: true });
  }, [focus, adjacency, theme, hidden, focusRef, sigma]);
  return null;
}

/**
 * Moves the camera on request. Sigma's camera lives in *normalised* ("framed")
 * coordinates, not in the raw layout coordinates stored on the nodes: feeding
 * it raw coordinates flings the view off the graph and leaves a blank canvas
 * — so the target always comes from getNodeDisplayData().
 */
function CameraController({
  focusRequest,
  fitSignal,
}: {
  focusRequest: { id: string; n: number };
  fitSignal: number;
}) {
  const sigma = useSigma();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!focusRequest.id) return;
    const g = sigma.getGraph();
    if (!g.hasNode(focusRequest.id)) return;
    const a = g.getNodeAttributes(focusRequest.id);
    const p = sigma.graphToViewport({ x: a.x, y: a.y });
    const { width, height } = sigma.getDimensions();
    if (!needsRecentre(p, { w: width, h: height })) return;
    const d = sigma.getNodeDisplayData(focusRequest.id);
    if (d) void sigma.getCamera().animate({ x: d.x, y: d.y }, { duration: reduce ? 0 : 350 });
    // Only a new request moves the camera; `reduce` changing must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest.n]);

  useEffect(() => {
    if (fitSignal > 0) void sigma.getCamera().reset({ duration: reduce ? 0 : 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  return null;
}

function ZoomControls() {
  const sigma = useSigma();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const zoom = (factor: number) => {
    const cam = sigma.getCamera();
    void cam.animate(
      { ratio: cam.getBoundedRatio(cam.ratio * factor) },
      { duration: reduce ? 0 : 200 },
    );
  };
  const btn =
    "grid h-8 w-8 place-items-center text-muted hover:bg-active hover:text-ink focus-visible:bg-active";
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        className={btn}
        onClick={() => zoom(1 / 1.5)}
        aria-label={t("graph.zoomIn")}
        title={t("graph.zoomIn")}
      >
        <Plus size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={`${btn} border-y border-line`}
        onClick={() => zoom(1.5)}
        aria-label={t("graph.zoomOut")}
        title={t("graph.zoomOut")}
      >
        <Minus size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => void sigma.getCamera().reset({ duration: reduce ? 0 : 300 })}
        aria-label={t("graph.fit")}
        title={t("graph.fit")}
      >
        <Maximize size={14} aria-hidden />
      </button>
    </div>
  );
}

/** Selection / origin halos and the hover card, positioned from sigma's own projection. */
function Overlays({
  selected,
  originId,
  hovered,
  nodes,
  labels,
}: {
  selected: string;
  originId: string;
  hovered: string | null;
  nodes: Map<string, GraphNode>;
  labels: IslandLabel[];
}) {
  const sigma = useSigma();
  const { t, lang } = useI18n();
  const selRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef(new Map<string, HTMLParagraphElement>());
  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);

  const place = useCallback(() => {
    const g = sigma.getGraph();
    const where = (id: string) => {
      const a = g.getNodeAttributes(id);
      const p = sigma.graphToViewport({ x: a.x, y: a.y });
      const d = sigma.getNodeDisplayData(id);
      return { p, r: d ? sigma.scaleSize(d.size) : 8 };
    };
    const halo = (el: HTMLDivElement | null, id: string | null, pad: number) => {
      if (!el) return;
      if (!id || !g.hasNode(id)) {
        el.style.display = "none";
        return;
      }
      const { p, r } = where(id);
      const size = (r + pad) * 2;
      el.style.display = "block";
      el.style.width = el.style.height = `${size}px`;
      el.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`;
    };
    halo(selRef.current, selected && g.hasNode(selected) ? selected : null, 5);
    halo(orgRef.current, originId && originId !== selected ? originId : null, 4);

    const tip = tipRef.current;
    if (tip) {
      if (hovered && g.hasNode(hovered)) {
        const { p, r } = where(hovered);
        const { width } = sigma.getDimensions();
        const tw = tip.offsetWidth;
        const below = p.y < 110;
        tip.style.display = "block";
        tip.style.left = `${Math.min(Math.max(p.x, tw / 2 + 8), width - tw / 2 - 8)}px`;
        tip.style.top = `${below ? p.y + r + 10 : p.y - r - 10}px`;
        tip.style.transform = below ? "translate(-50%, 0)" : "translate(-50%, -100%)";
      } else tip.style.display = "none";
    }

    // Island names ride the same render pulse: graph-space anchors projected
    // to screen on every camera move, exactly like the halos.
    for (const l of labels) {
      const el = tagRefs.current.get(l.label);
      if (!el) continue;
      const p = sigma.graphToViewport({ x: l.x, y: l.y });
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }, [sigma, selected, originId, hovered, labels]);

  useEffect(() => {
    place();
    sigma.on("afterRender", place);
    return () => void sigma.off("afterRender", place);
  }, [sigma, place]);

  useEffect(() => {
    window.__folioGraph = {
      ids: () => sigma.getGraph().nodes(),
      title: (id) => nodes.get(id)?.title ?? "",
      project: (id) => {
        const a = sigma.getGraph().getNodeAttributes(id);
        const p = sigma.graphToViewport({ x: a.x, y: a.y });
        // Page coordinates: sigma knows the viewport position, not where the
        // element sits in the document.
        const r = sigma.getContainer().getBoundingClientRect();
        return { x: p.x + r.left, y: p.y + r.top };
      },
      box: () => sigma.getDimensions(),
      camera: () => {
        const { x, y, ratio } = sigma.getCamera().getState();
        return { x, y, ratio };
      },
    };
    return () => {
      delete window.__folioGraph;
    };
  }, [sigma, nodes]);

  const hoverNode = hovered ? nodes.get(hovered) : undefined;
  return (
    <>
      {labels.length > 1 &&
        labels.map((l) => (
          <p
            key={l.label}
            ref={(el) => {
              if (el) tagRefs.current.set(l.label, el);
              else tagRefs.current.delete(l.label);
            }}
            aria-hidden
            data-testid="island-label"
            className="pointer-events-none absolute top-0 left-0 z-0 max-w-44 truncate text-center text-[11px] font-medium tracking-wide text-muted/70 uppercase"
          >
            {l.label}
          </p>
        ))}
      <div
        ref={orgRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 hidden rounded-full border-2 border-dashed"
        style={{ borderColor: ACCENT }}
      />
      <div
        ref={selRef}
        aria-hidden
        data-testid="selection-ring"
        className="pointer-events-none absolute top-0 left-0 hidden rounded-full border-[2.5px] border-ink"
      />
      <div
        ref={tipRef}
        role="tooltip"
        className="pointer-events-none absolute z-20 hidden max-w-[280px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[0_4px_16px_rgba(0,0,0,0.14)]"
      >
        {hoverNode && (
          <>
            <p className="line-clamp-3 leading-4 font-medium">{hoverNode.title}</p>
            <p className="mt-1 truncate text-muted">
              {[hoverNode.authors[0], hoverNode.year, hoverNode.venue].filter(Boolean).join(" · ")}
            </p>
            <p className="num mt-0.5 text-muted">
              {nf.format(hoverNode.citedBy)}{" "}
              {hoverNode.citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}
              {hoverNode.role !== "origin" && hoverNode.role !== "mine" && (
                <> · {t("graph.rel.sim", { pct: String(Math.round(hoverNode.sim * 100)) })}</>
              )}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- the canvas ---------- */

export type GraphCanvasProps = {
  graph: Graph;
  nodes: Map<string, GraphNode>;
  adjacency: Adjacency;
  originId: string;
  selected: string;
  hovered: string | null;
  theme: CanvasTheme;
  focusRequest: { id: string; n: number };
  fitSignal: number;
  ariaLabel: string;
  /** Papers hidden by the year timeline (never rendered). */
  hidden: Set<string>;
  /** Bibliography-island names anchored to the layout. */
  labels: IslandLabel[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onMakeOrigin: (id: string) => void;
};

export function GraphCanvas(props: GraphCanvasProps) {
  const {
    graph,
    nodes,
    adjacency,
    originId,
    selected,
    hovered,
    theme,
    focusRequest,
    fitSignal,
    hidden,
    labels,
  } = props;
  const wrap = useRef<HTMLDivElement>(null);
  // Mount sigma only once the wrapper has a real size: an unmeasured container
  // logs "Container has no height/width" and renders nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      setReady(r.width > 0 && r.height > 0);
    };
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const focusRef = useRef<FocusState>({ id: "", near: null, theme, hidden: new Set() });

  // Sigma v4 styles are declarative; the reducers below only layer the focus
  // dimming on top, reading the ref so they never have to be replaced.
  const options = useMemo<Partial<SigmaOptions>>(
    () => ({
      minCameraRatio: 0.15,
      maxCameraRatio: 3,
      labelRenderedSizeThreshold: 11,
      labelDensity: 1,
      labelGridCellSize: 110,
      stagePadding: 48,
      styles: {
        nodes: {
          ...DEFAULT_STYLES.nodes,
          labelColor: theme.label,
          labelSize: 12,
          backdropVisibility: "hidden", // our own hover card replaces sigma's
        },
        edges: DEFAULT_STYLES.edges,
      },
      nodeReducer: (key, data, attrs) => {
        const f = focusRef.current;
        const forced = attrs.force ? ({ labelVisibility: "visible" } as const) : {};
        if (f.hidden.has(key)) return { ...data, visibility: "hidden" };
        if (!f.near) return { ...data, ...forced };
        if (key === f.id) return { ...data, labelVisibility: "visible" };
        if (f.near.has(key)) return { ...data, labelVisibility: "visible" };
        return { ...data, color: f.theme.dim, labelVisibility: "hidden" };
      },
      edgeReducer: (key, data, _attrs, _state, _graphState, graph) => {
        const f = focusRef.current;
        if (!f.near) return data;
        const [a, b] = graph.extremities(key);
        if (a === f.id || b === f.id)
          return { ...data, color: f.theme.focusEdge, size: Math.max(data.size, 1.4) + 0.8 };
        return { ...data, color: f.theme.dimEdge };
      },
    }),
    [theme],
  );

  // Sigma has no container observer: keep its canvas in sync when side panels
  // or the window resize, or a stale mouse layer eats clicks.
  return (
    <div
      ref={wrap}
      className="absolute inset-0"
      role="img"
      aria-label={props.ariaLabel}
      data-testid="graph-stage"
    >
      {ready && (
        <CanvasBoundary>
          <SigmaContainer
            graph={graph}
            style={{ position: "absolute", inset: 0, background: "transparent" }}
            options={options}
          >
            <Events
              onSelect={props.onSelect}
              onHover={props.onHover}
              onMakeOrigin={props.onMakeOrigin}
            />
            <Highlight
              focus={hovered ?? selected}
              adjacency={adjacency}
              theme={theme}
              hidden={hidden}
              focusRef={focusRef}
            />
            <CameraController focusRequest={focusRequest} fitSignal={fitSignal} />
            <Overlays
              selected={selected}
              originId={originId}
              hovered={hovered}
              nodes={nodes}
              labels={labels}
            />
            <ZoomControls />
            <Resizer />
          </SigmaContainer>
        </CanvasBoundary>
      )}
    </div>
  );
}

function Resizer() {
  const sigma = useSigma();
  useEffect(() => {
    const ro = new ResizeObserver(() => sigma.resize());
    ro.observe(sigma.getContainer());
    return () => ro.disconnect();
  }, [sigma]);
  return null;
}
