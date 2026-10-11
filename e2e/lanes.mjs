// 道路の車線: 道路ツールのパレットに 4 つの車線ボタンがあり、押して引いた道路に車線が付く。エラーは出ない。
import { click, cx, cy, launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-lanes";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await page.click("#speed button[data-speed='0']");
await page.keyboard.press("2");
await page.waitForTimeout(150);
check("道路のパレットに車線の 4 つのボタンがある", (await page.locator("#road-lane-1, #road-lane-2, #road-lane-4, #road-lane-8").count()) === 4);
await page.click("#road-lane-8");
await page.waitForTimeout(100);
check("自転車レーンを押すと、ボタンがオンになる", await page.evaluate(() => document.getElementById("road-lane-8").classList.contains("active")));
const before = Number((await page.textContent("#hud")).match(/edges=(\d+)/)?.[1] ?? -1);
await click(page, cx(2), cy(22));
await click(page, cx(20), cy(22));
await page.waitForTimeout(250);
const after = Number((await page.textContent("#hud")).match(/edges=(\d+)/)?.[1] ?? -1);
check("車線つきの道路が引ける", after > before, `${before} -> ${after}`);
await page.screenshot({ path: `${out}-1-lanes.png` });
check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
