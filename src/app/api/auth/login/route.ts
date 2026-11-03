import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { HttpError, clientIp, enforceRateLimit, parseJson, route } from "@/lib/http";
import { loginBody } from "@/lib/validation";

// Verifying against a dummy hash keeps timing similar for unknown e-mails.
let dummyHash: Promise<string> | undefined;

export const POST = route(async (req) => {
  const { email, password } = await parseJson(req, loginBody);
  enforceRateLimit(`login:${clientIp(req)}:${email}`, 10, 15 * 60 * 1000);
  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  dummyHash ??= hashPassword("not-a-real-password");
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) throw new HttpError(401, "Correo o contraseña incorrectos");
  const session = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
