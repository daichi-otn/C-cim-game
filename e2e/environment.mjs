// 環境 (大気汚染・騒音・悪臭と病人) のブラウザ動作確認。
import { buildBase, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-environment";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']"); // 街づくりの操作中に日数が進んで、住民が入居しないよう、最初に止める
await buildBase(page);
await paintZones(page);
check("街がないうちは住民の健康は「良好」", (await page.textContent("#health")).trim() === "良好", await page.textContent("#health"));

await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(9000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
const health = (await page.textContent("#health")).trim();
check("住民の健康の欄に状態が出る", health === "良好" || /^病人 \d+ 人$/.test(health), health);

await page.keyboard.press("o");
await page.waitForTimeout(300);
check("O キーで案内が出る", (await page.textContent("#tip")).includes("環境"), await page.textContent("#tip"));
await page.screenshot({ path: `${out}-1-overlay.png` });
await page.keyboard.press("o");
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-2-off.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
