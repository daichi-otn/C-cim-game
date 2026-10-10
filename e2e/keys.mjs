// 使い方と操作キーの設定: メニューに使い方が出る、キーを変えると道具が新しいキーで動く、入れ替え・取り消し・初期設定・再読み込み後も残る。
import { launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-keys";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const row = (name) => page.locator("#key-table .key-row", { hasText: name }).first();
const kbdOf = (sel) => page.textContent(`${sel} kbd`);
const isActive = (sel) => page.evaluate((s) => document.querySelector(s).classList.contains("active"), sel);

await page.click("#speed button[data-speed='0']");
await page.keyboard.press("m");
await page.waitForTimeout(200);
await page.click("#menu-help");
await page.waitForTimeout(200);
check("メニューから使い方が開く", await page.isVisible("#help"));
check("使い方の文章がある", (await page.textContent("#help-guide")).includes("街づくりの流れ"));
check("操作キーの一覧がある", (await page.locator("#key-table .key-row").count()) > 30);

// 住宅ツールを N に変える
await row("住宅").locator("button").click();
await page.waitForTimeout(100);
check("変更中の表示になる", (await row("住宅").locator("button").textContent()).includes("押す"));
await page.keyboard.press("n");
await page.waitForTimeout(200);
check("新しいキーが一覧に出る", (await row("住宅").locator("kbd").textContent()) === "N");
await page.screenshot({ path: `${out}-1-keys.png` });

await page.click("#help-close");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("ツールバーの表示も N になる", (await kbdOf("#tool-zoneR")) === "N");
await page.keyboard.press("n");
await page.waitForTimeout(200);
check("N で住宅ツールになる", await isActive("#tool-zoneR"));
await page.keyboard.press("1");
await page.waitForTimeout(150);
await page.keyboard.press("4");
await page.waitForTimeout(200);
check("古いキー 4 では、もう住宅にならない", !(await isActive("#tool-zoneR")) && (await isActive("#tool-pan")));

// 使われているキーを選ぶと入れ替わる (住宅 N と 商業 5)
await page.keyboard.press("m");
await page.click("#menu-help");
await page.waitForTimeout(150);
await row("住宅").locator("button").click();
await page.keyboard.press("5");
await page.waitForTimeout(200);
check("入れ替えの案内が出る", (await page.textContent("#key-msg")).includes("入れ替え"));
check("商業が N になる", (await row("商業").locator("kbd").textContent()) === "N");

// 取り消し (Esc)
await row("工業").locator("button").click();
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("Esc で変更を取り消す", (await page.textContent("#key-msg")).includes("取り消し"));
check("工業のキーは変わらない", (await row("工業").locator("kbd").textContent()) === "6");

// 初期設定に戻す
await page.click("#key-reset");
await page.waitForTimeout(150);
check("初期設定に戻すと住宅は 4 に戻る", (await row("住宅").locator("kbd").textContent()) === "4");
check("ツールバーも 4 に戻る", (await kbdOf("#tool-zoneR")) === "4");

// 再読み込み後も残る
await row("住宅").locator("button").click();
await page.keyboard.press("n");
await page.waitForTimeout(150);
await page.click("#help-close");
await page.reload();
await page.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await page.waitForTimeout(500);
check("再読み込みしても N のまま", (await kbdOf("#tool-zoneR")) === "N");
await page.click("#speed button[data-speed='0']");
await page.keyboard.press("n");
await page.waitForTimeout(200);
check("再読み込み後も N で住宅ツール", await isActive("#tool-zoneR"));

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
