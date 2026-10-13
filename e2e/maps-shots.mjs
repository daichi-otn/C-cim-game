// 全マップの地形の見た目を撮る (確認用)。使い方: node e2e/maps-shots.mjs <出力フォルダ>
import { launch } from "./lib.mjs";
const out = process.argv[2] ?? ".";
const seeds = [["lakeside", 12345], ["plains", 31337], ["islands", 42], ["valley", 17], ["forest", 2025], ["japan", 1001], ["uk", 1002], ["australia", 1003], ["newzealand", 1004]];
for (const [name, seed] of seeds) {
  const { browser, page, errors } = await launch(`http://localhost:5173/?seed=${seed}`);
  await page.click("#speed button[data-speed='0']").catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/map-${name}.png` });
  if (errors.length) console.log(name, errors.slice(0, 3));
  await browser.close();
}
console.log("done");
