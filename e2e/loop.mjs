// 四角い道路: J で切り替え、2 つの角で枠を敷く、区切りの道路が増える、長さと角度・費用の表示が出る。
import { buildBase, click, cx, cy, launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-loop";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
const roads = async () => {
  const t = await page.textContent("#hud");
  const m = t.match(/edges=(\d+)/);
  return m ? Number(m[1]) : -1;
};

await page.click("#speed button[data-speed='0']");
await buildBase(page);
await page.keyboard.press("j");
await page.waitForTimeout(150);
check("J で四角道路ツールに切り替わる", await page.evaluate(() => document.getElementById("tool-loop").classList.contains("active")));
check("区切りのパレットが出る", await page.isVisible("#loop-palette"));

// 2 つの角 (南側の広場): 1 回目の角
const before = await roads();
await click(page, cx(2), cy(20));
await page.mouse.move(cx(16), cy(26));
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}-1-preview.png` });
check("枠の長さ (m) が表示される", (await page.textContent("#loop-labels")).includes(" m"));
check("角度 90° が表示される", (await page.textContent("#loop-labels")).includes("90°"));
await click(page, cx(16), cy(26));
await page.waitForTimeout(250);
const afterRing = await roads();
check("枠を敷くと道路が増える", afterRing > before, `${before} -> ${afterRing}`);

// 区切りを 2 本にして、もう一度
await page.locator("#loop-palette button", { hasText: "区画 6 マス" }).click();
await click(page, cx(20), cy(20));
await page.mouse.move(cx(34), cy(27));
await page.waitForTimeout(150);
await click(page, cx(34), cy(27));
await page.waitForTimeout(250);
const afterDiv = await roads();
check("区切りの道路が増える", afterDiv > afterRing, `${afterRing} -> ${afterDiv}`);
await page.screenshot({ path: `${out}-2-built.png` });

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
