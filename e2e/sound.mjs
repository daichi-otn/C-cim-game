// 音の動作確認: 最初の操作で音が始まり、音の設定ボタンで「あり」「なし」が切り替わる。エラーは出ない。
import { launch, makeChecker } from "./lib.mjs";

const base = process.argv[2] ?? "http://localhost:5173/";
const { browser, page, errors } = await launch(base.includes("?") ? base : base + "?seed=12345");
const { check, finish } = makeChecker();

await page.waitForTimeout(800);
await page.mouse.click(640, 360);
await page.waitForTimeout(600);
await page.keyboard.press("m");
await page.waitForTimeout(200);
const before = await page.textContent("#menu-sound");
await page.click("#menu-sound");
const after = await page.textContent("#menu-sound");
check("音の設定ボタンで「あり」と「なし」が切り替わる", before !== after, `${before} -> ${after}`);
await page.click("#menu-sound");
check("もう一度押すと元に戻る", (await page.textContent("#menu-sound")) === before);
await page.click("#menu-alert-test");
const alertShown = await page.evaluate(() => { const a = document.getElementById("alert"); return !a.classList.contains("hidden") && a.textContent.includes("緊急速報"); });
check("緊急速報のテストで、警報の帯が出る (開発者モードのとき)", alertShown);
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
check("街の操作中に音のエラーが出ない", errors.length === 0, errors.join(" | "));
await finish(browser);
