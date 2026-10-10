// グラフィック設定: メニューに 5 項目 × 5 段階があり、変えると保存され、再読み込みしても残る。エラーは出ない。
import { launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-graphicsmenu";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']");
await page.keyboard.press("m");
await page.waitForTimeout(200);
const rows = page.locator("#menu-graphics > div");
check("グラフィック設定の項目が 5 つある", (await rows.count()) === 5);
check("段階のボタンは項目ごとに 5 つ", (await page.locator("#menu-graphics > div").first().locator("button").count()) === 5);
check("段階の名前が並ぶ", (await page.textContent("#menu-graphics")).includes("ウルトラ高"));
check("標準は「中」が選ばれている", (await page.locator("#menu-graphics button.primary").count()) === 5);
await page.screenshot({ path: `${out}-1-menu.png` });

// 影を「無効」にする
await rows.first().locator("button", { hasText: "無効" }).click();
await page.waitForTimeout(200);
const saved = await page.evaluate(() => localStorage.getItem("ccim.graphics.v1"));
check("変えた設定が保存される", saved !== null && JSON.parse(saved).shadows === 0, saved ?? "");
// 木を「ウルトラ高」に
await rows.nth(2).locator("button", { hasText: "ウルトラ高" }).click();
await page.waitForTimeout(200);

await page.reload();
await page.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.click("#speed button[data-speed='0']");
await page.keyboard.press("m");
await page.waitForTimeout(200);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("ccim.graphics.v1")));
check("再読み込み後も設定が残る", after.shadows === 0 && after.trees === 4, JSON.stringify(after));
check("選んだ段階が表示に出る", (await page.locator("#menu-graphics > div").first().locator("button.primary").textContent()) === "無効");

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
