import { expect, test, type Page } from "@playwright/test";
import { mailPart, startFakeSmtp } from "../fake-smtp";

// Mail on: start the server with SMTP_URL=smtp://127.0.0.1:2525 and APP_URL
// set to its own origin (e.g. http://127.0.0.1:4211); this spec runs the SMTP
// end. Mail off (no SMTP_URL): only the admin instruction on /forgot is checked.
// Uses a throwaway account: the persistent e2e accounts must keep their password.

const OLD = "correct horse battery";
const NEW = "a fresh e2e password";

let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;

test.beforeAll(async () => {
  smtp = await startFakeSmtp(2525);
});

test.afterAll(async () => {
  await smtp?.close();
});

/** The login page links to /forgot only when the server has mail on. */
async function mailOn(page: Page): Promise<boolean> {
  await page.context().clearCookies();
  await page.goto("/login");
  return (await page.locator('a[href="/forgot"]').count()) > 0;
}

test("sin SMTP: /forgot explica que el admin ejecute pnpm reset-password", async ({ page }) => {
  test.skip(await mailOn(page), "this server has mail configured");
  await page.goto("/forgot");
  await expect(page.getByTestId("forgot-off")).toContainText("pnpm reset-password");
  await expect(page.locator("input#email")).toHaveCount(0);
});

test("con SMTP: olvidé → correo → enlace → contraseña nueva → entrar", async ({ page }) => {
  test.skip(!(await mailOn(page)), "mail is off on this server");
  const email = `reset-${Date.now()}-${Math.floor(Math.random() * 1e4)}@t.dev`;
  const reg = await page.request.post("/api/auth/register", {
    data: { email, name: "Reset E2E", password: OLD },
  });
  test.skip(reg.status() !== 201, `registration unavailable (${reg.status()})`);
  await page.context().clearCookies(); // signed out, as someone who forgot

  await page.goto("/login");
  await page.locator('a[href="/forgot"]').click();
  // Client-side nav: without this, the fill lands on the still-mounted login
  // form's email field and the forgot form submits empty.
  await page.waitForURL("**/forgot");
  await page.locator("input#email").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si existe una cuenta");

  await expect.poll(() => smtp.mails.filter((m) => m.rcpt.join().includes(email)).length).toBe(1);
  const mail = smtp.mails.find((m) => m.rcpt.join().includes(email))!;
  const link = /https?:\/\/\S+\/reset\?token=[A-Za-z0-9_-]+/.exec(
    mailPart(mail.data, "text/plain"),
  );
  expect(link, "reset link in the e-mail").toBeTruthy();

  await page.goto(link![0]);
  await page.locator("input#password").fill(NEW);
  await page.locator("input#confirm").fill(NEW);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Contraseña cambiada");

  // The link is single-use.
  const token = new URL(link![0]).searchParams.get("token");
  const reuse = await page.request.post("/api/auth/reset", { data: { token, password: NEW } });
  expect(reuse.status()).toBe(400);

  const old = await page.request.post("/api/auth/login", { data: { email, password: OLD } });
  expect(old.status()).toBe(401);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(NEW);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/projects/);
});
