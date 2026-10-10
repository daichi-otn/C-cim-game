// チュートリアルのブラウザ動作確認。タイトルから始め、実際に操作して手順を進める。
import { launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-tutorial";
const base = process.argv[2] ?? "http://localhost:5173/";
const { browser, page, errors } = await launch(base.includes("?") ? base : base + "?seed=12345");
const { check, finish } = makeChecker();

// タイトル画面から始める (?seed なしで開き直す)
await page.goto(base.split("?")[0]);
await page.waitForSelector("#tutorial-start");
check("タイトルにチュートリアルのボタンがある", await page.isVisible("#tutorial-start"));
check("初回は「クリア済み」と出ない", !(await page.isVisible("#tutorial-note")));
await page.click("#tutorial-start");
await page.waitForTimeout(500);

const title = async () => (await page.textContent("#tut-title")).trim();
const count = async () => (await page.textContent("#tut-count")).trim();
const waitStep = async (t) => page.waitForFunction((x) => document.getElementById("tut-title")?.textContent.trim() === x, t, { timeout: 8000 }).then(() => true, () => false);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(90); };

check("チュートリアルが始まり、時間は止まっている", (await waitStep("ようこそ、市長さん")) && (await page.evaluate(() => document.querySelector("#speed button.active")?.dataset.speed)) === "0");
check("手順の番号が出る", (await count()).startsWith("1 / "), await count());

await page.click("#tut-next");
check("次へで進む", await waitStep("画面を動かす"));

// 画面を動かす + ズーム
await page.mouse.move(900, 500);
await page.mouse.down();
await page.mouse.move(700, 450, { steps: 8 });
await page.mouse.up();
await page.mouse.move(640, 300);
await page.mouse.wheel(0, -100);
await page.waitForTimeout(200);
await page.mouse.wheel(0, 100); // もとに近い倍率に戻してから
await page.waitForTimeout(100);
await page.mouse.wheel(0, 100);
await page.waitForTimeout(100);
await page.mouse.wheel(0, 100);
await page.waitForTimeout(100);
await page.mouse.wheel(0, -100); // 少しだけ縮小した倍率にする
check("画面を動かしてズームすると自動で進む", await waitStep("道路を引く"));
check("道路ボタンが強調される", await page.evaluate(() => document.getElementById("tool-road").classList.contains("hint")));

// 道路 (画面中央を横切る 25 タイルほど)
await page.keyboard.press("2");
await click(380, 360);
await click(780, 360);
await page.keyboard.press("Escape");
check("道路を引くと進む", await waitStep("道路の種類"));

// 道路の種類: 大通りを選んで同じ道路をなぞる
await page.keyboard.press("2");
await page.click("#road-type-4");
await click(380, 360);
await click(780, 360);
await page.keyboard.press("Escape");
check("道路をアップグレードすると進む", await waitStep("住宅ゾーンを塗る"));

// 住宅 (道路の南)、商業 (北)、工業 (南の東)
await page.keyboard.press("4");
await click(400, 380);
await click(480, 420);
check("住宅を塗ると進む", await waitStep("商業と工業を塗る"));
await page.keyboard.press("5");
await click(520, 300);
await click(600, 340);
await page.keyboard.press("6");
await click(700, 380);
await click(780, 420);
check("商業と工業を塗ると進む", await waitStep("電気・水道・下水"));

// 施設: 発電所と下水処理場を建て、給水(水辺が必要)は飛ばす
await page.keyboard.press("8");
await click(430, 326);
await page.keyboard.press("0");
await click(700, 326);
await page.keyboard.press("1");
await page.waitForTimeout(200);
check("水辺がなくて給水を建てられなくても、手順を飛ばせる", (await title()) === "電気・水道・下水" && (await page.textContent("#tut-next")).includes("飛ばす"));
await page.click("#tut-next");
check("飛ばすと次の手順になる", await waitStep("外部接続"));
await page.keyboard.press("-");
await click(470, 326);
check("外部接続を建てると進む", await waitStep("街が育つのを見る"));

// 時間を動かす: 人口が 20 を超えるまで
await page.click("#speed button[data-speed='4']");
const grew = await page.waitForFunction(() => document.getElementById("title-wait")?.textContent ?? "", null, { timeout: 100 }).catch(() => null);
void grew;
await page.waitForFunction(() => document.getElementById("tut-title")?.textContent.trim() !== "街が育つのを見る", null, { timeout: 40000 }).catch(() => {});
await page.screenshot({ path: `${out}-1-grow.png` });
const afterGrow = await title();
if (afterGrow === "街が育つのを見る") await page.click("#tut-next"); // 住民が足りなくても、先へ進む
await page.click("#speed button[data-speed='0']");
check("需要と税率の手順になる", await waitStep("需要と税率"));
await page.click("#tax-up");
check("税率を変えると進む", await waitStep("公共サービス"));
await page.screenshot({ path: `${out}-2-services.png` });

// 残りは次へ・メニューで進める
await page.click("#tut-next");
check("渋滞と環境の手順", await waitStep("渋滞と環境"));
await page.click("#tut-next");
check("保存と再開の手順", await waitStep("保存と再開"));
await page.keyboard.press("m");
check("メニューを開くと進む", await waitStep("チュートリアル完了!"));
await page.keyboard.press("Escape");
check("最後の手順のボタンは「終了」", (await page.textContent("#tut-next")).trim() === "終了");
await page.click("#tut-next");
await page.waitForTimeout(300);
check("終了するとパネルが消える", !(await page.isVisible("#tutorial")));
check("クリア済みが記録される", await page.evaluate(() => localStorage.getItem("ccim.tutorial.done") === "1"));

// タイトルを開き直すと「クリア済み」
await page.keyboard.press("m");
await page.click("#menu-title");
check("タイトルに「クリア済み」と出る", await page.isVisible("#tutorial-note"));

// 途中で「やめる」
await page.click("#tutorial-start");
await page.waitForTimeout(300);
check("もう一度始められる", await waitStep("ようこそ、市長さん"));
await page.click("#tut-close");
check("やめるとパネルが消え、クリア済みは保たれる", !(await page.isVisible("#tutorial")));

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
