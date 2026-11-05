import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test("dos pestañas editando el mismo fichero convergen en vivo", async ({ browser }) => {
  // Collab is opt-in: skip cleanly when COLLAB_URL is not configured. The
  // probe asks for a token for the project's main file, exactly as the app
  // does (the token is file-scoped since the room-binding fix).
  const tokenProbe = await ctx.api
    .post(`/api/projects/${ctx.projectId}/collab-token`, { data: { fileId: ctx.mainId } })
    .catch(() => null);
  const enabled = tokenProbe?.ok() ? (await tokenProbe.json()).url : null;
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

test("dos usuarios de proyectos distintos no pueden entrar a la sala del otro", async () => {
  // Same gating as the convergence test; the probe doubles as the contract's
  // "A asks for a token for its own main → 200 with url".
  const mine = await ctx.api
    .post(`/api/projects/${ctx.projectId}/collab-token`, { data: { fileId: ctx.mainId } })
    .catch(() => null);
  const a = mine?.ok() ? await mine.json() : null;
  test.skip(!a?.url, "collab desactivado (COLLAB_URL vacía)");
  expect(a.token, "A recibe token firmado para SU main").toBeTruthy();

  const b = await seed({ fresh: true });
  // Premise: two DISTINCT accounts (fresh registration on purpose) — then B legitimately sees
  // A's project and the cross-project rejections below would be meaningless.
  const seen = await b.api.get(`/api/projects/${ctx.projectId}`);
  test.skip(seen.ok(), "seed compartió cuenta persistente (rate-limit de registro)");

  // (1) B cannot mint a token for A's file: not against A's project (404,
  // invisible to B via getAccessibleProject) nor against B's own project
  // (404, getFile finds no such file there).
  const viaProjectA = await b.api.post(`/api/projects/${ctx.projectId}/collab-token`, {
    data: { fileId: ctx.mainId },
  });
  expect(viaProjectA.status(), "B pide token contra el proyecto de A → 404").toBe(404);
  const viaOwnProject = await b.api.post(`/api/projects/${b.projectId}/collab-token`, {
    data: { fileId: ctx.mainId },
  });
  expect(viaOwnProject.status(), "B pide token para el main de A en SU proyecto → 404").toBe(404);

  // (2) Even holding A's valid token, the relay only admits the room signed
  // inside it: joining B's file room is closed with 4001. No browser needed —
  // Node's global WebSocket, same seam and URL shape as src/lib/collab.ts
  // (and services/collab/smoke.mjs).
  const code = await new Promise<number>((resolve, reject) => {
    const base = a.url.replace(/\/+$/, "");
    const ws = new WebSocket(
      `${base}/?token=${encodeURIComponent(a.token)}&file=${encodeURIComponent(b.mainId)}&client=1`,
    );
    const timer = setTimeout(() => reject(new Error("el relay no cerró la conexión en 5s")), 5000);
    // The relay closes 4001 *after* the WebSocket upgrade, so "open" always
    // fires. Admission is signaled by the first state frame — being admitted
    // is the breach this test must catch, reported as code 0.
    ws.addEventListener("message", () => {
      clearTimeout(timer);
      ws.close();
      resolve(0);
    });
    ws.addEventListener("close", (e: CloseEvent) => {
      clearTimeout(timer);
      resolve(e.code);
    });
    ws.addEventListener("error", () => {}); // close always follows
  });
  expect(code, "token de A + sala del main de B → el relay cierra 4001 (sala no firmada)").toBe(
    4001,
  );
});
