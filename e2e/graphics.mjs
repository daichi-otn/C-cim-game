// グラフィック (昼夜・窓や街灯の光・煙・水面・土ぼこり) のブラウザ動作確認。主に画面の変化を調べる。
import { buildBase, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-graphics";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await buildBase(page);
await paintZones(page);
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(12000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);

const hud = async () => page.textContent("#hud");
check("HUD に時刻が出る", /time=\d+:\d\d/.test(await hud()), await hud());
await page.keyboard.press("l"); // 昼に固定
await page.waitForTimeout(400);
check("L で昼に固定される", (await page.textContent("#tip")).includes("昼に固定"), await page.textContent("#tip"));
const day = await page.screenshot({ path: `${out}-1-day.png` });
await page.keyboard.press("l"); // 夜に固定
await page.waitForTimeout(400);
check("もう一度 L で夜に固定される", (await page.textContent("#tip")).includes("夜に固定"));
const night = await page.screenshot({ path: `${out}-2-night.png` });
check("夜は昼と画面が大きく違う", !day.equals(night));
await page.keyboard.press("l"); // 自動
await page.waitForTimeout(400);
check("もう一度 L で自動に戻る", (await page.textContent("#tip")).includes("移り変わる"));

// 煙・車のアニメーション: 時間を止めていても、見た目が動く (煙)
const a = await page.screenshot();
await page.waitForTimeout(600);
const b = await page.screenshot();
check("時間を止めていても、煙や水面が動いて画面が変わる", !a.equals(b));

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
