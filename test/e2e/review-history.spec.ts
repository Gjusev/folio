import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

// Review-mode v2 against the localStorage-seeded CURRENT review (the model
// call and the server persistence are covered by the route tests with a fake
// provider). Here: the honest empty history, the per-comment state buttons
// and the hand-off to the assistant tab.
test("revisión v2: estados, historial vacío y traspaso al asistente", async ({ page }) => {
  const detail = await (await ctx.api.get(`/api/projects/${ctx.projectId}`)).json();
  const main = (detail.files as { path: string; content: string }[]).find(
    (f) => f.path === "main.tex",
  )!;
  const line = main.content.split("\n").findIndex((l) => l.includes("Transformers replaced")) + 1;
  expect(line).toBeGreaterThan(0);

  // No savedId: the review is local-only, so the state buttons stay local too.
  const saved = {
    sections: 3,
    truncated: false,
    review: {
      summary: "Borrador claro, pero las afirmaciones necesitan números.",
      scores: { clarity: 4, evidence: 2 },
      comments: [
        {
          aspect: "evidence",
          severity: "major",
          file: "main.tex",
          line,
          quote: "Transformers replaced recurrence",
          comment: "Falta evidencia para esta afirmación.",
          suggestion: "Cita un resultado de referencia.",
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
  const comments = page.getByTestId("review-comment");
  await expect(page.getByTestId("review-result")).toBeVisible();
  await expect(comments).toHaveCount(2);

  // History: no saved reviews on the server for this fresh project.
  const history = page.getByTestId("review-history");
  await expect(history).toBeVisible();
  await expect(history).toContainText("Aún no hay revisiones guardadas");

  // Per-comment states: resolving marks the comment without any error
  // (nothing to PATCH against: there is no saved review).
  await comments.first().getByRole("button", { name: "Resolver" }).click();
  await expect(comments.first()).toContainText("Resuelto");
  // The PDF panel's own "not compiled" notice also uses role=alert, so the
  // assertion is scoped to the review panel's error area.
  await expect(page.getByTestId("review-error")).toHaveCount(0);
  // Dismiss still works alongside the new states.
  await comments.nth(1).getByRole("button", { name: "Descartar" }).click();
  await expect(comments).toHaveCount(1);

  // Fix with the assistant: switches the side tab and prefills the
  // instruction (comment + suggestion + quoted fragment, nothing applied).
  // Without an AI provider configured (the plain test stack) the composer does
  // not exist; the handoff is then the tab switch plus the honest off-state.
  await comments.first().getByRole("button", { name: "Arreglar con el asistente" }).click();
  await expect(page.getByRole("tab", { name: "Asistente" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const question = page.locator("#ai-question");
  if (await question.count()) {
    await expect(question).toHaveValue(/Falta evidencia para esta afirmación\./);
    await expect(question).toHaveValue(/Sugerencia: Cita un resultado de referencia\./);
    await expect(question).toHaveValue(/Fragmento: "Transformers replaced recurrence"/);
  } else {
    await expect(
      page.getByText(/Assistant not configured|Asistente no configurado/i),
    ).toBeVisible();
  }
});
