// Word-level diff of two texts (used to preview an AI rewrite before applying
// it). Tokenizes into words, whitespace runs and single punctuation/LaTeX
// tokens, then runs Myers' O(ND) algorithm over the token arrays.

export type DiffOp = { type: "same" | "del" | "ins"; text: string };

/** Above this many tokens per side the diff degrades to a coarse replace. */
export const MAX_DIFF_TOKENS = 6_000;

/** Cap on the Myers search depth: a rewrite differing in more tokens than
 *  this is a full rewrite for display purposes, so it gets the coarse result.
 *  Keeps the trace memory (O(D²)) bounded at a few MB. */
const MAX_EDIT_DEPTH = 2_500;

// A LaTeX command (\emph, \begin — backslash plus letters) is ONE token so
// word diffs never split a command; braces and other punctuation are single
// tokens each; words include combining marks (á can be a + U+0301).
const TOKEN = /\\[a-zA-Z]+|\s+|[\p{L}\p{M}\p{N}]+|[\s\S]/gu;

function tokenize(s: string): string[] {
  return [...s.matchAll(TOKEN)].map((m) => m[0]);
}

type Move = { t: "same" | "del" | "ins"; i: number };

/**
 * Myers O(ND) shortest edit script over two token arrays (Coglan's trace +
 * backtrack formulation). Returns null when the edit depth exceeds `maxD`
 * (caller then shows a coarse replace).
 */
function myersMoves(a: string[], b: string[], maxD: number): Move[] | null {
  const n = a.length;
  const m = b.length;
  const offset = maxD + 1;
  const v = new Int32Array(2 * maxD + 3);
  // trace[d] = copy of v's k∈[-d,d] slice taken BEFORE iteration d updated it.
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maxD; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        // Backtrack the path from (n, m) to (0, 0).
        const moves: Move[] = [];
        let cx = n;
        let cy = m;
        for (let dd = d; dd >= 0; dd--) {
          const tv = trace[dd];
          const k = cx - cy;
          const prevK = k === -dd || (k !== dd && tv[dd + k - 1] < tv[dd + k + 1]) ? k + 1 : k - 1;
          const prevX = tv[dd + prevK];
          const prevY = prevX - prevK;
          while (cx > prevX && cy > prevY) {
            moves.push({ t: "same", i: cx - 1 });
            cx--;
            cy--;
          }
          if (dd > 0) {
            if (cy === prevY) moves.push({ t: "del", i: prevX });
            else moves.push({ t: "ins", i: prevY });
          }
          cx = prevX;
          cy = prevY;
        }
        return moves.reverse();
      }
    }
  }
  return null;
}

/** The coarse fallback: everything removed, everything inserted. */
function coarse(a: string, b: string): DiffOp[] {
  const ops: DiffOp[] = [];
  if (a) ops.push({ type: "del", text: a });
  if (b) ops.push({ type: "ins", text: b });
  return ops;
}

/**
 * Word-level diff of `a` into `b`. Exact: concatenating the `same` and `del`
 * texts reconstructs `a`; `same` + `ins` reconstructs `b`. Adjacent ops of the
 * same type are merged. Inputs too large to diff finely (see MAX_DIFF_TOKENS)
 * come back as one whole-text deletion plus one whole-text insertion.
 */
export function diffWords(a: string, b: string): DiffOp[] {
  const at = tokenize(a);
  const bt = tokenize(b);
  if (at.length > MAX_DIFF_TOKENS || bt.length > MAX_DIFF_TOKENS) return coarse(a, b);

  // Trim the common prefix/suffix first: rewrites share most of their text,
  // which shrinks the Myers search to the genuinely changed region.
  let pre = 0;
  while (pre < at.length && pre < bt.length && at[pre] === bt[pre]) pre++;
  let suf = 0;
  while (
    suf < at.length - pre &&
    suf < bt.length - pre &&
    at[at.length - 1 - suf] === bt[bt.length - 1 - suf]
  )
    suf++;

  const midA = at.slice(pre, at.length - suf);
  const midB = bt.slice(pre, bt.length - suf);
  const moves = myersMoves(midA, midB, Math.min(MAX_EDIT_DEPTH, midA.length + midB.length));
  if (!moves) return coarse(a, b);

  const src = (t: Move["t"], i: number): string => (t === "ins" ? midB[i] : midA[i]);

  const ops: DiffOp[] = [];
  const emit = (type: DiffOp["type"], text: string) => {
    if (!text) return;
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  emit("same", at.slice(0, pre).join(""));
  for (const mv of moves) emit(mv.t, src(mv.t, mv.i));
  emit("same", at.slice(at.length - suf).join(""));
  return ops.length ? ops : [{ type: "same", text: "" }];
}
