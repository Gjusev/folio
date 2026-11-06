import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/session";
import { clientIp, enforceRateLimit, fail, parseJson, route } from "@/lib/http";
import { resetBody } from "@/lib/validation";

/** Sets a new password from an e-mailed token and signs out every session. No auto-login. */
export const POST = route(async (req) => {
  const { token, password } = await parseJson(req, resetBody);
  enforceRateLimit(`reset:ip:${clientIp(req)}`, 10, 15 * 60 * 1000);
  const passwordHash = await hashPassword(password);
  const r = schema.passwordResets;
  const done = await db().transaction(async (tx) => {
    // The single-use guarantee: one conditional UPDATE. A concurrent second
    // submit waits on the row lock, then sees used_at set and matches nothing.
    const [row] = await tx
      .update(r)
      .set({ usedAt: sql`now()` })
      .where(and(eq(r.id, hashToken(token)), isNull(r.usedAt), gt(r.expiresAt, sql`now()`)))
      .returning({ userId: r.userId });
    if (!row) return false;
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
    return true;
  });
  // Same answer for unknown, used and expired tokens.
  if (!done) throw fail(400, "api.auth.resetInvalid");
  return NextResponse.json({ ok: true });
});
