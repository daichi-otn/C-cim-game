// M12 のバス路線作成と保存互換を確認する。
import { launch, buildBase, makeChecker } from "./lib.mjs";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await buildBase(page);
await page.click("#menu-button");
await page.click("#transit-add-bus");
check("バス路線を作成", (await page.textContent("#menu-transit"))?.includes("バス 1 路線"));
check("停留所と車両を表示", (await page.textContent("#menu-transit"))?.includes("停留所") && (await page.textContent("#menu-transit"))?.includes("車両"));
await page.click("#menu-save-1");
const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ccim.save.1")));
check("公共交通を保存", save.city.transit?.lines?.length === 1);
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
