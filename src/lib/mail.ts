import "server-only";
import { createTransport, type SMTPTransportOptions } from "nodemailer";
import { env, type Env } from "@/lib/env";

type MailEnv = Pick<
  Env,
  "SMTP_URL" | "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM" | "APP_URL"
>;

/** MailEnv plus NODE_ENV: what the on/off decision depends on. */
type BootEnv = MailEnv & Pick<Env, "NODE_ENV">;

/** Transport options from the env, or null when SMTP is not configured.
 *  SMTP_URL wins; otherwise the discrete form, passed as an object so a
 *  password with '@' or '#' never has to survive URL-encoding. Never log this:
 *  it holds the password. */
export function transportOptions(e: MailEnv): SMTPTransportOptions | null {
  const timeouts = { connectionTimeout: 10_000, socketTimeout: 10_000 };
  if (e.SMTP_URL) return { url: e.SMTP_URL, ...timeouts };
  if (!e.SMTP_HOST) return null;
  return {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465, // implicit TLS; other ports upgrade with STARTTLS
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    ...timeouts,
  };
}

/** SMTP_FROM, else the authenticated mailbox (many providers reject any other
 *  From), else no-reply at APP_URL's host. */
export function fromAddress(e: MailEnv): string {
  if (e.SMTP_FROM) return e.SMTP_FROM;
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e.SMTP_USER)) return `Folio <${e.SMTP_USER}>`;
  return `Folio <no-reply@${new URL(e.APP_URL || "http://localhost:3000").hostname}>`;
}

/** Pure on/off decision: SMTP configured, and in production APP_URL present.
 *  This is the Host-header-poisoning defense: links come only from APP_URL, so
 *  production without it must not mail at all. Unit-tested for all four
 *  (nodeEnv, APP_URL) combinations. */
export function mailUsable(e: BootEnv): boolean {
  return transportOptions(e) !== null && !(e.NODE_ENV === "production" && e.APP_URL === "");
}

let warned = false;

/** mailUsable() on the real env, with the one-time boot warning when the only
 *  blocker is production's empty APP_URL. */
export function mailEnabled(): boolean {
  const e = env();
  const usable = mailUsable(e);
  if (!usable && transportOptions(e) && e.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[mail] SMTP set but APP_URL empty: mail disabled (set APP_URL to enable)");
  }
  return usable;
}

/** Public origin for links in e-mails, without a trailing slash. */
export function appUrl(): string {
  return (env().APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

let transport: ReturnType<typeof createTransport> | undefined;

/** Best effort: false on any failure. Logs err.message only: never the
 *  message (it holds tokens) nor the transport options (they hold the password). */
export async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  // nodemailer's addressparser turns "a@b\r\nBcc: evil@x" into a second
  // envelope recipient (verified: RCPT TO:<evil@x>), so a CRLF in the
  // recipient is refused; in the subject (user-controlled names reach it) it
  // is stripped to spaces. One chokepoint for every caller; routes also
  // validate with zod.
  if (/[\r\n]/.test(msg.to)) return false;
  const subject = msg.subject.replace(/[\r\n]+/g, " ");
  try {
    const e = env();
    const opts = transportOptions(e);
    if (!opts) return false;
    transport ??= createTransport(opts);
    await transport.sendMail({
      from: fromAddress(e),
      to: msg.to,
      subject,
      text: msg.text,
      html: msg.html,
    });
    return true;
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return false;
  }
}
