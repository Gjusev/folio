import { LOCKUP, MARK, MARK_SMALL, WORDMARK } from "@/lib/brand";

// The brand drawn inline: the source leaf and the wordmark take currentColor,
// the result leaf takes the accent, so the logo follows light and dark themes.

export function Logo({ className = "h-6 w-auto" }: { className?: string }) {
  const [x, y, w, h] = LOCKUP.viewBox;
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      className={className}
      role="img"
      aria-hidden
      focusable="false"
    >
      <g transform={`translate(0 ${LOCKUP.markY}) scale(${LOCKUP.markScale})`}>
        <path fill="currentColor" d={MARK.left} />
        <path fill="var(--accent)" d={MARK.right} />
      </g>
      <path
        fill="currentColor"
        transform={`translate(${LOCKUP.wordX} ${LOCKUP.baseline})`}
        d={WORDMARK.d}
      />
    </svg>
  );
}

/** The mark alone; `small` switches to the wide-spine variant for 48px and below. */
export function Mark({
  className = "h-6 w-6",
  small = false,
}: {
  className?: string;
  small?: boolean;
}) {
  const m = small ? MARK_SMALL : MARK;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden focusable="false">
      <path fill="currentColor" d={m.left} />
      <path fill="var(--accent)" d={m.right} />
    </svg>
  );
}
