// M15 設定画面の音量設定を確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
const volume = page.locator("#menu-volume");
check("音量設定を表示", await volume.count() === 1);
await volume.fill("0.35");
check("音量の割合を表示", (await page.textContent("#menu-volume-value")) === "35%");
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
