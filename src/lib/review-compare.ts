// Pure diff between two reviews (v2 of review mode): which old comments
// disappeared ("resolved"), which new comments nobody had seen ("added") and
// which of those still need attention ("open"). It works on the RAW comments:
// per-comment dismissed/resolved states live in the reviews table, not in the
// Review object, so the UI subtracts dismissed ones from `open` itself.

import type { Review, ReviewComment } from "@/lib/review";

export type CompareResult = { resolved: number; added: number; open: number };

/** A new comment continues an old one: same aspect, and either the same file
 *  with the line drifting at most 5, or the same (non-empty) quote prefix. */
function matches(oldC: ReviewComment, newC: ReviewComment): boolean {
  if (oldC.aspect !== newC.aspect) return false;
  if (
    oldC.file !== null &&
    newC.file !== null &&
    oldC.file === newC.file &&
    oldC.line !== null &&
    newC.line !== null &&
    Math.abs(oldC.line - newC.line) <= 5
  )
    return true;
  return !!oldC.quote && !!newC.quote && oldC.quote.slice(0, 25) === newC.quote.slice(0, 25);
}

export function compareReviews(oldRev: Review, newRev: Review): CompareResult {
  // ponytail: O(n*m) with n,m <= 20 comments per review; a pairing algorithm
  // only matters if reviews grow an order of magnitude.
  const continued = oldRev.comments.map((o) => newRev.comments.some((n) => matches(o, n)));
  const known = newRev.comments.map((n) => oldRev.comments.some((o) => matches(o, n)));
  const added = known.filter((k) => !k).length;
  return {
    resolved: continued.filter((c) => !c).length,
    added,
    open: added, // dismissed filtering is the UI's job (states are external)
  };
}
