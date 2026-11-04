import { describe, expect, it } from "vitest";
import { daysUntilPrismCloses } from "./prism";

describe("daysUntilPrismCloses", () => {
  it("counts whole days, rounding a partial day up", () => {
    expect(daysUntilPrismCloses(Date.UTC(2026, 10, 4, 12))).toBe(58);
    expect(daysUntilPrismCloses(Date.UTC(2026, 11, 31, 23))).toBe(1);
  });

  it("is 0 on and after the closing date, never negative", () => {
    expect(daysUntilPrismCloses(Date.UTC(2027, 0, 1))).toBe(0);
    expect(daysUntilPrismCloses(Date.UTC(2030, 5, 1))).toBe(0);
  });
});
