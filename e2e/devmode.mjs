// 開発者モード (すべての条件を無視する) のブラウザ動作確認。
import { click, cx, cy, dragRect, launch, makeChecker, panRight } from "./lib.mjs";

const url = process.argv[2] ?? "http://localhost:5173/?seed=12345";
const { browser, page, errors } = await launch(url);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const hud = async () => page.textContent("#hud");
const stat = async (re) => +re.exec(await hud())[1];

// 通常モード: 道路と区画だけでは、建物は建たない
await page.keyboard.press("1");
await panRight(page);
await page.keyboard.press("2");
await click(page, cx(-7), cy(12));
await click(page, cx(25), cy(12));
await page.keyboard.press("Escape");
await page.keyboard.press("4");
await dragRect(page, 0, 13, 9, 15);
await page.keyboard.press("1");
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(6000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
check("通常モードでは、施設がないので建物が建たない", (await stat(/buildings: R=(\d+)/)) === 0, await hud());

// メニューで開発者モードをオンにする
await page.keyboard.press("m");
await page.waitForTimeout(200);
check("メニューに開発者モードのチェックがある", await page.isVisible("#menu-dev"));
check("初めはオフ", !(await page.isChecked("#menu-dev")));
await page.check("#menu-dev");
await page.waitForTimeout(200);
check("オンにした案内が出る", (await page.textContent("#menu-msg")).includes("開発者モードをオンにしました"), await page.textContent("#menu-msg"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("パネルの案内に開発者モードと出る", (await page.textContent("#notices")).includes("開発者モード"), await page.textContent("#notices"));

await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(8000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);
const b = await stat(/buildings: R=(\d+)/);
check("電力・水道・下水・外部接続がなくても、建物が建つ", b > 0, `R buildings=${b}`);
check("住民が入る", num(await page.textContent("#pop")) > 0, await page.textContent("#pop"));
check("住民の健康は良好、病人はいない", (await page.textContent("#health")) === "良好", await page.textContent("#health"));
check("幸福度は 100%", (await page.textContent("#happiness")).includes("100"), await page.textContent("#happiness"));
check("住宅需要は最大 (バーが右いっぱい)", (await page.$eval("#bar-r", (e) => e.style.width)) === "50%");

// お金が減らない: 道路を敷いても資金が変わらない
const m1 = num(await page.textContent("#money"));
await page.keyboard.press("2");
await click(page, cx(0), cy(18));
await click(page, cx(20), cy(18));
await page.keyboard.press("Escape");
await page.keyboard.press("1");
await page.waitForTimeout(300);
check("道路を敷いても、お金は減らない", num(await page.textContent("#money")) === m1, `${m1} -> ${await page.textContent("#money")}`);
await page.screenshot({ path: `${process.argv[3] ?? "e2e/out-devmode"}.png` });

// オフに戻す
await page.keyboard.press("m");
await page.uncheck("#menu-dev");
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("オフにすると、通常の案内 (供給のない建物など) が戻る", !(await page.textContent("#notices")).includes("開発者モード"), await page.textContent("#notices"));

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
