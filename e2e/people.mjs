// M20: 保存した街で個人生活を表示し、政策・端末幅・追跡操作を確認する。
import { launch, makeChecker } from "./lib.mjs";
const url = process.argv[2] ?? "http://localhost:5173/?seed=12345";
const { browser, page, errors } = await launch(url);
const { check, finish } = makeChecker();
try {
  await page.evaluate(async () => {
    const { City } = await import("/src/sim/city.ts");
    const { makeSave } = await import("/src/sim/save.ts");
    const city = new City(12345);
    // 既存形式の住民データを読み込ませる。表示とロードの接続を実際のUIで検証する。
    const data = city.toData();
    data.people = [[1, 0, 0, 30 * 365, -1, -1], [2, 0, 0, 10 * 365, -1, -1, 100.5]];
    data.nextPersonId = 3;
    const saved = makeSave(City.fromData(data), { mapId: "lakeside", mapName: "M20検証", view: { x: 0, y: 0, zoom: 1, center: true }, speed: 0 });
    localStorage.setItem("ccim.save.1", JSON.stringify(saved));
  });
  await page.goto(url.split("?")[0]);
  await page.click("#title-load-1");
  await page.click("#menu-button");
  const card = page.locator("#menu-citizens .citizen").first();
  const initial = await card.textContent();
  for (const field of ["月収", "生活費", "教育", "健康", "通勤", "買い物", "満足度"]) check(`${field}を表示`, initial.includes(field));
  check("旧セーブの年齢と職業を表示", initial.includes("30歳・失業中"));
  await page.check("#policy-welfare");
  await page.waitForFunction((before) => document.querySelector("#menu-citizens .citizen")?.textContent !== before, initial);
  check("暮らし支援を個人の収支に即時反映", (await card.textContent()) !== initial);
  await page.click("#menu-save-1");
  const savedEducation = await page.evaluate(() => JSON.parse(localStorage.getItem("ccim.save.1")).city.people[1][6]);
  check("小数を含む就学日数を保存", savedEducation === 100.5);
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  const bounds = await card.boundingBox();
  check("スマートフォン幅に収まる", bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await card.click();
  check("住民の自宅を追跡できる", (await page.textContent("body")).includes("住民 #1 の自宅を表示しました"));
  await page.screenshot({ path: "e2e/out-people-mobile.png" });
  check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
} catch (error) {
  check("テスト操作を完了", false, error.message);
}
await finish(browser);
