import { describe, expect, it } from "vitest";
import { signCollabToken } from "@/lib/collab-token";
import { verifyToken } from "./server";

// Cross-compat: the web app signs (src/lib/collab-token.ts), the relay
// verifies — these tests pin both to the same format.
const SECRET = "test-secret-0123456789abcdef";

describe("collab relay token", () => {
  it("accepts a freshly signed token", () => {
    const token = signCollabToken("proj-1", "user-1", SECRET, 60_000, 1_000);
    expect(verifyToken(token, SECRET, 2_000)).toEqual({
      pid: "proj-1",
      uid: "user-1",
      exp: 61_000,
    });
  });

  it("rejects an expired token", () => {
    const token = signCollabToken("proj-1", "user-1", SECRET, 60_000, 1_000);
    expect(verifyToken(token, SECRET, 61_000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signCollabToken("proj-1", "user-1", "other-secret-0123456", 60_000);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects tampering with the payload or the signature", () => {
    const token = signCollabToken("proj-1", "user-1", SECRET, 60_000);
    const [payload, sig] = token.split(".");
    const forgedPid = Buffer.from(
      JSON.stringify({ pid: "proj-2", uid: "user-1", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifyToken(`${forgedPid}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(`${payload}.${"A".repeat(43)}`, SECRET)).toBeNull();
    expect(verifyToken(`${payload}.${sig}${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens and non-string input", () => {
    expect(verifyToken("", SECRET)).toBeNull();
    expect(verifyToken("no-dot", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
    expect(verifyToken(12345, SECRET)).toBeNull();
  });
});
