// 緑地 (公園・防音壁) と、折り返すツールバーのブラウザ動作確認。
import { buildBase, click, launch, makeChecker, paintZones, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-green";
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
await page.click("#speed button[data-speed='0']");

// ツールバーが画面に収まる (折り返す)
const box = await page.evaluate(() => {
  const r = document.getElementById("toolbar").getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
});
check("ツールバーが画面の幅に収まる", box.left >= 0 && box.right <= box.w, JSON.stringify(box));
check("緑地ボタンが押せる位置にある", await page.isVisible("#tool-green"));

await page.keyboard.press("x");
await page.waitForTimeout(250);
check("キー E で緑地ツール、パレットに公園と防音壁が出る", (await page.isVisible("#facility-palette")) && (await page.$$eval("#facility-palette button", (b) => b.map((x) => x.firstChild.textContent).join())) === "公園,防音壁");
let tip = await tipText();
check("公園の案内に費用と効果が出る", tip.includes("公園") && tip.includes("8,000,000") && tip.includes("大気汚染 −40%") && tip.includes("騒音 −30%") && tip.includes("半径 8"), tip);
await page.click("#facility-13");
await page.waitForTimeout(250);
tip = await tipText();
check("防音壁の案内は騒音だけ", tip.includes("防音壁") && tip.includes("騒音 −65%") && !tip.includes("大気汚染"), tip);

// パレットと案内が、折り返したツールバーに重ならない
const pal = await page.evaluate(() => document.getElementById("facility-palette").getBoundingClientRect().bottom);
check("パレットがツールバーの上に出る", pal <= box.top + 1, `palette.bottom=${pal} toolbar.top=${box.top}`);

// 建てる: 公園 (道路の北、商業と工業の間)
const m0 = (await read()).money;
await page.click("#facility-12");
await page.mouse.move(px(19) + 1, py(10) + 1);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-preview.png` });
await click(page, px(19) + 1, py(10) + 1);
const after = await read();
check("公園が建ち、建設費 800 万円が引かれる", m0 - after.money === 8_000_000, `${m0} -> ${after.money}`);
await page.click("#facility-13"); // 防音壁に切り替えて建てる
await click(page, px(22) + 1, py(10) + 1); // 公園 3×3 (x=18〜20) の隣
check("防音壁も建つ (建設費 600 万円)", after.money - (await read()).money === 6_000_000);
await page.keyboard.press("1");
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-2-built.png` });

// 保存して読み込むと元どおり
const n = (await read()).facilities;
await page.keyboard.press("m");
await page.click("#menu-save-1");
await page.keyboard.press("Escape");
await page.goto((process.argv[2] ?? "http://localhost:5173/").split("?")[0]);
await page.waitForSelector("#title-load-1");
await page.click("#title-load-1");
await page.waitForTimeout(600);
check("読み込むと施設の数が同じ", (await read()).facilities === n, `${n}`);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
