/** Prefix length used to relocate an anchor whose quote was edited inside. */
const PREFIX = 25;

export type Anchor = { start: number; end: number };

/** Relocates a quoted anchor in (possibly edited) content:
 *  1. exact slice match at the old position;
 *  2. nearest occurrence of the full quote, forward first then backward;
 *  3. nearest occurrence of the first 25 characters, same search;
 *  null when nothing relocates. Offsets are UTF-16 code-unit indices. */
export function relocateAnchor(
  content: string,
  quote: string,
  start: number,
  end: number,
): Anchor | null {
  if (!quote) return null;
  if (content.slice(start, end) === quote) return { start, end };
  return (
    nearest(content, quote, end - start, start) ??
    nearest(content, quote.slice(0, PREFIX), end - start, start)
  );
}

/** Closest occurrence of `needle` to `from`: forward candidates win ties. The
 *  returned span keeps the original anchor length. */
function nearest(content: string, needle: string, len: number, from: number): Anchor | null {
  if (!needle || len <= 0) return null;
  const fwd = content.indexOf(needle, from);
  const bwd = content.lastIndexOf(needle, from - 1);
  const at = fwd === -1 ? bwd : bwd === -1 ? fwd : from - bwd < fwd - from ? bwd : fwd;
  return at === -1 ? null : { start: at, end: at + len };
}
