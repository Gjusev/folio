import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test("dos pestañas editando el mismo fichero convergen en vivo", async ({ browser }) => {
  // Collab is opt-in: skip cleanly when COLLAB_URL is not configured.
  const tokenProbe = await ctx.api
    .post(`/api/projects/${ctx.projectId}/collab-token`)
    .catch(() => null);
  const enabled = tokenProbe ? (await tokenProbe.json()).url : null;
  test.skip(!enabled, "collab desactivado (COLLAB_URL vacía)");
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await login(pageA, ctx);
  await login(pageB, ctx);

  // Both open the same project and place the cursor at the end of the body.
  await pageA.goto(`/projects/${ctx.projectId}`);
  await pageB.goto(`/projects/${ctx.projectId}`);
  await expect(pageA.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
  await expect(pageB.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });

  // A types a distinctive line at the end…
  await pageA.locator(".cm-content").click();
  await pageA.keyboard.press("Control+End");
  await pageA.keyboard.type("% editado en vivo por la pestaña A\n");

  // …B sees it without reloading (collab relay → Yjs → CodeMirror binding).
  await expect(pageB.locator(".cm-content")).toContainText("editado en vivo por la pestaña A", {
    timeout: 20_000,
  });

  // And the reply from B lands in A.
  await pageB.locator(".cm-content").click();
  await pageB.keyboard.press("Control+End");
  await pageB.keyboard.type("% y confirmado por la pestaña B\n");
  await expect(pageA.locator(".cm-content")).toContainText("confirmado por la pestaña B", {
    timeout: 20_000,
  });

  await a.close();
  await b.close();
});
