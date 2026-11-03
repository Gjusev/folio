import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

test("grafo de un paper: canvas, selección desde la lista y tarjeta del nodo", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();

  await page.fill("#paper-q", "10.48550/arXiv.1706.03762");
  await page.press("#paper-q", "Enter");
  await expect(page.getByText("Attention Is All You Need").first()).toBeVisible({
    timeout: 30_000,
  });

  const row = page
    .locator("[role=tabpanel]")
    .filter({ hasText: "Attention Is All You Need" })
    .first();
  await row.getByRole("button", { name: "Grafo" }).first().click();

  // The graph view replaces the results: canvas mounts with the year legend.
  await expect(page.getByRole("img", { name: "Grafo de citas" })).toBeVisible({ timeout: 45_000 });
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();

  // Prior works list exists and clicking a row selects the node (card shows).
  await page
    .locator("summary")
    .filter({ hasText: /previos/i })
    .first()
    .click();
  const firstPrior = page.getByTestId("prior-works").locator("button").first();
  await expect(firstPrior).toBeVisible({ timeout: 15_000 });
  await firstPrior.click();
  await expect(page.getByRole("button", { name: "Ver su grafo" }).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("export TikZ crea la figura en el proyecto y avisa", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();

  await page.fill("#paper-q", "10.48550/arXiv.1706.03762");
  await page.press("#paper-q", "Enter");
  await expect(page.getByText("Attention Is All You Need").first()).toBeVisible({
    timeout: 30_000,
  });
  const row = page
    .locator("[role=tabpanel]")
    .filter({ hasText: "Attention Is All You Need" })
    .first();
  await row.getByRole("button", { name: "Grafo" }).first().click();
  await expect(page.getByRole("img", { name: "Grafo de citas" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "TikZ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "figures/citation-graph" })).toBeVisible({
    timeout: 15_000,
  });
  const detail = await ctx.api.get(`/api/projects/${ctx.projectId}`);
  const { files } = await detail.json();
  expect(files.map((f: { path: string }) => f.path)).toContain("figures/citation-graph.tex");
});

test("mi bibliografía abre el grafo multisequilla del .bib", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();

  // The project has one cited paper with a DOI (seeded by the citations spec
  // flow — this spec reuses the ctx, and cites one paper to be self-sufficient).
  const search = await ctx.api.get(
    `/api/papers/search?${new URLSearchParams({ q: "10.48550/arXiv.1706.03762" })}`,
  );
  expect(search.status()).toBe(200);
  const { results } = await search.json();
  expect(results.length).toBeGreaterThan(0);
  const r = await ctx.api.post(`/api/projects/${ctx.projectId}/citations`, {
    data: { source: results[0].source, paperId: results[0].id },
  });
  expect([201, 200]).toContain(r.status());

  await page.getByRole("button", { name: "Mi bibliografía" }).click();
  await expect(page.getByRole("img", { name: "Grafo de citas" })).toBeVisible({ timeout: 45_000 });
  await expect(
    page
      .getByTitle(/tu bibliograf/i)
      .or(page.getByText(/tu bibliograf/i))
      .first(),
  ).toBeVisible();
});
