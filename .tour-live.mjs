// Live verification of the onboarding tour card against the production build
// on :8141. Run:  node .tour-live.mjs   (repo root). Not part of the test suite.
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:8141";
const EMAIL = `tour-live-${Date.now()}@t.dev`;
const PASS = "correct horse battery";
const shots = [];
const log = (...a) => console.log("[tour]", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function count() {
  return (await page.getByTestId("onboarding-count").innerText()).trim();
}
async function settled() {
  let prev = "";
  for (let i = 0; i < 25; i++) {
    const now = await count();
    if (now && now === prev) return now;
    prev = now;
    await page.waitForTimeout(700);
  }
  throw new Error("count never settled: " + prev);
}

// 1. Fresh account, no demo, via the real register form (German UI).
await page.goto(`${BASE}/register`);
await page.fill("#name", "Tour Live");
await page.fill("#email", EMAIL);
await page.fill("#password", PASS);
await page.getByRole("checkbox").uncheck();
await page
  .getByRole("button", { name: /Konto erstellen/ })
  .last()
  .click();
await page.waitForURL(/\/projects\?welcome=1/);
log("registered", EMAIL);

// 2. Template project through the welcome dialog.
await page.getByRole("button", { name: "Vorlage wählen" }).click();
await page.getByRole("button", { name: "Projekt erstellen" }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
log("project open:", page.url());

// 3. The card: visible, settles at 1/9 (created; no AI configured → 9 tasks).
const card = page.getByTestId("onboarding-card");
await card.waitFor({ state: "visible", timeout: 15_000 });
const start = await settled();
log("settled count:", start);
if (!start.endsWith("/9")) throw new Error("expected total 9, got " + start);

// 4. REAL compile with Ctrl+Enter in the editor → ring +1.
await page.locator(".cm-content").click();
await page.keyboard.press("Control+Enter");
await page.getByText(/Seite 1 von/, { exact: false }).waitFor({ timeout: 120_000 });
const afterCompile = await settled();
log("count after compile:", afterCompile);
if (afterCompile === start) throw new Error("compile did not move the ring");

// 5. REAL pdf-click: click a sentence in the rendered PDF text layer.
// The layer re-renders after the compile settles; retry the click if the
// first one lands before the spans are interactive.
let afterPdf = afterCompile;
for (let attempt = 0; attempt < 3 && afterPdf === afterCompile; attempt++) {
  const sentence = page
    .locator(".react-pdf__Page__textContent span")
    .filter({ hasText: /Summarise the problem/ })
    .first();
  await sentence.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await sentence.click({ force: true });
  await page.waitForTimeout(3000);
  afterPdf = await count();
}
log("count after pdf click:", afterPdf);
if (afterPdf === afterCompile) throw new Error("pdf click did not move the ring");

// 6. Expand, look at the current task, screenshot.
await page.getByRole("button", { name: "Rundgang", exact: true }).click();
await card.getByTestId("onboarding-task-cite-paper").waitFor();
await page.screenshot({ path: ".tour-shots/expanded.png" });
shots.push("expanded.png");
const hint = await card.getByTestId("onboarding-task-cite-paper").innerText();
log("current task block:\n" + hint);

// 7. «Zeig es mir» switches the sidebar to the Literatur tab.
await card.getByRole("button", { name: "Zeig es mir" }).click();
const selected = await page.getByRole("tab", { name: "Literatur" }).getAttribute("aria-selected");
log("Literatur tab selected:", selected);
if (selected !== "true") throw new Error("Show me did not switch tab");

// 8. Dismiss → hidden → reload → still hidden → Rundgang reopens with progress.
// «Zeig es mir» left the sidebar on Literatur; the card lives in Dateien.
await page.getByRole("tab", { name: "Dateien" }).click();
for (let attempt = 0; attempt < 3; attempt++) {
  await page.getByTestId("onboarding-dismiss").click({ force: true });
  await page.waitForTimeout(1500);
  if ((await card.count()) === 0) break;
  log("dismiss attempt", attempt + 1, "did not hide the card; retrying");
  console.log(
    "server says:",
    await page.evaluate(async () =>
      JSON.stringify((await (await fetch("/api/preferences")).json()).onboarding),
    ),
  );
}
if ((await card.count()) > 0) throw new Error("dismiss never hid the card");
await page.reload();
await card.waitFor({ state: "hidden", timeout: 15_000 });
log("still dismissed after reload");
await page.getByRole("button", { name: "Rundgang", exact: true }).click();
await page.waitForTimeout(1200);
await card.waitFor({ state: "visible", timeout: 15_000 });
const reopened = await count();
log("reopened count (progress preserved):", reopened);
if (reopened !== afterPdf) throw new Error(`progress changed: ${reopened} != ${afterPdf}`);

// 9. Completion state (honest): mark everything done via the app's own API.
const all = [
  "create-project",
  "compile",
  "pdf-click",
  "cite-paper",
  "library",
  "graph",
  "snapshot",
  "check",
  "review",
  "share-or-token",
];
await page.evaluate(async (ids) => {
  for (const id of ids) window.dispatchEvent(new CustomEvent("folio:onboarding", { detail: id }));
}, all);
await page.waitForTimeout(800);
await page.reload();
await card.waitFor({ state: "visible" });
await page.getByRole("button", { name: "Rundgang", exact: true }).click();
await page.getByText("Du hast alles gesehen, was Folio kann.").waitFor({ timeout: 10_000 });
await page.screenshot({ path: ".tour-shots/complete.png" });
shots.push("complete.png");
log("completion state renders with the mark");

await browser.close();
console.log("DONE — screenshots:", shots.join(", "));
