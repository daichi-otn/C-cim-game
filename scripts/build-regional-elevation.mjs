// 日本以外の地域の標高格子 (src/sim/regionalElevationData.ts) を作る。
// NOAA ETOPO 2022 の OPeNDAP から、ゲームで使う縮尺に合わせて間引いて取得する。
// 使い方: node scripts/build-regional-elevation.mjs
// 出典: https://www.ncei.noaa.gov/products/etopo-global-relief-model
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATASET = "https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_bed_elev_netcdf/ETOPO_2022_v1_60s_N90W180_bed.nc";
const STEP_MINUTES = 1;
const STEP_M = 20;
const OFFSET_M = 100;

// west/south と step は、地域の地図のタイル縮尺に合わせる。
// UK/Australia は約 4.6 km/タイルなので 0.05 度、NZ は約 2.3 km/タイルなので 1/30 度。
const REGIONS = [
  { key: "uk", west: -9, south: 49, east: 2.5, north: 61, step: 0.05 },
  { key: "australia", west: 112, south: -45, east: 155, north: -10, step: 0.05 },
  { key: "newZealand", west: 165, south: -48, east: 180, north: -33, step: 1 / 30 },
];

function indexOfLon(lon) {
  return Math.round((lon + 180) * 60);
}

function indexOfLat(lat) {
  return Math.round((lat + 90) * 60);
}

async function fetchGrid(r) {
  const stride = Math.max(1, Math.round((r.step * 60) / STEP_MINUTES));
  const lat0 = indexOfLat(r.south);
  const lat1 = Math.min(10799, indexOfLat(r.north));
  const lon0 = indexOfLon(r.west);
  const lon1 = Math.min(21599, indexOfLon(r.east));
  const h = Math.floor((lat1 - lat0) / stride) + 1;
  const w = Math.floor((lon1 - lon0) / stride) + 1;
  const url = `${DATASET}.ascii?z[${lat0}:${stride}:${lat0 + (h - 1) * stride}][${lon0}:${stride}:${lon0 + (w - 1) * stride}]`;
  console.log(`${r.key}: NOAAから ${w}×${h} 点を取得中...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${r.key}: NOAA ${response.status}`);
  const text = await response.text();
  const values = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\[\d+\],\s*(.*)$/);
    if (!m) continue;
    for (const token of m[1].split(",")) {
      const n = Number(token.trim());
      if (Number.isFinite(n)) values.push(n);
    }
  }
  if (values.length !== w * h) throw new Error(`${r.key}: 値の数が合わない (${values.length} / ${w * h})`);
  const bytes = Uint8Array.from(values, (m) => Math.min(255, Math.max(0, Math.round((m + OFFSET_M) / STEP_M))));
  return { west: r.west, south: r.south, step: r.step, w, h, stepM: STEP_M, offsetM: OFFSET_M, bytes: Buffer.from(bytes).toString("base64") };
}

const out = {};
for (const r of REGIONS) out[r.key] = await fetchGrid(r);

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "sim", "regionalElevationData.ts");
writeFileSync(target, `// 自動生成: scripts/build-regional-elevation.mjs。編集しないこと。
// 出典: NOAA ETOPO 2022 Global Relief Model (パブリックドメイン) https://www.ncei.noaa.gov/products/etopo-global-relief-model
// 標高は 20 m 刻みの 1 バイトで持つ (値 = (標高 + offsetM) / stepM)。行は南から北、列は西から東。

export interface RegionalElevationGrid {
  west: number;
  south: number;
  step: number;
  w: number;
  h: number;
  stepM: number;
  offsetM: number;
  bytes: string;
}

export const REGIONAL_ELEVATION_GRIDS: Record<string, RegionalElevationGrid> = ${JSON.stringify(out, null, 2)};
`);
console.log(`書き出し: ${target}`);
