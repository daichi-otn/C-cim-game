// 経済 (資金・人口・需要・税率・時間の速度) のブラウザ動作確認。右上のパネルの表示を読む。
import { buildBase, click, cx, cy, launch, makeChecker, paintZones, panRight, placeFacility } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-economy";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const panel = async () => {
  await page.waitForTimeout(250);
  const text = (id) => page.textContent(id);
  const m = /(\d+)年(\d+)月(\d+)日/.exec(await text("#date"));
  return {
    day: (+m[1] - 1) * 360 + (+m[2] - 1) * 30 + +m[3],
    money: num(await text("#money")),
    pop: num(await text("#pop")),
    tax: num(await text("#tax")),
    bars: await page.evaluate(() => ["r", "c", "i"].map((k) => document.getElementById("bar-" + k).style.width)),
    activeSpeed: await page.evaluate(() => document.querySelector("#speed button.active")?.dataset.speed),
  };
};

// 初期状態
let p = await panel();
check("初期資金は 300,000,000 円・人口 0・税率 10%・1x", p.money === 300000000 && p.pop === 0 && p.tax === 10 && p.activeSpeed === "1", JSON.stringify(p));

// 時間が進む (1x では 0.5 秒で 1 日)
const d0 = p.day;
await page.waitForTimeout(2200);
p = await panel();
check("時間が進む", p.day >= d0 + 3, `day ${d0} -> ${p.day}`);

// Space で一時停止 → 日付が止まる → もう一度で再開
await page.keyboard.press(" ");
p = await panel();
check("Space で一時停止", p.activeSpeed === "0");
const dPause = p.day;
await page.waitForTimeout(1500);
p = await panel();
check("一時停止中は日付が進まない", p.day === dPause, `day ${dPause} -> ${p.day}`);
await page.keyboard.press(" ");
p = await panel();
check("もう一度 Space で元の速度に戻る", p.activeSpeed === "1");

// 速度ボタン
await page.click("#speed button[data-speed='4']");
const dFast = (await panel()).day;
await page.waitForTimeout(2000);
p = await panel();
check("4x では 2 秒で 10 日以上進む", p.day >= dFast + 10, `day ${dFast} -> ${p.day}`);
// 以降の建設費は、月末の精算が混ざらないよう一時停止して測る
await page.click("#speed button[data-speed='0']");

// 道路を敷くとお金が減る: x=-7〜25 の 32 タイル → 19,200,000 円
await page.keyboard.press("1");
await panRight(page);
const m0 = (await panel()).money;
await page.keyboard.press("2");
await click(page, cx(-7), cy(12));
await click(page, cx(25), cy(12));
await page.keyboard.press("Escape");
p = await panel();
check("道路を敷くと建設費 (32 タイル × 600,000 円 = 19,200,000 円) がかかる", m0 - p.money === 19200000, `${m0} -> ${p.money}`);

// 施設を建てるとお金が減る (給水 18M / 発電 30M / 下水 24M / 外部接続 15M)
const m1 = p.money;
await placeFacility(page, "9", -8, 9);
await placeFacility(page, "8", 4, 13);
await placeFacility(page, "0", 7, 13);
await placeFacility(page, "-", 11, 13);
await page.keyboard.press("1");
p = await panel();
check("施設の建設費 (1,800 万 + 3,000 万 + 2,400 万 + 1,500 万) がかかる", m1 - p.money === 87000000, `${m1} -> ${p.money}`);

// ゾーンを塗る → 街が育つ
await paintZones(page);
await page.click("#speed button[data-speed='4']");
await page.mouse.move(640, 500);
await page.waitForTimeout(8000);
p = await panel();
check("街が育つと人口が増える", p.pop > 0, `pop=${p.pop}`);
check("需要バーが表示されている", p.bars.some((w) => w !== "0%" && w !== ""), JSON.stringify(p.bars));
await page.screenshot({ path: `${out}-1-city.png` });

// 月末に収支が出る (4x で 30 日 = 約 4 秒)
const bal = num(await page.textContent("#balance"));
check("先月の収支が表示される", Number.isFinite(bal) && bal !== 0, `balance=${bal}`);

// 税率ボタン
await page.click("#tax-up");
await page.click("#tax-up");
p = await panel();
check("税率を上げるボタンで 12% になる", p.tax === 12, `tax=${p.tax}`);
await page.click("#tax-down");
for (let i = 0; i < 30; i++) await page.click("#tax-down");
p = await panel();
check("税率は 0% 未満にならない", p.tax === 0, `tax=${p.tax}`);
for (let i = 0; i < 30; i++) await page.click("#tax-up");
p = await panel();
check("税率は 20% を超えない", p.tax === 20, `tax=${p.tax}`);
await page.click("#speed button[data-speed='1']");

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
