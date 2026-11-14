// M25 公開品質の代表シナリオ。PC・スマホ幅、セーブ復元、長時間再生、アクセシビリティを確認する。
import { chromium } from "playwright-core";
import { buildBase, launchOptions, makeChecker } from "./lib.mjs";

const base = process.argv[2] ?? "http://localhost:5173/?seed=12345";
const url = `${base}${base.includes("?") ? "&" : "?"}quality=low`;
const browser = await chromium.launch(launchOptions());
const { check, finish } = makeChecker();
const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
desktop.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
desktop.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

await desktop.goto(url);
await desktop.waitForFunction(() => document.querySelector("canvas") && document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await desktop.waitForTimeout(400);

check("PC幅で横スクロールが発生しない", await desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
check("地図キャンバスに操作説明がある", await desktop.locator("canvas[aria-label]").count() >= 1);
check("情報パネルの開閉状態がARIAに反映される", await desktop.locator("#panel-toggle").getAttribute("aria-expanded") === "false");

const accessibility = await desktop.evaluate(() => {
  const visible = (el) => {
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && !el.closest(".hidden");
  };
  const buttons = [...document.querySelectorAll("button")].filter(visible);
  const unnamed = buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent || "").trim()).map((button) => button.id || button.outerHTML.slice(0, 80));
  const inputs = [...document.querySelectorAll("input, select")].filter(visible);
  const unlabeled = inputs.filter((input) => {
    if (input.getAttribute("aria-label")) return false;
    return !input.labels?.length;
  }).map((input) => input.id || input.tagName);
  return { unnamed, unlabeled };
});
check("表示中のボタンに名前がある", accessibility.unnamed.length === 0, accessibility.unnamed.join(", "));
check("表示中の入力にラベルがある", accessibility.unlabeled.length === 0, accessibility.unlabeled.join(", "));

await buildBase(desktop);
await desktop.click("#speed button[data-speed='0']");
await desktop.click("#menu-button");
await desktop.click("#menu-save-1");
check("公開品質シナリオでセーブできる", (await desktop.textContent("#menu-msg"))?.includes("保存しました"));
await desktop.click("#menu-title");
await desktop.click("#title-load-1");
await desktop.waitForTimeout(300);
check("公開品質シナリオで保存データを復元できる", Number((await desktop.textContent("#hud"))?.match(/edges=(\d+)/)?.[1] ?? 0) > 0);

const dayBefore = Number((await desktop.textContent("#hud"))?.match(/day=(\d+)/)?.[1] ?? 0);
await desktop.click("#speed button[data-speed='4']");
// ソフトウェア描画ではフレームが遅くなるため、日付の進行を十分待つ。
await desktop.waitForTimeout(5000);
await desktop.click("#speed button[data-speed='0']");
const dayAfter = Number((await desktop.textContent("#hud"))?.match(/day=(\d+)/)?.[1] ?? 0);
check("再生を続けてもゲーム内の日付が進む", dayAfter > dayBefore, `${dayBefore} -> ${dayAfter}`);

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const mobile = await mobileContext.newPage();
mobile.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
mobile.on("console", (m) => m.type() === "error" && errors.push(`mobile console: ${m.text()}`));
await mobile.goto(url);
await mobile.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await mobile.waitForTimeout(400);
const mobileLayout = await mobile.evaluate(() => {
  const toolbar = document.getElementById("toolbar");
  const visibleButtons = [...document.querySelectorAll("#toolbar button")].filter((button) => getComputedStyle(button).display !== "none");
  return {
    pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
    toolbarScrolls: !!toolbar && toolbar.scrollWidth > toolbar.clientWidth,
    buttonsAreTouchSized: visibleButtons.every((button) => button.getBoundingClientRect().height >= 44),
    panelToggle: !!document.getElementById("panel-toggle"),
  };
});
check("スマホ幅でページ全体が横にはみ出さない", mobileLayout.pageFits);
check("スマホ幅でツールバーを横に送れる", mobileLayout.toolbarScrolls);
check("スマホ幅のツールボタンが指で押せる大きさ", mobileLayout.buttonsAreTouchSized);
check("スマホ幅で情報パネルの開閉ボタンがある", mobileLayout.panelToggle);

check("PC・スマホでブラウザエラーがない", errors.length === 0, errors.join(" | "));
await mobileContext.close();
await finish(browser);
