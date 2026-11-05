import { expect, test } from "@playwright/test";
import { login, seed } from "./helpers";

// Mobile gate for the 2026-11-05 UI/UX audit wave: the three layout
// criticals stay fixed at 390/375 in Spanish (the longest-label locale that
// broke the projects header) and touch targets reach 44px on coarse pointers.

async function phonePage(browser: import("@playwright/test").Browser, width: number) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
  });
  const page = await context.newPage();
  return { page, context };
}

for (const width of [390, 375]) {
  test(`móvil ${width}px: projects no desborda y el cierre de sesión es visible (es)`, async ({
    browser,
  }) => {
    const ctx = await seed();
    const { page, context } = await phonePage(browser, width);
    await login(page, ctx);
    await page.goto("/projects");
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });

  test(`móvil ${width}px: la franja de pestañas llega a Review`, async ({ browser }) => {
    const ctx = await seed();
    const { page, context } = await phonePage(browser, width);
    await login(page, ctx);
    await page.goto(`/projects/${ctx.projectId}`);
    const strip = page.locator('[role="tablist"]').first();
    await expect(strip.getByRole("tab").nth(5)).toBeAttached();
    // The strip scrolls horizontally instead of clipping the sixth tab away.
    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    const box = await strip.getByRole("tab").nth(5).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
}

test("móvil 390px: los controles tocan a 44px en punteros gruesos", async ({ browser }) => {
  const ctx = await seed();
  const { page, context } = await phonePage(browser, 390);
  await login(page, ctx);
  await page.goto("/settings");
  const coarse = await page.evaluate(
    () => matchMedia("(hover: none) and (pointer: coarse)").matches,
  );
  // Skip silently on engines whose touch emulation keeps a fine pointer.
  test.skip(!coarse, "touch emulation does not report a coarse pointer");
  const h = await page
    .locator(".input")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
  await context.close();
});
