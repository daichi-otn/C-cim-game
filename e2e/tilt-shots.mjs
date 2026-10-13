// 斜めの 3D 視点で地形と木を撮る (確認用)。使い方: node e2e/tilt-shots.mjs <出力フォルダ> [シード...]
import { launch } from "./lib.mjs";
const out = process.argv[2] ?? ".";
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ["12345", "1001", "1003", "1004"];
for (const seed of seeds) {
  const { browser, page, errors } = await launch(`http://localhost:5173/?seed=${seed}`);
  await page.click("#speed button[data-speed='0']").catch(() => {});
  await page.keyboard.down("f");
  await page.waitForTimeout(3000);
  await page.keyboard.up("f");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/tilt-${seed}.png` });
  if (errors.length) console.log(seed, errors.slice(0, 3));
  await browser.close();
}
console.log("done");
