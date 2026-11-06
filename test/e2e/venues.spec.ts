import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

test("el venue ACL añade el aviso de Limitations y «Sin venue» lo retira", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Artículos" }).click();
  await page.getByRole("tab", { name: "Revisar" }).click();
  await page.getByTestId("check-run").click();
  await expect(page.getByTestId("check-verdict")).toBeVisible({ timeout: 30_000 });

  // Base checklist first: no venue rows yet.
  await expect(page.getByText("Anonimato")).toBeHidden();

  // Choosing ACL appends the venue checks: Limitations is missing in the
  // article template, and the official guide is linked.
  await page.getByTestId("check-venue").selectOption("acl");
  const sections = page.getByRole("listitem").filter({ hasText: "Limitations" });
  await expect(sections).toBeVisible({ timeout: 30_000 });
  const guide = page.getByRole("link", { name: /Guía oficial/ });
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute("href", /2025\.aclweb\.org/);

  // Back to "Sin venue": the checklist is exactly today's again.
  await page.getByTestId("check-venue").selectOption("");
  await expect(page.getByText("Limitations")).toBeHidden();
  await expect(page.getByText("Anonimato")).toBeHidden();
  await expect(page.getByText("Bibliografía — Estilo")).toBeHidden();
});
