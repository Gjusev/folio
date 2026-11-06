import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as forgot } from "@/app/api/auth/forgot/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as reset } from "@/app/api/auth/reset/route";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { POST as addMember } from "@/app/api/projects/[id]/members/route";
import { DELETE as removeMemberRoute } from "@/app/api/projects/[id]/members/[userId]/route";
import { closeDb, db, schema } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { inviteEmail } from "@/lib/mail-templates";
import { startFakeSmtp, mailPart, type CapturedMail } from "../../../test/fake-smtp";
import { ctx, request, signUp } from "../../../test/helpers";

// Password reset + invitation e-mails against a fake SMTP server. env() is
// cached per module graph, so mail "on" lives in this file and "off" in
// mail-off.test.ts.
const SMTP_PORT = 39_162;
const APP = "https://folio.example.org";
vi.hoisted(() => {
  process.env.SMTP_URL = "smtp://127.0.0.1:39162";
  process.env.APP_URL = "https://folio.example.org";
});

let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
let mails: CapturedMail[];

beforeAll(async () => {
  smtp = await startFakeSmtp(SMTP_PORT);
  mails = smtp.mails;
});

afterAll(async () => {
  await smtp.close();
  await closeDb();
  delete process.env.SMTP_URL;
  delete process.env.APP_URL;
});

beforeEach(() => {
  resetRateLimits();
  smtp.reset();
});

async function waitForMails(n: number) {
  await smtp.waitFor(n);
  expect(mails.length).toBe(n);
  return mails;
}

const settle = () => new Promise((r) => setTimeout(r, 300));
const part = mailPart;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const postForgot = (email: string, headers: Record<string, string> = {}) =>
  forgot(request("POST", "/api/auth/forgot", { body: { email }, headers }), undefined);

const postReset = (token: string, password: string) =>
  reset(request("POST", "/api/auth/reset", { body: { token, password } }), undefined);

const postLogin = (email: string, password: string) =>
  login(request("POST", "/api/auth/login", { body: { email, password } }), undefined);

async function userId(email: string): Promise<string> {
  const [u] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return u.id;
}

/** forgot → the token from the captured mail's link. */
async function tokenFor(email: string): Promise<string> {
  const before = mails.length;
  expect((await postForgot(email)).status).toBe(200);
  await waitForMails(before + 1);
  const text = part(mails[before].data, "text/plain");
  const m = /\/reset\?token=([A-Za-z0-9_-]+)/.exec(text);
  expect(m, "reset link in the mail").toBeTruthy();
  return m![1];
}

describe("POST /api/auth/forgot", () => {
  it("unknown e-mail: 200 and no mail", async () => {
    const res = await postForgot(`nobody-${Date.now()}@example.org`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await settle();
    expect(mails).toHaveLength(0);
    expect(smtp.connections()).toBe(0);
  });

  it("known e-mail: one mail whose link uses APP_URL, never Host/X-Forwarded-Host", async () => {
    const { email } = await signUp();
    const res = await postForgot(email, {
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      cookie: "folio_lang=en",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [mail] = await waitForMails(1);
    expect(mail.rcpt.join()).toContain(email);
    const text = part(mail.data, "text/plain");
    const html = part(mail.data, "text/html");
    expect(text).toMatch(new RegExp(`${APP}/reset\\?token=[A-Za-z0-9_-]{43}`));
    expect(html).toContain(`href="${APP}/reset?token=`);
    expect(mail.data).not.toContain("evil.example");
    expect(text).toContain("expires in 30 minutes"); // folio_lang=en picked the language
  });

  it("stores only the token's hash", async () => {
    const { email } = await signUp();
    const token = await tokenFor(email);
    const rows = await db()
      .select()
      .from(schema.passwordResets)
      .where(eq(schema.passwordResets.userId, await userId(email)));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sha256(token));
    expect(rows[0].id).not.toContain(token);
    expect(rows[0].usedAt).toBeNull();
    const ttl = rows[0].expiresAt.getTime() - Date.now();
    // Expiry lives on the DB clock now(); the JS compare tolerates host/DB skew.
    expect(ttl).toBeGreaterThan(29 * 60_000);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000 + 5_000);
  });

  it("rate-limits per e-mail (3/h) and per IP (5/h)", async () => {
    const { email } = await signUp();
    for (let i = 0; i < 3; i++) expect((await postForgot(email)).status).toBe(200);
    expect((await postForgot(email)).status).toBe(429);

    resetRateLimits();
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 5; i++) {
      expect((await postForgot(`n${i}-${Date.now()}@example.org`, ip)).status).toBe(200);
    }
    expect((await postForgot(`n5-${Date.now()}@example.org`, ip)).status).toBe(429);
  });
});

