import { useRef, useState, type KeyboardEvent } from "react";
import type { AiAction, AgentPlan, EvidenceItem } from "@/lib/ai-prompts";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import type { EditorHandle } from "./CodeEditor";

type DraftResult = {
  latex: string;
  usedKeys: string[];
  newPapers: { source: "openalex" | "s2" | "arxiv"; paperId: string; key: string }[];
};

type Turn = {
  id: number;
  action: AiAction | "draft" | "plan";
  prompt: string;
  answer: string;
  streaming: boolean;
  error?: string;
  /** Selection captured when the request was made, for "Replace". */
  range?: { fileId: string; from: number; to: number; text: string };
  /** Drafting agent extras. */
  stage?: "searching" | "drafting" | "planning";
  evidence?: EvidenceItem[];
  draft?: DraftResult;
  refsAdded?: boolean;
  plan?: AgentPlan;
};

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
};

const LABEL_KEY: Record<AiAction | "draft", MsgKey> = {
  improve: "ai.action.improve",
  explain: "ai.action.explain",
  continue: "ai.action.continue",
  fix: "ai.action.fix",
  ask: "ai.action.ask",
  draft: "ai.action.draft",
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
}: Props) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const busy = turns.some((t) => t.streaming);
  const [steerOpen, setSteerOpen] = useState(false);
  const [instructions, setInstructions] = useState(initialSteering.instructions);
  const [sample, setSample] = useState(initialSteering.sample);
  const [length, setLength] = useState<"short" | "normal" | "long">("normal");
  const [steerSaved, setSteerSaved] = useState(false);
  const [plan, setPlan] = useState<AgentPlan | null>(initialPlan ?? null);

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
        <p className="mt-2">{t("ai.disabled.body", { var1: "LLM_BASE_URL", var2: "LLM_MODEL" })}</p>
      </div>
    );
  }

  const patch = (id: number, p: Partial<Turn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  async function run(action: AiAction, instruction = "") {
    const ed = editor.current;
    if (!ed || !activeFile || busy) return;
    const sel = ed.selection();
    if ((action === "improve" || action === "explain") && !sel.text.trim()) {
      setHint(t("ai.selectFirst"));
      return;
    }
    setHint(null);
    const id = nextId.current++;
    const label = t(LABEL_KEY[action]);
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

  /** Drafting agent: search literature + stream a section draft (NDJSON). */
  async function draft(instruction: string) {
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
        body: JSON.stringify({ instruction, fileId: activeFile.id, length }),
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
      patch(id, { stage: event.stage as "searching" | "drafting" | "planning" });
    } else if (event.type === "evidence") {
      patch(id, { evidence: event.items as EvidenceItem[] });
    } else if (event.type === "token") {
      setTurns((ts) =>
        ts.map((turn) => (turn.id === id ? { ...turn, answer: turn.answer + event.text } : turn)),
      );
    } else if (event.type === "plan") {
      setPlan(event.plan as AgentPlan);
      patch(id, { plan: event.plan as AgentPlan, answer: "" });
    } else if (event.type === "done") {
      patch(id, {
        answer: event.latex as string,
        draft: {
          latex: event.latex as string,
          usedKeys: event.usedKeys as string[],
          newPapers: event.newPapers as DraftResult["newPapers"],
        },
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
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn"
            onClick={() => run("improve")}
            disabled={busy || !isTex}
          >
            {t("ai.improve")}
          </button>
          <button type="button" className="btn" onClick={() => run("explain")} disabled={busy}>
            {t("ai.explain")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => run("continue")}
            disabled={busy || !isTex}
          >
            {t("ai.continue")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => run("fix")}
            disabled={busy || !lastLog}
            title={lastLog ? undefined : t("ai.fix.disabled")}
          >
            {t("ai.fix")}
          </button>
        </div>
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
                {turn.stage === "searching" ? t("ai.draft.searching") : t("ai.draft.drafting")}
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
              {turn.answer ? (
                <div className="whitespace-pre-wrap">{turn.answer}</div>
              ) : turn.streaming ? (
                <span className="text-muted">{t("ai.thinking")}</span>
              ) : null}
              {turn.error && <p className="mt-1 text-sm text-danger">{turn.error}</p>}
            </div>
            {!turn.streaming && turn.answer && (
              <TurnActions
                turn={turn}
                editor={editor}
                activeFileId={activeFile?.id}
                addReferences={addReferences}
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
                className="input h-7 w-auto text-xs"
                value={length}
                onChange={(e) => setLength(e.target.value as typeof length)}
              >
                <option value="short">{t("ai.steer.length.short")}</option>
                <option value="normal">{t("ai.steer.length.normal")}</option>
                <option value="long">{t("ai.steer.length.long")}</option>
              </select>
            </label>
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
        <div className="mt-2 flex justify-end gap-2">
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
}: {
  turn: Turn;
  editor: React.RefObject<EditorHandle | null>;
  activeFileId?: string;
  addReferences: (turn: Turn) => Promise<void>;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isEdit = turn.action === "improve" || turn.action === "continue";
  const code = isEdit ? turn.answer.trim() : firstCodeBlock(turn.answer);
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
  return (
    <div className="flex flex-wrap gap-1.5">
      {canReplace && code && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            editor.current?.replaceRange(turn.range!.from, turn.range!.to, turn.range!.text, code)
          }
        >
          {t("ai.replace")}
        </button>
      )}
      {code && (
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
