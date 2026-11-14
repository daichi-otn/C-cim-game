// M13 のマップサイズ選択と保存を確認する。
import { GAME_URL, launch, makeChecker } from "./lib.mjs";
const start = process.argv[2] ?? GAME_URL;
const { browser, page, errors } = await launch(start);
const { check, finish } = makeChecker();
await page.goto(start.split("?")[0]);
await page.click("#map-plains");
const size = page.locator("#new-game-map-size");
check("マップサイズを選べる", await size.count() === 1 && await size.locator("option").count() === 4);
await size.selectOption("small");
await page.click("#new-game-start");
await page.click("#menu-button");
await page.click("#menu-save-1");
const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ccim.save.1")));
check("選択したマップサイズを保存", save?.city?.mapSize === "small");
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
