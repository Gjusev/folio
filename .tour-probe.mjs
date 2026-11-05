import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:8141";
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: "de-DE" })).newPage();
await page.goto(`${BASE}/register`);
await page.waitForLoadState("networkidle");
await page.fill("#name", "Style Check");
await page.fill("#email", `tour-style-${Date.now()}@t.dev`);
await page.fill("#password", "correct horse battery");
await page.getByRole("checkbox").uncheck();
await page
  .getByRole("button", { name: /Konto erstellen/ })
  .last()
  .click();
await page.waitForURL(/\/projects\?welcome=1/);
await page.getByRole("button", { name: "Vorlage wählen" }).click();
await page.getByRole("button", { name: "Projekt erstellen" }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
await page.getByTestId("onboarding-card").waitFor();
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("folio:onboarding", { detail: "compile" }));
  window.dispatchEvent(new CustomEvent("folio:onboarding", { detail: "pdf-click" }));
});
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Rundgang", exact: true }).click();
const styles = await page.evaluate(() => {
  const grab = (id) => {
    const el = document.querySelector(`[data-testid="${id}"] p`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, decoration: cs.textDecorationLine, weight: cs.fontWeight };
  };
  return {
    done: grab("onboarding-task-compile"),
    current: grab("onboarding-task-cite-paper"),
    pending: grab("onboarding-task-library"),
    ring: (() => {
      const c = document.querySelectorAll('[data-testid="onboarding-card"] svg circle')[1];
      const cs = getComputedStyle(c);
      return { stroke: cs.stroke, dasharray: cs.strokeDasharray, transition: cs.transition };
    })(),
    showBtn: (() => {
      const b = document.querySelector('[data-testid="onboarding-task-cite-paper"] button');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const hint = document.querySelector('[data-testid="onboarding-task-cite-paper"] p + div p');
      const hr = hint.getBoundingClientRect();
      return { ownRow: r.top >= hr.bottom - 2, transition: b.className };
    })(),
  };
});
console.log(JSON.stringify(styles, null, 1));
await browser.close();
