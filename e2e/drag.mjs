// ドラッグで道路・区画を作る動作確認。押した点から離した点まで、1 回のドラッグで作れることを見る。
import { cx, cy, launch, makeChecker, panRight } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-drag";
const base = process.argv[2] ?? "http://localhost:5173/";
const { browser, page, errors } = await launch(base.includes("?") ? base : base + "?seed=12345");
const { check, finish } = makeChecker();

await page.waitForTimeout(800);
await panRight(page);
const money = async () => Number((await page.textContent("#money")).replace(/[^0-9]/g, ""));
const drag = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
};

// 時間を止めて、道路をドラッグで引く
await page.click("#speed button[data-speed='0']").catch(() => {});
await page.keyboard.press("2");
const m0 = await money();
await drag(cx(-3), cy(3), cx(9), cy(3));
const m1 = await money();
check("道路をドラッグで引くと、お金がかかる", m1 < m0, `${m0} -> ${m1}`);

// 続けて、別の場所をドラッグする (前の道路の終点からではなく、押した点から)
await drag(cx(-3), cy(5), cx(9), cy(5));
const m2 = await money();
check("続けてもう一本、ドラッグで引ける", m2 < m1, `${m1} -> ${m2}`);

// 区画: 住宅を、ドラッグで塗る (道路のそば)
await page.keyboard.press("Escape");
await page.keyboard.press("4");
await drag(cx(0), cy(6), cx(5), cy(8));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-zone.png` });
check("区画をドラッグで塗れる (画面を確認)", true);

// クリック 2 回 (従来の操作) も変わらず使える
await page.keyboard.press("Escape");
await page.keyboard.press("2");
const m3 = await money();
await page.mouse.click(cx(-3), cy(12));
await page.mouse.click(cx(9), cy(12));
await page.waitForTimeout(250);
check("クリック 2 回でも道路が引ける", (await money()) < m3);
check("コンソールエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
