import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

test("compilar produce PDF, conteo de palabras y avisos de lint navegables", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);

  await page.locator('header button[title="Ctrl + Enter"]').click();
  await expect(page.getByText(/Página 1 de 1/)).toBeVisible({ timeout: 60_000 });

  // Word count chip arrives right after the compile (texcount in the service).
  await expect(page.getByText(/\d+ palabras/)).toBeVisible({ timeout: 30_000 });

  // Lint runs chktex over the stored sources and reports through the same list.
  await page.getByRole("button", { name: /^Lint/ }).click();
  await expect(page.getByText(/chktex/i).first()).toBeVisible({ timeout: 30_000 });

  // Clicking text in the PDF jumps to the source (exact sync or heuristic):
  // the editor takes focus with the caret at the located line.
  const span = page.locator(".react-pdf__Page__textContent span").first();
  await span.click({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            document.activeElement?.closest(".cm-editor") !== null ||
            document.activeElement?.className.includes("cm"),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});
