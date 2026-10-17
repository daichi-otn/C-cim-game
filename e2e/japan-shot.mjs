// 日本の地図の開始位置を撮る (確認用)。使い方: node e2e/japan-shot.mjs <出力フォルダ>
import { launch } from "./lib.mjs";
const out = process.argv[2] ?? ".";
const { browser, page, errors } = await launch("http://localhost:5173/?seed=1001");
await page.click("#speed button[data-speed='0']").catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/japan-start.png` });
if (errors.length) console.log(errors.slice(0, 3));
await browser.close();
console.log("done");
