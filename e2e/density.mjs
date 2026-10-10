// 区画の種類 (密度・オフィス・道路の太さとの関係) のブラウザ動作確認。
import { buildBase, click, cx, cy, dragRect, launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-density";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const stats = async () => {
  const hud = await page.textContent("#hud");
  const n = (re) => Number(re.exec(hud)[1]);
  return { zones: { R: n(/zones: R=(\d+)/), O: n(/offices: zones=(\d+)/) }, built: { R: n(/buildings: R=(\d+)/) } };
};

await buildBase(page);
check("オフィスのツールがある", await page.isVisible("#tool-zoneO"));
check("ゾーンツール以外ではパレットが出ない", !(await page.isVisible("#zone-palette")));

await page.keyboard.press("4");
check("住宅ツールで密度のパレットが出る (低・中・高・超高の 4 つ)", (await page.isVisible("#zone-palette")) && (await page.locator("#zone-palette button").count()) === 4);
check("最初は中密度が選ばれている", (await page.locator("#zone-density-2.active").count()) === 1);
await page.mouse.move(cx(2), cy(10));
await page.waitForTimeout(150);
check("案内に中密度住宅と必要な道路が出る", (await page.textContent("#tip")).includes("中密度住宅"), await page.textContent("#tip"));
await page.click("#zone-density-3");
check("パレットで高密度に切り替わる", (await page.locator("#zone-density-3.active").count()) === 1);
check("案内に高密度住宅と大通りが出る", (await page.textContent("#tip")).includes("高密度住宅") && (await page.textContent("#tip")).includes("大通り"), await page.textContent("#tip"));

// 高密度の住宅 (南側)、中密度の商業 (北側)、低密度のオフィス (北側)、低密度の工業 (南の東)
await dragRect(page, 0, 13, 3, 15);
await page.keyboard.press("5");
await dragRect(page, 9, 9, 12, 11);
await page.keyboard.press("b");
check("B でオフィスツールになり、密度が選べる", (await page.locator("#tool-zoneO.active").count()) === 1 && (await page.locator("#zone-palette button").count()) === 4);
await page.click("#zone-density-1");
await dragRect(page, 14, 9, 17, 11);
await page.keyboard.press("6");
await page.click("#zone-density-1");
await dragRect(page, 19, 13, 22, 15);
await page.keyboard.press("1");
check("ツールを切り替えるとパレットが消える", !(await page.isVisible("#zone-palette")));

await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(9000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
let s = await stats();
const notices = await page.textContent("#notices");
check("高密度の区画は細い道路では建たず、案内が出る", s.built.R === 0 && notices.includes("道路が細くて"), `${JSON.stringify(s)} / ${notices.slice(0, 60)}`);
await page.screenshot({ path: `${out}-1-narrow.png` });

// 道路を大通りにすると建ちはじめる
await page.keyboard.press("2");
await page.click("#road-type-4");
await click(page, cx(-7), cy(12));
await click(page, cx(25), cy(12));
await page.keyboard.press("Escape");
await page.keyboard.press("1");
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(12000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
s = await stats();
check("道路を大通りにすると高密度の住宅が建つ", s.built.R > 0, JSON.stringify(s));
check("オフィスの需要バーがある", await page.isVisible("#bar-o"));
await page.screenshot({ path: `${out}-2-towers.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
