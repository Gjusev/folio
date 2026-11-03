import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { HttpError, clientIp, enforceRateLimit, parseJson, route } from "@/lib/http";
import { registerBody } from "@/lib/validation";

export const POST = route(async (req) => {
  enforceRateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const { email, name, password } = await parseJson(req, registerBody);
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
