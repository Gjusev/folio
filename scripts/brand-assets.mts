// Renders every brand asset from src/lib/brand.ts:
//   node scripts/brand-assets.mts
// Outputs: public/brand/*.svg (logo + mark variants), the app icons and
// favicon, the Open Graph/Twitter image, GitHub's social preview, the README
// banners and an overview sheet for docs/brand-guidelines.md.
// Needs only the installed dev dependencies (sharp via Next, Playwright).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { BRAND, MARK, MARK_SMALL, logoSvg, markSvg } from "../src/lib/brand.ts";

const require = createRequire(import.meta.url);
// sharp ships with Next (it is not a direct dependency of this repo).
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next"))] }));

const ROOT = resolve(import.meta.dirname, "..");
const out = (p: string) => {
  const f = resolve(ROOT, p);
  mkdirSync(dirname(f), { recursive: true });
  return f;
};
const save = (p: string, data: string | Buffer) => writeFileSync(out(p), data);

/* ---------- vector: logo and mark variants ---------- */

const light = { left: BRAND.ink, right: BRAND.teal };
const dark = { left: BRAND.nightInk, right: BRAND.tealLight };
const mono = { left: "currentColor", right: "currentColor" };

save("public/brand/logo.svg", logoSvg(light));
save("public/brand/logo-dark.svg", logoSvg(dark));
save("public/brand/logo-mono.svg", logoSvg(mono));
save("public/brand/mark.svg", markSvg(light));
save("public/brand/mark-dark.svg", markSvg(dark));
save("public/brand/mark-mono.svg", markSvg(mono));

/* ---------- app icon: the mark on an ink tile ---------- */

// The tile is ink so the icon reads on light and dark tab bars and home
// screens alike; the leaves switch to their dark-ground colours.
function tileSvg(inset: number, radius: number, m: { left: string; right: string } = MARK) {
  const s = 512 - inset * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    `<rect width="512" height="512" rx="${radius}" fill="${BRAND.ink}"/>`,
    `<g transform="translate(${inset} ${inset}) scale(${s / 64})">`,
    `<path fill="${BRAND.paper}" d="${m.left}"/>`,
    `<path fill="${BRAND.tealLight}" d="${m.right}"/>`,
    `</g></svg>`,
  ].join("");
}
const icon = tileSvg(88, 112); // mark ~65% of the tile
const maskable = tileSvg(136, 0); // full bleed, mark inside the 80% safe zone
save("public/icon.svg", icon);

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();

save("public/icon-192.png", await png(icon, 192));
save("public/icon-512.png", await png(icon, 512));
save("public/icon-maskable-512.png", await png(maskable, 512));
save("src/app/apple-icon.png", await png(tileSvg(88, 0), 180)); // iOS rounds it itself

