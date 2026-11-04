import { expect, test } from "@playwright/test";

// Only meaningful on an instance with ALLOW_REGISTRATION=0; the probe decides.
test("con el registro cerrado, /register explica y /login no enlaza al alta", async ({ page }) => {
  const probe = await page.request.post("/api/auth/register", { data: {} });
  test.skip(probe.status() !== 403, "registration is open");

  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "El registro está cerrado en esta instancia" }),
  ).toBeVisible();
  await expect(page.locator("input#email")).toHaveCount(0);

  await page.goto("/login");
  await expect(page.locator('a[href="/register"]')).toHaveCount(0);
});
