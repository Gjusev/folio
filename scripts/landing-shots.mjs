// Regenerates the product pictures on the landing page from the real app:
//   node scripts/landing-shots.mjs [baseUrl]      (default http://127.0.0.1:3210)
// Registers a throwaway account, loads the English demo project, compiles it
// and photographs the editor, the library and the citation graph at 2x.
// Needs the app, its compiler and network access (the graph uses OpenAlex).
import { chromium, request } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3210";
const OUT = "public/landing/shots";
mkdirSync(OUT, { recursive: true });

const api = await request.newContext({ baseURL: BASE });
const email = `shots-${Date.now()}@t.dev`;
const reg = await api.post("/api/auth/register", {
  data: { email, name: "Folio", password: "correct horse battery" },
});
if (reg.status() !== 201) throw new Error(`register ${reg.status()}`);
const cookie = (reg.headers()["set-cookie"] ?? "").split(";")[0];
const authed = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie } });
const demo = await authed.post("/api/projects/demo", { data: { lang: "en" } });
if (demo.status() !== 201) throw new Error(`demo ${demo.status()}`);
const { project } = await demo.json();

const browser = await chromium.launch();
const ctx = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
  locale: "en-US",
  colorScheme: "light",
});
const [name, ...rest] = cookie.split("=");
await ctx.addCookies([{ name, value: rest.join("="), url: BASE }]);
const page = await ctx.newPage();

await page.goto(`/projects/${project.id}`);
await page.locator('header button[title="Ctrl + Enter"]').click();
await page.getByText(/Page 1 of \d+/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/editor.png` });

await page.getByRole("tab").filter({ hasText: /Papers/ }).first().click();
await page.locator("#papers-tab-library").click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/library.png` });

await page.locator("#papers-tab-search").click();
await page.fill("#paper-q", "10.48550/arXiv.1706.03762");
await page.press("#paper-q", "Enter");
await page.getByText("Attention Is All You Need").first().waitFor({ timeout: 30_000 });
await page
    .locator("[role=tabpanel]")
    .filter({ hasText: "Attention Is All You Need" })
    .first()
    .getByTestId("explore")
    .click();
await page.getByTestId("graph-explorer").waitFor({ timeout: 60_000 });
await page.waitForFunction(() => (window.__folioGraph?.ids().length ?? 0) > 1, undefined, {
  timeout: 60_000,
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/graph.png` });

await browser.close();
console.log("ok", OUT);
