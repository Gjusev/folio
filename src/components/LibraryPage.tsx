"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Library } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

const MAX_BYTES = 25 * 1024 * 1024;

type Paper = {
  id: string;
  title: string;
  size: number;
  pages: number | null;
  doi: string | null;
  text: boolean;
  createdAt: string;
  attachedTo: { projectId: string; name: string }[];
};
type Project = { id: string; name: string; role?: string | null };

/** Reads a File as base64 (without the data: URL prefix). */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*;base64,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const fmtSize = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

export function LibraryPage() {
  const { t } = useI18n();
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Project picker for Cite…/Attach: which paper, in which mode.
  const [picker, setPicker] = useState<{ mode: "cite" | "attach"; paper: Paper } | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDialogElement>(null);

  // The picker is a real modal: showModal() gives it the scrim, focus trap and
  // Escape-to-close that a plain `open` attribute never had.
  useEffect(() => {
    const d = pickerRef.current;
    if (!d) return;
    if (picker && !d.open) {
      try {
        d.showModal();
      } catch {
        /* already open elsewhere */
      }
    }
    if (!picker && d.open) d.close();
  }, [picker]);

  const load = useCallback(async () => {
    try {
      const { papers } = await api<{ papers: Paper[] }>("GET", "/api/library");
      setPapers(papers);
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Projects are needed only when a picker opens; viewers are filtered out.
  useEffect(() => {
    if (!picker) return;
    void (async () => {
      const res = await api<{ projects: Project[] }>("GET", "/api/projects").catch(() => null);
      setProjects(res ? res.projects.filter((p) => p.role !== "viewer") : []);
    })();
  }, [picker]);

  async function upload(files: File[]) {
    setError(null);
    setMessage(null);
    const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdfs.length !== files.length) {
      setMessage({ text: t("lb.notPdf"), error: true });
      if (pdfs.length === 0) return;
    }
    if (pdfs.some((f) => f.size > MAX_BYTES)) {
      setMessage({ text: t("lb.tooBig"), error: true });
      return;
    }
    setUploading(true);
    try {
      for (const file of pdfs) {
        await api("POST", "/api/library", { filename: file.name, data: await toBase64(file) });
      }
      await load();
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function open(paper: Paper) {
    try {
      const res = await fetch(`/api/library/${paper.id}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
    }
  }

  async function remove(paper: Paper) {
    setError(null);
    try {
      await api("DELETE", `/api/library/${paper.id}`);
      setPapers((xs) => (xs ?? []).filter((p) => p.id !== paper.id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof TypeError ? t("offline") : (err as Error).message);
    }
  }

  async function pickProject(project: Project) {
    if (!picker) return;
    setBusyProject(project.id);
    setMessage(null);
    try {
      if (picker.mode === "cite") {
        const r = await api<{ key: string; added: boolean; bibPath: string }>(
          "POST",
          `/api/library/${picker.paper.id}/cite`,
          { projectId: project.id },
        );
        setMessage({
          text: r.added
            ? t("lb.cited", { key: r.key, file: r.bibPath })
            : t("lb.cited.existing", { key: r.key, file: r.bibPath }),
        });
        setPicker(null);
      } else {
        const attached = picker.paper.attachedTo.some((a) => a.projectId === project.id);
        if (attached) {
          await api("DELETE", `/api/library/${picker.paper.id}/attach`, { projectId: project.id });
          setMessage({ text: t("lb.detached.msg") });
        } else {
          const r = await api<{ chunks: number }>(
            "POST",
            `/api/library/${picker.paper.id}/attach`,
            { projectId: project.id },
          );
          setMessage({ text: t("lb.attached.msg", { n: r.chunks }) });
        }
        await load();
      }
    } catch (err) {
      setMessage({
        text: err instanceof TypeError ? t("offline") : (err as Error).message,
        error: true,
      });
    } finally {
      setBusyProject(null);
    }
  }

  const startCite = (paper: Paper) => {
    if (!paper.doi) {
      setMessage({ text: t("lb.noDoi"), error: true });
      return;
    }
    setMessage(null);
    setPicker({ mode: "cite", paper });
  };

  const startAttach = (paper: Paper) => {
    if (!paper.text) {
      setMessage({ text: t("lb.noText"), error: true });
      return;
    }
    setMessage(null);
    setPicker({ mode: "attach", paper });
  };

  return (
    <section aria-labelledby="library-title">
      <h1 id="library-title" className="text-[22px] leading-7 font-semibold">
        {t("lb.title")}
      </h1>

      <div
        role="button"
        tabIndex={0}
        aria-label={t("lb.upload.pick")}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-soft" : "border-line hover:bg-raised"
        }`}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload([...e.dataTransfer.files]);
        }}
      >
        <FileUp aria-hidden className="h-6 w-6 text-muted" />
        <p className="mt-2 text-sm font-medium">{t("lb.upload.head")}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-muted">{t("lb.upload.body")}</p>
        <p className="mt-1 text-xs text-muted">
          {uploading ? t("lb.upload.busy") : t("lb.upload.hint")}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            message.error
              ? "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]"
              : "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
          }`}
        >
          {message.text}
        </p>
      )}

      {papers?.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <Library aria-hidden className="h-5 w-5 text-muted" />
          <h2 className="mt-3 text-base font-semibold">{t("lb.empty.head")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{t("lb.empty.body")}</p>
          <button
            type="button"
            className="btn btn-sm mt-3"
            onClick={() => fileInput.current?.click()}
          >
            {t("lb.upload.pick")}
          </button>
        </div>
      ) : (
        <>
          {papers && papers.length > 3 && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input mt-4 max-w-72"
              placeholder={t("lb.filter")}
              aria-label={t("lb.filter")}
            />
          )}
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-4 font-medium">{t("lb.col.title")}</th>
                <th className="num hidden py-2 pr-4 text-right font-medium md:table-cell">
                  {t("lb.col.pages")}
                </th>
                <th className="num hidden py-2 pr-4 text-right font-medium md:table-cell">
                  {t("lb.col.size")}
                </th>
                <th className="hidden py-2 pr-4 font-medium md:table-cell">
                  {t("lb.col.projects")}
                </th>
                <th className="py-2">
                  <span className="sr-only">{t("lb.delete")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(papers ?? [])
                .filter(
                  (p) =>
                    !filter ||
                    p.title.toLowerCase().includes(filter.toLowerCase()) ||
                    (p.doi ?? "").toLowerCase().includes(filter.toLowerCase()),
                )
                .map((p) => (
                  <tr key={p.id} className="group border-b border-rule hover:bg-raised">
                    <td className="max-w-0 py-0 pr-4">
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 truncate py-3 text-left font-medium"
                        onClick={() => void open(p)}
                        title={t("lb.open")}
                      >
                        <span className="truncate">{p.title}</span>
                        <span className="num text-xs font-normal text-muted md:hidden">
                          {p.pages ? t("lb.pages", { n: p.pages }) : t("lb.noPages")} ·{" "}
                          {fmtSize(p.size)}
                        </span>
                        {p.doi ? (
                          <span className="num text-xs font-normal text-muted">{p.doi}</span>
                        ) : null}
                        {!p.text ? (
                          <span className="text-xs font-normal text-muted">{t("lb.noText")}</span>
                        ) : null}
                      </button>
                    </td>
                    <td className="num hidden py-3 pr-4 text-right text-muted md:table-cell">
                      {p.pages ? t("lb.pages", { n: p.pages }) : t("lb.noPages")}
                    </td>
                    <td className="num hidden py-3 pr-4 whitespace-nowrap text-right text-muted md:table-cell">
                      {fmtSize(p.size)}
                    </td>
                    <td className="hidden max-w-0 py-3 pr-4 md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {p.attachedTo.map((a) => (
                          <span key={a.projectId} className="pill shrink-0">
                            {a.name}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="w-0 py-2 text-right">
                      <span className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startCite(p)}
                          disabled={!p.doi}
                          title={p.doi ? t("lb.cite") : t("lb.noDoi")}
                        >
                          {t("lb.cite")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startAttach(p)}
                          disabled={!p.text}
                          title={p.text ? t("lb.attach") : t("lb.noText")}
                        >
                          {t("lb.attach")}
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost btn-sm sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:!opacity-100 ${
                            confirmDelete === p.id ? "text-danger" : ""
                          }`}
                          onClick={() =>
                            confirmDelete === p.id ? void remove(p) : setConfirmDelete(p.id)
                          }
                          onBlur={() => setConfirmDelete((id) => (id === p.id ? null : id))}
                          aria-label={`${t("lb.delete")} ${p.title}`}
                        >
                          {confirmDelete === p.id ? t("common.confirm") : t("lb.delete")}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {picker && (
        <dialog
          ref={pickerRef}
          onCancel={() => setPicker(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPicker(null);
          }}
          className="m-auto w-[min(480px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop:bg-black/40 /* taste-skill-ignore shadow: modal dialog = real overlay */"
          aria-labelledby="library-pick-title"
        >
          <h2 id="library-pick-title" className="text-base font-semibold">
            {t("lb.pick.title")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {picker.mode === "cite" ? t("lb.pick.cite") : t("lb.pick.attach")}
          </p>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {projects === null ? (
              <li className="py-2 text-sm text-muted">{t("common.loading")}</li>
            ) : projects.length === 0 ? (
              <li className="py-2 text-sm text-muted">{t("lb.pick.none")}</li>
            ) : (
              projects.map((project) => {
                const attached = picker.paper.attachedTo.some((a) => a.projectId === project.id);
                return (
                  <li
                    key={project.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-raised"
                  >
                    <span className="truncate text-sm">{project.name}</span>
                    <button
                      type="button"
                      className="btn btn-sm shrink-0"
                      disabled={busyProject !== null}
                      onClick={() => void pickProject(project)}
                    >
                      {picker.mode === "cite"
                        ? t("lb.cite")
                        : attached
                          ? t("lb.detach")
                          : t("lb.attach")}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn" onClick={() => setPicker(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
