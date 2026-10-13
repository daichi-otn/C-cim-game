// 日本の標高の格子 (src/sim/elevationData.ts) を作る。
// 使い方: node scripts/build-elevation.mjs <ETOPO の CSV のパス>
// 入力は NOAA ETOPO1 (パブリックドメイン) を、0.05 度ごとに取り出した CSV (lat, lon, altitude)。
// 出力は、0.05 度の格子に標高を 20 m 刻みの 1 バイトで持つ (値 = (標高 + 100) / 20 を四捨五入し、0〜255 に収める)。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("CSV のパスを指定してください");

const WEST = 122;
const SOUTH = 24;
const STEP = 0.05;
const W = 481; // 122〜146 度
const H = 441; // 24〜46 度
const STEP_M = 20;
const OFFSET_M = 100;

const bytes = new Uint8Array(W * H);
let filled = 0;
for (const line of readFileSync(input, "utf8").split("\n").slice(2)) {
  if (!line.trim()) continue;
  const [lat, lon, alt] = line.split(",").map(Number);
  const col = Math.round((lon - WEST) / STEP);
  const row = Math.round((lat - SOUTH) / STEP);
  if (col < 0 || col >= W || row < 0 || row >= H) continue;
  const v = Math.round((alt + OFFSET_M) / STEP_M);
  bytes[row * W + col] = Math.min(255, Math.max(0, v));
  filled++;
}
if (filled !== W * H) throw new Error(`点の数が合わない: ${filled}`);

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "sim", "elevationData.ts");
writeFileSync(
  target,
  `// 自動生成: scripts/build-elevation.mjs。編集しないこと。
// 出典: NOAA ETOPO1 Global Relief Model (パブリックドメイン) https://www.ncei.noaa.gov/products/etopo-global-relief-model
// 日本の範囲 (122〜146 度 E、24〜46 度 N) を 0.05 度ごとに持つ。値 = (標高 m + ${OFFSET_M}) / ${STEP_M} (0〜255)。行は南から北、列は西から東。

export const ELEVATION_GRID = {
  west: ${WEST},
  south: ${SOUTH},
  step: ${STEP},
  w: ${W},
  h: ${H},
  stepM: ${STEP_M},
  offsetM: ${OFFSET_M},
  /** 標高の値を、base64 で持つ。 */
  bytes: "${Buffer.from(bytes).toString("base64")}",
};
`,
);
console.log(`書き出し: ${target} (${W}×${H} 点)`);
