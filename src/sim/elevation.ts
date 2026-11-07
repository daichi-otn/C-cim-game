import { ELEVATION_GRID } from "./elevationData";
import { REGIONAL_ELEVATION_GRIDS } from "./regionalElevationData";

/**
 * 実際の標高 (m) を、経緯度から引く。日本の範囲だけ。範囲の外は、海 (負の値) として扱う。
 * 格子は scripts/build-elevation.mjs で作る (0.1 度ごとの点を、なめらかに補間する)。
 */
const decoded = new Map<string, Uint8Array>();

function bytesOf(key: string, grid: { bytes: string }): Uint8Array {
  const hit = decoded.get(key);
  if (hit) return hit;
  const bytes = Uint8Array.from(atob(grid.bytes), (c) => c.charCodeAt(0));
  decoded.set(key, bytes);
  return bytes;
}

function at(grid: { w: number; h: number; stepM: number; offsetM: number; bytes: string }, key: string, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= grid.w || row >= grid.h) return -grid.offsetM;
  return bytesOf(key, grid)[row * grid.w + col]! * grid.stepM - grid.offsetM;
}

/** 経度・緯度 (度) の標高 (m)。 */
export function elevationAt(lon: number, lat: number): number {
  const G = ELEVATION_GRID;
  return elevationFromGrid(G, "japan", lon, lat);
}

function elevationFromGrid(G: { west: number; south: number; step: number; w: number; h: number; stepM: number; offsetM: number; bytes: string }, key: string, lon: number, lat: number): number {
  const gx = (lon - G.west) / G.step;
  const gy = (lat - G.south) / G.step;
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const fx = gx - i0;
  const fy = gy - j0;
  const a = at(G, key, i0, j0);
  const b = at(G, key, i0 + 1, j0);
  const c = at(G, key, i0, j0 + 1);
  const d = at(G, key, i0 + 1, j0 + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** 地域名に対応する実際の標高 (m)。未対応の地域は null。 */
export function regionalElevationAt(region: string, lon: number, lat: number): number | null {
  const grid = REGIONAL_ELEVATION_GRIDS[region];
  return grid ? elevationFromGrid(grid, region, lon, lat) : null;
}
