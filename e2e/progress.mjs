// M14 の統計・目標表示を確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
check("統計を表示", (await page.textContent("#menu-statistics"))?.includes("人口"));
check("交差点の種類を表示", (await page.textContent("#menu-statistics"))?.includes("交差点"));
check("統計グラフを表示", (await page.textContent("#menu-history"))?.includes("人口"));
check("次の目標を表示", (await page.textContent("#menu-goal"))?.includes("目標:"));
check("マイルストーンを表示", (await page.textContent("#menu-milestones"))?.includes("人口"));
check("住民追跡欄を表示", await page.locator("#menu-citizens").count() === 1);
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
