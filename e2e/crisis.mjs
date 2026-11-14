// M23 の危機管理パネルと防災条例の効果表示。
import { GAME_URL, launch, makeChecker } from "./lib.mjs";

const start = process.argv[2] ?? GAME_URL;
const { browser, page, errors } = await launch(start);
const { check, finish } = makeChecker();

await page.goto(start.split("?")[0]);
await page.click("#map-plains");
await page.click("#new-game-start");
await page.waitForTimeout(300);
await page.click("#speed button[data-speed='0']");
await page.click("#menu-button");
check("M23 危機管理パネルを表示", await page.locator("#menu-crisis").count() === 1);
check("災害がないときの案内を表示", (await page.locator("#menu-crisis-status").textContent())?.includes("現在、対応中の災害はありません") === true);
check("災害がないときは物資投入を無効化", await page.locator("#crisis-relief").isDisabled());
await page.check("#policy-disaster");
check("防災条例の効果を表示", (await page.locator("#menu-crisis-policy").textContent())?.includes("被害発生率") === true);
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
