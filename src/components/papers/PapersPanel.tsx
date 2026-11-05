"use client";

// The Papers tab in three plain views — Search · Library · Check — plus the
// literature explorer, which opens full-screen from any paper.

import nextDynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { citedKeys } from "@/lib/citation-health";
import { findInBib, parseBibEntries, type BibEntry } from "@/lib/bib-entries";
import { useI18n } from "@/lib/i18n/client";
import type { GraphSeed } from "@/lib/graph-types";
import type { Paper } from "@/lib/papers";
import { seedKey } from "@/components/graph/graph-model";
import { tourEvent } from "@/components/onboarding/tasks";
import type { FileDoc } from "@/components/workspace/document-store";
import { CheckView } from "./CheckView";
import { LibraryView } from "./LibraryView";
import { SearchView } from "./SearchView";

// sigma touches WebGL2RenderingContext at import time: never in the SSR bundle.
const GraphExplorer = nextDynamic(() => import("@/components/graph/GraphExplorer"), { ssr: false });

type View = "search" | "library" | "check";

type Props = {
  projectId: string;
  /** Current text of the project's .tex/.bib files, read when a view needs it. */
  getSources: () => { path: string; content: string }[];
  canCite: boolean;
  onCite: (key: string) => void;
  onBibUpdated: (file: FileDoc, key: string, added: boolean) => void;
  onFilesUpdated: (files: FileDoc[]) => void;
  flush: () => Promise<void>;
  /** Reveal a file position in the editor. */
  onOpenAt: (path: string, line: number) => void;
  /** Sub-view the workspace wants on top (the tour's «Show me»); null = leave it. */
  revealView?: View | null;
};

