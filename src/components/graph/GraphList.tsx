"use client";

// Left panel of the explorer: every paper of the graph (plus the "prior" and
// "derivative" works that fall outside it), sortable and filterable. It is also
// the keyboard / screen-reader way through the graph.

import { memo, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { GraphNode, OutsideWork } from "@/lib/graph-types";
import {
  authorLine,
  filterNodes,
  sortNodes,
  sortOutside,
  yearColor,
  type SortKey,
} from "./graph-model";
import { ACCENT } from "./graph-build";

export type ListTab = "graph" | "prior" | "derivative";

type RowData = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedBy: number;
  sim?: number;
  origin?: boolean;
  mine?: boolean;
  note?: string;
  inBib: boolean;
  color: string;
};

const Row = memo(function Row({
  d,
  active,
  onSelect,
  onHover,
}: {
  d: RowData;
  active: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang);
  return (
    <li>
      <button
        type="button"
        data-testid="graph-row"
        data-id={d.id}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(d.id)}
        onMouseEnter={() => onHover(d.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(d.id)}
        onBlur={() => onHover(null)}
        className={`flex w-full gap-2.5 border-l-[3px] px-3 py-2.5 text-left transition-colors ${
          active ? "border-accent bg-active" : "border-transparent hover:bg-raised"
        }`}
      >
        <span
          aria-hidden
          className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: d.color }}
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] leading-[18px] font-medium">{d.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {[authorLine(d.authors), d.year, d.venue].filter(Boolean).join(" · ")}
          </span>
          <span className="num mt-1 flex items-center gap-2 text-[11px] text-muted">
            {d.origin && (
              <span className="pill" style={{ background: ACCENT, color: "#fff" }}>
                {t("graph.originBadge")}
              </span>
            )}
            <span>
              {nf.format(d.citedBy)}{" "}
              {d.citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}
            </span>
            {d.sim !== undefined && !d.origin && !d.mine && (
              <span
                className="h-1 w-12 overflow-hidden rounded-full bg-raised"
                title={t("graph.rel.sim", { pct: String(Math.round(d.sim * 100)) })}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(6, Math.round(d.sim * 100))}%`, background: ACCENT }}
                />
              </span>
            )}
            {d.note && <span className="truncate">{d.note}</span>}
            {d.inBib && (
              <span
                className="ml-auto flex shrink-0 items-center gap-0.5 text-ok"
                title={t("graph.inBib")}
              >
                <Check size={12} aria-hidden />
                <span className="sr-only">{t("graph.inBib")}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
});

export function GraphList({
  nodes,
  prior,
  derivative,
  years,
  selected,
  tab,
  onTab,
  onSelect,
  onHover,
  inBib,
}: {
  nodes: GraphNode[];
  prior: OutsideWork[];
  derivative: OutsideWork[];
  years: { min: number; max: number } | null;
  selected: string;
  tab: ListTab;
  onTab: (tab: ListTab) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  inBib: (item: { doi?: string; title: string }) => boolean;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortKey>("sim");
  const [query, setQuery] = useState("");

  const rows = useMemo<RowData[]>(() => {
    const color = (y?: number) => yearColor(y, years?.min ?? 0, years?.max ?? 0);
    if (tab === "graph")
      return filterNodes(sortNodes(nodes, sort), query).map((n) => ({
        id: n.id,
        title: n.title,
        authors: n.authors,
        year: n.year,
        venue: n.venue,
        citedBy: n.citedBy,
        sim: n.sim,
        origin: n.role === "origin",
        mine: n.role === "mine",
        inBib: inBib(n),
        color: n.role === "origin" || n.role === "mine" ? ACCENT : color(n.year),
      }));
    const list = tab === "prior" ? prior : derivative;
    return filterNodes(sortOutside(list, sort), query).map((w) => ({
      id: w.id,
      title: w.title,
      authors: w.authors,
      year: w.year,
      venue: w.venue,
      citedBy: w.citedBy,
      note: t(tab === "prior" ? "graph.links.prior" : "graph.links.derivative", {
        n: String(w.links),
      }),
      inBib: inBib(w),
      color: color(w.year),
    }));
  }, [tab, nodes, prior, derivative, sort, query, years, inBib, t]);

  const tabs: { id: ListTab; label: string; n: number }[] = [
    { id: "graph", label: t("graph.tab.graph"), n: nodes.length },
    ...(prior.length
      ? [{ id: "prior" as const, label: t("graph.tab.prior"), n: prior.length }]
      : []),
    ...(derivative.length
      ? [{ id: "derivative" as const, label: t("graph.tab.derivative"), n: derivative.length }]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-3 border-b border-line px-3 pt-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className="tab"
            onClick={() => onTab(x.id)}
          >
            {x.label} <span className="num font-normal text-muted">{x.n}</span>
          </button>
        ))}
      </div>

      {tab !== "graph" && (
        <p className="shrink-0 border-b border-line px-3 py-2 text-xs leading-4 text-muted">
          {t(tab === "prior" ? "graph.tab.prior.hint" : "graph.tab.derivative.hint")}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("graph.filter.ph")}</span>
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted"
          />
          <input
            className="input h-7 pl-7 text-xs"
            placeholder={t("graph.filter.ph")}
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">{t("graph.sort")}</span>
          <select
            className="select h-7 text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="sim">{t("graph.sort.sim")}</option>
            <option value="citations">{t("graph.sort.citations")}</option>
            <option value="yearDesc">{t("graph.sort.yearDesc")}</option>
            <option value="yearAsc">{t("graph.sort.yearAsc")}</option>
          </select>
        </label>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto" data-testid="graph-list">
        {rows.map((d) => (
          <Row key={d.id} d={d} active={d.id === selected} onSelect={onSelect} onHover={onHover} />
        ))}
        {rows.length === 0 && (
          <li className="p-4 text-sm text-muted">
            {query ? t("graph.list.none") : t("graph.list.empty")}
          </li>
        )}
      </ul>
    </div>
  );
}
