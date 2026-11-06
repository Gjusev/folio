import { expect, test } from "@playwright/test";
import { getFile, login, putFile, seed, type Ctx } from "./helpers";

let ctx: Ctx;
/** What this server's /grammar answers: decides which of the two specs runs. */
let probe: { off?: boolean; error?: string; issues?: { file: string; line: number }[] };

// One sentence per line, so a reported line is easy to check in the editor.
const MAIN = [
  String.raw`\documentclass{article}`,
  String.raw`\begin{document}`,
  String.raw`\section{Introduction}`,
  "This are a short paragraph written for the grammar check.",
  "It have a second mistake on its own line, see Fig. \\ref{f}.",
  "The last line of prose is correct and long enough to be checked.",
  String.raw`\end{document}`,
  "",
].join("\n");

test.beforeAll(async () => {
  ctx = await seed();
  const { version } = await getFile(ctx, ctx.mainId);
  await putFile(ctx, ctx.mainId, MAIN, version);
  probe = await (await ctx.api.post(`/api/projects/${ctx.projectId}/grammar`)).json();
});

test.beforeEach(async ({ page }) => {
  await login(page, ctx);
});

async function compileAndLint(page: import("@playwright/test").Page) {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.locator('header button[title="Ctrl + Enter"]').click();
  await expect(page.getByText(/Página 1 de 1/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Lint/ }).click();
}

test("sin LANGUAGETOOL_URL: nota neutra y chktex funciona igual", async ({ page }) => {
  test.skip(!probe.off, "this server has LanguageTool configured");
  await compileAndLint(page);
  await expect(page.getByText(/chktex/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("grammar-note")).toHaveText(/no configurada/);
  // Neutral, not an error: no languagetool entries and the button keeps its name.
  await expect(page.getByText(/^languagetool:/)).toHaveCount(0);
  // (after a run the button reads "Lint (n)": only the grammar label must be absent)
  await expect(page.getByRole("button", { name: /Lint \+ gramática/ })).toHaveCount(0);
});

// Needs LANGUAGETOOL_URL pointing at a real server or a stub that reports at
// least one match for this text; skipped otherwise.
test("con LanguageTool: avisos con prefijo languagetool y salto a la línea", async ({ page }) => {
  test.skip(Boolean(probe.off) || Boolean(probe.error), "LanguageTool off or unreachable");
  test.skip(!probe.issues?.length, "LanguageTool reported nothing for this text");
  const first = probe.issues![0];
  const sourceLine = MAIN.split("\n")[first.line - 1];

  await compileAndLint(page);
  await expect(page.getByRole("button", { name: /Lint \+ gramática/ })).toBeVisible({
    timeout: 30_000,
  });
  const entry = page.getByRole("button", {
    name: new RegExp(`main\\.tex:${first.line}.*languagetool:`),
  });
  await expect(entry.first()).toBeVisible();
  await expect(page.getByTestId("grammar-note")).toHaveCount(0);

  await entry.first().click();
  await expect(page.locator(".cm-activeLine")).toContainText(sourceLine.slice(0, 20), {
    timeout: 10_000,
  });
});
