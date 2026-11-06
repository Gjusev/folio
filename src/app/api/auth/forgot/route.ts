import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashToken } from "@/lib/auth/session";
import { clientIp, enforceRateLimit, fail, parseJson, route } from "@/lib/http";
import { requestLang } from "@/lib/i18n/request";
import { appUrl, mailEnabled, sendMail } from "@/lib/mail";
import { resetEmail } from "@/lib/mail-templates";
import { forgotBody } from "@/lib/validation";

const RESET_TTL_MIN = 30;
const HOUR = 60 * 60 * 1000;

/** Sends a reset link. Always answers 200, whether the account exists or not. */
export const POST = route(async (req) => {
  if (!mailEnabled()) throw fail(404, "api.auth.resetOff");
  const { email } = await parseJson(req, forgotBody);
  enforceRateLimit(`forgot:ip:${clientIp(req)}`, 5, HOUR);
  enforceRateLimit(`forgot:email:${email}`, 3, HOUR);
  const lang = requestLang(req); // captured before the response; background work never touches req
  // Enumeration defense: the awaited path is identical whether the account
  // exists or not — lookup, token write and send all run after the response.
  // Errors are logged without ever the token or the link.
  void (async () => {
    try {
      const [user] = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      if (!user) return;
      const token = randomBytes(32).toString("base64url");
      await db().transaction(async (tx) => {
        // Only the newest link works: a new request invalidates the older ones.
        await tx
          .delete(schema.passwordResets)
          .where(
            and(eq(schema.passwordResets.userId, user.id), isNull(schema.passwordResets.usedAt)),
          );
        await tx.insert(schema.passwordResets).values({
          id: hashToken(token),
          userId: user.id,
          expiresAt: sql`now() + make_interval(mins => ${RESET_TTL_MIN})`,
        });
      });
      const mail = resetEmail(lang, `${appUrl()}/reset?token=${token}`, RESET_TTL_MIN);
      await sendMail({ to: email, ...mail });
    } catch (err) {
      // Logged without the token or the link.
      console.error("[mail] forgot failed:", (err as Error).message);
    }
  })();
  return NextResponse.json({ ok: true });
});
