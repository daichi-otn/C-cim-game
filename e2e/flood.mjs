// 浸水中の街を読み込み、注意表示と保存を確認する。
import { buildBase, launch, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#speed button[data-speed='0']");
await buildBase(page);
await page.click("#menu-button");
await page.click("#menu-save-1");
await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem("ccim.save.1"));
  const plant = data.city.facilities.find((f) => f.type === 1);
  data.city.disastersEnabled = true;
  data.city.flood = { x: plant.x, y: plant.y, started: data.city.day };
  localStorage.setItem("ccim.save.1", JSON.stringify(data));
});
await page.click("#menu-title");
await page.click("#title-load-1");
await page.waitForFunction(() => document.querySelector("#notices")?.textContent?.includes("洪水が発生"), null, { timeout: 30000 });
check("洪水の注意を表示", (await page.textContent("#notices")).includes("洪水が発生"));
await page.click("#menu-button");
await page.click("#menu-save-1");
const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ccim.save.1")));
check("洪水の進行状態を保存", save.city.flood && save.city.disastersEnabled === true);
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
