// Collab client: one WebSocket per file room against the relay in
// services/collab/server.ts. Updates travel base64-encoded in JSON frames;
// reconnection backs off 1s/2s/5s (3 tries) and then goes silent — the editor
// keeps working locally either way. Tokens come from
// POST /api/projects/[id]/collab-token (requestCollab below).

export type CollabConn = {
  /** Broadcasts a Yjs update to the room (dropped while disconnected). */
  send(update: Uint8Array): void;
  /** Broadcasts an awareness update (cursor/presence). */
  sendAwareness(update: Uint8Array): void;
  close(): void;
};

export type CollabCallbacks = {
  /**
   * Once per (re)connection, right after joining: the room's accumulated
   * state (comma-joined base64 Yjs updates, "" when the room is empty) and
   * whether this client is alone and may seed the document. `reconnect` is
   * true from the second successful connection on.
   */
  onState(data: string, first: boolean, reconnect: boolean): void;
  onUpdate(update: Uint8Array): void;
  onAwareness(update: Uint8Array): void;
  /** The relay dropped a peer (killed tab, network cut): forget its cursor. */
  onBye(client: number): void;
};

/** Reconnect delay after the nth failed connection; null stops trying. */
export function backoffMs(attempt: number): number | null {
  return [1_000, 2_000, 5_000][attempt] ?? null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // fromCharCode overflows on huge arrays
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function connectCollab(
  {
    url,
    token,
    fileId,
    clientId,
  }: { url: string; token: string; fileId: string; clientId: number },
  cb: CollabCallbacks,
): CollabConn {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let closedByUs = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    const base = url.replace(/\/+$/, "");
    socket = new WebSocket(
      `${base}/?token=${encodeURIComponent(token)}&file=${encodeURIComponent(fileId)}&client=${clientId}`,
    );
    socket.onmessage = (ev) => {
      let msg: { type?: unknown; data?: unknown; first?: unknown; client?: unknown };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.type === "state") {
        const reconnect = attempt > 0;
        attempt = 0;
        cb.onState(typeof msg.data === "string" ? msg.data : "", msg.first === true, reconnect);
      } else if (msg.type === "update" && typeof msg.data === "string") {
        cb.onUpdate(base64ToBytes(msg.data));
      } else if (msg.type === "awareness" && typeof msg.data === "string") {
        cb.onAwareness(base64ToBytes(msg.data));
      } else if (msg.type === "bye" && typeof msg.client === "number") {
        cb.onBye(msg.client);
      }
    };
    socket.onclose = () => {
      if (closedByUs) return;
      const delay = backoffMs(attempt++);
      if (delay !== null) retryTimer = setTimeout(connect, delay);
      // After 3 tries: silence. Local editing continues; reload to rejoin.
    };
  };
  connect();

  const sendRaw = (type: "update" | "awareness", update: Uint8Array) => {
    const data = bytesToBase64(update);
    // Stay under the relay's 1MB frame cap; an oversized frame would kill the
    // socket. Docs nearing the app's 1MB file limit simply stop syncing.
    if (socket?.readyState === WebSocket.OPEN && data.length <= 900_000)
      socket.send(JSON.stringify({ type, data }));
  };

  return {
    send: (update) => sendRaw("update", update),
    sendAwareness: (update) => sendRaw("awareness", update),
    close() {
      closedByUs = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}

/**
 * Asks the web app for relay credentials. null = collaboration disabled
 * (COLLAB_URL unset, not shared, or offline): callers must behave exactly as
 * they do today. The token is file-scoped: the server validates that the file
 * belongs to the project and signs it, and the relay only admits the signed
 * room.
 */
export async function requestCollab(
  projectId: string,
  fileId: string,
): Promise<{ url: string; token: string } | null> {
  if (!projectId || !fileId) return null;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/collab-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string; token?: string };
    return data.url && data.token ? { url: data.url, token: data.token } : null;
  } catch {
    return null;
  }
}
