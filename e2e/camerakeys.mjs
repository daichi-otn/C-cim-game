// キーボードの視点操作 (WASD・QE・RF) と、道具のキーの割り当てのブラウザ動作確認。
import { launch, makeChecker } from "./lib.mjs";

const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const pos = async () => {
  const hud = await page.textContent("#hud");
  const m = /pos=\((-?\d+), (-?\d+)\)/.exec(hud);
  return { x: +m[1], y: +m[2] };
};
const hold = async (key, ms = 500) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
};

const p0 = await pos();
await hold("d");
const p1 = await pos();
check("D を押すと視点が右へ動く", p1.x !== p0.x, `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
await hold("s");
const p2 = await pos();
check("S を押すと視点が手前 (南) へ動く", p2.y !== p1.y, `${JSON.stringify(p1)} -> ${JSON.stringify(p2)}`);
await hold("w", 300);
await hold("a", 300);
const p3 = await pos();
check("W と A でも動く", p3.x !== p2.x || p3.y !== p2.y, JSON.stringify(p3));

// 道具のキーを移したあとも、正しい道具が選ばれる
await page.keyboard.press("k");
const t1 = await page.evaluate(() => document.querySelector("#toolbar button.active")?.dataset.tool);
check("キー K で学校の道具", t1 === "school", t1);
await page.keyboard.press("i");
const t2 = await page.evaluate(() => document.querySelector("#toolbar button.active")?.dataset.tool);
check("キー I で消防署の道具", t2 === "fire", t2);
await page.keyboard.press("x");
const t3 = await page.evaluate(() => document.querySelector("#toolbar button.active")?.dataset.tool);
check("キー X で緑地の道具", t3 === "green", t3);
await page.keyboard.press("1");

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
