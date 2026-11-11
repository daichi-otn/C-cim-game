// M15 設定画面の音量設定を確認する。
import { launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#menu-button");
const volume = page.locator("#menu-volume");
check("音量設定を表示", await volume.count() === 1);
await volume.fill("0.35");
check("音量の割合を表示", (await page.textContent("#menu-volume-value")) === "35%");
await page.click("#menu-language");
check("英語表示へ切り替える", (await page.textContent("#menu-language")) === "Language: English" && (await page.textContent("#menu-close")) === "Close");
await page.click("#menu-language");
check("日本語表示へ戻せる", (await page.textContent("#menu-language")) === "言語: 日本語" && (await page.textContent("#menu-close")) === "閉じる");
await page.reload();
check("言語設定を保存", await page.evaluate(() => document.documentElement.lang === "ja"));
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