describe("POST /api/auth/reset", () => {
  it("good token: 200, new password works, old password fails, every session revoked", async () => {
    const { email, cookie } = await signUp();
    const id = await userId(email);
    expect((await postLogin(email, "correct horse battery")).status).toBe(200); // a 2nd session
    const token = await tokenFor(email);

    const res = await postReset(token, "a brand new password");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toBeNull(); // no auto-login

    const sessions = await db()
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id));
    expect(sessions).toHaveLength(0);
    const stale = await listProjects(request("GET", "/api/projects", { cookie }), undefined);
    expect(stale.status).toBe(401);

    expect((await postLogin(email, "correct horse battery")).status).toBe(401);
    expect((await postLogin(email, "a brand new password")).status).toBe(200);
  });

  it("a used token is rejected the second time", async () => {
    const { email } = await signUp();
    const token = await tokenFor(email);
    expect((await postReset(token, "first new password")).status).toBe(200);
    const again = await postReset(token, "second new password");
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe("El enlace no es válido o ha caducado");
    expect((await postLogin(email, "first new password")).status).toBe(200);
  });

  it("an expired token is rejected", async () => {
    const { email } = await signUp();
    const token = await tokenFor(email);
    await db()
      .update(schema.passwordResets)
      .set({ expiresAt: new Date(Date.now() - 60_000) }) // a minute past: no clock-skew flake
      .where(eq(schema.passwordResets.id, sha256(token)));
    expect((await postReset(token, "too late password")).status).toBe(400);
  });

  it("a garbage token is rejected", async () => {
    expect((await postReset("not-a-real-token", "whatever password")).status).toBe(400);
  });

  it("a too-short password fails validation like sign-up", async () => {
    const { email } = await signUp();
    const token = await tokenFor(email);
    expect((await postReset(token, "short")).status).toBe(400);
    // The token survives a validation error.
    expect((await postReset(token, "long enough password")).status).toBe(200);
  });

  it("two concurrent submits: exactly one wins", async () => {
    const { email } = await signUp();
    const token = await tokenFor(email);
    const statuses = (
      await Promise.all([
        postReset(token, "racer number one"),
        postReset(token, "racer number two"),
      ])
    )
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 400]);
  });

  it("a new forgot invalidates the older link", async () => {
    const { email } = await signUp();
    const older = await tokenFor(email);
    const newer = await tokenFor(email);
    expect((await postReset(older, "older link password")).status).toBe(400);
    expect((await postReset(newer, "newer link password")).status).toBe(200);
  });

  it("rate-limits per IP (10 per 15 min)", async () => {
    for (let i = 0; i < 10; i++)
      expect((await postReset(`junk-${i}`, "whatever password")).status).toBe(400);
    expect((await postReset("junk-10", "whatever password")).status).toBe(429);
  });
});

