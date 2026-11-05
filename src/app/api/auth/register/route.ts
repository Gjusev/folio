import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { HttpError, clientIp, enforceRateLimit, parseJson, route } from "@/lib/http";
import { registerBody } from "@/lib/validation";

export const POST = route(async (req) => {
  if (!env().ALLOW_REGISTRATION)
    throw new HttpError(403, "El registro está desactivado en esta instancia");
  // Validate BEFORE counting against the rate limit: malformed probes (the
  // e2e suite's registration-closed check, scanners) must not consume an
  // hour of a would-be user's budget. Well-formed registrations stay limited.
  const { email, name, password } = await parseJson(req, registerBody);
  enforceRateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const [user] = await db()
    .insert(schema.users)
    .values({ email, name, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  if (!user) throw new HttpError(409, "Ya existe una cuenta con ese correo");
  const session = await createSession(user.id);
  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
