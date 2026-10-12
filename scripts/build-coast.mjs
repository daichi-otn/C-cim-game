// 地域の海岸線の「陸・海」の地図 (src/sim/coastData.ts) を作る。
// 使い方: node scripts/build-coast.mjs <ne_50m_admin_0_countries.geojson のパス>
// 入力は Natural Earth (パブリックドメイン) の国境データ。出力は、0.1 度の格子に陸 (1) か海 (0) を書いたもの。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("GeoJSON のパスを指定してください");

const CELL = 0.1; // 格子の 1 マスの大きさ (度)

// 地域ごとに、対象の国と、範囲 (経度・緯度の中心の近く) の島だけを使う。遠くの小さな島は除く。
// tpd は、緯度 1 度あたりのタイル数 (1 タイル = 1/tpd 度)。細長い国は、街が入るように細かくする。
const REGIONS = [
  { key: "japan", admin: "Japan", box: [122, 20, 150, 50], tpd: 48 },
  { key: "uk", admin: "United Kingdom", box: [-9, 49, 2.5, 61], tpd: 24 },
  { key: "australia", admin: "Australia", box: [112, -45, 155, -10], tpd: 24 },
  { key: "newZealand", admin: "New Zealand", box: [165, -48, 180, -33], tpd: 48 },
];

const geo = JSON.parse(readFileSync(input, "utf8"));

/** 多角形の輪 (ring) の並び。MultiPolygon なら多角形ごとの輪。 */
function ringsOf(feature) {
  const g = feature.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.flatMap((poly) => poly); // 穴も含め、すべての輪を偶奇規則で塗る
}

const out = {};
for (const r of REGIONS) {
  const feats = geo.features.filter((f) => f.properties.ADMIN === r.admin);
  if (feats.length === 0) throw new Error(`見つからない: ${r.admin}`);
  // 箱の中心にある多角形だけ使う (遠くの島を除く)
  const polys = [];
  for (const f of feats) {
    const g = f.geometry;
    const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of list) {
      const outer = poly[0];
      const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
      const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
      if (cx >= r.box[0] && cx <= r.box[2] && cy >= r.box[1] && cy <= r.box[3]) polys.push(poly);
    }
  }
  const rings = polys.flat();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const west = Math.floor(minX / CELL) * CELL;
  const north = Math.ceil(maxY / CELL) * CELL;
  const w = Math.ceil((maxX - west) / CELL);
  const h = Math.ceil((north - minY) / CELL);
  const south = north - h * CELL;

  // 1 行ずつ、その行の中心の緯度で、輪の辺との交点を求め、偶奇規則で内側を埋める
  const bytes = new Uint8Array(Math.ceil((w * h) / 8));
  let land = 0;
  for (let row = 0; row < h; row++) {
    const lat = north - (row + 0.5) * CELL;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let col = 0; col < w; col++) {
        const lon = west + (col + 0.5) * CELL;
        if (lon >= xs[k] && lon < xs[k + 1]) {
          const idx = row * w + col;
          bytes[idx >> 3] |= 1 << (idx & 7);
          land++;
        }
      }
    }
  }
  out[r.key] = { west, north, w, h, tpd: r.tpd, bits: Buffer.from(bytes).toString("base64") };
  console.log(`${r.key}: ${w}×${h} マス, 陸 ${land} マス, 範囲 ${west}..${(west + w * CELL).toFixed(1)}E, ${south.toFixed(1)}..${north}N`);
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "sim", "coastData.ts");
const body = `// 自動生成: scripts/build-coast.mjs。編集しないこと。
// 出典: Natural Earth 1:50m Admin 0 – Countries (パブリックドメイン) https://www.naturalearthdata.com/
// 各地域は、0.1 度の格子に陸 (ビット 1) と海 (ビット 0) を、行ごと (北から南)・列ごと (西から東) に、LSB から詰めて持つ。

export const COAST_CELL_DEG = ${CELL};

export interface CoastGrid {
  /** 格子の左端の経度・上端の緯度 (度)。 */
  west: number;
  north: number;
  w: number;
  h: number;
  /** 緯度 1 度あたりのタイル数。 */
  tpd: number;
  /** 陸のビットを、base64 で持つ。 */
  bits: string;
}

export const COAST_GRIDS: Record<string, CoastGrid> = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(target, body);
console.log(`書き出し: ${target}`);
