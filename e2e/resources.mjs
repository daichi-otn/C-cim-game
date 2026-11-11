// M13 の土地購入と資源表示を確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
const before = await page.textContent("#menu-resources");
await page.click("#land-buy");
const after = await page.textContent("#menu-resources");
check("資源統計を表示", before?.includes("農地") && before?.includes("石油"));
check("土地購入で所有区画が増える", before !== after && after?.includes("所有区画 2"));
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
