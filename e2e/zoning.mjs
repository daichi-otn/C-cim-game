// ゾーニングのブラウザ動作確認。標準の街の土台 (道路・給水・発電・下水) の上でゾーンを塗る。
import { buildBase, click, cx, cy, dragRect, launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-zoning";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const state = async () => {
  await page.waitForTimeout(250); // HUD は次のフレームで更新されるので少し待つ
  const t = await page.textContent("#hud");
  const m = /tool=(\w+).*edges=(\d+)\s+zones: R=(\d+) C=(\d+) I=(\d+)\s+buildings: R=(\d+) C=(\d+) I=(\d+)\s+facilities=(\d+)/.exec(t);
  return {
    tool: m[1], edges: +m[2],
    zones: { R: +m[3], C: +m[4], I: +m[5] },
    blds: { R: +m[6], C: +m[7], I: +m[8] },
    facilities: +m[9],
  };
};
const total = (o) => o.R + o.C + o.I;

await buildBase(page);
let s = await state();
check("土台ができる (道路 1 本・施設 4 つ)", s.edges === 1 && s.facilities === 4, JSON.stringify(s));

// 道路から遠い場所には塗れない
await page.keyboard.press("4");
check("キー4で住宅ゾーンツール", (await state()).tool === "zoneR");
await page.click("#zone-density-1"); // 密度は、どのゾーンツールでも共通。低密度なら、少ない電力・水道でも、3 種類すべてに建物が建つ
await dragRect(page, 0, 20, 5, 22);
s = await state();
check("道路から遠い場所には塗れない", total(s.zones) === 0, JSON.stringify(s.zones));

// 住宅: 道路の北側 (9〜11 行目) に 8 列 × 3 行 = 24
await click(page, cx(0), cy(9));
await page.mouse.move(cx(7), cy(11));
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}-1-preview.png` });
await click(page, cx(7), cy(11));
s = await state();
check("住宅ゾーンが塗られる (8 列 × 3 行 = 24)", s.zones.R === 24, JSON.stringify(s.zones));

// 道路の上は塗れない: 道路の行 (12) を含む矩形を塗っても、道路のタイルは塗られない
await page.keyboard.press("5");
await dragRect(page, 9, 9, 14, 12); // 9〜11 行目の 18 タイル + 道路の行 (6 タイル) は対象外
s = await state();
check("商業ゾーンが塗られ、道路の行は塗られない (18)", s.zones.C === 18, JSON.stringify(s.zones));

// 施設の上には塗れない (発電所 x=4〜6、下水処理場 x=7〜9。どちらも 3×3 で、13〜15 行目)
await page.keyboard.press("6");
await dragRect(page, 3, 13, 9, 15); // 7 列 × 3 行 = 21、施設の 3×3 が 2 つ = 18 タイルを除いた 3
s = await state();
check("施設のタイルには塗れない (21 − 18 = 3)", s.zones.I === 3, JSON.stringify(s.zones));
// 解除して、施設とぶつからない場所に塗り直す
await page.keyboard.press("7");
await dragRect(page, 3, 13, 9, 15);
await page.keyboard.press("6");
await dragRect(page, 16, 13, 21, 15);
s = await state();
check("工業ゾーンが塗られる (18)", s.zones.I === 18, JSON.stringify(s.zones));

// 建物が自動で建つ
await page.keyboard.press("1");
await page.click("#speed button[data-speed='4']");
await page.mouse.move(640, 500);
await page.waitForTimeout(8000);
s = await state();
check("しばらくすると建物が建つ", total(s.blds) > 0, JSON.stringify(s.blds));
check("建物は種類ごとのゾーン数を超えない", s.blds.R <= s.zones.R && s.blds.C <= s.zones.C && s.blds.I <= s.zones.I);
await page.waitForTimeout(12000);
s = await state();
check("住宅・商業・工業のすべてに建物が建つ", s.blds.R > 0 && s.blds.C > 0 && s.blds.I > 0, JSON.stringify(s.blds));
await page.screenshot({ path: `${out}-2-built.png` });

// 別種類への塗り替えで建物が取り壊される
await page.keyboard.press("5");
const b1 = await state();
await dragRect(page, 0, 9, 7, 10); // 住宅の 2 行 (16 タイル) を商業に
s = await state();
check("塗り替えで住宅が減り商業が増える", s.zones.R === b1.zones.R - 16 && s.zones.C === b1.zones.C + 16, JSON.stringify(s.zones));

// ゾーン解除
await page.keyboard.press("7");
check("キー7でゾーン解除ツール", (await state()).tool === "unzone");
const b2 = await state();
await dragRect(page, 16, 13, 21, 15);
s = await state();
check("解除で工業ゾーンが消える", s.zones.I === 0 && total(s.zones) < total(b2.zones), JSON.stringify(s.zones));

// 道路を撤去するとゾーンも消える (施設は残る)
await page.keyboard.press("3");
const b3 = await state();
await click(page, cx(10), cy(12));
s = await state();
check("道路を撤去すると届かなくなったゾーンが消える", s.edges < b3.edges && total(s.zones) === 0, JSON.stringify(s));
check("施設は残る", s.facilities === 4);
await page.screenshot({ path: `${out}-3-after-bulldoze.png` });

// ドラッグは地図の移動のまま (ゾーンツールでもゾーンは増えない)
await page.keyboard.press("4");
const b4 = await state();
await page.mouse.move(600, 500);
await page.mouse.down();
await page.mouse.move(540, 470, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(100);
s = await state();
check("ドラッグではゾーンが増えない", total(s.zones) === total(b4.zones));

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
