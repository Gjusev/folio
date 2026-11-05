import { useState, type ClipboardEvent, type DragEvent } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

export type ImageKind = "auto" | "equation" | "table" | "figure" | "text";

export type ImageResult = {
  latex: string;
  /** true: compiled in the sandbox · false: failed (see error) · null: not checked. */
  compiles: boolean | null;
  error?: string;
  unreadable?: boolean;
};

const KINDS: { value: ImageKind; key: MsgKey }[] = [
  { value: "auto", key: "ai.image.kind.auto" },
  { value: "equation", key: "ai.image.kind.equation" },
  { value: "table", key: "ai.image.kind.table" },
  { value: "figure", key: "ai.image.kind.figure" },
  { value: "text", key: "ai.image.kind.text" },
];

const MAX_BYTES = 4 * 1024 * 1024; // mirrors the route's limit

/**
 * Photo, screenshot or scan → LaTeX. The image goes only to the user's own AI
 * provider (through the server) and is never stored; the server compiles the
 * result in the sandbox and says whether it builds.
 */
export function ImageToLatex({
  projectId,
  onResult,
  onClose,
}: {
  projectId: string;
  onResult: (result: ImageResult, request: { kind: ImageKind; hint: string }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [kind, setKind] = useState<ImageKind>("auto");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(file: File | undefined | null) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(t("ai.image.notImage"));
    if (file.size > MAX_BYTES) return setError(t("ai.image.tooBig"));
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: String(reader.result), name: file.name || "image" });
    reader.onerror = () => setError(t("ai.image.notImage"));
    reader.readAsDataURL(file);
  }

  async function convert() {
    if (!image || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImageResult>("POST", `/api/projects/${projectId}/ai/image`, {
        image: image.dataUrl,
        kind,
        ...(hint.trim() ? { hint: hint.trim() } : {}),
      });
      onResult(result, { kind, hint: hint.trim() });
      setImage(null);
      setHint("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-2.5"
      onPaste={(e: ClipboardEvent) => load(e.clipboardData.files[0])}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        load(e.dataTransfer.files[0]);
      }}
      data-testid="image-to-latex"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("ai.image.title")}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("ai.image.close")}
        </button>
      </div>
      {image ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
          <img
            src={image.dataUrl}
            alt={image.name}
            className="max-h-28 max-w-[50%] rounded border border-line object-contain"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(null)}>
            {t("ai.image.change")}
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-muted hover:text-ink">
          <span>{t("ai.image.choose")}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => load(e.target.files?.[0])}
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="label">{t("ai.image.kind")}</span>
          <select
            className="select h-7 text-xs"
            value={kind}
            onChange={(e) => setKind(e.target.value as ImageKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {t(k.key)}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input h-7 min-w-0 flex-1 text-xs"
          placeholder={t("ai.image.hint.ph")}
          value={hint}
          maxLength={500}
          onChange={(e) => setHint(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!image || busy}
          onClick={() => void convert()}
        >
          {busy ? t("ai.image.busy") : t("ai.image.run")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] leading-4 text-muted">{t("ai.image.privacy")}</p>
    </div>
  );
}
