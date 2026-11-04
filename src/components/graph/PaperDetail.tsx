"use client";

// Right panel of the explorer: everything known about the selected paper. The
// basics render instantly from the graph; abstract, summary, topics and links
// arrive from the details endpoint and never block the panel.

import { useState } from "react";
import { Check, ExternalLink, Network } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { GraphRole, PaperDetail as PaperDetailData } from "@/lib/graph-types";

export type DetailItem = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedBy: number;
  doi?: string;
  role?: GraphRole;
  sim?: number;
  shared?: number;
  cocited?: number;
  inGraphCitedBy?: number;
  /** Set for works outside the graph (prior / derivative lists). */
  outside?: "prior" | "derivative";
  links?: number;
};

type Props = {
  item: DetailItem | null;
  /** undefined while the details endpoint is still answering. */
  detail: { status: "ready" | "error"; data?: PaperDetailData } | undefined;
  isOrigin: boolean;
  bibMode: boolean;
  /** Citation key when the paper is already in the project bibliography. */
  bibKey?: string;
  citing: boolean;
  onCite: () => void;
  onMakeOrigin: () => void;
  onRetry: () => void;
};

const MAX_AUTHORS = 8;

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-raised"
          style={{ width: `${100 - ((i * 13) % 35)}%` }}
        />
      ))}
    </div>
  );
}

function Abstract({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const long = text.length > 520;
  return (
    <div>
      <p className={`text-[13px] leading-[21px] ${long && !open ? "line-clamp-[8]" : ""}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-xs text-accent hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? t("graph.detail.less") : t("graph.detail.more")}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  );
}

export function PaperDetail({
  item,
  detail,
  isOrigin,
  bibMode,
  bibKey,
  citing,
  onCite,
  onMakeOrigin,
  onRetry,
}: Props) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang);

  if (!item) {
    return (
      <div className="p-5 text-sm leading-6 text-muted" data-testid="paper-detail">
        {bibMode ? t("graph.detail.bib") : t("graph.detail.none")}
      </div>
    );
  }

  const data = detail?.data;
  const authors = data?.authors.length ? data.authors : item.authors;
  const shownAuthors = authors.slice(0, MAX_AUTHORS);
  const extra = authors.length - shownAuthors.length;
  const doi = data?.doi ?? item.doi;
  const venue = data?.venue ?? item.venue;
  const year = data?.year ?? item.year;
  const citedBy = data?.citedBy ?? item.citedBy;
  const relation: string[] = [];
  if (item.role === "prior") relation.push(t("graph.rel.prior"));
  else if (item.role === "derivative") relation.push(t("graph.rel.derivative"));
  else if (item.role === "related") relation.push(t("graph.rel.related"));
  else if (item.role === "mine") relation.push(t("graph.rel.mine"));
  if (item.outside)
    relation.push(
      t(item.outside === "prior" ? "graph.links.prior" : "graph.links.derivative", {
        n: String(item.links ?? 0),
      }),
    );
  if (item.sim !== undefined && item.role && item.role !== "origin" && item.role !== "mine")
    relation.push(t("graph.rel.sim", { pct: String(Math.round(item.sim * 100)) }));
  if (item.shared) relation.push(t("graph.rel.shared", { n: String(item.shared) }));
  if (item.cocited) relation.push(t("graph.rel.cocited", { n: String(item.cocited) }));
  if (item.inGraphCitedBy)
    relation.push(t("graph.rel.inGraph", { n: String(item.inGraphCitedBy) }));

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="paper-detail" aria-live="polite">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3">
        <h2 className="text-[17px] leading-6 font-semibold" data-testid="detail-title">
          {data?.title ?? item.title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-muted">
          {shownAuthors.join(", ")}
          {extra > 0 && ` ${t("graph.detail.authors.more", { n: String(extra) })}`}
        </p>
        <p className="mt-1 text-xs text-muted">{[venue, year].filter(Boolean).join(" · ")}</p>

        <p className="num mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <span>
            <strong className="font-semibold text-ink">{nf.format(citedBy)}</strong>{" "}
            {citedBy === 1 ? t("papers.citations.one") : t("papers.citations")}
          </span>
          {data && data.referencesCount > 0 && (
            <span>{t("graph.detail.references", { n: nf.format(data.referencesCount) })}</span>
          )}
          {data?.type && (
            <span className="pill bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]">
              {data.type}
            </span>
          )}
          {data?.isOa && (
            <span className="pill bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]">
              {t("papers.oaBadge")}
            </span>
          )}
        </p>

        {data?.tldr && (
          <Section title={t("graph.detail.tldr")}>
            <p className="rounded-md bg-accent-soft px-3 py-2 text-[13px] leading-5">{data.tldr}</p>
          </Section>
        )}

        <Section title={t("graph.detail.abstract")}>
          {detail === undefined && <Skeleton lines={6} />}
          {detail?.status === "error" && (
            <p className="text-xs text-[var(--pill-negative-ink)]">
              {t("graph.detail.error")}{" "}
              <button type="button" className="underline" onClick={onRetry}>
                {t("graph.retry")}
              </button>
            </p>
          )}
          {data &&
            (data.abstract ? (
              <Abstract key={item.id} text={data.abstract} />
            ) : (
              <p className="text-xs text-muted">{t("graph.detail.abstract.none")}</p>
            ))}
        </Section>

        {relation.length > 0 && (
          <Section title={t("graph.rel.title")}>
            <ul className="space-y-1 text-[13px] leading-5">
              {relation.map((r) => (
                <li key={r} className="flex gap-2">
                  <Network size={13} aria-hidden className="mt-[3px] shrink-0 text-muted" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data && data.topics.length > 0 && (
          <Section title={t("graph.detail.topics")}>
            <ul className="flex flex-wrap gap-1.5">
              {data.topics.map((topic) => (
                <li
                  key={topic}
                  className="pill bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]"
                >
                  {topic}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(doi || data) && (
          <Section title={t("graph.detail.links")}>
            <div className="flex flex-wrap gap-1.5">
              {doi && <ExtLink href={`https://doi.org/${doi}`} label="DOI" />}
              {data?.openAccessUrl && (
                <ExtLink href={data.openAccessUrl} label={t("graph.detail.pdf")} />
              )}
              {data?.landingUrl && (
                <ExtLink href={data.landingUrl} label={t("graph.detail.publisher")} />
              )}
              {data?.arxivId && (
                <ExtLink href={`https://arxiv.org/abs/${data.arxivId}`} label="arXiv" />
              )}
              {data && <ExtLink href={data.openalexUrl} label="OpenAlex" />}
            </div>
          </Section>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
        {bibKey ? (
          <span className="flex items-center gap-1.5 text-xs text-ok" title={bibKey}>
            <Check size={14} aria-hidden /> {t("graph.detail.cited")}
          </span>
        ) : (
          <button type="button" className="btn btn-primary" disabled={citing} onClick={onCite}>
            {citing ? t("papers.adding") : t("graph.detail.cite")}
          </button>
        )}
        {isOrigin ? (
          <span
            className="pill"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {t("graph.detail.isOrigin")}
          </span>
        ) : (
          <button type="button" className="btn" onClick={onMakeOrigin}>
            {t("graph.detail.makeOrigin")}
          </button>
        )}
      </div>
    </div>
  );
}

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="btn btn-sm" href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}