export function PapersPanel({
  projectId,
  getSources,
  canCite,
  onCite,
  onBibUpdated,
  onFilesUpdated,
  flush,
  onOpenAt,
  revealView,
}: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("search");
  // The tour's «Show me» names a sub-view; state adjusts during render (the
  // React pattern for prop-driven changes) rather than through an effect.
  const [revealed, setRevealed] = useState(revealView);
  if (revealView && revealView !== revealed) {
    setRevealed(revealView);
    setView(revealView);
  }
  const [explorer, setExplorer] = useState<{ seed: GraphSeed | null } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Bibliography entries and cited keys, re-derived only when the text changes.
  const sources = getSources();
  const bibText = sources
    .filter((s) => s.path.endsWith(".bib"))
    .map((s) => `${s.path}\u0000${s.content}`)
    .join("\u0001");
  const texText = sources
    .filter((s) => s.path.endsWith(".tex"))
    .map((s) => `${s.path}\u0000${s.content}`)
    .join("\u0001");
  const entries = useMemo<BibEntry[]>(
    () =>
      bibText
        ? bibText.split("\u0001").flatMap((chunk) => {
            const [path, ...rest] = chunk.split("\u0000");
            return parseBibEntries(rest.join("\u0000"), path);
          })
        : [],
    [bibText],
  );
  const cited = useMemo(
    () =>
      new Set(
        citedKeys(
          texText
            ? texText.split("\u0001").map((chunk) => {
                const [path, ...rest] = chunk.split("\u0000");
                return { path, content: rest.join("\u0000") };
              })
            : [],
        ),
      ),
    [texText],
  );
  const bibKeyOf = useCallback(
    (item: { doi?: string; title: string }) => findInBib(entries, item)?.key,
    [entries],
  );

  /** Adds a paper to the .bib (server-side dedup) and optionally inserts \cite. */
  const citeById = useCallback(
    async (source: Paper["source"], paperId: string, insert: boolean) => {
      // The server appends to the stored .bib; land our pending edits first or
      // its answer would clobber them (see DocumentStore.replaceFromServer).
      await flush();
      const r = await api<{ key: string; added: boolean; file: FileDoc }>(
        "POST",
        `/api/projects/${projectId}/citations`,
        { source, paperId },
      );
      onBibUpdated(r.file, r.key, r.added);
      if (insert && canCite) onCite(r.key);
      return { key: r.key, added: r.added, path: r.file.path };
    },
    [flush, projectId, onBibUpdated, onCite, canCite],
  );

  async function citeFromSearch(p: Paper) {
    // Already in the .bib: just drop the \cite at the cursor, no round-trip.
    const known = bibKeyOf(p);
    if (known) {
      if (canCite) onCite(known);
      setMessage({ text: t("papers.cited.existing", { file: "references.bib", key: known }) });
      tourEvent("cite-paper");
      return;
    }
    setAdding(p.id);
    setMessage(null);
    try {
      const r = await citeById(p.source, p.id, true);
      tourEvent("cite-paper");
      setMessage({
        text: r.added
          ? t("papers.cited.inserted", { file: r.path, key: r.key })
          : t("papers.cited.existing", { file: r.path, key: r.key }),
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

  const openExplorer = useCallback((seed: GraphSeed | null) => setExplorer({ seed }), []);
  const closeExplorer = useCallback(() => setExplorer(null), []);
  const explorerCite = useCallback(
    (paperId: string) => citeById("openalex", paperId, true),
    [citeById],
  );

  const tabs: { id: View; label: string; badge?: number }[] = [
    { id: "search", label: t("ps.tab.search") },
    { id: "library", label: t("ps.tab.library"), badge: entries.length },
    { id: "check", label: t("ps.tab.check") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 gap-1 border-b border-line px-3 py-2"
        role="tablist"
        aria-label={t("papers.search")}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`papers-tab-${tab.id}`}
            aria-selected={view === tab.id}
            aria-controls={`papers-view-${tab.id}`}
            onClick={() => {
              setView(tab.id);
              if (tab.id === "library") tourEvent("library");
            }}
            className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
              view === tab.id ? "bg-active text-ink" : "text-muted hover:bg-raised hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.badge ? (
              <span className="num text-[10px] font-normal text-muted">{tab.badge}</span>
            ) : null}
          </button>
        ))}
        <a
          href="/library"
          className="ml-auto flex h-7 items-center gap-1 px-2 text-xs text-muted hover:text-ink"
        >
          {t("lb.link")}
        </a>
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mx-3 mt-2 shrink-0 rounded-md px-3 py-2 text-xs ${
            message.error
              ? "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
              : "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* All views stay mounted: a search or a check report survives tab switches. */}
      <div className="min-h-0 flex-1">
        <div
          id="papers-view-search"
          role="tabpanel"
          aria-labelledby="papers-tab-search"
          className={view === "search" ? "h-full" : "hidden"}
        >
          <SearchView
            projectId={projectId}
            bibKeyOf={bibKeyOf}
            canCite={canCite}
            adding={adding}
            onCite={(p) => void citeFromSearch(p)}
            onExplore={openExplorer}
          />
        </div>
        <div
          id="papers-view-library"
          role="tabpanel"
          aria-labelledby="papers-tab-library"
          className={view === "library" ? "h-full" : "hidden"}
        >
          <LibraryView
            entries={entries}
            citedKeys={cited}
            canCite={canCite}
            onInsert={onCite}
            onExplore={(e) =>
              e.doi && openExplorer({ source: "doi", paperId: e.doi, title: e.title })
            }
            onOpenEntry={(e) => onOpenAt(e.file, e.line)}
            onOpenGraph={() => openExplorer(null)}
          />
        </div>
        <div
          id="papers-view-check"
          role="tabpanel"
          aria-labelledby="papers-tab-check"
          className={view === "check" ? "h-full" : "hidden"}
        >
          <CheckView projectId={projectId} flush={flush} onFilesUpdated={onFilesUpdated} />
        </div>
      </div>

      {explorer && (
        <GraphExplorer
          key={seedKey(explorer.seed)}
          projectId={projectId}
          seed={explorer.seed}
          bibKeyOf={bibKeyOf}
          onClose={closeExplorer}
          onCite={explorerCite}
        />
      )}
    </div>
  );
}
