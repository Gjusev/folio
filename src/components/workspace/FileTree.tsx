import { useRef, useState, type DragEvent, type SubmitEvent } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { validateFilePath } from "@/lib/paths";
import type { FileDoc, FileMeta } from "./document-store";

type Props = {
  projectId: string;
  files: FileMeta[];
  activeId?: string;
  mainFile: string;
  onOpen: (id: string) => void;
  onAdded: (file: FileDoc) => void;
  onRenamed: (id: string, path: string) => void;
  onRemoved: (id: string) => void;
  onMainChanged: (path: string) => void;
};

const ACCEPT = ".tex,.bib,.sty,.cls,.bst,.txt,.md,.csv,.dat,.png,.jpg,.jpeg,.pdf";
const kb = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;

/** Groups "a/b.tex" under folder "a"; root files first. */
function grouped(files: FileMeta[]) {
  const groups = new Map<string, FileMeta[]>();
  for (const f of files) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  );
}

export function FileTree(p: Props) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function create(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const path = String(new FormData(e.currentTarget).get("path") ?? "").trim();
    const problem = validateFilePath(path);
    if (problem) return setError(problem);
    try {
      const { file } = await api<{ file: FileDoc }>("POST", `/api/projects/${p.projectId}/files`, {
        path,
      });
      p.onAdded(file);
      setCreating(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function upload(list: FileList | File[]) {
    setError(null);
    for (const f of Array.from(list)) {
      setUploading((n) => n + 1);
      const form = new FormData();
      form.append("file", f);
      if (/\.(png|jpe?g|pdf)$/i.test(f.name)) form.append("folder", "figures");
      try {
        const res = await fetch(`/api/projects/${p.projectId}/uploads`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${f.name}: ${data.error ?? `error ${res.status}`}`);
        p.onAdded(data.file);
      } catch (err) {
        setError(err instanceof TypeError ? t("offline") : (err as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function rename(f: FileMeta) {
    const next = prompt(t("files.rename.prompt"), f.path)?.trim();
    if (!next || next === f.path) return;
    try {
      await api("PATCH", `/api/projects/${p.projectId}/files/${f.id}`, { path: next });
      p.onRenamed(f.id, next);
      if (f.path === p.mainFile) p.onMainChanged(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(f: FileMeta) {
    if (!confirm(t("files.delete.confirm", { path: f.path }))) return;
    try {
      await api("DELETE", `/api/projects/${p.projectId}/files/${f.id}`);
      p.onRemoved(f.id);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function makeMain(f: FileMeta) {
    try {
      await api("PATCH", `/api/projects/${p.projectId}`, { mainFile: f.path });
      p.onMainChanged(f.path);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${dragging ? "bg-accent-soft" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex shrink-0 gap-1.5 px-3 pt-3 pb-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
        >
          {t("files.new")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => input.current?.click()}
          disabled={uploading > 0}
        >
          {uploading > 0 ? t("files.upload.busy") : t("files.upload")}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {creating && (
        <form onSubmit={create} className="px-3 pb-2">
          <label htmlFor="new-file" className="sr-only">
            {t("files.new")}
          </label>
          <input
            id="new-file"
            name="path"
            className="input font-mono text-xs" /* taste-skill-ignore mono: a file path is literal code */
            placeholder={t("files.path.placeholder")}
            autoFocus
          />
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-md bg-[var(--pill-negative-bg)] px-2 py-1.5 text-xs text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}
      <nav aria-label={t("files.title")} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {grouped(p.files).map(([dir, items]) => (
          <div key={dir || "/"} className={dir ? "mt-2" : ""}>
            {dir && <p className="px-2 pb-0.5 text-xs text-muted">{dir}/</p>}
            <ul>
              {items.map((f) => {
                const name = dir ? f.path.slice(dir.length + 1) : f.path;
                const isMain = f.path === p.mainFile;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => p.onOpen(f.id)}
                      aria-current={f.id === p.activeId ? "page" : undefined}
                      className={`flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-[13px] ${dir ? "pl-4" : "pl-2"} ${
                        f.id === p.activeId
                          ? "bg-active font-medium text-ink"
                          : "text-ink hover:bg-raised"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {isMain && (
                        <span className="pill shrink-0 bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]">
                          {t("files.main")}
                        </span>
                      )}
                      {f.binary && (
                        <span className="num shrink-0 text-[11px] text-muted">
                          {kb(f.size ?? 0)}
                        </span>
                      )}
                    </button>
                    {f.id === p.activeId && (
                      <div className={`flex flex-wrap gap-1 pt-0.5 pb-1 ${dir ? "pl-3" : "pl-1"}`}>
                        {!isMain && f.path.endsWith(".tex") && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => makeMain(f)}
                          >
                            {t("files.makeMain")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => rename(f)}
                          aria-label={t("files.rename.a11y", { path: f.path })}
                        >
                          {t("files.rename")}
                        </button>
                        {!isMain && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm hover:text-danger"
                            onClick={() => remove(f)}
                            aria-label={t("files.delete.a11y", { path: f.path })}
                          >
                            {t("files.delete")}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="px-2 pt-3 text-xs text-muted">{t("files.drop.hint")}</p>
      </nav>
    </div>
  );
}
