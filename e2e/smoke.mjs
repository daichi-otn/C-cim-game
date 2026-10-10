// ブラウザ上での動作確認: 描画・ドラッグ・ズーム・エラー有無を検証し、スクリーンショットを保存する。
import { chromium } from "playwright-core";
import { GAME_URL, launchOptions } from "./lib.mjs";

const url = process.argv[2] ?? GAME_URL;
const out = process.argv[3] ?? "e2e/out";
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

await page.goto(url);
await page.waitForFunction(() => document.querySelector("canvas") && document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await page.waitForTimeout(500);
const hud = () => page.textContent("#hud");

const h0 = await hud();
await page.screenshot({ path: `${out}-1-initial.png` });

// ドラッグ: 左上方向へ 300px
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(340, 160, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const h1 = await hud();
await page.screenshot({ path: `${out}-2-dragged.png` });

// ズームイン
await page.mouse.move(640, 360);
for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(300);
const h2 = await hud();
await page.screenshot({ path: `${out}-3-zoomed.png` });

// ズームアウト (引きの画面で地形の多様性を見る)
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 100);
await page.waitForTimeout(500);
const h3 = await hud();
const shot = await page.screenshot({ path: `${out}-4-zoomout.png` });

// 画面に色が出ているか。WebGL canvas は直接読めないのでスクリーンショットを復号してサンプリングする
const colors = await page.evaluate(async (b64) => {
  const blob = await (await fetch("data:image/png;base64," + b64)).blob();
  const bmp = await createImageBitmap(blob);
  const o = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = o.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, o.width, o.height).data;
  const set = new Set();
  for (let i = 0; i < d.length; i += 4 * 997) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return set.size;
}, shot.toString("base64"));

console.log("initial:", h0);
console.log("dragged:", h1);
console.log("zoomed :", h2);
console.log("zoomout:", h3);
console.log("distinct colors sampled (zoomout):", colors);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (errors.length || h0 === h1 || h1 === h2 || h2 === h3 || colors < 4) process.exit(1);
