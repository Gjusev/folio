import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

test("el menú Exportar ofrece un paquete de arXiv con checks y ZIP descargable", async ({
  page,
}) => {
  await page.goto(`/projects/${ctx.projectId}`);

  // Export menu -> arXiv package entry opens the dialog.
  await page.locator("header").getByText("Exportar", { exact: true }).click();
  await page.getByRole("button", { name: "Paquete arXiv…" }).click();
  const dialog = page.getByTestId("arxiv-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("arxiv-row-names")).toBeVisible();
  await expect(dialog.getByTestId("arxiv-row-bbl")).toBeVisible();

  // Download builds the package server-side; the browser download event
  // carries the exact bytes the user gets (response-body decoding varies).
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    dialog.getByTestId("arxiv-download").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-arxiv\.zip$/);
  const file = await download.path();
  const entries = unzipSync(new Uint8Array(fs.readFileSync(file!)));
  expect(Object.keys(entries)).toContain("main.tex");
  expect(Object.keys(entries).some((n) => n.endsWith(".bbl"))).toBe(true);
});
