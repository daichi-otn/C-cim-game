// メニューからの借入・返済を確認する。
import { launch, makeChecker } from "./lib.mjs";

const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();
await page.click("#speed button[data-speed='0']");
await page.click("#menu-button");
check("初期残高は0円", (await page.textContent("#menu-loan")).includes("借入残高 0 円"));
await page.click("#loan-borrow");
check("借入後に残高と利息を表示", (await page.textContent("#menu-loan")).includes("借入残高 100,000,000 円 / 翌月の利息 1,000,000 円"));
await page.click("#loan-repay");
check("返済で残高が0円になる", (await page.textContent("#menu-loan")).includes("借入残高 0 円"));
await page.check("#policy-welfare");
check("条例を有効にできる", await page.isChecked("#policy-welfare"));
await page.click("#menu-close");
await page.click("#menu-button");
check("メニューを開き直しても条例が有効", await page.isChecked("#policy-welfare"));
await page.uncheck("#policy-welfare");
check("ブラウザエラーなし", errors.length === 0, errors.join(" / "));
await finish(browser);
