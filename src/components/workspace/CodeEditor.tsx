import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorSelection, EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, type RefObject } from "react";

export type EditorHandle = {
  /** Current selection of the active file. */
  selection(): { from: number; to: number; text: string };
  /** Up to `max` characters before the cursor. */
  beforeCursor(max: number): string;
  /** Replaces [from, to) when it still holds `expected`; otherwise inserts at the cursor. */
  replaceRange(from: number, to: number, expected: string, text: string): void;
  insertAtCursor(text: string): void;
  /** Replaces a file's content from outside (server reload). Does not count as a user edit. */
  setDoc(fileId: string, content: string): void;
  /** Moves the cursor to a 1-based line once `fileId` is active. */
  reveal(fileId: string, line: number): void;
  focus(): void;
};

type Props = {
  fileId: string;
  getDoc: (fileId: string) => string;
  onChange: (fileId: string, content: string) => void;
  onSave: () => void;
  onCompile: () => void;
  handleRef: RefObject<EditorHandle | null>;
  label: string;
  /** Offer \cite keys and \label anchors as you type. */
  completions?: { citeKeys: string[]; labels: string[] };
};

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--ink)" },
  ".cm-content": { padding: "20px 0", caretColor: "var(--ink)" },
  ".cm-line": { padding: "0 20px" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent-soft) 55%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent) !important",
  },
  ".cm-panels": { backgroundColor: "var(--paper)", color: "var(--ink)" },
});

export function CodeEditor({
  fileId,
  getDoc,
  onChange,
  onSave,
  onCompile,
  handleRef,
  label,
  completions,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef(fileId);
  const states = useRef(new Map<string, EditorState>());
  const pendingReveal = useRef<{ fileId: string; line: number } | null>(null);
  const silent = useRef(false);
  // Latest callbacks without rebuilding the editor.
  const cb = useRef({ onChange, onSave, onCompile, getDoc });
  useEffect(() => {
    cb.current = { onChange, onSave, onCompile, getDoc };
  });
  // Autocomplete reads the latest keys without rebuilding the editor.
  const ac = useRef(completions ?? { citeKeys: [], labels: [] });
  useEffect(() => {
    ac.current = completions ?? { citeKeys: [], labels: [] };
  }, [completions]);

  const extensions = useRef<Extension[] | null>(null);

  // \cite{ and \ref{ completions from the project's bibliography and labels.
  const latexCompletions = (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\\(?:cite|ref|eqref|autoref)\{[^},]*$/);
    if (!before) return null;
    const cmd = /\\(\w+)\{$/.exec(before.text)?.[1];
    const list = cmd === "cite" ? ac.current.citeKeys : ac.current.labels;
    return {
      from: before.from + before.text.indexOf("{") + 1,
      options: list
        .slice(0, 200)
        .map((k) => ({ label: k, type: cmd === "cite" ? "keyword" : "variable" })),
      validFor: /^[a-zA-Z0-9_.:-]*$/,
    };
  };

  // Only called from effects, never during render.
  function stateFor(id: string) {
    extensions.current ??= [
      basicSetup,
      StreamLanguage.define(stex),
      EditorView.lineWrapping,
      theme,
      EditorView.contentAttributes.of({ "aria-label": label }),
      autocompletion({ override: [latexCompletions] }),
      Prec.highest(
        keymap.of([
          indentWithTab,
          { key: "Mod-s", preventDefault: true, run: () => (cb.current.onSave(), true) },
          { key: "Mod-Enter", preventDefault: true, run: () => (cb.current.onCompile(), true) },
        ]),
      ),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !silent.current)
          cb.current.onChange(current.current, u.state.doc.toString());
      }),
    ];
    return (
      states.current.get(id) ??
      EditorState.create({ doc: cb.current.getDoc(id), extensions: extensions.current })
    );
  }

  function applyReveal() {
    const v = view.current;
    const r = pendingReveal.current;
    if (!v || !r || r.fileId !== current.current) return;
    pendingReveal.current = null;
    const line = v.state.doc.line(Math.min(Math.max(1, r.line), v.state.doc.lines));
    v.dispatch({ selection: EditorSelection.cursor(line.from), scrollIntoView: true });
    v.focus();
  }

  // Mount once.
  useEffect(() => {
    const v = new EditorView({ state: stateFor(current.current), parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Switch files, keeping each file's undo history.
  useEffect(() => {
    const v = view.current;
    if (!v || current.current === fileId) return;
    states.current.set(current.current, v.state);
    current.current = fileId;
    v.setState(stateFor(fileId));
    applyReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to file switches only
  }, [fileId]);

  useEffect(() => {
    handleRef.current = {
      selection() {
        const v = view.current!;
        const { from, to } = v.state.selection.main;
        return { from, to, text: v.state.sliceDoc(from, to) };
      },
      beforeCursor(max) {
        const v = view.current!;
        const at = v.state.selection.main.head;
        return v.state.sliceDoc(Math.max(0, at - max), at);
      },
      replaceRange(from, to, expected, text) {
        const v = view.current!;
        if (v.state.sliceDoc(from, to) === expected && to <= v.state.doc.length) {
          v.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from, head: from + text.length },
          });
        } else {
          this.insertAtCursor(text);
        }
        v.focus();
      },
      insertAtCursor(text) {
        const v = view.current!;
        v.dispatch(v.state.replaceSelection(text));
        v.focus();
      },
      setDoc(id, content) {
        const v = view.current;
        if (v && id === current.current) {
          silent.current = true;
          v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: content } });
          silent.current = false;
        } else {
          states.current.delete(id);
        }
      },
      reveal(id, line) {
        pendingReveal.current = { fileId: id, line };
        applyReveal();
      },
      focus() {
        view.current?.focus();
      },
    };
  });

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
