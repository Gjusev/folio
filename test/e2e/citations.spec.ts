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

  // Search by DOI: deterministic single result (Attention Is All You Need).
  await page.fill("#paper-q", "10.48550/arXiv.1706.03762");
  await page.press("#paper-q", "Enter");
  await expect(page.getByText("Attention Is All You Need").first()).toBeVisible({
    timeout: 30_000,
  });

  // Cite the first result.
  const row = page
    .locator("[role=tabpanel] .sheet, [role=tabpanel] div")
    .filter({
      has: page.getByText("Attention Is All You Need"),
    })
    .first();
  await row.getByRole("button", { name: "Citar" }).first().click();

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
    .toContain("Attention Is All You Need");

  // …and the editor inserted \cite{…} where the cursor was.
  const main = await getFile(ctx, ctx.mainId);
  expect(main.content, main.content).toMatch(/\\cite\{[^}]*vaswani[^}]*\}/i);
});

test("la salud de citas refleja definidas/citadas sin ghosts tras citar", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();
  await page.getByRole("button", { name: "Salud de citas" }).click();
  await expect(
    page
      .getByText(/definidas/i)
      .or(page.getByText(/1/))
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  const r = await ctx.api.get(`/api/projects/${ctx.projectId}/citations/health`);
  expect(r.status()).toBe(200);
  const h = await r.json();
  expect(h.undefined).toEqual([]);
  expect(h.defined).toBeGreaterThanOrEqual(1);
});
