import { describe, expect, it } from "vitest";
import { backoffMs, base64ToBytes, bytesToBase64 } from "./collab";

describe("collab client helpers", () => {
  it("round-trips bytes through base64", () => {
    for (const [name, bytes] of [
      ["empty", new Uint8Array()],
      ["ascii", new Uint8Array([72, 101, 108, 108, 111])],
      ["binary with zeros and high bits", new Uint8Array(256).map((_, i) => i)],
    ] as const) {
      const round = base64ToBytes(bytesToBase64(bytes));
      expect(round.length, name).toBe(bytes.length);
      expect(Buffer.from(round), name).toEqual(Buffer.from(bytes));
    }
  });

  it("reconnect backoff is 1s/2s/5s and then stops", () => {
    expect(backoffMs(0)).toBe(1_000);
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(5_000);
    expect(backoffMs(3)).toBeNull();
    expect(backoffMs(99)).toBeNull();
  });
});
