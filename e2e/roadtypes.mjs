// 道路の種類 (パレットの選択・費用の案内・敷設とアップグレード・見た目) のブラウザ動作確認。
import { click, cx, cy, launch, makeChecker, panRight } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-roadtypes";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const money = async () => num(await page.textContent("#money"));
await page.keyboard.press("1");
await panRight(page);
await page.click("#speed button[data-speed='0']");

check("道路ツール以外ではパレットが出ない", !(await page.isVisible("#road-palette")));
await page.keyboard.press("2");
check("道路ツールでパレットが出る", await page.isVisible("#road-palette"));
check("道路の種類が 10 個ある", (await page.locator("#road-palette button[data-road]").count()) === 10);
check("最初は「通り」が選ばれている", (await page.locator("#road-type-2.active").count()) === 1);

// 種類ごとに 1 本ずつ、8 行おきに敷く
const types = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const costs = [300000, 600000, 900000, 1200000, 1800000, 900000, 2000000, 4000000, 120000, 450000];
const ROW0 = 3;
let allOk = true;
for (const t of types) {
  await page.click(`#road-type-${t}`);
  const m0 = await money();
  const y = ROW0 + (t - 1) * 2;
  await click(page, cx(-3), cy(y));
  await page.mouse.move(cx(9), cy(y));
  await page.waitForTimeout(150);
  const tipText = await page.textContent("#tip");
  await click(page, cx(9), cy(y));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const spent = m0 - (await money());
  const ok = spent === costs[t - 1] * 12;
  allOk &&= ok;
  if (!ok) console.log(`種類 ${t}: ${spent} 円 (期待 ${costs[t - 1] * 12})  案内: ${tipText}`);
}
check("10 種類の道路を敷くと、それぞれの建設費が引かれる", allOk);

// アップグレード: 3 行目の細道を大通りに
await page.click("#road-type-4");
const m1 = await money();
await click(page, cx(-3), cy(ROW0));
await click(page, cx(9), cy(ROW0));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("アップグレードは差額だけ引かれる", m1 - (await money()) === (1200000 - 300000) * 12, `${m1 - (await money())}`);

// パレットで種類を切り替える
await page.click("#road-type-5");
check("パレットで種類 5 に切り替わる", (await page.locator("#road-type-5.active").count()) === 1);
await page.click("#road-type-3");
check("パレットで種類 3 に戻せる", (await page.locator("#road-type-3.active").count()) === 1);

// 一方通行: Z で切り替え、敷くと矢印つきで描かれ、車は一方向に走る
await page.keyboard.press("2");
await page.click("#road-type-2");
check("一方通行ボタンがある", await page.isVisible("#road-oneway"));
await page.keyboard.press("z");
check("Z で一方通行になる", (await page.locator("#road-oneway.active").count()) === 1);
const m2 = await money();
await click(page, cx(-3), cy(ROW0 + 22));
await page.mouse.move(cx(9), cy(ROW0 + 22));
await page.waitForTimeout(150);
check("案内に一方通行と出る", (await page.textContent("#tip")).includes("一方通行"), await page.textContent("#tip"));
await click(page, cx(9), cy(ROW0 + 22));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("一方通行の道路も通常の建設費", m2 - (await money()) === 600000 * 12, `${m2 - (await money())}`);
await page.keyboard.press("z");
check("もう一度 Z で解除", (await page.locator("#road-oneway.active").count()) === 0);

