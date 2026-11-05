"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MessageSquare, Pencil } from "lucide-react";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { ArxivExport } from "./ArxivExport";
import { CommentsDrawer, type CommentDto, type CommentDraft } from "./CommentsDrawer";
import { ShareMenu } from "./ShareMenu";
import { SnapshotsMenu } from "./SnapshotsMenu";
import { bibKeys } from "@/lib/bibtex";
import { relocateAnchor } from "@/lib/anchors";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { AgentPlan } from "@/lib/ai-prompts";
import type { LogIssue } from "@/lib/latex-log";
import { AiPanel } from "./AiPanel";
import { ReviewPanel } from "./ReviewPanel";
import { CodeEditor, type EditorHandle } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { PapersPanel } from "@/components/papers/PapersPanel";
import { PdfPanel, type CompileState } from "./PdfPanel";
import { useDocuments, type FileDoc, type SaveStatus } from "./useDocuments";
import { useOutsideClose } from "./useOutsideClose";
import { requestCollab } from "@/lib/collab";

type Props = {
  project: {
    id: string;
    name: string;
    mainFile: string;
    aiInstructions: string | null;
    aiStyleSample: string | null;
    aiPlan?: unknown;
    /** Owner's decision on AI for this manuscript: any | local | off. */
    aiPolicy?: string | null;
    /** Access level of the current user; the owner sees the share menu. */
    role?: "owner" | "editor" | "viewer";
  };
  initialFiles: FileDoc[];
  aiEnabled: boolean;
  /** Display name for live cursors when real-time collab is enabled. */
  userName?: string;
};

type SideTab = "files" | "papers" | "assistant" | "review";
type MobileView = "files" | "editor" | "pdf" | "papers" | "assistant" | "review";

const STATUS_KEY: Record<
  SaveStatus,
  "save.saved" | "save.dirty" | "save.saving" | "save.error" | "save.conflict"
> = {
  saved: "save.saved",
  dirty: "save.dirty",
  saving: "save.saving",
  error: "save.error",
  conflict: "save.conflict",
};