// favicon.ico with 16/32/48 PNG entries (the ICO container is a tiny header).
const sizes = [16, 32, 48];
const small = tileSvg(48, 112, MARK_SMALL);
save("public/icon-small.svg", small);
const images = await Promise.all(sizes.map((s) => png(small, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
save("src/app/favicon.ico", Buffer.concat([header, ...images]));

/* ---------- raster compositions, rendered in a real browser ---------- */

// Inlined as data: URLs; a page opened with setContent cannot load file:// assets.
const dataUrl = (p: string, type: string) =>
  `data:${type};base64,${readFileSync(resolve(ROOT, p)).toString("base64")}`;
const font = (w: number) =>
  `@font-face{font-family:Switzer;font-weight:${w};src:url(${dataUrl(`public/fonts/switzer-${w}.woff2`, "font/woff2")}) format("woff2")}`;
const page = dataUrl("docs/brand/source/compiled-page.jpg", "image/jpeg");
const css = `${font(400)}${font(500)}${font(600)}
*{box-sizing:border-box;margin:0}
body{font-family:Switzer,sans-serif;-webkit-font-smoothing:antialiased}
.c{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start}
h1{font-weight:600;letter-spacing:-.045em;line-height:.98;text-wrap:balance}
p{letter-spacing:-.01em}`;

const logoImg = (svg: string, height: number) =>
  `<img alt="" style="height:${height}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;

/** The social card: the sentence on paper, the product leaning in from the right. */
const card = (w: number, h: number) => `
<div class="c" style="width:${w}px;height:${h}px;padding:${h * 0.1}px ${w * 0.06}px;background:${BRAND.paper};color:${BRAND.ink}">
  ${logoImg(logoSvg(light), h * 0.085)}
  <div><h1 style="font-size:${h * 0.135}px">Your paper<br>on your server.</h1>
  <p style="margin-top:${h * 0.05}px;font-size:${h * 0.045}px;line-height:1.35;max-width:${w * 0.5}px;color:${BRAND.stone}">The open workspace for writing scientific papers with AI.</p></div>
  <p style="font-size:${h * 0.046}px;font-weight:500;color:${BRAND.ink}">Open source · Self-hosted · Apache-2.0</p>
  <div style="position:absolute;left:${w * 0.63}px;top:0;right:0;bottom:0;background:${BRAND.sand}">
    <img alt="" src="${page}" style="position:absolute;left:${w * 0.035}px;top:${h * 0.13}px;width:${w * 0.3}px;display:block;background:#fff">
  </div>
</div>`;

/** README banner: lockup and promise, in light and dark. */
const banner = (w: number, h: number, mode: "light" | "dark") => {
  const bg = mode === "light" ? BRAND.paper : BRAND.night;
  const fg = mode === "light" ? BRAND.ink : BRAND.nightInk;
  const sub = mode === "light" ? BRAND.stone : "#b2b1ac";
  return `
<div class="c" style="width:${w}px;height:${h}px;padding:${h * 0.16}px ${w * 0.05}px;background:${bg};color:${fg};flex-direction:row;align-items:center">
  ${logoImg(logoSvg(mode === "light" ? light : dark), h * 0.3)}
  <p style="font-size:${h * 0.085}px;font-weight:500;max-width:${w * 0.42}px;text-align:right;color:${sub};line-height:1.25">The open workspace for writing scientific papers with AI.</p>
</div>`;
};

/** One-page overview for the guidelines: logo, mark sizes, palette, type. */
const sheet = () => {
  const swatch = (name: string, hex: string, ink: string) =>
    `<div style="background:${hex};color:${ink};padding:18px;height:150px;display:flex;flex-direction:column;justify-content:flex-end;box-shadow:inset 0 0 0 1px rgba(20,20,19,.14)"><b style="font-weight:600;font-size:20px">${name}</b><span style="font-size:16px">${hex}</span></div>`;
  const marks = [16, 32, 64, 128]
    .map(
      (s) =>
        `<div style="width:${s}px;height:${s}px">${markSvg(light).replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>`,
    )
    .join("");
  return `
<div style="width:1600px;padding:72px;background:${BRAND.paper};color:${BRAND.ink};display:grid;gap:56px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
    <div style="background:${BRAND.sheet};padding:64px">${logoImg(logoSvg(light), 96)}</div>
    <div style="background:${BRAND.night};padding:64px">${logoImg(logoSvg(dark), 96)}</div>
  </div>
  <div style="display:flex;align-items:end;gap:48px">${marks}
    <div style="width:128px;height:128px">${icon.replace("<svg ", '<svg width="128" height="128" ')}</div>
    <div style="width:32px;height:32px">${small.replace("<svg ", '<svg width="32" height="32" ')}</div>
    <div style="width:16px;height:16px">${small.replace("<svg ", '<svg width="16" height="16" ')}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;background:#fff;padding:16px">
    ${swatch("Ink", BRAND.ink, BRAND.paper)}${swatch("Paper", BRAND.paper, BRAND.ink)}${swatch("Sand", BRAND.sand, BRAND.ink)}${swatch("Teal", BRAND.teal, "#fff")}${swatch("Teal light", BRAND.tealLight, BRAND.ink)}
  </div>
  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:end">
    <h1 style="font-size:88px">Your paper on your server.</h1>
    <p style="font-size:22px;line-height:1.5;color:${BRAND.stone}">Switzer Semibold for the wordmark and display lines; IBM Plex Sans for the interface; IBM Plex Mono for code only.</p>
  </div>
</div>`;
};

const browser = await chromium.launch();
async function render(html: string, w: number, h: number | null, file: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h ?? 800 } });
  await page.setContent(`<!doctype html><style>${css}</style>${html}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out(file), fullPage: h === null });
  await page.close();
}
await render(card(1200, 630), 1200, 630, "src/app/opengraph-image.png");
await render(card(1200, 630), 1200, 630, "src/app/twitter-image.png");
await render(card(1280, 640), 1280, 640, "docs/brand/social-preview.png");
await render(banner(1600, 400, "light"), 1600, 400, "docs/brand/banner-light.png");
await render(banner(1600, 400, "dark"), 1600, 400, "docs/brand/banner-dark.png");
await render(sheet(), 1600, null, "docs/brand/overview.png");
await browser.close();

const alt =
  "Folio: scientific writing in LaTeX, on your own server. Open source, self-hosted, Apache-2.0.";
save("src/app/opengraph-image.alt.txt", alt);
save("src/app/twitter-image.alt.txt", alt);

console.log(
  "brand assets written:",
  readFileSync(out("public/brand/logo.svg")).length,
  "bytes logo",
);
