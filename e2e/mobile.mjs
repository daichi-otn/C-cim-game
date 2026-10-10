// スマホ・タブレット: タップで道具を選び、タップ 2 回で道路を引く。移動ツールで 1 本指の操作で動く。2 本指でつまんで拡大できる。
import { chromium } from "playwright-core";
import { launchOptions, makeChecker } from "./lib.mjs";

const url = process.argv[2] ?? "http://localhost:5173/?seed=12345";
const out = process.argv[3] ?? "e2e/out-mobile";
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const { check, finish } = makeChecker();
const cdp = await context.newCDPSession(page);
const touch = async (points) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
const move = async (points) => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points });
const end = async () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
const tap = async (x, y) => {
  await touch([{ x, y, id: 0 }]);
  await end();
  await page.waitForTimeout(150);
};
const hud = async () => page.textContent("#hud");

await page.goto(url);
await page.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.click("#speed button[data-speed='0']");
await page.screenshot({ path: `${out}-1-phone.png` });

const tb = await page.locator("#toolbar").boundingBox();
check("ツールバーが画面の幅に収まる", tb !== null && tb.x >= 0 && tb.x + tb.width <= 390 + 1, JSON.stringify(tb));
check("情報パネルは畳める (開くボタンがある)", await page.isVisible("#panel-toggle"));

// 道路ツールをタップで選ぶ → タップ 2 回で道路を引く
await page.locator("#tool-road").tap();
await page.waitForTimeout(150);
const before = (await hud()).match(/edges=(\d+)/)?.[1];
await tap(120, 420);
await tap(300, 420);
await page.waitForTimeout(250);
const after = (await hud()).match(/edges=(\d+)/)?.[1];
check("タップ 2 回で道路が引ける", Number(after) > Number(before), `${before} -> ${after}`);

// 移動ツールで、1 本指を動かすと画面が動く
await page.locator("#tool-pan").tap();
await page.waitForTimeout(150);
const pos0 = (await hud()).match(/pos=\((\d+), (\d+)\)/);
await touch([{ x: 200, y: 500, id: 0 }]);
for (let i = 1; i <= 8; i++) await move([{ x: 200 - i * 12, y: 500, id: 0 }]);
await end();
await page.waitForTimeout(200);
const pos1 = (await hud()).match(/pos=\((\d+), (\d+)\)/);
check("移動ツールの 1 本指で画面が動く", pos0 && pos1 && pos0[1] !== pos1[1], `${pos0?.[0]} -> ${pos1?.[0]}`);

// 2 本指でつまんで拡大
const zoom0 = Number((await hud()).match(/zoom=([\d.]+)/)[1]);
await touch([
  { x: 170, y: 420, id: 0 },
  { x: 220, y: 420, id: 1 },
]);
for (let i = 1; i <= 8; i++)
  await move([
    { x: 170 - i * 8, y: 420, id: 0 },
    { x: 220 + i * 8, y: 420, id: 1 },
  ]);
await end();
await page.waitForTimeout(200);
const zoom1 = Number((await hud()).match(/zoom=([\d.]+)/)[1]);
check("2 本指でつまむと拡大する", zoom1 > zoom0, `${zoom0} -> ${zoom1}`);
await page.screenshot({ path: `${out}-2-after.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
