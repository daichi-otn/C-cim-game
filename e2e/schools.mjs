// 学校 4 種類 (小学校・中学校・高校・大学) と、施設の種類パレットのブラウザ動作確認。
import { buildBase, click, launch, makeChecker, paintZones, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-schools";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const read = async () => {
  await page.waitForTimeout(250);
  const hud = await page.textContent("#hud");
  return { facilities: +/facilities=(\d+)/.exec(hud)[1], money: num(await page.textContent("#money")) };
};
const tipText = async () => ((await page.isVisible("#tip")) ? await page.textContent("#tip") : "");
const paletteNames = async () => page.$$eval("#facility-palette button", (bs) => bs.map((b) => b.firstChild.textContent));

await buildBase(page);
await paintZones(page);
await page.click("#speed button[data-speed='0']");

check("移動ツールのときは、施設のパレットは出ない", !(await page.isVisible("#facility-palette")));
await page.keyboard.press("p");
check("警察署のように 1 種類のツールでも、パレットは出ない", !(await page.isVisible("#facility-palette")));
await page.keyboard.press("k");
await page.waitForTimeout(250);
check("学校ツールで、施設のパレットが出る", await page.isVisible("#facility-palette"));
const names = await paletteNames();
check("小学校・中学校・高校・大学が並ぶ", JSON.stringify(names) === JSON.stringify(["小学校", "中学校", "高校", "大学"]), names.join(","));
check("最初は小学校が選ばれている", (await page.getAttribute("#facility-8", "class"))?.includes("active") ?? false);

// ] で次の種類へ
await page.click("#facility-9");
await page.waitForTimeout(250);
let tip = await tipText();
check("パレットで中学校に変わり、案内に費用と半径が出る", tip.includes("中学校") && tip.includes("30,000,000") && tip.includes("半径 16"), tip);
await page.click("#facility-11");
await page.waitForTimeout(250);
tip = await tipText();
check("パレットで大学に切り替わる", tip.includes("大学") && tip.includes("60,000,000") && tip.includes("半径 26"), tip);

// パレットのボタンで高校を選ぶ
await page.click("#facility-10");
await page.waitForTimeout(250);
tip = await tipText();
check("パレットのクリックで高校を選べる", tip.includes("高校") && tip.includes("36,000,000") && tip.includes("オフィスの需要"), tip);

// プレビューに範囲の円が出る
await page.mouse.move(px(19) + 1, py(10) + 1);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-preview.png` });

// 大学を建てる
const m0 = (await read()).money;
await page.click("#facility-11");
await click(page, px(19) + 1, py(10) + 1); // 左上が (18,9) の位置 (道路の北、商業と工業の間)
const after = await read();
check("大学が建ち、建設費 6,000 万円が引かれる", m0 - after.money === 60_000_000, `${m0} -> ${after.money}`);
await page.keyboard.press("1");
await page.waitForTimeout(250);
check("移動ツールに戻るとパレットが消える", !(await page.isVisible("#facility-palette")));

// 保存して読み込むと、大学も元どおり
const before = (await read()).facilities;
await page.keyboard.press("m");
await page.click("#menu-save-1");
await page.keyboard.press("Escape");
await page.goto((process.argv[2] ?? "http://localhost:5173/").split("?")[0]);
await page.waitForSelector("#title-load-1");
await page.click("#title-load-1");
await page.waitForTimeout(600);
check("読み込むと施設の数が同じ", (await read()).facilities === before, `${before}`);
await page.screenshot({ path: `${out}-2-built.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
