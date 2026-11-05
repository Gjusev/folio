import { useMemo, useState } from "react";
import { parseDelimited, toBooktabs } from "@/lib/csv-to-latex";
import { useI18n } from "@/lib/i18n/client";

/**
 * Paste a CSV / spreadsheet range, get a booktabs table. Deterministic on
 * purpose — no AI, nothing to hallucinate: the preview shows exactly the
 * LaTeX that will be inserted.
 */
export function CsvTable({
  onInsert,
  onClose,
}: {
  onInsert: (latex: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const [header, setHeader] = useState(true);
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");

  const latex = useMemo(() => {
    if (!raw.trim()) return "";
    try {
      return toBooktabs(parseDelimited(raw), {
        header,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
    } catch {
      return "";
    }
  }, [raw, header, caption, label]);

  return (
    <div
      className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-2.5"
      data-testid="csv-table"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("ai.csv.title")}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t("ai.image.close")}
        </button>
      </div>
      <textarea
        className="input min-h-20 resize-y font-mono text-xs"
        placeholder={t("ai.csv.ph")}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={header}
            onChange={(e) => setHeader(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          {t("ai.csv.header")}
        </label>
        <input
          className="input h-7 min-w-0 flex-1 text-xs"
          placeholder={t("ai.csv.caption.ph")}
          value={caption}
          maxLength={120}
          onChange={(e) => setCaption(e.target.value)}
        />
        <input
          className="input h-7 w-36 text-xs"
          placeholder="tab:..."
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {latex && (
        <pre className="max-h-40 overflow-auto rounded-md border border-line bg-raised p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">
          {latex}
        </pre>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-muted">{t("ai.csv.note")}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm shrink-0"
          disabled={!latex}
          onClick={() => {
            onInsert(latex);
            onClose();
          }}
        >
          {t("ai.insertCode")}
        </button>
      </div>
    </div>
  );
}
