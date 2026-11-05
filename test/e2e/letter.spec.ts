import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

// The response letter, end to end: pasted reviewer points -> items -> the
// generated .tex compiled through the same /compile the workspace uses.
// (The AI-drafts flow needs a provider and is covered by the route tests.)
test("carta de respuesta: pega tres puntos, crea y compila", async ({ page }) => {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Revisión" }).click();
  await page.getByTestId("letter-section").locator("summary").click();

  await page
    .locator("#letter-pasted")
    .fill(
      [
        "1. The abstract does not state the main result. This is a major issue.",
        "2. Figure 2 is unreadable at print size.",
        "3. Minor: fix the typos in the section titles.",
      ].join("\n"),
    );
  const items = page.getByTestId("letter-item");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("P1");
  await expect(items.first()).toContainText("Importante"); // severity chip, localized

  // One response typed by hand: it must land in the .tex.
  await items.first().locator("textarea").fill("We now state the result in the abstract.");

  await page.getByRole("button", { name: /Crear y compilar carta/ }).click();
  const done = page.getByTestId("letter-done");
  await expect(done).toBeVisible({ timeout: 90_000 });
  await expect(done).toContainText("response-letter.tex");
  await expect(done).toContainText(/página/); // page count from the compile log

  // The server copy carries what the panel showed.
  const detail = await (await ctx.api.get(`/api/projects/${ctx.projectId}`)).json();
  const letter = (detail.files as { path: string; content: string }[]).find(
    (f) => f.path === "response-letter.tex",
  )!;
  expect(letter).toBeTruthy();
  expect(letter.content).toContain("We now state the result in the abstract.");
  expect(letter.content).toContain("fix the typos");

  // "Abrir en editor" switches the editor pane to the letter.
  await done.getByRole("button", { name: "Abrir en editor" }).click();
  await expect(page.locator(".cm-content")).toContainText("Carta de respuesta a los revisores");
});

test("carta de respuesta: con snapshot, el .tex lleva un apéndice que lo nombra", async ({
  page,
}) => {
  // A version saved through the API, as the Snapshots menu would.
  const snap = await ctx.api.post(`/api/projects/${ctx.projectId}/snapshots`, {
    data: { label: "v1-enviada" },
  });
  expect(snap.status()).toBe(200); // the snapshots route replies 200, not 201
  const { snapshot } = await snap.json();

  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Revisión" }).click();
  await page.getByTestId("letter-section").locator("summary").click();

  await page.locator("#letter-pasted").fill("1. Please discuss the limitations.");
  await page.locator("#letter-snapshot").selectOption(snapshot.id);
  await page.getByRole("button", { name: /Crear y compilar carta/ }).click();
  await expect(page.getByTestId("letter-done")).toBeVisible({ timeout: 90_000 });

  const detail = await (await ctx.api.get(`/api/projects/${ctx.projectId}`)).json();
  const letter = (detail.files as { path: string; content: string }[]).find(
    (f) => f.path === "response-letter.tex",
  )!;
  expect(letter.content).toContain("v1-enviada");
  expect(letter.content).toContain("Apéndice"); // appendix section, in the UI language
});

test("carta de respuesta: los ítems vienen de la revisión de Folio cargada", async ({ page }) => {
  // The current Folio review lives in localStorage in the plain test stack
  // (no provider); the letter section preselects it.
  const saved = {
    sections: 1,
    truncated: false,
    review: {
      summary: "Dos cosas.",
      scores: {},
      comments: [
        {
          aspect: "evidence",
          severity: "major",
          file: "main.tex",
          line: 3,
          quote: "State your research question",
          comment: "Falta evidencia para la afirmación principal.",
          suggestion: null,
        },
        {
          aspect: "clarity",
          severity: "minor",
          file: null,
          line: null,
          quote: null,
          comment: "El resumen no dice qué se mide.",
          suggestion: null,
        },
      ],
    },
  };
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    [`folio:review:${ctx.projectId}`, JSON.stringify(saved)],
  );

  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("tab", { name: "Revisión" }).click();
  await page.getByTestId("letter-section").locator("summary").click();

  const items = page.getByTestId("letter-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("F1");
  await expect(items.first()).toContainText("Falta evidencia");
  // Located Folio comments keep their jump link.
  await expect(items.first()).toContainText("main.tex:3");
});
