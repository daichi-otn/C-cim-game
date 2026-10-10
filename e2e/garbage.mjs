// ごみ処理場とパネルの「ごみ」欄のブラウザ動作確認。
import { buildBase, click, launch, makeChecker, paintZones, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-garbage";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const read = async () => {
  await page.waitForTimeout(250);
  const hud = await page.textContent("#hud");
  return { facilities: +/facilities=(\d+)/.exec(hud)[1], money: num(await page.textContent("#money")) };
};
const tipText = async () => ((await page.isVisible("#tip")) ? await page.textContent("#tip") : "");

await buildBase(page);
await paintZones(page);
check("パネルに「ごみ」欄がある", (await page.textContent("#util-garbage")) !== null);
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(9000); // 建物が建つまで待つ
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
const before = await page.textContent("#util-garbage");
check("ごみ処理場がないと、ごみの量と「処理場なし」が出る", /\d+ \(処理場なし\)/.test(before) || before === "なし", before);

await page.keyboard.press("g");
await page.waitForTimeout(250);
check("キー G でごみ処理場ツール", (await page.evaluate(() => document.querySelector("#toolbar button.active")?.dataset.tool)) === "garbage");
check("1 種類だけなので、パレットは出ない", !(await page.isVisible("#facility-palette")));
const tip = await tipText();
check("案内に費用と処理量が出る", tip.includes("ごみ処理場") && tip.includes("28,000,000") && tip.includes("300 処理"), tip);

const m0 = (await read()).money;
await page.mouse.move(px(19) + 1, py(10) + 1);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-preview.png` });
await click(page, px(19) + 1, py(10) + 1);
const s = await read();
check("ごみ処理場が建ち、建設費 2,800 万円が引かれる", m0 - s.money === 28_000_000, `${m0} -> ${s.money}`);
await page.keyboard.press("1");
await page.waitForTimeout(500);
const after = await page.textContent("#util-garbage");
check("処理量 300 が出る (「使用 / 300」)", /^\d+ \/ 300$/.test(after), after);
await page.screenshot({ path: `${out}-2-built.png` });

// 保存して読み込んでも残る
const n = s.facilities;
await page.keyboard.press("m");
await page.click("#menu-save-1");
await page.keyboard.press("Escape");
await page.goto((process.argv[2] ?? "http://localhost:5173/").split("?")[0]);
await page.waitForSelector("#title-load-1");
await page.click("#title-load-1");
await page.waitForTimeout(800);
check("読み込むと施設の数とごみの処理量が同じ", (await read()).facilities === n && (await page.textContent("#util-garbage")).endsWith("/ 300"), `${n} ${await page.textContent("#util-garbage")}`);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