// 曲線: C で切り替え、始点・制御点・終点の 3 クリックで敷く。撤去は一続きで消える
await page.keyboard.press("2");
await page.click("#road-type-2");
check("曲線ボタンがある", await page.isVisible("#road-curve"));
await page.keyboard.press("c");
check("C で曲線になる", (await page.locator("#road-curve.active").count()) === 1);
const m3 = await money();
const edgesBefore = Number(/edges=(\d+)/.exec(await page.textContent("#hud"))[1]);
await click(page, cx(-3), cy(ROW0 + 26));
await click(page, cx(5), cy(ROW0 + 22)); // 制御点
await page.mouse.move(cx(12), cy(ROW0 + 26));
await page.waitForTimeout(150);
check("曲線の案内に「曲線」と出る", (await page.textContent("#tip")).includes("曲線"), await page.textContent("#tip"));
await click(page, cx(12), cy(ROW0 + 26));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
const edgesAfter = Number(/edges=(\d+)/.exec(await page.textContent("#hud"))[1]);
check("曲線は細かい区間に分かれて敷かれ、お金が引かれる", edgesAfter - edgesBefore >= 5 && (await money()) < m3, `edges ${edgesBefore} -> ${edgesAfter}`);
await page.screenshot({ path: `${out}-2-curve.png` });
await page.keyboard.press("c");
await page.keyboard.press("3"); // 撤去
await click(page, cx(5), cy(ROW0 + 24));
await page.waitForTimeout(150);
const edgesGone = Number(/edges=(\d+)/.exec(await page.textContent("#hud"))[1]);
check("撤去すると曲線は一続きで消える", edgesGone === edgesBefore, `edges ${edgesAfter} -> ${edgesGone}`);

// 道路変更ツール: U。道路をなぞらずに、クリックだけでひとつながりの道路の種類を変える
await page.keyboard.press("u");
check("U で道路変更ツールになり、パレットが出る", (await page.locator("#tool-upgrade.active").count()) === 1 && (await page.isVisible("#road-palette")));
check("道路変更のときは一方通行・曲線のボタンが隠れる", !(await page.isVisible("#road-oneway")) && !(await page.isVisible("#road-curve")));
await page.click("#road-type-7");
const m6 = await money();
await page.mouse.move(cx(2), cy(ROW0 + 2));
await page.waitForTimeout(250);
const upTip = await page.textContent("#tip");
check("案内に、変える費用が出る", upTip.includes("に変える") && upTip.includes("円"), upTip);
await click(page, cx(2), cy(ROW0 + 2));
await page.waitForTimeout(200);
check("クリックだけで道路が変わり、差額が引かれる", m6 - (await money()) === (2000000 - 600000) * 12, `${m6 - (await money())}`);
await page.mouse.move(cx(2), cy(ROW0 + 2));
await page.waitForTimeout(250);
check("同じ種類にはもう変えられない", (await page.textContent("#tip")).includes("すでにその種類"), await page.textContent("#tip"));
// 橋とトンネル (シード 12345: 南の山の 3 タイル幅 (行 34, x=-1〜1) と、西の小さな水路 (行 30, x=-35〜-33))
await page.keyboard.press("2");
await page.click("#road-type-2");
const m4 = await money();
await click(page, cx(-4), cy(34));
await page.mouse.move(cx(4), cy(34));
await page.waitForTimeout(150);
check("山を抜ける案内にトンネルと出る", (await page.textContent("#tip")).includes("トンネル"), await page.textContent("#tip"));
await click(page, cx(4), cy(34));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
const tunnelCost = m4 - (await money());
check("トンネルの区間は高い (8 タイルの直線の 1.4 倍以上)", tunnelCost > 8 * 600000 * 1.4, `${tunnelCost}`);
await page.screenshot({ path: `${out}-3-tunnel.png` });

// 西の水路へ画面を動かして、橋を架ける
await page.keyboard.press("1");
await page.mouse.move(200, 600);
await page.mouse.down();
await page.mouse.move(200 + 480, 600, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.keyboard.press("2");
const m5 = await money();
const bx = (tx) => tx * 16 + 240 + 480 + 8;
await click(page, bx(-38), cy(30));
await page.mouse.move(bx(-31), cy(30));
await page.waitForTimeout(150);
check("水を渡る案内に橋と出る", (await page.textContent("#tip")).includes("橋"), await page.textContent("#tip"));
await click(page, bx(-31), cy(30));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("橋を架けるとお金が引かれる", m5 - (await money()) > 7 * 600000, `${m5 - (await money())}`);
await page.screenshot({ path: `${out}-4-bridge.png` });
// 水の中から始めると断られる
await click(page, bx(-34), cy(30));
await page.waitForTimeout(300);
check("水の上からは始められない (始点がつかない)", !(await page.isVisible("#tip")));
await page.keyboard.press("Escape");

await page.keyboard.press("1");
check("移動ツールに戻るとパレットが消える", !(await page.isVisible("#road-palette")));
await page.screenshot({ path: `${out}-1-all.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
