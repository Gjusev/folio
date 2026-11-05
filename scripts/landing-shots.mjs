// Regenerates the product pictures on the landing page from the real app:
//   node scripts/landing-shots.mjs [baseUrl] [--derive]
// (default http://127.0.0.1:3210; --derive skips the browser and only rebuilds
// the public/landing JPGs from the PNGs already in public/landing/shots).
// Registers a throwaway account, loads the English demo project, compiles it
// and photographs the editor, the library and the citation graph — 1920x1080
// at 3x in dark mode (the landing is always dark). Then derives the JPGs the
// landing actually embeds, including a chrome-free crop of the compiled PDF
// title page found by scanning the pixels for the white page rectangle.
// Needs the app, its compiler and network access (the graph uses OpenAlex).
import { chromium, request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://127.0.0.1:3210";
const DERIVE_ONLY = process.argv.includes("--derive");
const OUT = "public/landing/shots";
const LAND = "public/landing";
mkdirSync(OUT, { recursive: true });

// sharp ships with Next (it is not a direct dependency of this repo).
const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next"))] }));
const moz = (quality) => ({ mozjpeg: true, quality });

let page;
if (!DERIVE_ONLY) {
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
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 3,
    locale: "en-US",
    colorScheme: "dark",
  });
  const [name, ...rest] = cookie.split("=");
  await ctx.addCookies([{ name, value: rest.join("="), url: BASE }]);
  page = await ctx.newPage();

  // Fonts first, then let layout/animations settle before every capture.
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
  };

  await page.goto(`/projects/${project.id}`);
  await page.locator('header button[title="Ctrl + Enter"]').click();
  await page.getByText(/Page 1 of \d+/).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500); // let the PDF canvases finish painting
  await settle();
  await page.screenshot({ path: `${OUT}/editor.png` });

  await page
    .getByRole("tab")
    .filter({ hasText: /Papers/ })
    .first()
    .click();
  await page.locator("#papers-tab-library").click();
  await page.waitForTimeout(800);
  await settle();
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
  await page.waitForTimeout(2500); // let the force layout stop moving
  await settle();
  await page.screenshot({ path: `${OUT}/graph.png` });

  await browser.close();
}

/* ---------- derivation: the JPGs the landing embeds ---------- */

/** Finds the compiled PDF's first page in the editor shot: the large white
 *  rectangle on the right half (everything else is dark chrome in dark mode).
 *  Returns its rect in raw PNG pixels. */
async function findPdfPage(png) {
  const meta = await sharp(png).metadata();
  const half = Math.floor(meta.width / 2);
  const { data, info } = await sharp(png)
    .extract({ left: half, top: 0, width: meta.width - half, height: meta.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const isWhite = (i) => data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230;

  // Rows whose white-pixel count is a wide run = paper rows (page margins are
  // white on every line of the page). Threshold well under the page width.
  const rowWhite = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    const row = y * W * channels;
    for (let x = 0; x < W; x++) if (isWhite(row + x * channels)) n++;
    rowWhite[y] = n;
  }
  const rowMin = W * 0.3;
  let top = rowWhite.findIndex((n) => n > rowMin);
  if (top < 0) throw new Error("no white page found in the editor shot");
  let bottom = top;
  while (bottom + 1 < H && rowWhite[bottom + 1] > rowMin) bottom++;

  // Columns kept white over those rows give the page's horizontal extent.
  const colWhite = new Int32Array(W);
  for (let y = top; y <= bottom; y++) {
    const row = y * W * channels;
    for (let x = 0; x < W; x++) if (isWhite(row + x * channels)) colWhite[x]++;
  }
  const colMin = (bottom - top + 1) * 0.6;
  let left = colWhite.findIndex((n) => n > colMin);
  let right = left;
  while (right + 1 < W && colWhite[right + 1] > colMin) right++;

  const rect = {
    left: half + left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
  console.log("pdf page rect:", rect);
  return rect;
}

/** The text bands (title, abstract, sections) inside the page rect, as row
 *  ranges that contain ink, so the strip can be cut on a whitespace gap. */
async function pageBands(png, rect) {
  const { data, info } = await sharp(png)
    .extract(rect)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const bands = [];
  let run = null;
  for (let y = 0; y < H; y++) {
    let ink = 0;
    const row = y * W;
    for (let x = 0; x < W; x++) if (data[row + x] < 128) ink++;
    if (ink > 4 && run) run[1] = y;
    else if (ink > 4) run = [y, y];
    else if (run) {
      bands.push(run);
      run = null;
    }
  }
  if (run) bands.push(run);
  return bands;
}

async function derive() {
  // Full editor and the left (source) half for the stages slider.
  const meta = await sharp(`${OUT}/editor.png`).metadata();
  await sharp(`${OUT}/editor.png`)
    .resize({ width: 1920 })
    .jpeg(moz(82))
    .toFile(`${LAND}/editor.jpg`);
  await sharp(`${OUT}/editor.png`)
    .extract({ left: 0, top: 0, width: Math.round(meta.width * 0.55), height: meta.height })
    .resize({ width: 1600 })
    .jpeg(moz(82))
    .toFile(`${LAND}/editor-source.jpg`);
  await sharp(`${OUT}/library.png`)
    .resize({ width: 1920 })
    .jpeg(moz(82))
    .toFile(`${LAND}/library.jpg`);
  await sharp(`${OUT}/graph.png`)
    .resize({ width: 1600 })
    .jpeg(moz(82))
    .toFile(`${LAND}/graph-explorer.jpg`);

  // Chrome-free crop of the compiled page itself: title + abstract through the
  // first section. The demo paper's section 1 paragraph ends near 45% of the
  // page; cut on the whitespace gap closest to that so no line gets sliced.
  const rect = await findPdfPage(`${OUT}/editor.png`);
  const bands = await pageBands(`${OUT}/editor.png`, rect);
  console.log("text bands (y within page):", bands.map(([a, b]) => `${a}-${b}`).join(" "));
  const snapToGap = (target) =>
    bands.reduce((best, [, b]) => {
      const g = b + 1;
      return best === null || Math.abs(g - target) < Math.abs(best - target) ? g : best;
    }, null) ?? target;
  const cutY = snapToGap(Math.round(rect.height * 0.45));
  const strip = { ...rect, height: cutY };

  // page-strip: the page crop on a thin dark border, 2x for crisp small type.
  await sharp(`${OUT}/editor.png`)
    .extract(strip)
    .resize({ width: strip.width * 2, kernel: "lanczos3" })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#0b0b0a" })
    .jpeg(moz(90))
    .toFile(`${LAND}/page-strip.jpg`);

  // page-mobile: 2:1 window over the same page (title + abstract), width 1000,
  // bottom snapped to the nearest text line so the window ends between lines.
  const mobile = { ...rect, height: snapToGap(Math.round(rect.width / 2)) };
  await sharp(`${OUT}/editor.png`)
    .extract(mobile)
    .resize({ width: 1000 })
    .jpeg(moz(85))
    .toFile(`${LAND}/page-mobile.jpg`);

  console.log("cut strip at", cutY, "of", rect.height, "page px");
}

await derive();
console.log("ok", OUT, "→", LAND);
