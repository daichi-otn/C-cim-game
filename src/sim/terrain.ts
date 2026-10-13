import { landAt, lonLatOfTile } from "./coast";
import { elevationAt } from "./elevation";
import { fbm } from "./noise";

export const CHUNK_SIZE = 32;

export const enum Tile {
  Water = 0,
  Sand = 1,
  Grass = 2,
  Forest = 3,
  Mountain = 4,
}

export interface Chunk {
  cx: number;
  cy: number;
  tiles: Uint8Array;
}


/**
 * 地域ごとの地形の特徴。標高のしきい値 (水・砂・山)、森のしきい値、地形の大きさ (scale。小さいほど、なだらかで大きい)。
 * 描画側も同じ値で地形をなめらかに塗る。
 */
export interface RegionProfile {
  water: number;
  sand: number;
  mountain: number;
  forest: number;
  scale: number;
  /** 海岸線の地図 (coastData の鍵)。あれば、陸と海はその地図に従う。 */
  coast?: string;
  /** 実際の標高 (elevation.ts) を使うか。使うときは、山の高さを実際の標高から決める。 */
  elevation?: boolean;
}

export const DEFAULT_PROFILE: RegionProfile = { water: 0.4, sand: 0.44, mountain: 0.68, forest: 0.58, scale: 0.02 };

/** 地域の地図のシード値 (地図の選択とつながる)。 */
export const REGION_SEEDS = { japan: 1001, uk: 1002, australia: 1003, newZealand: 1004 } as const;

const REGION_PROFILES = new Map<number, RegionProfile>([
  // 日本: 山が多く、森と海に囲まれた、起伏の大きい地形
  [REGION_SEEDS.japan, { water: 0.42, sand: 0.45, mountain: 0.68, forest: 0.52, scale: 0.03, coast: "japan", elevation: true }],
  // イギリス: なだらかな丘と、草地と森。山は少ない
  [REGION_SEEDS.uk, { water: 0.36, sand: 0.4, mountain: 0.82, forest: 0.5, scale: 0.014, coast: "uk" }],
  // オーストラリア: 広く乾いた内陸。水と森が少なく、砂と草地が広がる
  [REGION_SEEDS.australia, { water: 0.3, sand: 0.42, mountain: 0.86, forest: 0.7, scale: 0.012, coast: "australia" }],
  // ニュージーランド: 海に囲まれた島々と、険しい山
  [REGION_SEEDS.newZealand, { water: 0.36, sand: 0.4, mountain: 0.62, forest: 0.5, scale: 0.035, coast: "newZealand" }],
]);

/** 地域の地形の特徴。地図でない (自由なシード) 場合は、標準の地形。 */
export function profileOf(seed: number): RegionProfile {
  return REGION_PROFILES.get(seed) ?? DEFAULT_PROFILE;
}

/** タイル (tx,ty) の標高 (0..1)。 */
export function heightAt(seed: number, tx: number, ty: number): number {
  const P = profileOf(seed);
  const h = fbm(seed, tx * P.scale, ty * P.scale, 5);
  if (!P.coast) return h;
  // 実際の標高があれば、標高 1000 m で山の境目になるように、陸の高さを決める (細かな凹凸は noise で足す)
  let base = h;
  if (P.elevation) {
    const p = lonLatOfTile(P.coast, tx, ty)!;
    const m = Math.max(0, elevationAt(p.lon, p.lat));
    base = P.sand + 0.01 + (m / 1000) * (P.mountain - P.sand - 0.01) + (h - 0.5) * 0.03;
  }
  // 海岸線の地図があれば、陸は水より上、海は水より下にする。境目は少しなめらかにつなぐ
  const t = clamp01((landAt(P.coast, tx, ty) - 0.25) / 0.5);
  const land = Math.max(base, P.water + 0.03);
  const sea = Math.min(base, P.water - 0.03);
  return sea + (land - sea) * (t * t * (3 - 2 * t));
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** タイル (tx,ty) の森ノイズ (0..1)。高いほど森になりやすい。 */
export function forestAt(seed: number, tx: number, ty: number): number {
  const scale = profileOf(seed).scale * 3;
  return fbm(seed + 7919, tx * scale, ty * scale, 3);
}

export function tileAt(seed: number, tx: number, ty: number): Tile {
  const P = profileOf(seed);
  const h = heightAt(seed, tx, ty);
  if (h < P.water) return Tile.Water;
  if (h < P.sand) return Tile.Sand;
  if (h > P.mountain) return Tile.Mountain;
  // 森は別ノイズで斑に分布させる
  return forestAt(seed, tx, ty) > P.forest ? Tile.Forest : Tile.Grass;
}

/** チャンク座標 (cx, cy) の地形を生成する。同じ seed なら常に同じ結果。 */
export function generateChunk(seed: number, cx: number, cy: number): Chunk {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      tiles[y * CHUNK_SIZE + x] = tileAt(seed, cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y);
    }
  }
  return { cx, cy, tiles };
}
