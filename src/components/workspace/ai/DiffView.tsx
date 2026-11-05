import { useMemo } from "react";
import { diffWords } from "@/lib/text-diff";
import { useI18n } from "@/lib/i18n/client";

/**
 * Word-level diff of an AI proposal against the text it would replace:
 * deletions struck through in red, insertions in green. Pure presentation —
 * applying is always a separate, explicit action of the author.
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const { t } = useI18n();
  const ops = useMemo(() => diffWords(before, after), [before, after]);
  const changed = ops.some((op) => op.type !== "same");
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted">{changed ? t("ai.diff.legend") : t("ai.diff.none")}</p>
      <div
        className="max-h-80 overflow-y-auto font-mono text-[12px] leading-5 whitespace-pre-wrap"
        data-testid="ai-diff"
      >
        {ops.map((op, i) =>
          op.type === "same" ? (
            <span key={i}>{op.text}</span>
          ) : op.type === "del" ? (
            <del
              key={i}
              className="rounded-sm bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] decoration-1"
            >
              {op.text}
            </del>
          ) : (
            <ins
              key={i}
              className="rounded-sm bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] no-underline"
            >
              {op.text}
            </ins>
          ),
        )}
      </div>
    </div>
  );
}
