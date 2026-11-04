"use client";

// One search / suggestion result: the facts that matter at a glance, the
// abstract on demand, and two clear actions — cite it, or explore its surroundings.

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, Network } from "lucide-react";
import { authorLine } from "@/components/graph/graph-model";
import { useI18n } from "@/lib/i18n/client";
import type { Paper } from "@/lib/papers";

export function PaperCard({
  p,
  bibKey,
  canCite,
  adding,
  onCite,
  onExplore,
}: {
  p: Paper;
  /** Citation key when the paper is already in the project's .bib. */
  bibKey?: string;
  canCite: boolean;
  adding: boolean;
  onCite: (p: Paper) => void;
  onExplore: (p: Paper) => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const nf = new Intl.NumberFormat(lang);
  const link = p.openAccessUrl ?? (p.doi ? `https://doi.org/${p.doi}` : undefined);

  return (
    <li className="px-3 py-3" data-testid="paper-card">
      <button
        type="button"
        className="text-left text-sm leading-5 font-medium hover:text-accent"
        onClick={() => onExplore(p)}
        title={t("ps.explore.title")}
      >
        {p.title}
      </button>
      <p className="mt-0.5 text-xs text-muted">
        {[authorLine(p.authors), p.year, p.venue].filter(Boolean).join(" · ")}
      </p>
      <p className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
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
        {bibKey && (
          <span className="flex items-center gap-1 text-ok" title={bibKey}>
            <Check size={12} aria-hidden /> {t("ps.inBib", { key: bibKey })}
          </span>
        )}
      </p>

      {p.abstract && (
        <div className="mt-1.5">
          <p className={`text-xs leading-[18px] text-muted ${open ? "" : "line-clamp-2"}`}>
            {p.abstract}
          </p>
          <button
            type="button"
            className="mt-0.5 flex items-center gap-0.5 text-xs text-accent hover:underline"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t("papers.abstract.hide") : t("papers.abstract")}
            <ChevronDown size={12} aria-hidden className={open ? "rotate-180" : ""} />
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {bibKey ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onCite(p)}
            disabled={adding}
            title={t("papers.cite.title.on")}
          >
            {adding ? t("papers.adding") : t("lib.insert")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onCite(p)}
            disabled={adding}
            title={canCite ? t("papers.cite.title.on") : t("papers.cite.title.off")}
          >
            {adding ? t("papers.adding") : canCite ? t("papers.cite") : t("papers.add")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onExplore(p)}
          title={t("ps.explore.title")}
          data-testid="explore"
        >
          <Network size={13} aria-hidden /> {t("ps.explore")}
        </button>
        {link && (
          <a
            className="btn btn-ghost btn-sm"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title={p.openAccessUrl ? t("papers.read") : "DOI"}
          >
            {p.openAccessUrl ? t("papers.read") : "DOI"}
            <ExternalLink size={11} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}
