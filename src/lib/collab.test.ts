import { describe, expect, it } from "vitest";
import { signCollabToken } from "./collab-token";
import { backoffMs, base64ToBytes, bytesToBase64 } from "./collab";

describe("collab client helpers", () => {
  it("signs pid, uid, file and exp into the token claims", () => {
    // Pins the sign side; services/collab/server.test.ts pins the verify side
    // (the verifier is deliberately duplicated in the relay deployable).
    const token = signCollabToken(
      "proj-1",
      "user-1",
      "file-1",
      "test-secret-0123456789abcdef",
      60_000,
      1_000,
    );
    const [payload] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    expect(claims).toEqual({ pid: "proj-1", uid: "user-1", file: "file-1", exp: 61_000 });
  });

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
