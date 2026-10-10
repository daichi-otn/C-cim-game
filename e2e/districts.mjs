// 地区 (ディストリクト) のブラウザ動作確認: Y で囲んで作る、パネルで名前・税率・建てられる密度を決める、消す。
import { buildBase, click, cx, cy, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-districts";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']");
await buildBase(page);
await paintZones(page);

await page.keyboard.press("y");
await page.waitForTimeout(150);
check("Y で地区ツールに切り替わる", (await page.getAttribute("#tool-district", "class"))?.includes("active") ?? false);
check("地区のボタンがある", await page.isVisible("#tool-district"));

// 2 回クリックで囲む (道路の北側の空きの広場)
await click(page, cx(2), cy(6));
await click(page, cx(9), cy(8));
await page.waitForTimeout(250);
const names = await page.$$eval("#districts .nm", (els) => els.map((e) => e.textContent));
check("地区が 1 つできて、一覧に出る", names.length === 1, names.join(","));
check("財布の額が出る", (await page.textContent("#districts .dist span:last-child")).includes("円"));

// 作ったばかりの地区は、設定が開いている
check("設定 (名前・税率・密度) が開く", (await page.$$("#districts .detail")).length === 1);
await page.fill("#districts .detail input[type=text]", "  中央  ");
await page.$eval("#districts .detail input[type=text]", (el) => el.dispatchEvent(new Event("change")));
await page.waitForTimeout(200);
check("名前が変わる", (await page.textContent("#districts .nm")) === "中央");

// 税率の ＋ で、市と同じ税率から 1% 上がって、個別の税率になる
const taxBefore = await page.textContent("#districts .detail .row b");
await page.click("#districts .detail .row button:last-child");
await page.waitForTimeout(200);
const taxAfter = await page.textContent("#districts .detail .row b");
check("税率を ＋ で変えられる", taxBefore !== taxAfter, `${taxBefore} -> ${taxAfter}`);

// 高い密度 (高) を建てさせない
const highBox = page.locator("#districts .detail label").filter({ hasText: /^高$/ }).locator("input");
await highBox.uncheck();
await page.waitForTimeout(200);
check("高い密度の規制をオフにできる", !(await highBox.isChecked()));

// 色を変える (次の色へ)
const swatchBefore = await page.$eval("#districts .sw", (el) => el.style.background);
await page.click("#districts .sw");
await page.waitForTimeout(200);
const swatchAfter = await page.$eval("#districts .sw", (el) => el.style.background);
check("地区の色を変えられる", swatchBefore !== swatchAfter);

// 木の多さを「多い」に変える
await page.locator("#districts .detail button", { hasText: "多い" }).click();
await page.waitForTimeout(200);
check("木の多さを変えられる", await page.locator("#districts .detail button", { hasText: "多い" }).evaluate((el) => el.classList.contains("active")));

await page.screenshot({ path: `${out}-1-panel.png` });

// 消す
await page.click("#districts button:has-text('地区を消す')");
await page.waitForTimeout(200);
check("消すと一覧から外れる", (await page.$$("#districts .nm")).length === 0);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
