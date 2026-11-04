import { expect, test } from "@playwright/test";
import { getFile, login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

test("citar un paper hallado por DOI añade la entrada al .bib y el \\cite al cursor", async ({
  page,
}) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();

  // Search by DOI: deterministic single result (ResNet — the template does not
  // ship it, so the add-to-bib path is the honest one).
  await page.fill("#paper-q", "10.1109/CVPR.2016.90");
  await page.press("#paper-q", "Enter");
  await expect(page.getByText("Deep Residual Learning for Image Recognition").first()).toBeVisible({
    timeout: 30_000,
  });

  // Cite the first result.
  const row = page
    .locator("[role=tabpanel] .sheet, [role=tabpanel] div")
    .filter({
      has: page.getByText("Deep Residual Learning for Image Recognition"),
    })
    .first();
  // First attempt says "Citar"; a retry after a partial failure says
  // "Insertar" (already in the .bib) — both land the \cite at the cursor.
  const citeBtn = row.getByRole("button", { name: /^(Citar|Insertar)$/ }).first();
  await citeBtn.click();

  // The .bib now holds the entry…
  await expect
    .poll(
      async () => {
        const detail = await ctx.api.get(`/api/projects/${ctx.projectId}`);
        const { files } = await detail.json();
        const bibId = files.find((f: { path: string }) => f.path.endsWith(".bib"))?.id;
        return bibId ? (await getFile(ctx, bibId)).content : "";
      },
      { timeout: 20_000 },
    )
    .toContain("Deep Residual Learning for Image Recognition");

  // …and the editor inserted \cite{…} at the cursor. The insertion is local
  // with a ~1 s debounced save: poll the server until it lands.
  await expect
    .poll(async () => (await getFile(ctx, ctx.mainId)).content, { timeout: 15_000 })
    .toMatch(/\\cite\{[^}]*he2016[^}]*\}/i);
});

test("la revisión de citas refleja definidas/citadas sin ghosts tras citar", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();
  await page.getByRole("tab", { name: "Revisar" }).click();
  await page.getByTestId("check-run").click();
  await expect(page.getByTestId("check-verdict")).toBeVisible({ timeout: 30_000 });
  const r = await ctx.api.get(`/api/projects/${ctx.projectId}/citations/health`);
  expect(r.status()).toBe(200);
  const h = await r.json();
  expect(h.undefined).toEqual([]);
  expect(h.defined).toBeGreaterThanOrEqual(1);
});
