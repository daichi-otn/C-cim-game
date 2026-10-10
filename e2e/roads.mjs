// 道路ツールのブラウザ動作確認。初期カメラ位置 (0,0) の画面座標で操作する。
//   画面 1px = ワールド 1px、1タイル = 16px。左上〜中央は草地、x>650 付近は山。
import { chromium } from "playwright-core";
import { GAME_URL, launchOptions } from "./lib.mjs";

const url = process.argv[2] ?? GAME_URL;
const out = process.argv[3] ?? "e2e/out-roads";
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

await page.goto(url);
await page.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
await page.waitForTimeout(500);

const state = async () => {
  await page.waitForTimeout(250); // HUD は次のフレームで更新されるので少し待つ
  const t = await page.textContent("#hud");
  const m = /tool=(\w+).*pos=\((-?\d+), (-?\d+)\).*nodes=(\d+) edges=(\d+)/.exec(t);
  return { tool: m[1], x: +m[2], y: +m[3], nodes: +m[4], edges: +m[5] };
};
const click = async (x, y) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
};

const failures = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failures.push(name);
};

// 初期状態
let s = await state();
check("初期は移動ツール・道路なし", s.tool === "pan" && s.nodes === 0 && s.edges === 0);

// 移動ツールではクリックしても道路は引かれない
await click(100, 150);
await click(300, 150);
s = await state();
check("移動ツールでは道路を引かない", s.edges === 0);

// 道路ツールに切り替え (ボタン)
await page.click("#tool-road");
s = await state();
check("ボタンで道路ツールに切り替わる", s.tool === "road");

// 1本目: 横線
await click(100, 150);
await click(300, 150);
s = await state();
check("2クリックで道路が1本 (2ノード・1エッジ)", s.nodes === 2 && s.edges === 1, JSON.stringify(s));

// 連続して引ける (終点が次の始点): 続けて (300,150) → (300,300)
await click(300, 300);
s = await state();
check("連続敷設で折れ線になる (3ノード・2エッジ)", s.nodes === 3 && s.edges === 2, JSON.stringify(s));

// Esc で始点解除 → 十字交差
await page.keyboard.press("Escape");
await click(200, 100);
await page.mouse.move(200, 250);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}-1-preview.png` });
await click(200, 250);
s = await state();
check("交差すると自動で分割される (6ノード・5エッジ)", s.nodes === 6 && s.edges === 5, JSON.stringify(s));
await page.keyboard.press("Escape");
await page.mouse.move(640, 600);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}-2-crossed.png` });

// 山への敷設は拒否される (始点は草地、終点は山)
const before = await state();
await click(500, 150);
await click(800, 200);
s = await state();
check("山へは敷設できない", s.edges === before.edges && s.nodes === before.nodes, JSON.stringify(s));
await page.keyboard.press("Escape");

// 道路ツールでもドラッグは地図の移動 (道路は増えない)
const b2 = await state();
await page.mouse.move(600, 500);
await page.mouse.down();
await page.mouse.move(540, 470, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
s = await state();
check("ドラッグで地図が動く", s.x !== b2.x || s.y !== b2.y, `pos ${b2.x},${b2.y} -> ${s.x},${s.y}`);
check("ドラッグでは道路が増えない", s.edges === b2.edges && s.nodes === b2.nodes);

// 地図を元に戻す (逆ドラッグ)
await page.mouse.move(540, 470);
await page.mouse.down();
await page.mouse.move(600, 500, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
s = await state();
check("元の位置に戻せる", s.x === b2.x && s.y === b2.y, `pos ${s.x},${s.y}`);

// 撤去ツール (キー 3): 1本目の左側の区間を消す
await page.keyboard.press("3");
s = await state();
check("キー3で撤去ツール", s.tool === "bulldoze");
const b3 = await state();
await click(150, 152);
s = await state();
check("撤去でエッジが1本減り、孤立ノードも消える", s.edges === b3.edges - 1 && s.nodes === b3.nodes - 1, JSON.stringify(s));
await click(700, 650); // 何もないところ
s = await state();
check("何もない場所の撤去は無害", s.edges === b3.edges - 1);

await page.screenshot({ path: `${out}-3-bulldozed.png` });
check("コンソールエラーなし", errors.length === 0, errors.join(" | "));

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} 件失敗: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nすべて成功");
