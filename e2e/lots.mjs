// 複数マスの建物 (区画の密度ごとに大きさが違い、見た目はランダム) のブラウザ動作確認。
import { buildBase, click, cx, cy, dragRect, launch, makeChecker } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-lots";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const hud = async () => page.textContent("#hud");
const stat = async (re) => +re.exec(await hud())[1];

await buildBase(page);
// 道路の南北に、中密度の住宅と商業を広めに塗る (キー 4 / 5 のあと、パレットは中密度が初期値)
await page.keyboard.press("4");
await dragRect(page, -4, 13, 3, 17); // 住宅 (道路の南)
await page.keyboard.press("5");
await dragRect(page, -4, 7, 14, 11); // 商業 (道路の北)
await page.keyboard.press("1");
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(15000);
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);

const zonesR = await stat(/zones: R=(\d+)/);
const bR = await stat(/buildings: R=(\d+)/);
const zonesC = await stat(/zones: R=\d+ C=(\d+)/);
const bC = await stat(/buildings: R=\d+ C=(\d+)/);
console.log({ zonesR, bR, zonesC, bC });
check("住宅が建っている", bR > 0, `${bR}`);
check("商業が建っている", bC > 0, `${bC}`);
check("複数マスの建物があるので、建物の数は区画のタイル数より少ない", bR + bC < zonesR + zonesC, `${bR + bC} < ${zonesR + zonesC}`);

// 見た目: ズームインして撮る
await page.mouse.move(cx(0), cy(12));
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}-1-zoomed.png` });

// 一部を解除すると、その建物だけ取り壊されて残りは空き地に戻る (エラーが出ない)
await page.keyboard.press("7");
await click(page, cx(-4), cy(13));
await click(page, cx(-4), cy(13));
await page.keyboard.press("1");
await page.waitForTimeout(400);
check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
