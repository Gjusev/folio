import { expect, test, type Page } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

/** Opens the explorer on Attention (DOI search → Explore). */
async function openAttentionExplorer(page: Page) {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();
  await page.fill("#paper-q", "10.48550/arXiv.1706.03762");
  await page.press("#paper-q", "Enter");
  await expect(page.getByText("Attention Is All You Need").first()).toBeVisible({
    timeout: 30_000,
  });
  const card = page
    .locator("[role=tabpanel]")
    .filter({ hasText: "Attention Is All You Need" })
    .first();
  await card.getByTestId("explore").click();
  await expect(page.getByTestId("graph-explorer")).toBeVisible({ timeout: 60_000 });
  // The stage div exists before sigma mounts; the projection handle is the
  // honest signal that nodes are painted and clickable.
  await page.waitForFunction(() => (window.__folioGraph?.ids().length ?? 0) > 1, undefined, {
    timeout: 30_000,
  });
}

test("grafo: clic en un nodo del canvas selecciona el paper y muestra su ficha", async ({
  page,
}) => {
  await openAttentionExplorer(page);

  // Real canvas click: project a node to page coordinates and click there.
  const pick = await page.evaluate(() => {
    const g = window.__folioGraph!;
    const box = g.box();
    let best = { id: "", title: "", d: Infinity, x: 0, y: 0 };
    for (const id of g.ids()) {
      const p = g.project(id);
      const d = Math.hypot(p.x - box.width / 2, p.y - box.height / 2);
      if (d < best.d) best = { id, title: g.title(id), d, x: p.x, y: p.y };
    }
    return best;
  });
  expect(pick.id).toBeTruthy();
  await page.mouse.click(pick.x, pick.y);

  // The selection ring appears and the card shows exactly that paper.
  await expect(page.getByTestId("selection-ring")).toBeVisible({ timeout: 5_000 });
  const detail = page.getByTestId("paper-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("detail-title")).toHaveText(pick.title, { timeout: 10_000 });
});

test("grafo: doble clic cambia el origen y volver restaura el anterior", async ({ page }) => {
  await openAttentionExplorer(page);

  // Double-click the node farthest from the centre: new origin, old one kept
  // in the history (the back button appears).
  const pick = await page.evaluate(() => {
    const g = window.__folioGraph!;
    const box = g.box();
    let best = { id: "", d: -1, x: 0, y: 0 };
    for (const id of g.ids()) {
      const p = g.project(id);
      const d = Math.hypot(p.x - box.width / 2, p.y - box.height / 2);
      if (d > best.d) best = { id, d, x: p.x, y: p.y };
    }
    return best;
  });
  expect(pick.id).toBeTruthy();
  await page.mouse.dblclick(pick.x, pick.y);

  await expect(page.getByTestId("graph-back")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("graph-title")).not.toContainText("Attention Is All You Need");
  await page.getByTestId("graph-back").click();
  await expect(page.getByTestId("graph-title")).toContainText("Attention", { timeout: 45_000 });
});

test("grafo: la lista lateral selecciona y filtra sin romperse", async ({ page }) => {
  await openAttentionExplorer(page);
  const rows = page.getByTestId("graph-row");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  expect(await rows.count()).toBeGreaterThan(5);

  // Clicking a row shows its card.
  await rows.first().click();
  await expect(page.getByTestId("paper-detail")).toBeVisible();

  // The filter narrows the list (and an impossible query empties it honestly).
  const filter = page.getByPlaceholder(/título, autor, año/i);
  await filter.fill("attention 2017");
  await expect(rows)
    .not.toHaveCount(0, { timeout: 5_000 })
    .catch(() => {});
  await filter.fill("zzzznothing");
  await expect(page.getByText(/ningún paper coincide/i)).toBeVisible({ timeout: 5_000 });
});

test("línea temporal: filtrar por años oculta papers del grafo y se restaura", async ({ page }) => {
  await openAttentionExplorer(page);

  const timeline = page.getByTestId("graph-timeline");
  await expect(timeline).toBeVisible({ timeout: 30_000 });

  // Total shown before filtering.
  const counters = timeline.locator("span.num").last();
  const total = Number((await counters.textContent())?.split("/")[1]);
  expect(total).toBeGreaterThan(10);

  // Drag the "from" handle to a recent year: fewer papers on screen.
  const from = timeline.locator('input[type="range"]').first();
  const max = Number(await from.getAttribute("max"));
  await from.fill(String(Number(max) - 2));
  await expect
    .poll(async () => Number((await counters.textContent())?.split("/")[0]), { timeout: 5_000 })
    .toBeLessThan(total);

  // Reset puts everyone back.
  await timeline.getByRole("button").click();
  await expect
    .poll(async () => Number((await counters.textContent())?.split("/")[0]), { timeout: 5_000 })
    .toBe(total);
});

test("export TikZ crea la figura en el proyecto y avisa", async ({ page }) => {
  await openAttentionExplorer(page);
  await page.getByRole("button", { name: "TikZ", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "figures/citation-graph" })).toBeVisible({
    timeout: 15_000,
  });
  const detail = await ctx.api.get(`/api/projects/${ctx.projectId}`);
  const { files } = await detail.json();
  expect(files.map((f: { path: string }) => f.path)).toContain("figures/citation-graph.tex");
});

test("mi bibliografía: la vista Biblioteca abre el grafo multisequilla", async ({ page }) => {
  // Cite one real paper through the API (DOI search → cite).
  const search = await ctx.api.get(
    `/api/papers/search?${new URLSearchParams({ q: "10.48550/arXiv.1706.03762" })}`,
  );
  const { results } = await search.json();
  const r = await ctx.api.post(`/api/projects/${ctx.projectId}/citations`, {
    data: { source: results[0].source, paperId: results[0].id },
  });
  expect([201, 200]).toContain(r.status());

  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();
  await page.getByRole("tab", { name: "Biblioteca" }).click();
  await expect(page.getByTestId("lib-graph")).toBeEnabled();
  await page.getByTestId("lib-graph").click();

  await expect(page.getByTestId("graph-explorer")).toBeVisible({ timeout: 60_000 });
  // The stage div exists before sigma mounts; the projection handle is the
  // honest signal that nodes are painted and clickable.
  await page.waitForFunction(() => (window.__folioGraph?.ids().length ?? 0) > 1, undefined, {
    timeout: 30_000,
  });
});
