import { expect, test } from "@playwright/test";

const PASSWORD = "correct horse battery";
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@t.dev`;

test.describe("idioma por navegador", () => {
  for (const [locale, login] of [
    ["de-DE", "Anmelden"],
    ["en-GB", "Sign in"],
    ["es-ES", "Iniciar sesión"],
    ["ja-JP", "Sign in"], // unsupported: falls back to English
  ] as const) {
    test(`la landing sale en el idioma del navegador (${locale})`, async ({ browser }) => {
      const ctx = await browser.newContext({ locale });
      const page = await ctx.newPage();
      await page.goto("/");
      await expect(page.getByRole("link", { name: login }).first()).toBeVisible();
      await ctx.close();
    });
  }

  test("la elección explícita (cookie) gana al navegador", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "de-DE" });
    await ctx.addCookies([{ name: "folio_lang", value: "en", url: "http://127.0.0.1:3000" }]);
    const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "folio_lang", value: "en", url: base }]);
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
    await ctx.close();
  });
});

test("registrarse con el proyecto demo marcado abre un artículo que compila", async ({ page }) => {
  const probe = await page.request.post("/api/auth/register", { data: {} });
  test.skip(probe.status() === 403, "registration is closed on this instance");

  await page.goto("/register");
  await page.fill("#name", "Ada");
  await page.fill("#email", unique("demo"));
  await page.fill("#password", PASSWORD);
  await expect(page.getByRole("checkbox")).toBeChecked(); // default: start with the demo
  await page
    .getByRole("button", { name: /Crear cuenta/ })
    .last()
    .click();

  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.locator(".cm-content")).toContainText("Bienvenido a Folio");

  await page.locator('header button[title="Ctrl + Enter"]').click();
  await expect(page.getByText(/Página 1 de 2/)).toBeVisible({ timeout: 90_000 });
});

test("registrarse sin demo muestra las tres vías de arranque", async ({ page }) => {
  const probe = await page.request.post("/api/auth/register", { data: {} });
  test.skip(probe.status() === 403, "registration is closed on this instance");

  await page.goto("/register");
  await page.fill("#name", "Grace");
  await page.fill("#email", unique("welcome"));
  await page.fill("#password", PASSWORD);
  await page.getByRole("checkbox").uncheck();
  await page
    .getByRole("button", { name: /Crear cuenta/ })
    .last()
    .click();

  await page.waitForURL(/\/projects\?welcome=1/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Te damos la bienvenida, Grace/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar proyecto demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Elegir plantilla" })).toBeVisible();

  // The demo card creates the project and opens it.
  await page.getByRole("button", { name: "Cargar proyecto demo" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.locator(".cm-content")).toContainText("Bienvenido a Folio");
});
