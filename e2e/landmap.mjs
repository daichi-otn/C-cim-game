// 地価マップ (メニューの「表示」から切り替える色分け) のブラウザ動作確認。
import { buildBase, click, cx, cy, dragRect, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-landmap";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']");
await buildBase(page);
await paintZones(page);
await page.keyboard.press("m");
await page.waitForTimeout(200);
check("メニューに地価マップのチェックがある", await page.isVisible("#menu-land"));
check("初めはオフ", !(await page.isChecked("#menu-land")));
await page.check("#menu-land");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-on.png` });
await page.keyboard.press("m");
await page.uncheck("#menu-land");
await page.keyboard.press("Escape");
check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
