// Folio collab relay: fans Yjs updates and awareness (cursors) between editors
// of the same file. One Node process, in-memory rooms, no database: v1 keeps
// the session state in RAM only and the web app's autosave (files table) stays
// the source of truth. Self-contained on purpose — the Docker build context is
// this directory and nothing else.
//
// Wire protocol (JSON text frames, base64 payloads):
//   client -> ws://host/?token=<t>&file=<fileId>&client=<yjsClientId>
//   relay  -> {type:"state", data:"u1,u2,...", first:boolean}   on join
//   either -> {type:"update", data:"<base64>"}    broadcast minus sender
//   either -> {type:"awareness", data:"<base64>"} broadcast minus sender
//   relay  -> {type:"bye", client:<id>}           when a peer's socket dies
// `data` of state is the comma-joined accumulated updates; clients split on ","
// and apply each one sequentially (valid Yjs updates compose by concatenation).
// `first` tells the joining client it is alone and may seed the document.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 3001);
// COLLAB_SECRET is the signing key; COMPILER_TOKEN is reused when unset so a
// single-secret deployment works (documented in .env.example).
const SECRET = process.env.COLLAB_SECRET || process.env.COMPILER_TOKEN || "";
const MAX_PAYLOAD = 1_000_000; // 1 MB per message
const HEARTBEAT_MS = 30_000;
const FILE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export type TokenClaims = { pid: string; uid: string; exp: number };

/**
 * Token format: `<b64url(json claims)>.<b64url(hmac-sha256(claims segment))>`.
 * The web app signs it (src/lib/collab-token.ts); only this verifier runs
 * here. services/collab/server.test.ts checks both sides agree.
 */
export function verifyToken(token: unknown, secret: string, now = Date.now()): TokenClaims | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot < 1 || token.indexOf(".", dot + 1) !== -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // b64url without padding of a 32-byte HMAC is always 43 chars.
  if (sig.length !== 43) return null;
  const want = createHmac("sha256", secret).update(payload).digest("base64url");
  const got = Buffer.from(sig);
  const expected = Buffer.from(want);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const c = claims as Partial<TokenClaims>;
  if (typeof c.pid !== "string" || !c.pid || typeof c.uid !== "string" || !c.uid) return null;
  if (typeof c.exp !== "number" || !Number.isFinite(c.exp) || c.exp <= now) return null;
  return { pid: c.pid, uid: c.uid, exp: c.exp };
}

type Conn = { ws: WebSocket; room: Room; client: number; alive: boolean };
type Room = { id: string; conns: Set<Conn>; updates: string[] };

const rooms = new Map<string, Room>();

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: unknown, except: WebSocket) {
  const frame = JSON.stringify(msg);
  for (const c of room.conns)
    if (c.ws !== except && c.ws.readyState === c.ws.OPEN) c.ws.send(frame);
}

const http = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const claims = verifyToken(url.searchParams.get("token"), SECRET);
  const file = url.searchParams.get("file") ?? "";
  const client = Number(url.searchParams.get("client"));
  if (!claims) return ws.close(4001, "invalid token");
  if (!FILE_ID.test(file) || !Number.isInteger(client) || client < 0)
    return ws.close(4002, "invalid room");

  let room = rooms.get(file);
  const first = room === undefined || room.conns.size === 0;
  if (!room) rooms.set(file, (room = { id: file, conns: new Set(), updates: [] }));
  const conn: Conn = { ws, room, client, alive: true };
  room.conns.add(conn);

  send(ws, { type: "state", data: room.updates.join(","), first });

  ws.on("pong", () => (conn.alive = true));
  ws.on("message", (data, isBinary) => {
    // Text frames arrive as Buffer (ws never delivers strings on the server).
    if (isBinary) return ws.close(4002, "binary frames not supported");
    const text =
      typeof data === "string"
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data).toString("utf8")
          : Buffer.from(data as Buffer).toString("utf8");
    let msg: { type?: unknown; data?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return ws.close(4002, "invalid json");
    }
    if (msg.type === "update" && typeof msg.data === "string" && msg.data.length <= MAX_PAYLOAD) {
      // ponytail: unbounded per-room accumulation of update strings; rooms are
      // GC'd when the last peer leaves and a restart clears everything.
      // Upgrade path: persist/compact with Y.mergeUpdates (or a DB snapshot)
      // if long-lived rooms ever grow past a few MB.
      room.updates.push(msg.data);
      broadcast(room, msg, ws);
    } else if (msg.type === "awareness" && typeof msg.data === "string") {
      broadcast(room, msg, ws);
    } else {
      ws.close(4002, "invalid message");
    }
  });
  ws.on("close", () => {
    room.conns.delete(conn);
    if (room.conns.size === 0) {
      rooms.delete(room.id);
    } else {
      // Let survivors drop the departed peer's cursor without decoding
      // awareness on the relay. Never accepted from clients, only emitted.
      broadcast(room, { type: "bye", client }, ws);
    }
  });
  ws.on("error", () => ws.terminate());
});

// Kill dead connections: a tab killed outright never sends a close frame.
setInterval(() => {
  for (const room of rooms.values())
    for (const conn of room.conns) {
      if (!conn.alive) conn.ws.terminate();
      else {
        conn.alive = false;
        conn.ws.ping();
      }
    }
}, HEARTBEAT_MS).unref();

// Belt-and-braces GC: rooms are deleted on last close, this sweeps any leak.
setInterval(() => {
  for (const [id, room] of rooms) if (room.conns.size === 0) rooms.delete(id);
}, 60_000).unref();

export const server = http;

if (process.argv[1]?.endsWith("server.ts")) {
  if (SECRET.length < 16) {
    console.error("COLLAB_SECRET (or COMPILER_TOKEN) must be set (>= 16 chars)");
    process.exit(1);
  }
  http.listen(PORT, () => console.log(`collab relay listening on :${PORT}`));
}
