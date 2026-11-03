import { ApiError, api } from "@/lib/client/api";

export type FileMeta = { id: string; path: string; binary?: boolean; size?: number };
export type FileDoc = FileMeta & { content: string; version: number };
export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
export type Conflict = { fileId: string; path: string; content: string; version: number };
export type Snapshot = {
  files: FileMeta[];
  status: SaveStatus;
  conflict: Conflict | null;
  error: string | null;
};

type Doc = {
  path: string;
  binary: boolean;
  size: number;
  content: string;
  saved: string;
  version: number;
  timer?: ReturnType<typeof setTimeout>;
  inflight?: Promise<void>;
  error?: boolean;
  conflict?: boolean;
};

type Request = typeof api;

/**
 * Client copy of a project's files with debounced autosave.
 * Every save names the version it was based on; a 409 never overwrites the
 * server copy and raises a conflict for the user to resolve.
 */
export class DocumentStore {
  private docs = new Map<string, Doc>();
  private listeners = new Set<() => void>();
  private conflict: Conflict | null = null;
  private error: string | null = null;
  private snapshot!: Snapshot;

  constructor(
    private readonly projectId: string,
    initial: FileDoc[],
    private readonly request: Request = api,
    private readonly delays = { autosave: 1000, retry: 5000 },
  ) {
    for (const f of initial)
      this.docs.set(f.id, {
        path: f.path,
        binary: Boolean(f.binary),
        size: f.size ?? 0,
        content: f.content,
        saved: f.content,
        version: f.version,
      });
    this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  getDoc = (id: string) => this.docs.get(id)?.content ?? "";

  hasUnsaved = () => [...this.docs.values()].some((d) => d.content !== d.saved);

  edit = (id: string, content: string) => {
    const d = this.docs.get(id);
    if (!d) return;
    d.content = content;
    clearTimeout(d.timer);
    if (!d.conflict) d.timer = setTimeout(() => void this.save(id), this.delays.autosave);
    if (d.error && d.content === d.saved) d.error = false; // back to the saved copy
    this.emit();
  };

  save = async (id: string): Promise<void> => {
    const d = this.docs.get(id);
    if (!d || d.conflict) return;
    clearTimeout(d.timer);
    if (d.inflight) {
      await d.inflight;
      return this.save(id);
    }
    if (d.content === d.saved) return;
    const content = d.content;
    d.inflight = this.put(id, d, content);
    this.emit();
    await d.inflight;
    d.inflight = undefined;
    if (!d.error && !d.conflict && d.content !== d.saved) {
      d.timer = setTimeout(() => void this.save(id), this.delays.autosave);
    }
    this.emit();
  };

  private async put(id: string, d: Doc, content: string) {
    try {
      const r = await this.request<{ version: number }>(
        "PUT",
        `/api/projects/${this.projectId}/files/${id}`,
        {
          content,
          baseVersion: d.version,
        },
      );
      d.version = r.version;
      d.saved = content;
      d.error = false;
      this.error = null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = err.data.current as { content: string; version: number };
        d.conflict = true;
        this.conflict = { fileId: id, path: d.path, ...current };
      } else {
        d.error = true;
        this.error = (err as Error).message;
        d.timer = setTimeout(() => void this.save(id), this.delays.retry);
      }
    }
  }

  flush = async () => {
    await Promise.all([...this.docs.keys()].map((id) => this.save(id)));
  };

  /** Server copy wins. Returns it so the editor can load it. */
  takeServer = (): Conflict | null => {
    const c = this.conflict;
    if (!c) return null;
    const d = this.docs.get(c.fileId)!;
    d.content = d.saved = c.content;
    d.version = c.version;
    d.conflict = false;
    this.conflict = null;
    this.emit();
    return c;
  };

  /** Local copy wins: rebase on the server version and save again. */
  keepMine = () => {
    const c = this.conflict;
    if (!c) return;
    const d = this.docs.get(c.fileId)!;
    d.version = c.version;
    d.saved = c.content;
    d.conflict = false;
    this.conflict = null;
    void this.save(c.fileId);
  };

  add = (f: FileDoc) => {
    this.docs.set(f.id, {
      path: f.path,
      binary: Boolean(f.binary),
      size: f.size ?? 0,
      content: f.content,
      saved: f.content,
      version: f.version,
    });
    this.emit();
  };

  remove = (id: string) => {
    clearTimeout(this.docs.get(id)?.timer);
    this.docs.delete(id);
    if (this.conflict?.fileId === id) this.conflict = null;
    this.emit();
  };

  rename = (id: string, path: string) => {
    const d = this.docs.get(id);
    if (d) d.path = path;
    if (this.conflict?.fileId === id) this.conflict = { ...this.conflict, path };
    this.emit();
  };

  /**
   * Applies a change made on the server (e.g. a citation added to the .bib).
   * With a clean doc the server copy replaces ours. With unsaved local edits
   * we must NOT rebase silently: the pending debounced save would PUT the
   * stale local content on the new baseVersion and wipe the server change —
   * so we raise the same conflict the 409 path uses and let the user merge.
   */
  replaceFromServer = (id: string, content: string, version: number) => {
    const d = this.docs.get(id);
    if (!d) return;
    if (d.content !== d.saved) {
      d.conflict = true;
      this.conflict = { fileId: id, path: d.path, content, version };
    } else {
      d.saved = content;
      d.version = version;
      d.content = content;
    }
    this.emit();
  };

  private emit() {
    let status: SaveStatus = "saved";
    const rank: SaveStatus[] = ["saved", "dirty", "saving", "error", "conflict"];
    for (const d of this.docs.values()) {
      const s: SaveStatus = d.conflict
        ? "conflict"
        : d.error
          ? "error"
          : d.inflight
            ? "saving"
            : d.content !== d.saved
              ? "dirty"
              : "saved";
      if (rank.indexOf(s) > rank.indexOf(status)) status = s;
    }
    const files = [...this.docs.entries()]
      .map(([id, d]) => ({ id, path: d.path, binary: d.binary, size: d.size }))
      .sort((a, b) => a.path.localeCompare(b.path));
    this.snapshot = { files, status, conflict: this.conflict, error: this.error };
    for (const l of this.listeners) l();
  }
}
