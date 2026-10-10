// タイトル画面 (マップ選択・シード指定) とセーブ・ロードのブラウザ動作確認。
import { GAME_URL, buildBase, launch, makeChecker } from "./lib.mjs";

const START_URL = process.argv[2] ?? GAME_URL; // 別ポートの開発サーバーを試すときは URL を渡せる
const BASE = START_URL.split("?")[0];
const { browser, page, errors } = await launch(START_URL);
const { check, finish } = makeChecker();

const hud = () => page.textContent("#hud");
const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const hudNum = async (key) => Number(new RegExp(`${key}=(\\d+)`).exec(await hud())[1]);
const visible = (id) => page.evaluate((i) => !document.getElementById(i).classList.contains("hidden"), id);
const startFromTitle = async () => {
  await page.goto(BASE);
  await page.waitForSelector(".map-card");
};

// 1. 街を作って保存する (?seed= 付きならタイトルを飛ばして始まる)
check("?seed= 付きならタイトルを飛ばして始まる", !(await visible("title")) && (await hudNum("seed")) === 12345);
await buildBase(page);
await page.click("#speed button[data-speed='0']"); // 資金が動かないよう一時停止
await page.waitForTimeout(400);
const before = { edges: await hudNum("edges"), facilities: await hudNum("facilities"), money: num(await page.textContent("#money")) };
check("街ができている (道路と施設)", before.edges > 0 && before.facilities === 4, JSON.stringify(before));
await page.keyboard.press("m");
check("キー M でメニューが開く", await visible("menu"));
await page.click("#menu-save-1");
check("スロット1に保存できる", (await page.textContent("#menu-msg")).includes("保存しました"), await page.textContent("#menu-msg"));
await page.keyboard.press("Escape");
check("Esc でメニューが閉じる", !(await visible("menu")));

// 2. タイトル画面: マップ選択
await startFromTitle();
check("タイトル画面に 5 つのマップが並ぶ", (await page.locator(".map-card").count()) === 5);
check("保存したスロットが「読込」できる", await page.evaluate(() => !document.getElementById("title-load-1").disabled));
check("空きスロットは読込できない", await page.evaluate(() => document.getElementById("title-load-2").disabled));
await page.click("#map-plains");
await page.waitForTimeout(300);
check("マップを選ぶとそのシードで始まる (大平原 = 31337)", !(await visible("title")) && (await hudNum("seed")) === 31337, await hud());
check("新しい街は道路も施設もない", (await hudNum("edges")) === 0 && (await hudNum("facilities")) === 0);

// 3. 読み込み: 保存した街が元どおりに戻る
await page.keyboard.press("m");
await page.click("#menu-title");
check("メニューからタイトルへ戻れる", await visible("title"));
await page.click("#title-load-1");
await page.waitForTimeout(400);
const after = { edges: await hudNum("edges"), facilities: await hudNum("facilities"), money: num(await page.textContent("#money")) };
check("読み込むと道路・施設・資金が復元される", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
check("読み込むと保存時のシードに戻る", (await hudNum("seed")) === 12345);
check("保存時の速度 (一時停止) が復元される", (await page.evaluate(() => document.querySelector("#speed button.active")?.dataset.speed)) === "0");

// 4. シード指定
await startFromTitle();
await page.click("#seed-start");
check("シードが空だと案内が出て始まらない", (await visible("title")) && (await page.textContent("#title-msg")).includes("入力"));
await page.fill("#seed-input", "777");
await page.click("#seed-start");
await page.waitForTimeout(300);
check("数字のシード (777) で始まる", (await hudNum("seed")) === 777, await hud());
await startFromTitle();
await page.fill("#seed-input", "さくら");
await page.click("#seed-start");
await page.waitForTimeout(300);
const s1 = await hudNum("seed");
await startFromTitle();
await page.fill("#seed-input", "さくら");
await page.click("#seed-start");
await page.waitForTimeout(300);
check("言葉のシードは毎回同じ値になる", s1 > 0 && s1 === (await hudNum("seed")), `seed=${s1}`);

// 5. 壊れたセーブデータでも落ちない
await page.evaluate(() => localStorage.setItem("ccim.save.2", "{壊れている"));
await startFromTitle();
const slot2 = await page.evaluate(() => document.querySelectorAll("#title-slots .slot")[1].textContent);
check("壊れたスロットは理由が表示され、読込できない", slot2.includes("壊れ") && (await page.evaluate(() => document.getElementById("title-load-2").disabled)), slot2);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await page.screenshot({ path: "e2e/out-saveload.png" });
await finish(browser);
