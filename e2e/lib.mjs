// e2e 共通部品: ブラウザの起動と、標準の街づくりシナリオ。
//   シード 12345 の初期位置付近の地形 (タイル座標):
//   x<=-9 は湖。x=-8〜-7 は砂浜、その東は草地。湖畔に給水ポンプ場を建てられる。
//   画面を右へ PAN_X px ずらして操作する (タイル tx の左端が画面 x = tx*16 + PAN_X)。
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const EDGE_WINDOWS = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

export const TILE = 16;
export const PAN_X = 240;
export const px = (tx) => tx * TILE + PAN_X; // タイルの左端の画面 x
export const py = (ty) => ty * TILE;
export const cx = (tx) => px(tx) + TILE / 2; // タイルの中心の画面 x
export const cy = (ty) => py(ty) + TILE / 2;

/** ブラウザの起動設定。環境変数 CCIM_BROWSER があればそれ、なければ Windows の Edge、それもなければ Playwright 同梱の Chromium。 */
export function launchOptions() {
  const exe = process.env.CCIM_BROWSER ?? (existsSync(EDGE_WINDOWS) ? EDGE_WINDOWS : undefined);
  // CCIM_GPU=1 で、このマシンの実際の GPU を使う (既定は GPU を使わないソフトウェア描画: 再現性のため、遅い)
  const gpu = process.env.CCIM_GPU === "1" && process.platform === "darwin"
    ? ["--use-gl=angle", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  return { executablePath: exe, args: gpu };
}

/** 開始 URL。シードを指定すると、タイトル画面を飛ばして原点から始まる (座標を固定できる)。 */
export const GAME_URL = "http://localhost:5173/?seed=12345";

export async function launch(url = GAME_URL) {
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("hud")?.textContent, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  return { browser, page, errors };
}

export function makeChecker() {
  const failures = [];
  const check = (name, cond, detail = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
    if (!cond) failures.push(name);
  };
  const finish = async (browser) => {
    await browser.close();
    if (failures.length) {
      console.log(`\n${failures.length} 件失敗: ${failures.join(", ")}`);
      process.exit(1);
    }
    console.log("\nすべて成功");
  };
  return { check, finish };
}

export const click = async (page, x, y) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
};

/** 地図を右へ PAN_X px ずらす (ドラッグ)。 */
export async function panRight(page) {
  await page.mouse.move(300, 600);
  await page.mouse.down();
  await page.mouse.move(300 + PAN_X, 600, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** 2 クリックで矩形を指定する (タイル座標 x0,y0 〜 x1,y1)。 */
export async function dragRect(page, x0, y0, x1, y1) {
  await click(page, cx(x0), cy(y0));
  await click(page, cx(x1), cy(y1));
}

/** 施設 (2×2) を、左上のタイル (tx,ty) に建てる。カーソルが施設の中心 = 4 タイルの角に来るようにクリックする。 */
export async function placeFacility(page, key, tx, ty) {
  await page.keyboard.press(key);
  await click(page, px(tx + 1) + 1, py(ty + 1) + 1);
}

/**
 * 標準の街の土台: 道路 (12 行目, x=-7〜25) と、水辺の給水ポンプ場・発電所・下水処理場・外部接続。
 * 終わるとき移動ツールになっている。
 */
export async function buildBase(page) {
  await page.keyboard.press("1");
  await panRight(page);
  await page.keyboard.press("2");
  await click(page, cx(-7), cy(12));
  await click(page, cx(25), cy(12));
  await page.keyboard.press("Escape");
  await placeFacility(page, "9", -8, 9); // 給水ポンプ場 (湖畔)
  await placeFacility(page, "8", 4, 13); // 発電所
  await placeFacility(page, "0", 7, 13); // 下水処理場
  await placeFacility(page, "-", 11, 13); // 外部接続 (住民が引っ越してくる入口)
  await page.keyboard.press("1");
}

/** 標準のゾーン: 住宅 x0〜7 / 商業 x9〜14 (どちらも 9〜11 行目)、工業 x16〜21 (13〜15 行目)。 */
export async function paintZones(page) {
  await page.keyboard.press("4");
  await dragRect(page, 0, 9, 7, 11);
  await page.keyboard.press("5");
  await dragRect(page, 9, 9, 14, 11);
  await page.keyboard.press("6");
  await dragRect(page, 16, 13, 21, 15);
  await page.keyboard.press("1");
}
