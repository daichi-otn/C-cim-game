// 公共サービス (警察署・消防署・病院・学校) のブラウザ動作確認。
import { buildBase, launch, makeChecker, paintZones, placeFacility, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-services";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const read = async () => {
  await page.waitForTimeout(250);
  const hud = await page.textContent("#hud");
  return {
    facilities: +/facilities=(\d+)/.exec(hud)[1],
    money: num(await page.textContent("#money")),
    happiness: num(await page.textContent("#happiness")),
    coverage: await page.textContent("#coverage"),
    activeTool: await page.evaluate(() => document.querySelector("#toolbar button.active")?.dataset.tool),
  };
};
const tipText = async () => ((await page.isVisible("#tip")) ? await page.textContent("#tip") : "");

await buildBase(page);
await paintZones(page);
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(9000); // 建物が建つまで待つ
await page.click("#speed button[data-speed='0']");

let s = await read();
check("サービス施設がなければ幸福度は 50% 以下 (汚染があれば下がる)", s.happiness <= 50, `${s.happiness}%`);
check("範囲の欄に 4 つのサービスが出る", ["治安", "消防", "医療", "教育"].every((n) => s.coverage.includes(n)), s.coverage);
check("施設がなければどれも 0%", !/[1-9]\d*%/.test(s.coverage.replace(/-/g, "")), s.coverage);

// ツールとキー (大文字小文字どちらでも)
await page.keyboard.press("p");
s = await read();
check("キー P で警察署ツール", s.activeTool === "police", s.activeTool);
await page.mouse.move(px(17), py(10));
await page.waitForTimeout(250);
const tip = await tipText();
check("案内に建設費と届く距離が出る", tip.includes("警察署") && tip.includes("20,000,000") && tip.includes("半径 12"), tip);
await page.keyboard.press("Shift+I");
s = await read();
check("キー Shift+I でも消防署ツール", s.activeTool === "fire", s.activeTool);

// 建てる: 道路 (12 行目) の北側、商業と工業の間
const m0 = (await read()).money;
await placeFacility(page, "p", 16, 9);
await placeFacility(page, "i", 18, 9);
await placeFacility(page, "h", 20, 9);
await placeFacility(page, "k", 23, 9); // 病院は 3×3 (x=20〜22) なので、その隣
await page.keyboard.press("1");
s = await read();
check("4 つ建って施設が合計 8 になる", s.facilities === 8, `facilities=${s.facilities}`);
check("建設費 (2,000 万 + 2,200 万 + 4,000 万 + 2,500 万 = 1 億 700 万) がかかる", m0 - s.money === 107_000_000, `${m0} -> ${s.money}`);
check("サービスが届き、幸福度が 50% を超える", s.happiness > 50, `${s.happiness}%  ${s.coverage}`);
check("範囲の欄に 0% 以外が出る", /[1-9]\d*%/.test(s.coverage), s.coverage);

// 範囲のプレビューが描かれる (建設前に円が見える)
await page.keyboard.press("h");
await page.mouse.move(px(8), py(6));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-1-preview.png` });
await page.keyboard.press("1");

// 保存して読み込むと、公共サービス施設も元どおり
await page.keyboard.press("m");
await page.click("#menu-save-1");
await page.keyboard.press("Escape");
await page.goto((process.argv[2] ?? "http://localhost:5173/").split("?")[0]);
await page.waitForSelector("#title-load-1");
await page.click("#title-load-1");
await page.waitForTimeout(600);
const after = await read();
check("読み込むと公共サービス施設と幸福度が復元される", after.facilities === 8 && after.happiness === s.happiness, JSON.stringify(after));
await page.screenshot({ path: `${out}-2-built.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
