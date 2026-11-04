import { expect, request, test } from "@playwright/test";
import { getFile, login, putFile, seed, type Ctx } from "./helpers";

const BASE = () => process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

// The article template's question sentence: short (fits one visual editor row,
// so Home+Shift+End marks exactly the line), unique in main.tex.
const SENTENCE = "State your research question here.";
const OWNER_BODY = "El resumen promete tres cosas: dejémoslo en tres frases.";
const VIEWER_BODY = "Visto, me parece bien así.";

/** A second, DISTINCT account for the viewer. Like seed(), falls back to the
 *  persistent account when the register rate-limit kicks in; null when that
 *  fallback is the owner itself (shared account) — then the two-user flow
 *  cannot run and the caller skips. */
async function secondUser(owner: Ctx): Promise<(Ctx & { email: string }) | null> {
  const api = await request.newContext({ baseURL: BASE() });
  const email = `e2e-coviewer-${Date.now()}@t.dev`;
  const reg = await api.post("/api/auth/register", {
    data: { email, name: "Coauthor", password: "correct horse battery" },
  });
  let who = email;
  let cookie: string;
  if (reg.status() === 201) {
    cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
  } else {
    who = process.env.E2E_USER ?? "e2e-persistent@t.dev";
    const r = await api.post("/api/auth/login", {
      data: { email: who, password: process.env.E2E_PASS ?? "correct horse battery" },
    });
    if (r.status() !== 200) return null;
    cookie = (r.headers()["set-cookie"] ?? "").split(";")[0];
  }
  const authed = await request.newContext({ baseURL: BASE(), extraHTTPHeaders: { cookie } });
  // Distinctness probe: a different account cannot see the owner's project.
  if ((await authed.get(`/api/projects/${owner.projectId}`)).ok()) return null;
  return { cookie, api: authed, projectId: owner.projectId, mainId: owner.mainId, email: who };
}

test("comentarios: selección, hilo con respuesta, resolución y ancla que sobrevive a la edición", async ({
  browser,
}) => {
  const owner = await seed();
  const viewer = await secondUser(owner);
  if (!viewer) {
    test.skip(true, "sin segunda cuenta disponible (rate-limit del registro)");
    return;
  }

  // The owner shares the project as viewer — the exact call projects.test.ts
  // makes (POST /api/projects/[id]/members with email + role).
  const invite = await owner.api.post(`/api/projects/${owner.projectId}/members`, {
    data: { email: viewer.email, role: "viewer" },
  });
  expect(invite.status(), await invite.text()).toBe(201);

  const ownerBrowser = await browser.newContext();
  const ownerPage = await ownerBrowser.newPage();
  await login(ownerPage, owner);
  await ownerPage.goto(`/projects/${owner.projectId}`);
  await expect(ownerPage.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });

  // Select the sentence: click its line, then Home + Shift+End marks exactly
  // that line (the whole sentence, no newline).
  await ownerPage.locator(".cm-line", { hasText: "State your research" }).click();
  await ownerPage.keyboard.press("Home");
  await ownerPage.keyboard.press("Shift+End");
  const onSelection = ownerPage.getByTestId("comment-on-selection");
  await expect(onSelection).toBeVisible();
  await expect(onSelection).toHaveText(
    new RegExp(`Comentar la selección \\(${SENTENCE.length}\\)`),
  );
  await onSelection.click();

  // The drawer opens with the composer prefilled with the selected quote.
  const drawer = ownerPage.getByTestId("comments-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(`«${SENTENCE}»`);
  await drawer.getByPlaceholder("Escribe un comentario…").fill(OWNER_BODY);
  await drawer.getByRole("button", { name: "Enviar", exact: true }).click();

  // The thread lands in the open group with quote, body and file path.
  const thread = drawer.locator("li", { hasText: OWNER_BODY });
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expect(thread).toContainText(`«${SENTENCE}»`);
  await expect(thread).toContainText("main.tex");

  // The viewer replies from their own session.
  const viewerBrowser = await browser.newContext();
  const viewerPage = await viewerBrowser.newPage();
  await login(viewerPage, viewer);
  await viewerPage.goto(`/projects/${owner.projectId}`);
  await expect(viewerPage.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
  await viewerPage.getByTestId("comments-toggle").click();
  const viewerDrawer = viewerPage.getByTestId("comments-drawer");
  const viewerThread = viewerDrawer.locator("li", { hasText: OWNER_BODY });
  await expect(viewerThread).toBeVisible({ timeout: 10_000 });
  // A viewer never gets the resolve button; that door is API-only for them.
  await expect(viewerThread.getByRole("button", { name: "Resolver", exact: true })).toHaveCount(0);
  await viewerThread.getByRole("button", { name: "Responder", exact: true }).click();
  await viewerDrawer.getByPlaceholder("Escribe una respuesta…").fill(VIEWER_BODY);
  await viewerDrawer.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(viewerThread).toContainText(VIEWER_BODY, { timeout: 10_000 });

  // The owner reopens the drawer (it refetches on open) and sees the reply.
  // The open drawer overlays the header, so it is closed with its own button.
  await drawer.getByRole("button", { name: "Cerrar" }).click();
  await ownerPage.getByTestId("comments-toggle").click();
  await expect(thread).toContainText(VIEWER_BODY, { timeout: 10_000 });

  // Resolve: the thread moves to the resolved group, the open one empties.
  await thread.getByRole("button", { name: "Resolver", exact: true }).click();
  const resolved = drawer.getByRole("heading", { name: "Resueltos" }).locator("..");
  await expect(resolved.getByText(OWNER_BODY)).toBeVisible({ timeout: 10_000 });
  await expect(resolved.getByText(VIEWER_BODY)).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Abiertos" })).toHaveCount(0);

  // The owner edits the file BEFORE the anchor through the API and reloads:
  // the thread survives with its quote (the anchor follows the text).
  const file = await getFile(owner, owner.mainId);
  const insert = "% línea añadida antes del resumen\n";
  const next = file.content.replace("\\begin{abstract}", `${insert}\\begin{abstract}`);
  expect(next, "el edit se inserta antes del ancla").not.toBe(file.content);
  await putFile(owner, owner.mainId, next, file.version);

  await ownerPage.reload();
  await expect(ownerPage.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
  await expect(ownerPage.locator(".cm-content")).toContainText("antes del resumen");
  await ownerPage.getByTestId("comments-toggle").click();
  const reopened = ownerPage.getByTestId("comments-drawer");
  const reopenedResolved = reopened.getByRole("heading", { name: "Resueltos" }).locator("..");
  await expect(reopenedResolved.getByText(OWNER_BODY)).toBeVisible({ timeout: 10_000 });
  await expect(reopenedResolved.getByText(`«${SENTENCE}»`)).toBeVisible();

  // The viewer's resolve attempt is refused by the API (read-only role).
  const list = await (await viewer.api.get(`/api/projects/${owner.projectId}/comments`)).json();
  const root = (list.comments as { id: string; body: string }[]).find((c) => c.body === OWNER_BODY);
  expect(root, "el hilo sigue listado tras la edición").toBeTruthy();
  const attempt = await viewer.api.post(
    `/api/projects/${owner.projectId}/comments/${root!.id}/resolve`,
  );
  expect(attempt.status()).toBe(403);

  await ownerBrowser.close();
  await viewerBrowser.close();
});
