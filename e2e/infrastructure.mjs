// インフラ (電力・水道・下水) のブラウザ動作確認。
import { PAN_X, click, cx, cy, dragRect, launch, makeChecker, paintZones, panRight, placeFacility, px, py } from "./lib.mjs";

const out = process.argv[3] ?? "e2e/out-infra";
const { browser, page, errors } = await launch(process.argv[2]);
const { check, finish } = makeChecker();

const num = (t) => Number(t.replace(/[^\d-]/g, ""));
const read = async () => {
  await page.waitForTimeout(250);
  const hud = await page.textContent("#hud");
  const m = /zones: R=(\d+) C=(\d+) I=(\d+)\s+buildings: R=(\d+) C=(\d+) I=(\d+)\s+facilities=(\d+)/.exec(hud);
  return {
    zones: +m[1] + +m[2] + +m[3],
    blds: +m[4] + +m[5] + +m[6],
    facilities: +m[7],
    money: num(await page.textContent("#money")),
    pop: num(await page.textContent("#pop")),
    power: await page.textContent("#util-power"),
    water: await page.textContent("#util-water"),
    sewage: await page.textContent("#util-sewage"),
    outside: await page.textContent("#outside"),
    notices: await page.textContent("#notices"),
  };
};
const tipText = async () => (await page.isVisible("#tip")) ? await page.textContent("#tip") : "";
/** カーソルを施設の位置 (左上タイル tx,ty) に置いて、案内を読む。 */
const hover = async (key, tx, ty) => {
  await page.keyboard.press(key);
  await page.mouse.move(px(tx + 1) + 1, py(ty + 1) + 1);
  await page.waitForTimeout(150);
  return tipText();
};

// 地図を動かして道路を敷く (x=-7〜25, 12 行目)
await page.keyboard.press("1");
await panRight(page);
await page.keyboard.press("2");
await click(page, cx(-7), cy(12));
await click(page, cx(25), cy(12));
await page.keyboard.press("Escape");
await page.keyboard.press("1");
let s = await read();
check("道路を敷いた直後は施設なし", s.facilities === 0);

// ツールの選択と案内
let tip = await hover("8", 4, 13);
check("キー8で発電所ツール。置ける場所では建設費が案内に出る", tip.includes("発電所") && tip.includes("30,000,000"), tip);
tip = await hover("9", 4, 13);
check("給水ポンプ場は水辺でないと置けない (案内に理由)", tip.includes("水辺"), tip);
tip = await hover("0", 4, 13);
check("キー0で下水処理場ツール", tip.includes("下水処理場") && tip.includes("24,000,000"), tip);
tip = await hover("8", 4, 11);
check("道路の上には置けない (案内に理由)", tip.includes("道路の上"), tip);
tip = await hover("8", 4, 17);
check("道路から遠いと置けない (案内に理由)", tip.includes("道路から遠すぎ"), tip);

// 置けない場所をクリックしても何も起きない
const before = await read();
await page.keyboard.press("8");
await click(page, px(5) + 1, py(18) + 1);
await click(page, px(5) + 1, py(12) + 1);
s = await read();
check("置けない場所をクリックしても施設もお金も変わらない", s.facilities === 0 && s.money === before.money, JSON.stringify(s));

// 施設がないうちはゾーンを塗っても建物が建たず、案内が出る
await paintZones(page);
await page.click("#speed button[data-speed='4']");
await page.mouse.move(640, 500);
await page.waitForTimeout(4000);
s = await read();
check("施設がないと建物は建たない", s.zones > 0 && s.blds === 0, JSON.stringify(s));
check("施設がないと案内が出る", s.notices.includes("電力") && s.notices.includes("水道") && s.notices.includes("下水"), s.notices);
check("パネルは「なし」と表示", s.power === "なし" && s.water === "なし" && s.sewage === "なし");
await page.screenshot({ path: `${out}-1-no-services.png` });

