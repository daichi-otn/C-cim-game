// 交通 (車の走行・混雑の色分け・交通パネル) のブラウザ動作確認。
import { buildBase, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-traffic";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']"); // 街づくりの操作中に日数が進んで、住民が入居しないよう、最初に止める
await buildBase(page);
await paintZones(page);

check("住民がいないうちは交通の欄が — になる", (await page.textContent("#traffic")).trim() === "—", await page.textContent("#traffic"));

await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(9000); // 建物が建ち、住民が入居するまで待つ
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);

const text = await page.textContent("#traffic");
check("街が育つと交通の欄に混雑率が出る", /^\d+%/.test(text.trim()), text);

// 車が走る: 少し時間を進めて、道路の上の画面が変わることを確かめる
await page.click("#speed button[data-speed='1']");
const a = await page.screenshot();
await page.waitForTimeout(700);
const b = await page.screenshot();
check("車が動いて画面が変わる", !a.equals(b));
await page.click("#speed button[data-speed='0']");

// T キーで混雑の色分けを切り替える
await page.keyboard.press("t");
await page.waitForTimeout(300);
check("T キーで案内が出る", (await page.textContent("#tip")).includes("混雑"), await page.textContent("#tip"));
await page.screenshot({ path: `${out}-1-heat.png` });
await page.keyboard.press("t");
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-2-cars.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
