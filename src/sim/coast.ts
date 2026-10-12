import { COAST_CELL_DEG, COAST_GRIDS, type CoastGrid } from "./coastData";

/**
 * 海岸線の地図 (陸か海か) を、タイル座標から引く。地図の格子は scripts/build-coast.mjs で作る。
 * タイルの原点は、格子の中心 (緯度・経度)。1 タイル = 緯度 1/tpd 度 (地域ごと)。東西は、緯度に合わせて縮める。
 */

interface Decoded {
  grid: CoastGrid;
  land: Uint8Array;
  lonC: number;
  latC: number;
}

const cache = new Map<string, Decoded>();

function decode(key: string): Decoded | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const grid = COAST_GRIDS[key];
  if (!grid) return null;
  const bytes = Uint8Array.from(atob(grid.bits), (c) => c.charCodeAt(0));
  const d: Decoded = {
    grid,
    land: bytes,
    lonC: grid.west + (grid.w * COAST_CELL_DEG) / 2,
    latC: grid.north - (grid.h * COAST_CELL_DEG) / 2,
  };
  cache.set(key, d);
  return d;
}

function cellLand(d: Decoded, col: number, row: number): number {
  const { w, h } = d.grid;
  if (col < 0 || row < 0 || col >= w || row >= h) return 0;
  const idx = row * w + col;
  return (d.land[idx >> 3]! >> (idx & 7)) & 1;
}

/** 地域の、緯度 1 度あたりのタイル数。地図がなければ 0。 */
export function tilesPerDegOf(key: string): number {
  return decode(key)?.grid.tpd ?? 0;
}

/** タイル (tx, ty) の経度・緯度 (度)。 */
export function lonLatOfTile(key: string, tx: number, ty: number): { lon: number; lat: number } | null {
  const d = decode(key);
  if (!d) return null;
  const tpd = d.grid.tpd;
  const lat = d.latC - ty / tpd;
  const lon = d.lonC + tx / (tpd * Math.cos((d.latC * Math.PI) / 180));
  return { lon, lat };
}

/**
 * タイル (tx, ty) の陸らしさ (0 = 海、1 = 陸)。格子の 4 マスをなめらかに補間する。
 * 地図の範囲の外は海。
 */
export function landAt(key: string, tx: number, ty: number): number {
  const d = decode(key);
  if (!d) return 1;
  const p = lonLatOfTile(key, tx, ty)!;
  const gx = (p.lon - d.grid.west) / COAST_CELL_DEG - 0.5;
  const gy = (d.grid.north - p.lat) / COAST_CELL_DEG - 0.5;
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const fx = gx - i0;
  const fy = gy - j0;
  const a = cellLand(d, i0, j0);
  const b = cellLand(d, i0 + 1, j0);
  const c = cellLand(d, i0, j0 + 1);
  const e = cellLand(d, i0 + 1, j0 + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}
