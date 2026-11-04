import "server-only";
import { createHmac } from "node:crypto";

export const COLLAB_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Signs a relay token: `<b64url(json claims)>.<b64url(hmac-sha256(claims))>`.
 * Claims are {pid, uid, file, exp}: the relay only admits the holder to the
 * room whose id equals the signed `file`, so a token issued for one project
 * cannot be replayed against a file of another project. The verifier lives in
 * services/collab/server.ts (a separate deployable, so the format is
 * deliberately duplicated there) and services/collab/server.test.ts pins both
 * sides to the same format.
 */
export function signCollabToken(
  pid: string,
  uid: string,
  file: string,
  secret: string,
  ttlMs = COLLAB_TOKEN_TTL_MS,
  now = Date.now(),
): string {
  const claims = JSON.stringify({ pid, uid, file, exp: now + ttlMs });
  const payload = Buffer.from(claims).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
