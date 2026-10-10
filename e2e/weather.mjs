// 天気と季節 (パネルの表示・雨や雪・季節の色・木々の揺れ・建設の足場) のブラウザ動作確認。
import { buildBase, launch, makeChecker, paintZones } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-weather";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

await buildBase(page);
await paintZones(page);
await page.keyboard.press("l"); // 昼に固定 (天気の見た目を調べやすくする)

const label = async () => page.textContent("#weather");
check("パネルに季節と天気が出る", /^(春|夏|秋|冬)・(晴れ|くもり|雨|雪)$/.test(await label()), await label());
check("最初は春", (await label()).startsWith("春"), await label());

// 4 倍速で時間を進め、天気が移り変わるのを待つ (1 日 = 0.125 秒)
await page.click("#speed button[data-speed='4']");
const seen = new Set();
const shots = {};
for (let i = 0; i < 120 && !(seen.has("rain") && seen.size >= 3); i++) {
  await page.waitForTimeout(500);
  const t = await label();
  const w = t.endsWith("雨") ? "rain" : t.endsWith("雪") ? "snow" : t.endsWith("くもり") ? "cloudy" : "clear";
  seen.add(w);
  if (!shots[w]) shots[w] = await page.screenshot({ path: `${out}-${w}.png` });
}
check("天気が移り変わる (3 種類以上)", seen.size >= 3, [...seen].join(","));
check("雨の日がある", seen.has("rain"));
await page.click("#speed button[data-speed='0']");
await page.waitForTimeout(300);

// 雨の間は雨粒が動くので、時間を止めても画面が変わる (止めた時点が雨でなければ、このチェックは雨の日の画像で行う)
if (shots.clear && shots.rain) check("雨の日は晴れの日と画面が違う", !shots.clear.equals(shots.rain));
const a = await page.screenshot();
await page.waitForTimeout(500);
const b = await page.screenshot();
check("時間を止めていても、雨・雪・木々の揺れ・煙で画面が動く", !a.equals(b));

// 季節を巡る (夏まで進める)
await page.click("#speed button[data-speed='4']");
let summer = false;
for (let i = 0; i < 120 && !summer; i++) {
  await page.waitForTimeout(500);
  summer = (await label()).startsWith("夏");
}
check("90 日たつと夏になる", summer, await label());
await page.screenshot({ path: `${out}-summer.png` });
await page.click("#speed button[data-speed='0']");

// 遠くまでズームアウトしても、エラーなく動く (細部は省かれる)
await page.mouse.move(640, 360);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-zoomout.png` });
check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
