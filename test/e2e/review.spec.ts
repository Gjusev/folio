import { expect, test } from "@playwright/test";
import { login, seed, type Ctx } from "./helpers";

let ctx: Ctx;

test.beforeAll(async () => {
  ctx = await seed();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

// The panel renders a stored result (the model call itself is covered by the
// route tests with a fake provider), so this checks what the author touches:
// filters, the jump to the line, dismissing and the copyable report.
test("revisión: filtros por gravedad y aspecto, salto a la línea y descarte", async ({ page }) => {
  const detail = await (await ctx.api.get(`/api/projects/${ctx.projectId}`)).json();
  const main = (detail.files as { path: string; content: string }[]).find(
    (f) => f.path === "main.tex",
  )!;
  const line = main.content.split("\n").findIndex((l) => l.includes("Transformers replaced")) + 1;
  expect(line).toBeGreaterThan(0);

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
        {
          aspect: "clarity",
          severity: "nit",
          file: "main.tex",
          line,
          quote: null,
          comment: "Prefiere la voz activa.",
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
  await expect(comments).toHaveCount(3);

  // Severity filter: switching "Detalle" off hides the nit.
  await page.getByRole("button", { name: /^Detalle/ }).click();
  await expect(comments).toHaveCount(2);
  // Aspect filter: switching "Claridad" off leaves only the evidence comment.
  await page.getByRole("button", { name: "Claridad", exact: true }).last().click();
  await expect(comments).toHaveCount(1);
  await expect(comments.first()).toContainText("Falta evidencia");

  // The location button opens the line in the editor.
  await comments
    .first()
    .getByRole("button", { name: `main.tex:${line}` })
    .click();
  await expect(page.locator(".cm-activeLine")).toContainText("Transformers replaced", {
    timeout: 10_000,
  });

  // Dismissing removes the comment from the list but keeps a way back.
  await comments.first().getByRole("button", { name: "Descartar" }).click();
  await expect(comments).toHaveCount(0);
  await page.getByRole("button", { name: /1 descartado/ }).click();
  await expect(comments).toHaveCount(1);
});
