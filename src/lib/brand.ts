// Folio's brand in one place: colours, the mark's geometry and the wordmark
// outlines. The app's <Logo> and scripts/brand-assets.mts (which renders every
// icon, social image and banner) both read this file, so they cannot drift.
// See docs/brand-guidelines.md.

export const BRAND = {
  ink: "#141413", // text, the source leaf
  paper: "#f6f5f1", // ground
  sheet: "#ffffff", // surfaces (the compiled page)
  sand: "#e9e8e2", // tone step
  stone: "#5d5c58", // secondary text
  teal: "#1b6c80", // the accent: the result leaf, links, selection
  tealLight: "#5fb3c8", // the accent on dark grounds
  night: "#0f0f0e", // dark ground
  nightInk: "#f2f2ef", // text on dark ground
} as const;

/**
 * The mark: a folio, a sheet folded once, seen open. Two leaves on a 64-unit
 * grid with a 6-unit spine between them; the outer edges rise so the sheet
 * reads as open, not flat. Left leaf = the source (ink), right leaf = the
 * compiled result (teal).
 */
export const MARK = {
  size: 64,
  left: "M6 12L29 18V56L6 50Z",
  right: "M35 18L58 12V50L35 56Z",
} as const;

/**
 * Small-size mark (favicons and anything drawn at 48px or less): the spine
 * widens to 10 units and the tilt flattens, so the gap survives antialiasing.
 */
export const MARK_SMALL = {
  size: 64,
  left: "M3 14L27 18V54L3 50Z",
  right: "M37 18L61 14V50L37 54Z",
} as const;

/** "Folio" in Switzer Semibold, tracking -0.04em, outlined at 100 units, baseline y=0. */
export const WORDMARK = {
  d: "M20.20 0L6.70 0L6.70-68L54.50-68L54.50-57.30L20.20-57.30L20.20-38.10L50.70-38.10L50.70-27.40L20.20-27.40L20.20 0ZM82.90 1.50L82.90 1.50Q71 1.50 64.10-6.05Q57.20-13.60 57.20-26.70L57.20-26.70Q57.20-40.20 64.10-47.65Q71-55.10 82.90-55.10Q94.80-55.10 101.65-47.50Q108.50-39.90 108.50-26.70L108.50-26.70Q108.50-13.40 101.60-5.95Q94.70 1.50 82.90 1.50ZM73.60-13.65Q76.80-9.10 82.90-9.10Q89-9.10 92.15-13.60Q95.30-18.10 95.30-26.70Q95.30-35.30 92.10-39.90Q88.90-44.50 82.90-44.50L82.90-44.50Q76.80-44.50 73.60-39.95Q70.40-35.40 70.40-26.70L70.40-26.70Q70.40-18.20 73.60-13.65ZM126.60 0L113.80 0L113.80-72L126.60-72L126.60 0ZM147.10-59.60L134.30-59.60L134.30-72L147.10-72L147.10-59.60ZM147.10 0L134.30 0L134.30-53.60L147.10-53.60L147.10 0ZM178 1.50L178 1.50Q166.10 1.50 159.20-6.05Q152.30-13.60 152.30-26.70L152.30-26.70Q152.30-40.20 159.20-47.65Q166.10-55.10 178-55.10Q189.90-55.10 196.75-47.50Q203.60-39.90 203.60-26.70L203.60-26.70Q203.60-13.40 196.70-5.95Q189.80 1.50 178 1.50ZM168.70-13.65Q171.90-9.10 178-9.10Q184.10-9.10 187.25-13.60Q190.40-18.10 190.40-26.70Q190.40-35.30 187.20-39.90Q184-44.50 178-44.50L178-44.50Q171.90-44.50 168.70-39.95Q165.50-35.40 165.50-26.70L165.50-26.70Q165.50-18.20 168.70-13.65Z",
  x1: 6.7,
  y1: -72,
  x2: 203.6,
  y2: 1.5,
  capHeight: 68,
} as const;

// Horizontal lockup: the leaves' outer edge is as tall as the capitals and
// starts at the cap line; the gap to the "F" is about one spine and a half.
const S = WORDMARK.capHeight / (50 - 12); // leaf outer height (38 units) -> cap height
const BASELINE = 100;
const MARK_Y = BASELINE - WORDMARK.capHeight - 12 * S;
const WORD_X = 58 * S + 24 - WORDMARK.x1;
const TOP = BASELINE + WORDMARK.y1 - 6;
const BOTTOM = MARK_Y + 56 * S + 6;

export const LOCKUP = {
  markScale: S,
  markY: MARK_Y,
  wordX: WORD_X,
  baseline: BASELINE,
  viewBox: [0, TOP, WORD_X + WORDMARK.x2 + 6, BOTTOM - TOP] as const,
};

type Colors = { left: string; right: string; word?: string };

const r = (n: number) => Number(n.toFixed(3));

/** Standalone SVG of the mark (64x64 viewBox). */
export function markSvg({ left, right }: Colors, title = "Folio"): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${title}">`,
    `<path fill="${left}" d="${MARK.left}"/>`,
    `<path fill="${right}" d="${MARK.right}"/>`,
    `</svg>`,
  ].join("");
}

/** Standalone SVG of the horizontal lockup (mark + wordmark). */
export function logoSvg({ left, right, word = left }: Colors, title = "Folio"): string {
  const [x, y, w, h] = LOCKUP.viewBox;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${r(y)} ${r(w)} ${r(h)}" role="img" aria-label="${title}">`,
    `<g transform="translate(0 ${r(MARK_Y)}) scale(${r(S)})">`,
    `<path fill="${left}" d="${MARK.left}"/><path fill="${right}" d="${MARK.right}"/>`,
    `</g>`,
    `<path fill="${word}" transform="translate(${r(WORD_X)} ${BASELINE})" d="${WORDMARK.d}"/>`,
    `</svg>`,
  ].join("");
}