describe("invitation e-mail", () => {
  it("a new member gets one mail with the escaped project name; a role change sends none", async () => {
    const owner = await signUp();
    const guest = await signUp();
    const name = "<script>alert(1)</script> & Co";
    const created = await createProject(
      request("POST", "/api/projects", { cookie: owner.cookie, body: { name } }),
      undefined,
    );
    const { project } = await created.json();
    const share = (role: "editor" | "viewer") =>
      addMember(
        request("POST", `/api/projects/${project.id}/members`, {
          cookie: owner.cookie,
          body: { email: guest.email, role },
        }),
        ctx({ id: project.id }),
      );

    const res = await share("editor");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailed).toBe(true);
    expect(body.member).toEqual({
      userId: await userId(guest.email),
      email: guest.email,
      role: "editor",
    });

    const [mail] = await waitForMails(1);
    expect(mail.rcpt.join()).toContain(guest.email);
    const html = part(mail.data, "text/html");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
    expect(html).not.toContain("<script>");
    expect(part(mail.data, "text/plain")).toContain(`${APP}/projects/${project.id}`);

    const again = await share("viewer");
    expect(again.status).toBe(201);
    expect((await again.json()).emailed).toBe(false);
    await settle();
    expect(mails).toHaveLength(1);
  });

  it("concurrent double invite: one insert, exactly one mail, one emailed:true", async () => {
    const owner = await signUp();
    const guest = await signUp();
    const created = await createProject(
      request("POST", "/api/projects", { cookie: owner.cookie, body: { name: "Race" } }),
      undefined,
    );
    const { project } = await created.json();
    const share = () =>
      addMember(
        request("POST", `/api/projects/${project.id}/members`, {
          cookie: owner.cookie,
          body: { email: guest.email, role: "editor" },
        }),
        ctx({ id: project.id }),
      );
    const results = await Promise.all([share(), share()]);
    for (const r of results) expect(r.status).toBe(201);
    const emailed = (await Promise.all([results[0].json(), results[1].json()]))
      .map((b) => b.emailed)
      .sort();
    expect(emailed).toEqual([false, true]); // exactly one fresh insert wins
    await waitForMails(1);
  });

  it("re-invite after removal mails again", async () => {
    const owner = await signUp();
    const guest = await signUp();
    const created = await createProject(
      request("POST", "/api/projects", { cookie: owner.cookie, body: { name: "Again" } }),
      undefined,
    );
    const { project } = await created.json();
    const share = () =>
      addMember(
        request("POST", `/api/projects/${project.id}/members`, {
          cookie: owner.cookie,
          body: { email: guest.email, role: "viewer" },
        }),
        ctx({ id: project.id }),
      );
    expect((await (await share()).json()).emailed).toBe(true);
    await waitForMails(1);
    const guestId = await userId(guest.email);
    const del = await removeMemberRoute(
      request("DELETE", `/api/projects/${project.id}/members/${guestId}`, {
        cookie: owner.cookie,
      }),
      ctx({ id: project.id, userId: guestId }),
    );
    expect(del.status).toBe(204);
    await settle();
    expect((await (await share()).json()).emailed).toBe(true);
    await waitForMails(2);
  });
});

describe("header injection and oversized fields", () => {
  it("rejects a CRLF-carrying address before any SMTP work", async () => {
    const res = await postForgot("victim@example.org\r\nBcc: evil@x");
    expect(res.status).toBe(400);
    await settle();
    expect(smtp.connections()).toBe(0);
  });

  it("a CRLF inside a project name is stripped from the invite subject and cannot inject headers", async () => {
    const owner = await signUp();
    const guest = await signUp();
    const created = await createProject(
      request("POST", "/api/projects", {
        cookie: owner.cookie,
        body: { name: "A\r\nBcc: evil@x" },
      }),
      undefined,
    );
    const { project } = await created.json();
    const res = await addMember(
      request("POST", `/api/projects/${project.id}/members`, {
        cookie: owner.cookie,
        body: { email: guest.email, role: "viewer" },
      }),
      ctx({ id: project.id }),
    );
    expect(res.status).toBe(201);
    const [mail] = await waitForMails(1);
    const headers = mail.data.slice(0, mail.data.indexOf("\r\n\r\n"));
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).not.toContain("evil@x");
    expect(mail.rcpt.join()).toContain(guest.email);
  });

  it("sendMail refuses a CRLF-carrying To outright (nodemailer would deliver to the smuggled address)", async () => {
    const ok = await sendMail({
      to: "victim@example.org\r\nBcc: evil@x",
      subject: "probe",
      text: "x",
      html: "x",
    });
    expect(ok).toBe(false); // nodemailer alone would have sent RCPT TO:<evil@x>
    await settle();
    expect(smtp.connections()).toBe(0);
  });

  it("a 10 000-character project name in the subject still yields one well-formed message", async () => {
    const mail = inviteEmail("es", {
      inviterName: "A",
      projectName: "X".repeat(10_000),
      role: "viewer",
      link: `${APP}/projects/abc`,
    });
    expect(await sendMail({ to: "long@x.example", ...mail })).toBe(true);
    const [msg] = await smtp.waitFor(1);
    expect(msg, "message captured").toBeTruthy();
    const lines = msg.data.split("\r\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(998); // SMTP line limit
    expect(part(msg.data, "text/plain")).toContain(`${APP}/projects/abc`);
  });
});
