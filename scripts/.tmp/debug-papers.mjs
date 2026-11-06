// Reproduce the papers-tab hang: capture console errors and page state.
import { chromium, request } from "@playwright/test";

const BASE = "http://127.0.0.1:4211";
const api = await request.newContext({ baseURL: BASE });
const login = await api.post("/api/auth/login", {
  data: { email: "e2e-persistent@t.dev", password: "correct horse battery" },
});
const cookie = (login.headers()["set-cookie"] ?? "").split(";")[0];
const authed = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie } });
const demo = await (await authed.post("/api/projects/demo", { data: { lang: "es" } })).json();

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, locale: "es-ES" });
const [name, ...rest] = cookie.split("=");
await ctx.addCookies([{ name, value: rest.join("="), url: BASE }]);
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
page.on("requestfailed", (r) => console.log("REQFAIL:", r.url().slice(-80), r.failure()?.errorText));

await page.goto(`/projects/${demo.project.id}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
console.log("tabs:", (await page.getByRole("tab").allInnerTexts()).join(" | "));
await page.getByRole("tab", { name: "Artículos" }).click();
await page.waitForTimeout(2500);
console.log("after Artículos, tabs:", (await page.getByRole("tab").allInnerTexts()).join(" | "));
console.log("check-venue visible:", await page.getByTestId("check-venue").isVisible().catch(() => "no"));
await browser.close();
