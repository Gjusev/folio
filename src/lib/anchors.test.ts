import { describe, expect, it } from "vitest";
import { relocateAnchor } from "@/lib/anchors";

const doc =
  "Intro line.\nThe quick brown fox jumps over the lazy dog and keeps running.\nOutro line.\n";
const quote = "The quick brown fox jumps over the lazy dog";
const start = doc.indexOf(quote);
const end = start + quote.length; // 44 > 25, so a late edit still leaves the prefix intact

describe("relocateAnchor", () => {
  it("keeps an anchor whose quote still matches exactly", () => {
    expect(relocateAnchor(doc, quote, start, end)).toEqual({ start, end });
  });

  it("shifts when text is inserted before the quote", () => {
    const inserted = "A brand new sentence. ";
    const edited = inserted + doc;
    expect(relocateAnchor(edited, quote, start, end)).toEqual({
      start: start + inserted.length,
      end: end + inserted.length,
    });
  });

  it("keeps the position when the edit is after the quote", () => {
    const edited = doc + "Trailing commentary.\n";
    expect(relocateAnchor(edited, quote, start, end)).toEqual({ start, end });
  });

  it("relocates by prefix when the quote is edited inside (past char 25)", () => {
    const edited = doc.replace("lazy dog", "sleepy dog");
    // The full quote no longer appears, but its first 25 characters still do.
    expect(edited.includes(quote)).toBe(false);
    const anchor = relocateAnchor(edited, quote, start, end);
    expect(anchor).toEqual({ start, end });
    expect(edited.slice(anchor!.start, anchor!.start + 25)).toBe(quote.slice(0, 25));
  });

  it("returns null when the quote is gone", () => {
    const edited = doc.replace(quote, "");
    expect(edited.includes(quote.slice(0, 25))).toBe(false);
    expect(relocateAnchor(edited, quote, start, end)).toBeNull();
  });

  it("picks the nearest occurrence and prefers forward on ties", () => {
    const content = "NEEDLE xx NEEDLE yy NEEDLE"; // occurrences at 0, 10, 20
    const before = relocateAnchor(content, "NEEDLE", 12, 18); // nearest is 10
    expect(before).toEqual({ start: 10, end: 16 });
    const after = relocateAnchor(content, "NEEDLE", 16, 22); // nearest is 20
    expect(after).toEqual({ start: 20, end: 26 });
    const tie = relocateAnchor(content, "NEEDLE", 15, 21); // equidistant: forward wins
    expect(tie).toEqual({ start: 20, end: 26 });
  });
});
