import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AiAction, AgentPlan, EvidenceItem } from "@/lib/ai-prompts";
import { ApiError, api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import type { EditorHandle } from "./CodeEditor";
import { useOutsideClose } from "./useOutsideClose";
import { AiPolicyControl, DisclosureCard, type AiPolicy } from "./ai/AiProjectSettings";
import { DiffView } from "./ai/DiffView";
import { ImageToLatex, type ImageKind, type ImageResult } from "./ai/ImageToLatex";

/** A compile-error fix as returned by POST /api/projects/[id]/ai/fix. */
type FixPatch = {
  explanation: string;
  fileId: string;
  path: string;
  startLine: number;
  endLine: number;
  original: string;
  replacement: string;
  error: { message: string; line: number };
};

/** What the parent workspace does with a reviewed patch (undoable edit). */
export type ApplyPatch = (p: {
  fileId: string;
  startLine: number;
  endLine: number;
  original: string;
  replacement: string;
}) => boolean;

/**
 * Rewrite presets for a selection. The instruction is model-facing (English
 * on purpose); the label is what the author sees.
 */
const REWRITES: { key: MsgKey; instruction: string }[] = [
  { key: "ai.rewrite.improve", instruction: "" },
  {
    key: "ai.rewrite.shorten",
    instruction:
      "Shorten the selection by about a third. Keep every claim, number, \\cite key, \\label and \\ref; keep the LaTeX valid.",
  },
  {
    key: "ai.rewrite.formal",
    instruction:
      "Rewrite the selection in a formal academic register, precise and concise. Keep the meaning, citations, labels and math unchanged.",
  },
  {
    key: "ai.rewrite.simplify",
    instruction:
      "Rewrite the selection in plainer, clearer language for a broad scientific audience. Keep the meaning, citations, labels and math unchanged.",
  },
  {
    key: "ai.rewrite.grammar",
    instruction:
      "Fix only grammar, spelling and punctuation in the selection. Do not rephrase anything else.",
  },
  {
    key: "ai.rewrite.toEn",
    instruction:
      "Translate the selection into English. Keep LaTeX commands, math, \\cite keys, \\label and \\ref untouched; translate only the prose.",
  },
  {
    key: "ai.rewrite.toEs",
    instruction:
      "Translate the selection into Spanish. Keep LaTeX commands, math, \\cite keys, \\label and \\ref untouched; translate only the prose.",
  },
  {
    key: "ai.rewrite.toDe",
    instruction:
      "Translate the selection into German. Keep LaTeX commands, math, \\cite keys, \\label and \\ref untouched; translate only the prose.",
  },
];

const IMAGE_KIND_KEY: Record<ImageKind, MsgKey> = {
  auto: "ai.image.kind.auto",
  equation: "ai.image.kind.equation",
  table: "ai.image.kind.table",
  figure: "ai.image.kind.figure",
  text: "ai.image.kind.text",
};

type DraftResult = {
  latex: string;
  usedKeys: string[];
  newPapers: { source: "openalex" | "s2" | "arxiv"; paperId: string; key: string }[];
};

type CritiqueIssue = {
  kind: "evidence" | "citation" | "structure" | "latex";
  note: string;
};

type Critique = { verdict: "ok" | "revise"; issues: CritiqueIssue[] };

type VerifyResult = {
  resolved: string[];
  undefinedKeys: string[];
  /** Undefined keys that the "add references" button will resolve. */
  pendingNew: string[];
  /** Honest skip reason (compiler down, no \end{document}…). */
  skipped?: string;
};

type Turn = {
  id: number;
  action: AiAction | "draft" | "plan" | "image";
  /** Compile-error patch (action "fix" through /ai/fix). */
  fix?: FixPatch;
  /** Image → LaTeX result. */
  image?: ImageResult;
  prompt: string;
  answer: string;
  streaming: boolean;
  error?: string;
  /** Selection captured when the request was made, for "Replace". */
  range?: { fileId: string; from: number; to: number; text: string };
  /** Drafting agent extras. */
  stage?: "searching" | "drafting" | "planning" | "critiquing" | "verifying";
  evidence?: EvidenceItem[];
  draft?: DraftResult;
  refsAdded?: boolean;
  plan?: AgentPlan;
  critique?: Critique;
  verify?: VerifyResult;
  wordCount?: number;
  wordBudget?: number;
};

/** Word budget per length selector value (mirrors the API contract). */
const LENGTH_WORDS = { short: 150, normal: 400, long: 700 } as const;

type Props = {
  projectId: string;
  enabled: boolean;
  activeFile: { id: string; path: string } | null;
  editor: React.RefObject<EditorHandle | null>;
  lastLog: string | null;
  flush: () => Promise<void>;
  /** Adds papers to the project .bib (used by the drafting agent). */
  onAddPapers?: (
    papers: { source: "openalex" | "s2" | "arxiv"; paperId: string }[],
  ) => Promise<void>;
  /** Per-project drafting steering, persisted through PATCH /api/projects/[id]. */
  initialSteering: { instructions: string; sample: string };
  /** Section plan saved on the project from a previous "plan" run, if any. */
  initialPlan?: AgentPlan | null;
  /** Project AI policy (owner's decision, enforced on the server). */
  initialPolicy?: AiPolicy;
  isOwner?: boolean;
  /** Applies a reviewed compile-error patch as an undoable edit. */
  applyPatch?: ApplyPatch;
  onRecompile?: () => void;
};

const LABEL_KEY: Record<AiAction | "draft", MsgKey> = {
  improve: "ai.action.improve",
  explain: "ai.action.explain",
  continue: "ai.action.continue",
  fix: "ai.action.fix",
  ask: "ai.action.ask",
  draft: "ai.action.draft",
};

/** Drafting stages -> status line ("planning" belongs to plan turns). */
const STAGE_KEY: Partial<Record<NonNullable<Turn["stage"]>, MsgKey>> = {
  searching: "ai.draft.searching",
  drafting: "ai.draft.drafting",
  critiquing: "ai.draft.critiquing",
  verifying: "ai.draft.verifying",
};

const firstCodeBlock = (s: string) =>
  /```(?:latex|tex)?\n([\s\S]*?)```/.exec(s)?.[1]?.trimEnd() ?? null;

export function AiPanel({
  projectId,
  enabled,
  activeFile,
  editor,
  lastLog,
  flush,
  onAddPapers,
  initialSteering,
  initialPlan,
  initialPolicy = "any",
  isOwner = false,
  applyPatch,
  onRecompile,
}: Props) {
  const { t, lang } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AiPolicy>(initialPolicy);
  // Set when the project's policy (not a missing provider) blocks this user.
  const [blocked, setBlocked] = useState<"off" | "local" | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // Leaving the workspace mid-stream must stop the generation: nobody is
  // reading it and it keeps burning the user's ai rate-limit budget.
  useEffect(() => () => abort.current?.abort(), []);
  // Seed the conversation with the persisted history (empty state = fresh).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded) return;
    setSeeded(true);
    api<{
      messages: { role: string; action: string; content: string }[] | null;
      policy?: AiPolicy;
      blocked?: "off" | "local";
    }>("GET", `/api/projects/${projectId}/ai`)
      .then((r) => {
        if (r.policy) setPolicy(r.policy);
        setBlocked(r.blocked ?? null);
        const msgs = (r.messages ?? []).filter((m) => m.content.trim());
        if (msgs.length === 0) return;
        setTurns((prev) => {
          if (prev.length > 0) return prev; // live turns win over history
          let n = 0;
          const history: Turn[] = [];
          for (const m of msgs) {
            const isUser = m.role === "user";
            const turn: Turn = {
              id: --n,
              action: (m.action as Turn["action"]) || "ask",
              prompt: isUser ? m.content : "",
              answer: isUser ? "" : m.content,
              streaming: false,
            };
            // Rehydrate what can be re-rendered structurally.
            if (!isUser && m.action === "plan") {
              try {
                turn.plan = JSON.parse(m.content) as AgentPlan;
              } catch {
                /* raw text fallback */
              }
            }
            history.push(turn);
          }
          return history;
        });
      })
      .catch(() => {});
  }, [projectId, seeded]);
  const nextId = useRef(1);
  const busy = turns.some((t) => t.streaming);
  const [steerOpen, setSteerOpen] = useState(false);
  const [instructions, setInstructions] = useState(initialSteering.instructions);
  const [sample, setSample] = useState(initialSteering.sample);
  const [length, setLength] = useState<"short" | "normal" | "long">("normal");
  const [steerSaved, setSteerSaved] = useState(false);
  const [plan, setPlan] = useState<AgentPlan | null>(initialPlan ?? null);
  // RAG index of the project's own files: status line + re-index button.
  const [rag, setRag] = useState<{ files: number; chunks: number; updatedAt: string } | null>(null);
  const [indexing, setIndexing] = useState(false);
  useEffect(() => {
    api<{ status: { files: number; chunks: number; updatedAt: string } | null }>(
      "GET",
      `/api/projects/${projectId}/rag`,
    )
      .then((r) => setRag(r.status))
      .catch(() => {});
  }, [projectId]);

  async function runIndex() {
    if (indexing) return;
    setIndexing(true);
    try {
      const r = await api<{ files: number; chunks: number; updatedAt: string }>(
        "POST",
        `/api/projects/${projectId}/rag`,
        {},
      );
      setRag(r);
    } catch (err) {
      setHint((err as Error).message);
    } finally {
      setIndexing(false);
    }
  }

  async function saveSteering(next: { instructions?: string; sample?: string }) {
    setSteerSaved(false);
    try {
      await api("PATCH", `/api/projects/${projectId}`, {
        ...(next.instructions !== undefined ? { aiInstructions: next.instructions } : {}),
        ...(next.sample !== undefined ? { aiStyleSample: next.sample } : {}),
      });
      setSteerSaved(true);
      setTimeout(() => setSteerSaved(false), 1500);
    } catch (err) {
      setHint((err as Error).message);
    }
  }

  if (!enabled) {
    return (
      <div className="p-6 text-sm leading-relaxed text-muted">
        <h2 className="text-base font-semibold text-ink">{t("ai.disabled.title")}</h2>
        {blocked ? (
          // The owner's decision, not a missing provider, is what stops here.
          <p
            role="status"
            data-testid="ai-blocked"
            className="mt-2 rounded-md bg-[var(--pill-warning-bg)] px-2.5 py-1.5 text-xs text-[var(--pill-warning-ink)]"
          >
            {t(blocked === "off" ? "ai.policy.blocked.off" : "ai.policy.blocked.local")}
          </p>
        ) : (
          <p className="mt-2">
            {t("ai.disabled.body", { var1: "LLM_BASE_URL", var2: "LLM_MODEL" })}
          </p>
        )}
      </div>
    );
  }

  const patch = (id: number, p: Partial<Turn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  async function run(action: AiAction, instruction = "", labelKey?: MsgKey) {
    const ed = editor.current;
    if (!ed || !activeFile || busy) return;
    const sel = ed.selection();
    if ((action === "improve" || action === "explain") && !sel.text.trim()) {
      setHint(t("ai.selectFirst"));
      return;
    }
    setHint(null);
    const id = nextId.current++;
    const label = t(labelKey ?? LABEL_KEY[action]);
    const prompt =
      action === "ask"
        ? instruction
        : sel.text
          ? `${label}: «${sel.text.slice(0, 140)}${sel.text.length > 140 ? "…" : ""}»`
          : label;
    const history =
      action === "ask"
        ? turns
            .filter((t) => t.action === "ask" && t.answer && !t.error)
            .slice(-3)
            .flatMap((t) => [
              { role: "user" as const, content: t.prompt },
              { role: "assistant" as const, content: t.answer },
            ])
        : [];
    setTurns((ts) => [
      ...ts,
      {
        id,
        action,
        prompt,
        answer: "",
        streaming: true,
        range: sel.text ? { fileId: activeFile.id, ...sel } : undefined,
      },
    ]);

    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await flush(); // the server reads the document from the database
      const res = await fetch(`/api/projects/${projectId}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          action,
          fileId: activeFile.id,
          selection: sel.text,
          beforeCursor: ed.beforeCursor(4000),
          instruction,
          log: action === "fix" ? (lastLog ?? "").slice(-20_000) : "",
          history,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.issues?.[0]?.message ?? data.error ?? `Error ${res.status}`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += value;
        patch(id, { answer });
      }
      patch(id, { streaming: false });
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patch(id, { streaming: false, error: aborted ? t("ai.stopped") : (err as Error).message });
    }
  }

  /**
   * Compile error → a patch on the failing lines, reviewed as a diff. Falls
   * back to the streamed explanation when the log has no locatable error.
   */
  async function fixRun() {
    if (!activeFile || busy || !lastLog) return;
    setHint(null);
    const id = nextId.current++;
    setTurns((ts) => [
      ...ts,
      { id, action: "fix", prompt: t(LABEL_KEY.fix), answer: "", streaming: true },
    ]);
    try {
      await flush();
      const fix = await api<FixPatch>("POST", `/api/projects/${projectId}/ai/fix`, {
        log: lastLog.slice(-20_000),
        lang,
      });
      patch(id, { streaming: false, fix, answer: fix.explanation });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // No file:line in the log: the free-form explanation is still useful.
        setTurns((ts) => ts.filter((x) => x.id !== id));
        void run("fix");
        return;
      }
      patch(id, { streaming: false, error: (err as Error).message });
    }
  }

  function addImageTurn(result: ImageResult, req: { kind: ImageKind; hint: string }) {
    const id = nextId.current++;
    setTurns((ts) => [
      ...ts,
      {
        id,
        action: "image",
        prompt:
          t("ai.image.prompt", { kind: t(IMAGE_KIND_KEY[req.kind]) }) +
          (req.hint ? ` · ${req.hint}` : ""),
        answer: result.latex,
        streaming: false,
        image: result,
        error: result.unreadable ? t("ai.image.unreadable") : undefined,
      },
    ]);
    setImageOpen(false);
  }

  /** Drafting agent: search literature + stream a section draft (NDJSON). */
  async function draft(
    instruction: string,
    section?: { title: string; goal: string; words: number },
  ) {
    const ed = editor.current;
    if (!ed || !activeFile || busy || !isTex) return;
    setHint(null);
    const id = nextId.current++;
    setTurns((ts) => [
      ...ts,
      { id, action: "draft", prompt: instruction, answer: "", streaming: true, stage: "searching" },
    ]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await flush();
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          instruction,
          fileId: activeFile.id,
          length,
          ...(section ? { section } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.issues?.[0]?.message ?? data.error ?? `Error ${res.status}`);
      }
      await readAgentStream(id, res);
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patch(id, { streaming: false, error: aborted ? t("ai.stopped") : (err as Error).message });
    }
  }

  /** Shared NDJSON reader for the agent routes. */
  async function readAgentStream(id: number, res: Response) {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        handleAgentLine(id, JSON.parse(line));
      }
    }
    patch(id, { streaming: false });
  }

  /** Planning agent: one structured outline for the whole document (NDJSON). */
  async function planRun(instruction: string) {
    const ed = editor.current;
    if (!ed || !activeFile || busy || !isTex) return;
    setHint(null);
    const id = nextId.current++;
    setTurns((ts) => [
      ...ts,
      { id, action: "plan", prompt: instruction, answer: "", streaming: true, stage: "planning" },
    ]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await flush();
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ action: "plan", instruction, fileId: activeFile.id }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.issues?.[0]?.message ?? data.error ?? `Error ${res.status}`);
      }
      await readAgentStream(id, res);
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patch(id, { streaming: false, error: aborted ? t("ai.stopped") : (err as Error).message });
    }
  }

  function handleAgentLine(id: number, event: Record<string, unknown>) {
    if (event.type === "status") {
      patch(id, { stage: event.stage as Turn["stage"] });
    } else if (event.type === "evidence") {
      patch(id, { evidence: event.items as EvidenceItem[] });
    } else if (event.type === "token") {
      setTurns((ts) =>
        ts.map((turn) => (turn.id === id ? { ...turn, answer: turn.answer + event.text } : turn)),
      );
    } else if (event.type === "plan") {
      setPlan(event.plan as AgentPlan);
      patch(id, { plan: event.plan as AgentPlan, answer: "" });
    } else if (event.type === "critique") {
      patch(id, {
        critique: {
          verdict: event.verdict as Critique["verdict"],
          issues: event.issues as CritiqueIssue[],
        },
      });
    } else if (event.type === "verify") {
      patch(id, {
        verify: {
          resolved: (event.resolved as string[]) ?? [],
          undefinedKeys: (event.undefinedKeys as string[]) ?? [],
          pendingNew: (event.pendingNew as string[]) ?? [],
          skipped: event.skipped as string | undefined,
        },
      });
    } else if (event.type === "done") {
      patch(id, {
        answer: event.latex as string,
        draft: {
          latex: event.latex as string,
          usedKeys: event.usedKeys as string[],
          newPapers: event.newPapers as DraftResult["newPapers"],
        },
        wordCount: event.wordCount as number | undefined,
        wordBudget: event.wordBudget as number | undefined,
      });
    } else if (event.type === "error") {
      patch(id, { streaming: false, error: event.message as string });
    }
  }

  async function addReferences(turn: Turn) {
    if (!turn.draft || turn.refsAdded) return;
    setTurns((ts) => ts.map((x) => (x.id === turn.id ? { ...x, refsAdded: true } : x)));
    try {
      await onAddPapers?.(turn.draft.newPapers);
    } catch (err) {
      setTurns((ts) =>
        ts.map((x) =>
          x.id === turn.id ? { ...x, refsAdded: false, error: (err as Error).message } : x,
        ),
      );
    }
  }

  /** One click from a plan row to a bounded section draft. */
  function draftSection(s: AgentPlan["sections"][number]) {
    void draft(
      t("ai.plan.sectionInstruction", {
        title: s.title,
        goal: s.goal,
        points: s.points.join("; "),
        cites: s.cite.join(", "),
      }),
      { title: s.title, goal: s.goal, words: LENGTH_WORDS[length] },
    );
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    void run("ask", q);
  }

  const isTex = activeFile?.path.endsWith(".tex") ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line p-3">
        {blocked && (
          <p
            role="status"
            data-testid="ai-blocked"
            className="mb-2 rounded-md bg-[var(--pill-warning-bg)] px-2.5 py-1.5 text-xs text-[var(--pill-warning-ink)]"
          >
            {t(blocked === "off" ? "ai.policy.blocked.off" : "ai.policy.blocked.local")}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <RewriteMenu
            disabled={busy || !isTex || !!blocked}
            onPick={(r) => void run("improve", r.instruction, r.key)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => run("explain")}
            disabled={busy || !!blocked}
          >
            {t("ai.explain")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => run("continue")}
            disabled={busy || !isTex || !!blocked}
          >
            {t("ai.continue")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void fixRun()}
            disabled={busy || !lastLog || !!blocked}
            title={lastLog ? undefined : t("ai.fix.disabled")}
          >
            {t("ai.fix")}
          </button>
          <button
            type="button"
            className="btn"
            aria-expanded={imageOpen}
            onClick={() => setImageOpen((o) => !o)}
            disabled={busy || !isTex || !!blocked}
          >
            {t("ai.image.button")}
          </button>
        </div>
        {imageOpen && (
          <ImageToLatex
            projectId={projectId}
            onResult={addImageTurn}
            onClose={() => setImageOpen(false)}
          />
        )}
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {hint ?? t("ai.hint")}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {plan && <PlanView plan={plan} busy={busy} onDraft={draftSection} />}
        {turns.length === 0 && !plan && (
          <p className="px-2 py-8 text-center text-sm text-muted">{t("ai.empty")}</p>
        )}
        {turns.map((turn) => (
          <article key={turn.id} className="space-y-2">
            <p className="text-xs font-medium text-muted">{turn.prompt}</p>
            {turn.action === "plan" && turn.streaming && (
              <p className="text-xs text-muted">{t("ai.plan.planning")}</p>
            )}
            {turn.action === "draft" && turn.streaming && (
              <p className="text-xs text-muted">
                {t(STAGE_KEY[turn.stage ?? "searching"] ?? "ai.draft.drafting")}
              </p>
            )}
            {turn.action === "draft" && turn.evidence && turn.evidence.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">
                  {t("ai.draft.evidence")} <span className="num">({turn.evidence.length})</span>
                </summary>
                <ul className="mt-1 space-y-1">
                  {turn.evidence.map((e) => (
                    <li key={e.key} className="text-muted">
                      <span className={e.inBib ? "" : "text-ink"}>{e.key}</span> · {e.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="rounded-lg border border-line bg-surface p-3 text-sm">
              {turn.fix ? (
                <FixBody fix={turn.fix} />
              ) : turn.image ? (
                <ImageBody image={turn.image} />
              ) : turn.action === "improve" &&
                turn.range &&
                !turn.streaming &&
                turn.answer &&
                !turn.error ? (
                <DiffView
                  before={turn.range.text}
                  after={keepEdges(turn.range.text, turn.answer)}
                />
              ) : turn.answer ? (
                <div className="whitespace-pre-wrap">{turn.answer}</div>
              ) : turn.streaming ? (
                <span className="text-muted">{t("ai.thinking")}</span>
              ) : null}
              {turn.error && <p className="mt-1 text-sm text-danger">{turn.error}</p>}
              {turn.action === "draft" && <DraftMeta turn={turn} />}
            </div>
            {!turn.streaming && turn.answer && (
              <TurnActions
                turn={turn}
                editor={editor}
                activeFileId={activeFile?.id}
                addReferences={addReferences}
                applyPatch={applyPatch}
                onRecompile={onRecompile}
              />
            )}
          </article>
        ))}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <button
          type="button"
          className="mb-2 text-xs text-muted hover:text-ink"
          aria-expanded={steerOpen}
          onClick={() => setSteerOpen(!steerOpen)}
        >
          {t("ai.steer.title")} {steerSaved ? `· ${t("ai.steer.saved")}` : ""}
        </button>
        {steerOpen && (
          <div className="mb-2 space-y-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="label">{t("ai.steer.instructions")}</span>
              <textarea
                className="input min-h-[52px] resize-none text-xs"
                value={instructions}
                maxLength={4000}
                placeholder={t("ai.steer.instructions.ph")}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => void saveSteering({ instructions })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="label">{t("ai.steer.sample")}</span>
              <textarea
                className="input min-h-[52px] resize-none text-xs"
                value={sample}
                maxLength={4000}
                placeholder={t("ai.steer.sample.ph")}
                onChange={(e) => setSample(e.target.value)}
                onBlur={() => void saveSteering({ sample })}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="label">{t("ai.steer.length")}</span>
              <select
                className="select h-7 text-xs"
                value={length}
                onChange={(e) => setLength(e.target.value as typeof length)}
              >
                <option value="short">{t("ai.steer.length.short")}</option>
                <option value="normal">{t("ai.steer.length.normal")}</option>
                <option value="long">{t("ai.steer.length.long")}</option>
              </select>
            </label>
            <div className="border-t border-line pt-2">
              <AiPolicyControl
                projectId={projectId}
                policy={policy}
                isOwner={isOwner}
                onChange={(p) => {
                  setPolicy(p);
                  // React immediately: "off" blocks everyone; the other two
                  // depend on the user's endpoint and are recomputed on load.
                  setBlocked(p === "off" ? "off" : null);
                }}
              />
            </div>
            <DisclosureCard
              projectId={projectId}
              onInsert={(latex) => editor.current?.insertAtCursor(latex)}
            />
          </div>
        )}
        <label htmlFor="ai-question" className="sr-only">
          {t("papers.search")}
        </label>
        <textarea
          id="ai-question"
          className="input min-h-[60px] resize-none"
          placeholder={t("ai.placeholder")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKey}
          maxLength={4000}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {indexing
              ? t("rag.indexing")
              : rag
                ? t("rag.status", {
                    n: rag.chunks,
                    m: rag.files,
                    date: new Intl.DateTimeFormat(lang, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(rag.updatedAt)),
                  })
                : t("rag.none")}
            {!indexing && (
              <button
                type="button"
                className="ml-1 underline hover:text-ink"
                onClick={() => void runIndex()}
              >
                {t("rag.index")}
              </button>
            )}
          </p>
          {busy ? (
            <button type="button" className="btn" onClick={() => abort.current?.abort()}>
              {t("ai.stop")}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!isTex) {
                    setHint(t("ai.draft.needsTex"));
                    return;
                  }
                  const q = question.trim();
                  if (q.length < 8) {
                    setHint(t("ai.draft.hint"));
                    return;
                  }
                  setQuestion("");
                  void draft(q);
                }}
                title={t("ai.draft.hint")}
              >
                {t("ai.draft.button")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!isTex) {
                    setHint(t("ai.draft.needsTex"));
                    return;
                  }
                  const q = question.trim();
                  if (q.length < 8) {
                    setHint(t("ai.plan.hint"));
                    return;
                  }
                  setQuestion("");
                  void planRun(q);
                }}
                title={t("ai.plan.hint")}
              >
                {t("ai.plan.button")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={send}
                disabled={!question.trim()}
              >
                {t("ai.send")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_KEY: Record<CritiqueIssue["kind"], MsgKey> = {
  evidence: "ai.critique.kind.evidence",
  citation: "ai.critique.kind.citation",
  structure: "ai.critique.kind.structure",
  latex: "ai.critique.kind.latex",
};

/** Critique chips, citation verification and word counter under a draft. */
function DraftMeta({ turn }: { turn: Turn }) {
  const { t } = useI18n();
  const v = turn.verify;
  return (
    <div className="mt-2 space-y-1.5 text-xs">
      {turn.critique && (
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`font-medium ${turn.critique.verdict === "ok" ? "text-ok" : "text-warn"}`}
          >
            {turn.critique.verdict === "ok" ? t("ai.critique.ok") : t("ai.critique.revise")}
          </span>
          {turn.critique.issues.map((issue, i) => (
            <span key={i} className="text-muted">
              {t(KIND_KEY[issue.kind])}: {issue.note}
            </span>
          ))}
        </div>
      )}
      {v &&
        (v.skipped ? (
          <p className="text-muted">{t("ai.verify.skipped", { reason: v.skipped })}</p>
        ) : (
          <p className="text-muted">
            {t("ai.verify.line", {
              resolved: v.resolved.length,
              pending: v.pendingNew.length,
              unresolved: v.undefinedKeys.length - v.pendingNew.length,
            })}
          </p>
        ))}
      {typeof turn.wordCount === "number" && turn.wordBudget ? (
        <p className={turn.wordCount > turn.wordBudget ? "text-warn" : "text-muted"}>
          {t("ai.words", { n: turn.wordCount, budget: turn.wordBudget })}
        </p>
      ) : null}
    </div>
  );
}

/** The editable-in-spirit section plan: rows the user drafts one by one. */
function PlanView({
  plan,
  busy,
  onDraft,
}: {
  plan: AgentPlan;
  busy: boolean;
  onDraft: (s: AgentPlan["sections"][number]) => void;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="ai-plan-title"
      className="rounded-lg border border-line bg-surface p-3"
    >
      <h3 id="ai-plan-title" className="text-sm font-medium">
        {t("ai.plan.title")} <span className="text-xs font-normal text-muted">· {plan.title}</span>
      </h3>
      <ol className="mt-2 space-y-2">
        {plan.sections.map((s, i) => (
          <li key={i} className="rounded-md border border-line p-2">
            <p className="text-sm font-medium">
              {i + 1}. {s.title}
            </p>
            {s.goal && <p className="mt-0.5 text-xs text-muted">{s.goal}</p>}
            {s.points.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                {s.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => onDraft(s)}
              >
                {t("ai.plan.draft")}
              </button>
              {s.cite.length > 0 && (
                <span className="font-mono text-[10px] text-muted">{s.cite.join(" · ")}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TurnActions({
  turn,
  editor,
  activeFileId,
  addReferences,
  applyPatch,
  onRecompile,
}: {
  turn: Turn;
  editor: React.RefObject<EditorHandle | null>;
  activeFileId?: string;
  addReferences: (turn: Turn) => Promise<void>;
  applyPatch?: ApplyPatch;
  onRecompile?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // Outcome of applying a reviewed change: nothing yet / landed / text moved on.
  const [applied, setApplied] = useState<"none" | "ok" | "stale">("none");
  const isEdit = turn.action === "improve" || turn.action === "continue";
  // The rewrite the author saw as a diff — boundary whitespace of the original
  // restored around the model's trimmed answer, so diff and applied text match.
  const improved =
    turn.action === "improve" && turn.range
      ? keepEdges(turn.range.text, turn.answer.trim())
      : turn.answer.trim();
  const code =
    turn.action === "image"
      ? (turn.image?.latex ?? null)
      : isEdit
        ? improved
        : firstCodeBlock(turn.answer);
  const canReplace = turn.action === "improve" && turn.range && turn.range.fileId === activeFileId;
  if (turn.action === "draft" && turn.draft) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => editor.current?.insertAtCursor(turn.draft!.latex)}
        >
          {t("ai.draft.insert")}
        </button>
        {turn.draft.newPapers.length > 0 && !turn.refsAdded && (
          <button
            type="button"
            className="btn"
            onClick={() => void addReferences(turn)}
            title={turn.draft.newPapers.map((p) => p.key).join(", ")}
          >
            {t("ai.draft.addRefs", { var1: turn.draft.newPapers.length })}
          </button>
        )}
        {turn.refsAdded && (
          <span className="self-center text-xs text-ok">{t("ai.draft.refsAdded")}</span>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(turn.draft!.latex);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("figure.copied") : t("ai.copy")}
        </button>
      </div>
    );
  }
  // Compile-error patch: apply the reviewed lines and recompile in one click.
  if (turn.action === "fix" && turn.fix) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {applied !== "ok" ? (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="fix-apply"
            onClick={() => {
              const ok =
                applyPatch?.({
                  fileId: turn.fix!.fileId,
                  startLine: turn.fix!.startLine,
                  endLine: turn.fix!.endLine,
                  original: turn.fix!.original,
                  replacement: turn.fix!.replacement,
                }) ?? false;
              setApplied(ok ? "ok" : "stale");
              if (ok) onRecompile?.();
            }}
          >
            {t("ai.fix.apply")}
          </button>
        ) : (
          <span className="text-xs text-ok">{t("ai.fix.applied")}</span>
        )}
        {applied === "stale" && <span className="text-xs text-danger">{t("ai.fix.stale")}</span>}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(turn.fix!.replacement);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("figure.copied") : t("ai.copy")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canReplace && code && applied !== "ok" && (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="rewrite-apply"
          onClick={() => {
            const { from, to, text } = turn.range!;
            setApplied(
              editor.current?.replaceIfUnchanged(from, to, text, improved) ? "ok" : "stale",
            );
          }}
        >
          {t("ai.diff.apply")}
        </button>
      )}
      {applied === "ok" && <span className="text-xs text-ok">{t("ai.diff.applied")}</span>}
      {applied === "stale" && <span className="text-xs text-danger">{t("ai.diff.stale")}</span>}
      {code && applied !== "ok" && (
        <button type="button" className="btn" onClick={() => editor.current?.insertAtCursor(code)}>
          {turn.action === "continue"
            ? t("ai.insertAtCursor")
            : isEdit
              ? t("ai.insert")
              : t("ai.insertCode")}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(code ?? turn.answer);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t("figure.copied") : t("ai.copy")}
      </button>
    </div>
  );
}

/**
 * Restores the original's leading/trailing whitespace around the model's
 * (usually trimmed) answer, so a rewrite never eats the space that separated
 * it from the surrounding text — and the diff shows real changes only.
 */
function keepEdges(before: string, after: string): string {
  const lead = /^\s*/.exec(before)?.[0] ?? "";
  const tail = /\s*$/.exec(before)?.[0] ?? "";
  let out = after;
  if (lead && !out.startsWith(lead)) out = lead + out.trimStart();
  if (tail && !out.endsWith(tail)) out = out.trimEnd() + tail;
  return out;
}

/** Rewrite presets behind one menu button (selection required). */
function RewriteMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (preset: { key: MsgKey; instruction: string }) => void;
}) {
  const { t } = useI18n();
  const ref = useOutsideClose();
  return (
    <details className="relative" ref={ref} data-testid="rewrite-menu">
      <summary
        className={`btn cursor-pointer list-none ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {t("ai.rewrite")}
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        {REWRITES.map((r) => (
          <button
            key={r.key}
            type="button"
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-raised"
            onClick={() => {
              ref.current?.removeAttribute("open");
              onPick(r);
            }}
          >
            {t(r.key)}
          </button>
        ))}
      </div>
    </details>
  );
}

/** A compile-error fix: what happened, where, and the patch as a diff. */
function FixBody({ fix }: { fix: FixPatch }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <p className="whitespace-pre-wrap">{fix.explanation}</p>
      <p className="num text-xs text-muted" data-testid="fix-where">
        {t("ai.fix.where", { path: fix.path, a: fix.startLine, b: fix.endLine })}
      </p>
      <DiffView before={fix.original} after={fix.replacement} />
    </div>
  );
}

/** Image → LaTeX result with its honest compile status. */
function ImageBody({ image }: { image: ImageResult }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5" data-testid="image-result">
      {image.latex ? (
        <pre className="max-h-60 overflow-auto font-mono text-[12px] leading-5 whitespace-pre-wrap">
          {image.latex}
        </pre>
      ) : null}
      {image.latex &&
        (image.compiles === true ? (
          <p className="text-xs text-ok">{t("ai.image.compiles")}</p>
        ) : image.compiles === false ? (
          <p className="text-xs text-danger">
            {t("ai.image.fails", { error: image.error ?? "?" })}
          </p>
        ) : (
          <p className="text-xs text-muted">{t("ai.image.unchecked")}</p>
        ))}
    </div>
  );
}