// 発電所だけ・発電所 + 水道だけでは足りない
await placeFacility(page, "8", 4, 13);
await placeFacility(page, "9", -8, 9);
await page.keyboard.press("1");
await page.waitForTimeout(3000);
s = await read();
check("下水がないと建物は建たない", s.facilities === 2 && s.blds === 0, JSON.stringify(s));
check("電力・水道の供給量が表示される (300)", s.power.endsWith("/ 300") && s.water.endsWith("/ 300"), `${s.power} ${s.water}`);

// 下水を建てると街が動き出す
await page.click("#speed button[data-speed='0']");
const m0 = (await read()).money;
await placeFacility(page, "0", 7, 13);
await page.keyboard.press("1");
s = await read();
check("下水処理場の建設費 24,000,000 円", m0 - s.money === 24000000, `${m0} -> ${s.money}`);
await page.click("#speed button[data-speed='4']");
await page.waitForTimeout(6000);
s = await read();
check("3 つそろうと建物が建つ", s.blds > 0, JSON.stringify(s));
check("使用量が表示される (使用 > 0)", num(s.power.split("/")[0]) > 0 && num(s.water.split("/")[0]) > 0, `${s.power} ${s.water} ${s.sewage}`);

// 外部接続がないと、住宅が建っても住民は引っ越してこない
await page.waitForTimeout(3000);
s = await read();
check("外部接続がないと人口は 0 のまま", s.blds > 0 && s.pop === 0, JSON.stringify(s));
check("外部接続がないと案内とパネルで知らせる", s.notices.includes("外部接続がありません") && s.outside === "なし", `${s.outside} / ${s.notices}`);
// 月末の精算で資金が動かないよう、測っている間だけ一時停止する
await page.click("#speed button[data-speed='0']");
const mo = (await read()).money;
tip = await hover("-", 11, 13);
check("キー-で外部接続ツール (案内に建設費)", tip.includes("外部接続") && tip.includes("15,000,000"), tip);
await placeFacility(page, "-", 11, 13);
await page.keyboard.press("1");
s = await read();
check("外部接続の建設費 15,000,000 円", mo - s.money === 15000000 && s.facilities === 4, `${mo} -> ${s.money}`);
await page.click("#speed button[data-speed='4']");
check("パネルの外部接続が「あり」になる", s.outside === "あり", s.outside);
await page.waitForTimeout(8000);
s = await read();
check("外部接続をつくると住民が引っ越してきて人口が増える", s.pop > 0, `pop=${s.pop}`);
check("外部接続の案内は消える", !s.notices.includes("外部接続"), s.notices);
await page.screenshot({ path: `${out}-2-running.png` });

// 施設の取り壊し: 撤去ツールで発電所をクリック → 電力が「なし」、人口は 0 になる
await page.keyboard.press("3");
await click(page, px(4) + 8, py(13) + 8);
await page.keyboard.press("1");
await page.waitForTimeout(1500);
s = await read();
check("撤去ツールで施設を取り壊せる", s.facilities === 3, JSON.stringify(s));
check("発電所がなくなると電力は「なし」・人口は 0", s.power === "なし" && s.pop === 0, `${s.power} pop=${s.pop}`);
check("供給のない建物があると案内が出る", s.notices.includes("供給のない建物"), s.notices);
await page.screenshot({ path: `${out}-3-no-power.png` });

// 発電所を建て直すと回復する
await placeFacility(page, "8", 4, 13);
await page.keyboard.press("1");
await page.waitForTimeout(2000);
s = await read();
check("発電所を建て直すと人口が戻る", s.facilities === 4 && s.pop > 0, JSON.stringify(s));

// 道路を撤去すると、施設は残るが道路とのつながりが切れて供給が止まる
await page.keyboard.press("3");
await click(page, cx(10), cy(12));
await page.keyboard.press("1");
await page.waitForTimeout(1500);
s = await read();
check("道路を撤去するとゾーンは消え、施設は残る", s.zones === 0 && s.facilities === 4, JSON.stringify(s));
check("つながっていない施設の電力は使用 0", s.power.startsWith("0 /") || s.power === "なし", s.power);

check("コンソールエラーなし", errors.length === 0, errors.join(" | "));
await finish(browser);
