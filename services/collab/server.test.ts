import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signCollabToken } from "@/lib/collab-token";

// Cross-compat: the web app signs (src/lib/collab-token.ts), the relay
// verifies — these tests pin both to the same format.
//
// The relay module reads COLLAB_SECRET at import time, so pin it (and clear
// COMPILER_TOKEN) before ./server loads.
const SECRET = vi.hoisted(() => {
  process.env.COLLAB_SECRET = "test-secret-0123456789abcdef";
  process.env.COMPILER_TOKEN = "";
  return "test-secret-0123456789abcdef";
});
const { verifyToken, server } = await import("./server");

describe("collab relay token", () => {
  it("accepts a freshly signed token", () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", SECRET, 60_000, 1_000);
    expect(verifyToken(token, SECRET, 2_000)).toEqual({
      pid: "proj-1",
      uid: "user-1",
      file: "file-1",
      exp: 61_000,
    });
  });

  it("rejects an expired token", () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", SECRET, 60_000, 1_000);
    expect(verifyToken(token, SECRET, 61_000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", "other-secret-0123456", 60_000);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects tampering with the payload or the signature", () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", SECRET, 60_000);
    const [payload, sig] = token.split(".");
    const forgedPid = Buffer.from(
      JSON.stringify({
        pid: "proj-2",
        uid: "user-1",
        file: "file-2",
        exp: Date.now() + 60_000,
      }),
    ).toString("base64url");
    expect(verifyToken(`${forgedPid}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(`${payload}.${"A".repeat(43)}`, SECRET)).toBeNull();
    expect(verifyToken(`${payload}.${sig}${sig}`, SECRET)).toBeNull();
  });

  it("rejects tokens from before `file` was signed (old format)", () => {
    // Hand-rolled pre-file token: identical HMAC construction, claims without
    // `file`. Old clients just ask for a fresh token; these must never pass.
    const payload = Buffer.from(
      JSON.stringify({ pid: "proj-1", uid: "user-1", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyToken(`${payload}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens and non-string input", () => {
    expect(verifyToken("", SECRET)).toBeNull();
    expect(verifyToken("no-dot", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
    expect(verifyToken(12345, SECRET)).toBeNull();
  });
});

describe("room binding (live socket)", () => {
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("closes 4001 when the room is not the file signed in the token", async () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", SECRET, 60_000);
    const code = await closeCode(`ws://127.0.0.1:${port}/?token=${token}&file=file-2&client=1`);
    expect(code).toBe(4001);
  });

  it("joins the room named in the token", async () => {
    const token = signCollabToken("proj-1", "user-1", "file-1", SECRET, 60_000);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}&file=file-1&client=1`);
    const state = await new Promise<{ type?: string; data?: string; first?: boolean }>(
      (resolve, reject) => {
        ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))), { once: true });
        ws.addEventListener("close", (e) => reject(new Error(`closed ${e.code}`)), {
          once: true,
        });
      },
    );
    expect(state).toEqual({ type: "state", data: "", first: true });
    ws.close();
  });
});

function closeCode(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("close", (e) => resolve(e.code));
    ws.addEventListener("error", () => reject(new Error("socket error")));
  });
}
