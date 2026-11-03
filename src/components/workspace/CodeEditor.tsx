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
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { useEffect, useRef, type RefObject } from "react";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import { base64ToBytes, connectCollab } from "@/lib/collab";

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
  /**
   * Opt-in live collaboration (Yjs over the collab relay; see src/lib/collab).
   * null/undefined = off: the editor behaves exactly as before. When set, the
   * active file syncs with its room and remote peers show named cursors.
   */
  collab?: { url: string; token: string; user?: { name: string } } | null;
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
  collab,
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

  // Live collab state for the bound file (null while off or connecting).
  const collabFile = useRef<string | null>(null);
  const ytext = useRef<Y.Text | null>(null);
  const collabExt = useRef<Extension | null>(null);

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
  function baseExtensions(): Extension[] {
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
    return extensions.current;
  }

  function stateFor(id: string) {
    // The collab-bound file never reuses a cached state: it went stale while
    // another file was active (updates only reach the attached view), so it is
    // always rebuilt from the Y.Doc, binding included.
    if (id === collabFile.current && ytext.current && collabExt.current)
      return EditorState.create({
        doc: ytext.current.toString(),
        extensions: [...baseExtensions(), collabExt.current],
      });
    return (
      states.current.get(id) ??
      EditorState.create({ doc: cb.current.getDoc(id), extensions: baseExtensions() })
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
    // Collab states are rebuilt from the Y.Doc on re-entry; cache local ones.
    if (current.current !== collabFile.current) states.current.set(current.current, v.state);
    current.current = fileId;
    v.setState(stateFor(fileId));
    applyReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to file switches only
  }, [fileId]);

  // Live collaboration, opt-in via the `collab` prop. One room per file: the
  // connection is torn down and reopened on file switches. The binding is
  // attached only after the room state arrives (async), until then the editor
  // is exactly the plain local one. Remote changes enter as normal editor
  // transactions, so the autosave pipeline (and the 409 conflict banner) keep
  // working unchanged.
  useEffect(() => {
    if (!collab) return;
    const statesMap = states.current; // stable for the effect's lifetime
    const doc = new Y.Doc();
    const text = doc.getText("folio");
    const aware = new Awareness(doc);
    const net = {}; // origin marker: updates that came in over the wire
    const name = collab.user?.name ?? "";
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const palette = ["#2563eb", "#ea580c", "#059669", "#7c3aed", "#dc2626", "#c026d3"];
    // No name given: colour-only cursor (no untranslated fallback label).
    aware.setLocalStateField(
      "user",
      name
        ? { name, color: palette[hash % palette.length] }
        : { color: palette[hash % palette.length] },
    );

    const conn = connectCollab(
      { url: collab.url, token: collab.token, fileId, clientId: doc.clientID },
      {
        onState(data, first, reconnect) {
          for (const part of data ? data.split(",") : [])
            if (part) Y.applyUpdate(doc, base64ToBytes(part), net);
          if (text.toString() === "" && first) {
            // Empty room and we are alone: seed with what the editor shows now
            // (so local typing since mount is kept). Broadcast via the update
            // listener below.
            const content =
              view.current && current.current === fileId
                ? view.current.state.doc.toString()
                : cb.current.getDoc(fileId);
            if (content) doc.transact(() => text.insert(0, content));
          } else if (text.toString() !== "" && (first || reconnect)) {
            // Rejoin with a document the room does not know (restart, or we
            // are repopulating a GC'd room): resend our full state, peers
            // merge it (Yjs updates are idempotent for known operations).
            conn.send(Y.encodeStateAsUpdate(doc));
          }
          if (collabFile.current) return; // binding already attached
          collabFile.current = fileId;
          ytext.current = text;
          collabExt.current = yCollab(text, aware);
          const v = view.current;
          if (v && current.current === fileId) v.setState(stateFor(fileId));
        },
        onUpdate(update) {
          Y.applyUpdate(doc, update, net);
        },
        onAwareness(update) {
          applyAwarenessUpdate(aware, update, net);
        },
        onBye(client) {
          removeAwarenessStates(aware, [client], net);
        },
      },
    );

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      // Local edits (origin = the y-codemirror binding) and the seed above
      // are broadcast; anything applied from the network is not re-sent.
      if (origin !== net) conn.send(update);
    };
    doc.on("update", onDocUpdate);
    const onAwarenessUpdate = (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === net) return;
      conn.sendAwareness(
        encodeAwarenessUpdate(aware, [...changes.added, ...changes.updated, ...changes.removed]),
      );
    };
    aware.on("update", onAwarenessUpdate);

    return () => {
      conn.close();
      doc.off("update", onDocUpdate);
      aware.off("update", onAwarenessUpdate);
      aware.destroy();
      doc.destroy();
      if (collabFile.current === fileId) {
        // Keep what the session shows as the file's local content, then go
        // back to the plain editor: identical to the no-collab behaviour.
        const local = EditorState.create({
          doc: text.toString(),
          extensions: baseExtensions(),
        });
        statesMap.set(fileId, local);
        collabFile.current = null;
        ytext.current = null;
        collabExt.current = null;
        const v = view.current;
        if (v && current.current === fileId) v.setState(local);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect on room/identity changes only
  }, [collab?.url, collab?.token, collab?.user?.name, fileId]);

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