const desktopQuery = "(min-width: 900px)";
const subscribeMedia = (cb: () => void) => {
  const m = window.matchMedia(desktopQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** Finds a phrase clicked in the PDF in the sources; tolerant of line breaks. */
function locate(text: string, docs: { id: string; path: string; content: string }[]) {
  const words = text
    .normalize("NFKC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return null;
  const re = new RegExp(words.join("\\s+"));
  for (const d of docs) {
    // Index and line count on the same normalized text (NFKC can change length).
    const content = d.content.normalize("NFKC");
    const m = re.exec(content);
    if (m) return { id: d.id, line: content.slice(0, m.index).split("\n").length };
  }
  return null;
}

export function Workspace({ project, initialFiles, aiEnabled, userName }: Props) {
  const docs = useDocuments(project.id, initialFiles);
  const { t, lang } = useI18n();
  const editor = useRef<EditorHandle | null>(null);
  const isDesktop = useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
  const [name, setName] = useState(project.name);
  const [mainFile, setMainFile] = useState(project.mainFile);
  const exportRef = useOutsideClose();
  const [activeId, setActiveId] = useState<string | undefined>(
    () => initialFiles.find((f) => f.path === project.mainFile)?.id ?? initialFiles[0]?.id,
  );
  const [side, setSide] = useState<SideTab>("files");
  // The drafting agent is a main character now: give its tab more room.
  const sidePanel = useRef<PanelImperativeHandle | null>(null);
  useEffect(() => {
    sidePanel.current?.resize(side === "assistant" || side === "review" ? "32%" : "22%");
  }, [side]);
  const [mobile, setMobile] = useState<MobileView>("editor");
  const [compile, setCompile] = useState<CompileState>({
    status: "idle",
    errors: [],
    warnings: [],
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [arxivOpen, setArxivOpen] = useState(false);
  // Instruction handed over by the review panel ("Fix with the assistant").
  const [fixInstruction, setFixInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const pdfUrl = useRef<string | undefined>(undefined);

  // Comments: the data lives here so the header badge and the editor markers
  // survive the drawer closing.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentDto[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [focusComment, setFocusComment] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    fileId: string;
    from: number;
    to: number;
    text: string;
  } | null>(null);
  // Author id of the current user, learned from the first comment they post
  // (the session cookie pins one user per browser, so caching it is enough).
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    const cached = localStorage.getItem("folio:uid");
    if (cached) setMyId(cached);
  }, []);

  const reloadComments = useCallback(() => {
    api<{ comments: CommentDto[] }>("GET", `/api/projects/${project.id}/comments`)
      .then((r) => {
        setComments(r.comments);
        setCommentsError(null);
      })
      .catch((err) => setCommentsError((err as Error).message));
  }, [project.id]);

  // On mount, on drawer open, and when the active file changes (the server
  // relocates anchors against the current content of each file).
  useEffect(() => {
    reloadComments();
  }, [reloadComments, activeId, commentsOpen]);

  function commentPosted(c: CommentDto) {
    if (myId) return;
    localStorage.setItem("folio:uid", c.authorId);
    setMyId(c.authorId);
  }

  const active = docs.files.find((f) => f.id === activeId) ?? null;
  const keys = docs.files
    .filter((f) => f.path.endsWith(".bib"))
    .flatMap((f) => bibKeys(docs.store.getDoc(f.id)));
  const canCite = Boolean(active?.path.endsWith(".tex"));

  const unresolved = comments?.filter((c) => !c.resolvedAt).length ?? 0;

  // Gutter markers for the active file: one per anchored comment, on the
  // 1-based line its anchor starts on (relocated when the file changed since).
  const commentMarkers = useMemo(() => {
    if (!active || !comments) return [];
    const content = docs.store.getDoc(active.id);
    const out: { id: string; line: number }[] = [];
    for (const c of comments) {
      if (c.fileId !== active.id || c.anchorStart == null || c.anchorEnd == null) continue;
      const at = relocateAnchor(content, c.anchorQuote ?? "", c.anchorStart, c.anchorEnd) ?? {
        start: Math.min(c.anchorStart, content.length),
      };
      out.push({ id: c.id, line: content.slice(0, at.start).split("\n").length });
    }
    return out;
  }, [active, comments, docs.store]);

  // Live selection of the active .tex file; powers “Comment on selection”.
  const texSelection =
    selection && active && selection.fileId === active.id && active.path.endsWith(".tex")
      ? selection.text.trim()
        ? selection
        : null
      : null;

  function markerClicked(line: number) {
    // Prefer the first open thread on that line, else the first comment.
    const hit =
      commentMarkers.find(
        (m) => m.line === line && !comments?.find((c) => c.id === m.id)?.resolvedAt,
      ) ?? commentMarkers.find((m) => m.line === line);
    if (!hit) return;
    setFocusComment(hit.id);
    setCommentsOpen(true);
  }

  // Autocomplete sources for the editor: bib keys and \label anchors.
  const completions = useMemo(() => {
    const labels: string[] = [];
    for (const f of docs.files) {
      if (!f.path.endsWith(".tex")) continue;
      for (const m of docs.store.getDoc(f.id).matchAll(/\\label\{([^}]+)\}/g)) labels.push(m[1]);
    }
    return { citeKeys: keys, labels };
  }, [docs.files, keys, docs.store]);

  useEffect(() => {
    const key = `folio:import:${project.id}`;
    const msg = sessionStorage.getItem(key);
    if (msg) {
      sessionStorage.removeItem(key);
      queueMicrotask(() => setNotice(msg));
    }
  }, [project.id]);

  const [words, setWords] = useState<number | null>(null);
  // Live collab session for the active file (null when the feature is off).
  const [collab, setCollab] = useState<{ url: string; token: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCollab(null);
    if (activeId)
      void requestCollab(project.id, activeId).then((c) => {
        if (!cancelled) setCollab(c);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, activeId]);
  const [lint, setLint] = useState<LogIssue[] | null>(null);
  const [lintBusy, setLintBusy] = useState(false);

  /** chktex warnings over the stored sources; revealed like compile issues. */
  async function runLint() {
    setLintBusy(true);
    try {
      await docs.store.flush();
      const r = await api<{ issues: { file: string; line: number; message: string }[] }>(
        "GET",
        `/api/projects/${project.id}/lint`,
      );
      setLint(
        r.issues.map((i) => ({ file: i.file, line: i.line, message: `chktex: ${i.message}` })),
      );
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setLintBusy(false);
    }
  }

  const compiling = useRef(false);
  const runCompile = useCallback(async () => {
    if (compiling.current) return; // key repeat and double clicks race otherwise
    compiling.current = true;
    setCompile((c) => ({ ...c, status: "running", message: undefined }));
    if (!window.matchMedia(desktopQuery).matches) setMobile("pdf");
    const started = performance.now();
    try {
      await docs.store.flush();
      const r = await api<{
        ok: boolean;
        pdf?: string;
        log: string;
        timedOut?: boolean;
        errors: LogIssue[];
        warnings: LogIssue[];
      }>("POST", `/api/projects/${project.id}/compile`);
      let pdf: Uint8Array<ArrayBuffer> | undefined;
      if (r.ok && r.pdf) {
        pdf = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
        if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
        pdfUrl.current = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      }
      setCompile((c) => ({
        status: r.ok ? "done" : "failed",
        ok: r.ok,
        pdf: pdf ?? c.pdf,
        pdfUrl: pdfUrl.current,
        log: r.log,
        errors: r.errors,
        warnings: r.warnings,
        timedOut: r.timedOut,
        seconds: (performance.now() - started) / 1000,
      }));
      setLint(null);
      if (r.ok) {
        api<{ words: number }>("GET", `/api/projects/${project.id}/count`)
          .then((c) => setWords(c.words))
          .catch(() => setWords(null));
      } else {
        setWords(null);
      }
    } catch (err) {
      setCompile((c) => ({
        ...c,
        status: "failed",
        ok: undefined,
        message: (err as Error).message,
      }));
    } finally {
      compiling.current = false;
    }
  }, [docs.store, project.id]);

  useEffect(() => () => void (pdfUrl.current && URL.revokeObjectURL(pdfUrl.current)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void runCompile();
      } else if (e.key === "s") {
        e.preventDefault();
        void docs.store.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runCompile, docs.store]);

  function open(id: string, line?: number) {
    setActiveId(id);
    setMobile("editor");
    if (line) requestAnimationFrame(() => editor.current?.reveal(id, line));
  }

  /**
   * Applies a reviewed line-based AI patch (a compile-error fix) as a normal,
   * undoable editor edit. Returns false — changing nothing — when the target
   * lines no longer hold the text the proposal was computed against.
   */
  function applyPatch(p: {
    fileId: string;
    startLine: number;
    endLine: number;
    original: string;
    replacement: string;
  }): boolean {
    const content = docs.store.getDoc(p.fileId);
    const lines = content.split("\n");
    const start = p.startLine - 1;
    const end = p.endLine;
    if (start < 0 || end > lines.length) return false;
    const actual = lines.slice(start, end).join("\n");
    const norm = (s: string) => s.replace(/\r\n?/g, "\n");
    if (norm(actual) !== norm(p.original)) return false; // stale proposal
    // CRLF files keep CRLF in the replacement (the server computed \n).
    const replacement = actual.includes("\r")
      ? p.replacement.replace(/\n/g, "\r\n")
      : p.replacement;
    const from = lines.slice(0, start).reduce((n, l) => n + l.length + 1, 0);
    const dispatch = () =>
      editor.current?.replaceIfUnchanged(from, from + actual.length, actual, replacement) === true;
    if (activeId === p.fileId) {
      const ok = dispatch();
      if (ok) editor.current?.reveal(p.fileId, p.startLine);
      return ok;
    }
    // Not the visible file: switch first, apply once the editor holds the doc.
    open(p.fileId, p.startLine);
    requestAnimationFrame(() => void dispatch());
    return true; // the content guard above already passed on the live doc
  }

  function reveal(issue: LogIssue) {
    if (!issue.line) return;
    const target = issue.file ? docs.files.find((f) => f.path === issue.file) : active;
    if (target) open(target.id, issue.line);
    // Forward sync: also bring the PDF to the page holding that line.
    if (synctexBusy.current) return;
    synctexBusy.current = true;
    void docs.store
      .flush()
      .then(() =>
        api<{ ok: boolean; result?: { page: number } }>(
          "POST",
          `/api/projects/${project.id}/synctex`,
          { mode: "view", line: issue.line!, col: 1 },
        ),
      )
      .then((r) => {
        if (r.ok && r.result)
          document
            .getElementById(`pdf-page-${r.result.page}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(() => {})
      .finally(() => {
        synctexBusy.current = false;
      });
  }

  // Exact PDF→source sync. Costs a server-side recompile, so one at a time
  // and with a quiet fallback to the text heuristic when it fails.
  const synctexBusy = useRef(false);
  async function pointClicked(p: { page: number; x: number; y: number; text: string }) {
    if (synctexBusy.current) return;
    synctexBusy.current = true;
    try {
      await docs.store.flush();
      const r = await api<{ ok: boolean; result?: { file: string; line: number } }>(
        "POST",
        `/api/projects/${project.id}/synctex`,
        { mode: "edit", page: p.page, x: Math.round(p.x), y: Math.round(p.y) },
      );
      if (r.ok && r.result) {
        const name = r.result.file.split(/[\\/]/).pop() ?? "";
        const target =
          docs.files.find((f) => f.path === name || f.path.endsWith(`/${name}`)) ?? active;
        if (target) {
          open(target.id, r.result.line);
          return;
        }
      }
    } catch {
      /* fall through to the heuristic */
    } finally {
      synctexBusy.current = false;
    }
    findClicked(p.text);
  }

  function findClicked(text: string) {
    const texs = docs.files
      .filter((f) => f.path.endsWith(".tex"))
      .sort((a, b) => (a.path === mainFile ? -1 : b.path === mainFile ? 1 : 0))
      .map((f) => ({ ...f, content: docs.store.getDoc(f.id) }));
    const hit = locate(text, texs);
    if (hit) open(hit.id, hit.line);
    else
      setNotice(
        lang === "en"
          ? `“${text.slice(0, 40)}” was not found in the source.`
          : lang === "de"
            ? `„${text.slice(0, 40)}“ wurde im Quelltext nicht gefunden.`
            : `No se encontró «${text.slice(0, 40)}» en el código.`,
      );
  }

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return setName(project.name);
    if (trimmed === project.name) return;
    try {
      await api("PATCH", `/api/projects/${project.id}`, { name: trimmed });
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  function resolveWithServer() {
    const c = docs.store.takeServer();
    if (c) editor.current?.setDoc(c.fileId, c.content);
  }

  const statusDot =
    docs.status === "saved"
      ? "bg-ok"
      : docs.status === "error" || docs.status === "conflict"
        ? "bg-danger"
        : "bg-warn";

  /* ---------- panes ---------- */

  const files = (
    <FileTree
      projectId={project.id}
      files={docs.files}
      activeId={activeId}
      mainFile={mainFile}
      onOpen={(id) => open(id)}
      onAdded={(f) => {
        docs.store.add(f);
        if (!f.binary) open(f.id);
      }}
      onRenamed={docs.store.rename}
      onRemoved={(id) => {
        docs.store.remove(id);
        if (activeId === id) setActiveId(docs.files.find((f) => f.path === mainFile)?.id);
      }}
      onMainChanged={setMainFile}
    />
  );

  const syncServerFiles = (files: FileDoc | FileDoc[]) => {
    for (const file of [files].flat()) {
      if (!docs.files.some((f) => f.id === file.id)) docs.store.add(file);
      else docs.store.replaceFromServer(file.id, file.content, file.version);
      // The store keeps unsaved local edits; sync the editor to its copy.
      editor.current?.setDoc(file.id, docs.store.getDoc(file.id));
    }
  };

  const papers = (
    <PapersPanel
      projectId={project.id}
      getSources={() => docs.files.map((f) => ({ path: f.path, content: docs.store.getDoc(f.id) }))}
      canCite={canCite}
      onCite={(k) => editor.current?.insertAtCursor(`~\\cite{${k}}`)}
      onBibUpdated={syncServerFiles}
      onFilesUpdated={syncServerFiles}
      flush={docs.store.flush}
      onOpenAt={(path, line) => {
        const target = docs.files.find((f) => f.path === path);
        if (target) open(target.id, line);
      }}
    />
  );

  const addPapersToBib: NonNullable<React.ComponentProps<typeof AiPanel>["onAddPapers"]> = async (
    papers,
  ) => {
    // The server appends to the stored .bib; land our pending edits first.
    await docs.store.flush();
    for (const p of papers) {
      try {
        const r = await api<{ key: string; added: boolean; file: FileDoc }>(
          "POST",
          `/api/projects/${project.id}/citations`,
          { source: p.source, paperId: p.paperId },
        );
        if (!docs.files.some((f) => f.id === r.file.id)) docs.store.add(r.file);
        else docs.store.replaceFromServer(r.file.id, r.file.content, r.file.version);
        editor.current?.setDoc(r.file.id, docs.store.getDoc(r.file.id));
      } catch (err) {
        setNotice((err as Error).message);
      }
    }
  };

  const assistant = (
    <AiPanel
      projectId={project.id}
      enabled={aiEnabled}
      activeFile={active}
      editor={editor}
      lastLog={compile.ok === false ? (compile.log ?? null) : null}
      flush={docs.store.flush}
      onAddPapers={addPapersToBib}
      initialSteering={{
        instructions: project.aiInstructions ?? "",
        sample: project.aiStyleSample ?? "",
      }}
      initialPlan={(project.aiPlan as AgentPlan | null) ?? null}
      initialInstruction={fixInstruction}
      initialPolicy={
        project.aiPolicy === "local" || project.aiPolicy === "off" ? project.aiPolicy : "any"
      }
      isOwner={project.role === "owner"}
      applyPatch={applyPatch}
      onRecompile={() => void runCompile()}
    />
  );

  const review = (
    <ReviewPanel
      projectId={project.id}
      enabled={aiEnabled}
      active={side === "review" || mobile === "review"}
      getFiles={() => docs.files.map((f) => ({ path: f.path, content: docs.store.getDoc(f.id) }))}
      flush={docs.store.flush}
      onOpenAt={(path, line) => {
        const target = docs.files.find((f) => f.path === path);
        if (target) open(target.id, line);
      }}
      onRequestFix={(instruction) => {
        setFixInstruction(instruction);
        setSide("assistant");
        setMobile("assistant");
      }}
    />
  );

  const editorSheet = (
    <div className="sheet flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <h2 className="min-w-0 truncate font-medium">{active?.path ?? t("editor.noFile")}</h2>
        {active?.path === mainFile && (
          <span className="text-xs text-muted">{t("editor.main")}</span>
        )}
        {texSelection && active && (
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto shrink-0"
            data-testid="comment-on-selection"
            onClick={() => {
              setCommentDraft({
                fileId: active.id,
                anchor: {
                  start: texSelection.from,
                  end: texSelection.to,
                  quote: texSelection.text.slice(0, 500),
                },
              });
              setCommentsOpen(true);
            }}
          >
            {t("cm.onSelection", { n: texSelection.text.length })}
          </button>
        )}
      </div>
      {docs.conflict && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 bg-[var(--pill-negative-bg)] px-4 py-2 text-sm text-[var(--pill-negative-ink)]"
        >
          <span>{t("save.conflict.banner", { file: docs.conflict.path })}</span>
          <button type="button" className="btn btn-sm" onClick={resolveWithServer}>
            {t("save.conflict.server")}
          </button>
          <button type="button" className="btn btn-sm" onClick={docs.store.keepMine}>
            {t("save.conflict.mine")}
          </button>
        </div>
      )}
      {docs.status === "error" && docs.error && (
        <div
          role="alert"
          className="shrink-0 bg-[var(--pill-warning-bg)] px-4 py-1.5 text-xs text-[var(--pill-warning-ink)]"
        >
          {t("save.error.banner", { error: docs.error })}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {active?.binary ? (
          <FigurePreview
            projectId={project.id}
            file={active}
            copied={copied}
            onCopy={async (snippet) => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        ) : active ? (
          <CodeEditor
            fileId={active.id}
            getDoc={docs.store.getDoc}
            onChange={docs.store.edit}
            onSave={() => void docs.store.flush()}
            onCompile={() => void runCompile()}
            handleRef={editor}
            completions={completions}
            label={t("editor.label")}
            collab={collab ? { ...collab, user: userName ? { name: userName } : undefined } : null}
            comments={commentMarkers}
            onMarkerClick={markerClicked}
            onSelectionChange={(sel) => setSelection(sel ? { ...sel, fileId: active.id } : null)}
          />
        ) : (
          <p className="p-6 text-sm text-muted">{t("editor.pick")}</p>
        )}
      </div>
    </div>
  );

  const pdfSheet = (
    <div className="sheet h-full min-h-0 overflow-hidden">
      <PdfPanel
        state={compile}
        fileName={name || "documento"}
        onCompile={runCompile}
        onReveal={reveal}
        onTextClick={findClicked}
        onPointClick={pointClicked}
        words={words}
        lint={lint}
        lintBusy={lintBusy}
        onLint={() => void runLint()}
      />
    </div>
  );

  const sideTabs: [SideTab, string][] = [
    ["files", t("projects.files")],
    ["papers", lang === "en" ? "Papers" : lang === "de" ? "Literatur" : "Artículos"],
    ["assistant", lang === "en" ? "Assistant" : lang === "de" ? "Assistent" : "Asistente"],
    ["review", t("rv.tab")],
  ];

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col" aria-label={t("files.title")}>
      <div className="flex shrink-0 gap-4 border-b border-line px-3 pt-1" role="tablist">
        {sideTabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={side === id}
            className="tab"
            onClick={() => setSide(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1" role="tabpanel">
        {/* Kept mounted so searches and the conversation survive tab switches. */}
        <div className={side === "files" ? "h-full" : "hidden"}>{files}</div>
        <div className={side === "papers" ? "h-full" : "hidden"}>{papers}</div>
        <div className={side === "assistant" ? "h-full" : "hidden"}>{assistant}</div>
        <div className={side === "review" ? "h-full" : "hidden"}>{review}</div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* On phones the action group wraps to a second row instead of pushing
          the compile button off-screen. */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 sm:h-12 sm:flex-nowrap sm:py-0">
        <Link href="/projects" className="btn btn-ghost btn-sm">
          {t("ws.back")}
        </Link>
        <span className="text-muted" aria-hidden>
          /
        </span>
        <label htmlFor="project-name" className="sr-only">
          {t("ws.rename")}
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-sm sm:flex-none">
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => saveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            maxLength={120}
            className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 text-base font-semibold hover:bg-active focus:bg-surface focus:outline-none"
          />
          <Pencil size={12} className="shrink-0 text-muted" aria-hidden />
        </div>
        {/* On mobile only the dot fits; its title carries the full state. */}
        <span
          className="flex items-center text-xs text-muted sm:hidden"
          role="status"
          aria-live="polite"
          title={t(STATUS_KEY[docs.status])}
        >
          <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden />
        </span>
        <span
          className="hidden items-center gap-1.5 text-xs text-muted sm:flex"
          role="status"
          aria-live="polite"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} aria-hidden />
          {t(STATUS_KEY[docs.status])}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="relative inline-flex">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="comments-toggle"
              aria-label={t("cm.title")}
              aria-expanded={commentsOpen}
              title={t("cm.title")}
              onClick={() => setCommentsOpen((o) => !o)}
            >
              <MessageSquare size={14} aria-hidden />
            </button>
            {unresolved > 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white"
              >
                {unresolved > 9 ? "9+" : unresolved}
              </span>
            )}
          </span>
          {project.role === "owner" && <ShareMenu projectId={project.id} />}
          {project.role === "viewer" && (
            <span className="pill" title={t("share.hint")}>
              {t("share.role.viewer")}
            </span>
          )}
          <details className="relative" ref={exportRef}>
            <summary className="btn cursor-pointer list-none">{t("ws.export")}</summary>
            <div
              className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]" /* taste-skill-ignore shadow: floating export menu */
            >
              {compile.pdfUrl ? (
                <a
                  className="block rounded-md px-3 py-2 text-sm hover:bg-raised"
                  href={compile.pdfUrl}
                  download={`${name || "documento"}.pdf`}
                >
                  {t("ws.export.pdf")}
                </a>
              ) : (
                <span className="block px-3 py-2 text-sm text-muted">
                  {t("ws.export.pdf.pending")}
                </span>
              )}
              <a
                className="block rounded-md px-3 py-2 text-sm hover:bg-raised"
                href={`/api/projects/${project.id}/export`}
                download={`${(name || "project")
                  .normalize("NFKD")
                  .replace(/\p{M}/gu, "")
                  .replace(/[^\w.-]+/g, "-")
                  .replace(/^-+|-+$/g, "") || "project"}.zip`}
              >
                {t("ws.export.zip")}
              </a>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-raised"
                onClick={() => {
                  exportRef.current?.removeAttribute("open");
                  setArxivOpen(true);
                }}
              >
                {t("ws.export.arxiv")}
              </button>
            </div>
          </details>
          <SnapshotsMenu
            projectId={project.id}
            onDiff={(partial) => {
              if (partial.pdf) {
                if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
                pdfUrl.current = URL.createObjectURL(
                  new Blob([partial.pdf], { type: "application/pdf" }),
                );
              }
              setCompile((c) => ({
                ...c,
                ...partial,
                pdfUrl: partial.pdf ? pdfUrl.current : c.pdfUrl,
              }));
            }}
            onRestored={() => window.location.reload()}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={runCompile}
            disabled={compile.status === "running"}
            title="Ctrl + Enter"
          >
            {compile.status === "running" ? t("ws.compile.busy") : t("ws.compile")}
          </button>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="mx-2 mb-2 flex items-center justify-between gap-3 rounded-lg bg-[var(--pill-neutral-bg)] px-3 py-1.5 text-sm text-[var(--pill-neutral-ink)]"
        >
          <span>{notice}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            {t("common.close")}
          </button>
        </div>
      )}

      {arxivOpen && (
        <ArxivExport
          projectId={project.id}
          mainFile={mainFile}
          log={compile.log}
          files={docs.files.map((f) => ({
            path: f.path,
            content: docs.store.getDoc(f.id),
            binary: f.binary,
          }))}
          onClose={() => setArxivOpen(false)}
        />
      )}

      {commentsOpen && (
        <CommentsDrawer
          projectId={project.id}
          role={project.role ?? "viewer"}
          myId={myId}
          comments={comments}
          error={commentsError}
          draft={commentDraft}
          focusId={focusComment}
          flush={docs.store.flush}
          onClose={() => setCommentsOpen(false)}
          onMutated={reloadComments}
          onPosted={commentPosted}
          onDraftDone={() => setCommentDraft(null)}
          onFocusHandled={() => setFocusComment(null)}
        />
      )}

      {isDesktop ? (
        <Group orientation="horizontal" className="min-h-0 flex-1 px-2 pb-2">
          <Panel id="side" panelRef={sidePanel} defaultSize="22" minSize={220} maxSize="46">
            {sidebar}
          </Panel>
          <Separator className="w-2 rounded-full transition-colors hover:bg-active data-[separator=active]:bg-active" />
          <Panel id="editor" defaultSize="39" minSize={300}>
            {editorSheet}
          </Panel>
          <Separator className="w-2 rounded-full transition-colors hover:bg-active data-[separator=active]:bg-active" />
          <Panel id="pdf" defaultSize="39" minSize={300}>
            {pdfSheet}
          </Panel>
        </Group>
      ) : (
        <>
          <div
            className="flex shrink-0 gap-4 border-b border-line px-3"
            role="tablist"
            aria-label={t("ws.view")}
          >
            {(
              [
                ["files", t("projects.files")],
                ["editor", lang === "en" ? "Editor" : "Editor"],
                ["pdf", "PDF"],
                ["papers", sideTabs[1][1]],
                ["assistant", sideTabs[2][1]],
                ["review", sideTabs[3][1]],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={mobile === id}
                className="tab"
                onClick={() => setMobile(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 p-2">
            <div className={mobile === "editor" ? "h-full" : "hidden"}>{editorSheet}</div>
            <div className={mobile === "pdf" ? "h-full" : "hidden"}>{pdfSheet}</div>
            <div className={mobile === "files" ? "sheet h-full overflow-hidden" : "hidden"}>
              {files}
            </div>
            <div className={mobile === "papers" ? "sheet h-full overflow-hidden" : "hidden"}>
              {papers}
            </div>
            <div className={mobile === "assistant" ? "sheet h-full overflow-hidden" : "hidden"}>
              {assistant}
            </div>
            <div className={mobile === "review" ? "sheet h-full overflow-hidden" : "hidden"}>
              {review}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FigurePreview({
  projectId,
  file,
  copied,
  onCopy,
}: {
  projectId: string;
  file: { id: string; path: string; size?: number };
  copied: boolean;
  onCopy: (snippet: string) => void;
}) {
  const { t } = useI18n();
  const isPdf = file.path.toLowerCase().endsWith(".pdf");
  const snippet = `\\includegraphics[width=\\linewidth]{${file.path}}`;
  const src = `/api/projects/${projectId}/files/${file.id}/raw`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--pdf-desk)] p-6">
        {isPdf ? (
          <p className="text-sm text-muted">{t("figure.pdfNote")}</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-scoped file
          <img
            src={src}
            alt={t("figure.alt", { path: file.path })}
            className="max-h-full max-w-full bg-white object-contain"
          />
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{snippet}</code>
        <button type="button" className="btn btn-sm" onClick={() => onCopy(snippet)}>
          {copied ? t("figure.copied") : t("figure.copy")}
        </button>
        <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noopener">
          {t("figure.open")}
        </a>
      </div>
    </div>
  );
}
