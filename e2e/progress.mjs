// M14 の統計・目標表示を確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
check("統計を表示", (await page.textContent("#menu-statistics"))?.includes("人口"));
check("次の目標を表示", (await page.textContent("#menu-goal"))?.includes("目標:"));
check("マイルストーンを表示", (await page.textContent("#menu-milestones"))?.includes("人口"));
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
