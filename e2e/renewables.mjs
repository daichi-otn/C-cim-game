// 風力・太陽光発電所 (発電量が天気と季節で変わる) のブラウザ動作確認。
import { buildBase, click, launch, makeChecker, paintZones, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-renewables";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const money = async () => {
  await page.waitForTimeout(250);
  return num(await page.textContent("#money"));
};
const supply = async () => Number(/\/ (\d+)/.exec(await page.textContent("#util-power"))[1]);
const tipText = async () => ((await page.isVisible("#tip")) ? await page.textContent("#tip") : "");

await buildBase(page);
await paintZones(page);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
const base = await supply();
check("発電所 1 基だけなら供給は 300 (天気に関係なく一定)", base === 300, `${base}`);

await page.keyboard.press("8");
await page.waitForTimeout(250);
const names = await page.$$eval("#facility-palette button", (bs) => bs.map((b) => b.firstChild.textContent));
check("発電所ツールのパレットに 3 種類が並ぶ", JSON.stringify(names) === JSON.stringify(["発電所", "風力発電所", "太陽光発電所"]), names.join(","));
check("最初は火力の発電所が選ばれている", (await page.getAttribute("#facility-1", "class"))?.includes("active") ?? false);

await page.click("#facility-15");
await page.waitForTimeout(250);
let tip = await tipText();
check("風力の案内に費用と供給量、天気による変化が出る", tip.includes("風力発電所") && tip.includes("14,000,000") && tip.includes("供給 120") && tip.includes("雨の日"), tip);
await page.click("#facility-16");
await page.waitForTimeout(250);
tip = await tipText();
check("太陽光の案内に費用と供給量、天気による変化が出る", tip.includes("太陽光発電所") && tip.includes("18,000,000") && tip.includes("供給 100") && tip.includes("晴れで最大"), tip);

// 建てる: 風力 → 太陽光 (道路の北側)
const m0 = await money();
await page.click("#facility-15");
await page.mouse.move(px(17) + 1, py(10) + 1);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-preview.png` });
await click(page, px(17) + 1, py(10) + 1);
const m1 = await money();
check("風力発電所が建ち、建設費 1,400 万円が引かれる", m0 - m1 === 14_000_000, `${m0} -> ${m1}`);
await page.click("#facility-16");
await click(page, px(20) + 1, py(10) + 1); // 風力 3×3 (x=16〜18) の隣
const m2 = await money();
check("太陽光発電所が建ち、建設費 1,800 万円が引かれる", m1 - m2 === 18_000_000, `${m1} -> ${m2}`);
await page.keyboard.press("1");
await page.waitForTimeout(500);
const total = await supply();
// 300 + 風力 (96〜156) + 太陽光 (晴れの春 100 〜 雪の冬 12。夏の晴れで 120) の範囲
check("パネルの電力の供給が、火力 300 + 風力 + 太陽光になる", total > 300 && total <= 300 + 156 + 120, `${total}`);

// 時間を進めて、季節・天気で供給量が動くのを見る
await page.click("#speed button[data-speed='4']");
const seen = new Set([total]);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  seen.add(await supply());
}
await page.click("#speed button[data-speed='0']");
check("天気が変わると、電力の供給量も変わる", seen.size >= 2, [...seen].join(","));
await page.waitForTimeout(500);
// 羽根が回る (時間を止めていても、画面が動く)
const a = await page.screenshot();
await page.waitForTimeout(400);
const b = await page.screenshot();
check("風車の羽根が回って画面が動く", !a.equals(b));
await page.screenshot({ path: `${out}-2-built.png` });

// 保存して読み込んでも残る
await page.keyboard.press("m");
await page.click("#menu-save-1");
await page.keyboard.press("Escape");
const before = +/facilities=(\d+)/.exec(await page.textContent("#hud"))[1];
await page.goto((process.argv[2] ?? "http://localhost:5173/").split("?")[0]);
await page.waitForSelector("#title-load-1");
await page.click("#title-load-1");
await page.waitForTimeout(800);
check("読み込むと施設の数が同じ", +/facilities=(\d+)/.exec(await page.textContent("#hud"))[1] === before, `${before}`);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
