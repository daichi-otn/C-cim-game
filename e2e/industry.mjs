// M13 の一次産業UIを確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
check("一次産業の表示", (await page.textContent("#menu-industry"))?.includes("一次産業"));
check("搬出・加工の統計を表示", (await page.textContent("#menu-industry"))?.includes("搬出") && (await page.textContent("#menu-industry"))?.includes("加工"));
check("資源に対応する産業ボタン", await page.locator("#industry-farm").count() === 1 && await page.locator("#industry-oil").count() === 1);
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
