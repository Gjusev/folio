import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Personal access tokens ("agent keys"): the user's own tools — Claude Code,
 * Codex, scripts — authenticate to Folio's API as that user, with a subset of
 * permissions. A browser session keeps full access; a token only does what its
 * scopes allow. Only the SHA-256 hash is stored.
 */
export const TOKEN_SCOPES = ["read", "write", "compile", "literature"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
const ALL_SCOPES = new Set<TokenScope>(TOKEN_SCOPES);

export type ApiIdentity = {
  user: SessionUser;
  scopes: Set<TokenScope>;
  via: "session" | "token";
};

const TOKEN_PREFIX = "folio_";
const TOKEN_BODY_LEN = 32;

export function isTokenScope(value: unknown): value is TokenScope {
  return TOKEN_SCOPES.includes(value as TokenScope);
}

export function parseScopes(csv: string): Set<TokenScope> {
  const parts = csv.split(",").map((s) => s.trim());
  return new Set(parts.every(isTokenScope) ? (parts as TokenScope[]) : []);
}

/** folio_ + 32 base62 characters; enough entropy to be unguessable. */
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function generateToken(): { token: string; hash: string; prefix: string } {
  // byte % 62 over 256 values biases the first 8 alphabet chars by ~3% —
  // irrelevant for a 190-bit random secret (and one line, not a sampler).
  const bytes = randomBytes(TOKEN_BODY_LEN);
  let body = "";
  for (let i = 0; i < TOKEN_BODY_LEN; i++) body += B62[bytes[i]! % B62.length];
  const token = TOKEN_PREFIX + body;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length === TOKEN_PREFIX.length + TOKEN_BODY_LEN;
}

/**
 * Who is calling: a Bearer agent token (scopes from the row) or, without one,
 * the browser session (full scopes — the user themselves). null when neither
 * authenticates; callers turn that into 401.
 */
export async function authenticateApiRequest(req: NextRequest): Promise<ApiIdentity | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (!looksLikeToken(token)) return null;
    const [row] = await db()
      .select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) return null;
    const [user] = await db()
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, row.userId))
      .limit(1);
    if (!user) return null; // token outlived its account
    // Best effort: knowing a token is used must never fail the request.
    void db()
      .update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, row.id))
      .catch(() => {});
    return { user, scopes: parseScopes(row.scopes), via: "token" };
  }
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  return { user, scopes: new Set(ALL_SCOPES), via: "session" };
}

/** 403 (not 404): the caller should know the scope is the problem. */
export function requireScope(identity: ApiIdentity, scope: TokenScope): void {
  if (!identity.scopes.has(scope))
    throw new HttpError(403, `Este token no tiene el permiso «${scope}»`);
}

export async function createApiToken(userId: string, name: string, scopes: TokenScope[]) {
  const clean = [...new Set(scopes)].filter(isTokenScope).sort();
  if (clean.length === 0) throw new HttpError(400, "Elige al menos un permiso");
  const { token, hash, prefix } = generateToken();
  const [row] = await db()
    .insert(schema.apiTokens)
    .values({
      userId,
      name: name.trim().slice(0, 60),
      tokenHash: hash,
      prefix,
      scopes: clean.join(","),
    })
    .returning({ id: schema.apiTokens.id });
  return { id: row.id, token, prefix, name: name.trim().slice(0, 60), scopes: clean };
}

export async function listApiTokens(userId: string) {
  const rows = await db()
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      prefix: schema.apiTokens.prefix,
      scopes: schema.apiTokens.scopes,
      lastUsedAt: schema.apiTokens.lastUsedAt,
      createdAt: schema.apiTokens.createdAt,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId));
  return rows.map((r) => ({ ...r, scopes: r.scopes.split(",") }));
}

export async function deleteApiToken(userId: string, id: string): Promise<void> {
  const rows = await db()
    .delete(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId)))
    .returning({ id: schema.apiTokens.id });
  if (!rows.length) throw new HttpError(404, "Token no encontrado");
}
