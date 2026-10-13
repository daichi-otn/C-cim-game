import { ELEVATION_GRID } from "./elevationData";

/**
 * 実際の標高 (m) を、経緯度から引く。日本の範囲だけ。範囲の外は、海 (負の値) として扱う。
 * 格子は scripts/build-elevation.mjs で作る (0.1 度ごとの点を、なめらかに補間する)。
 */
let decoded: Uint8Array | null = null;

function bytesOf(): Uint8Array {
  if (!decoded) decoded = Uint8Array.from(atob(ELEVATION_GRID.bytes), (c) => c.charCodeAt(0));
  return decoded;
}

function at(col: number, row: number): number {
  const G = ELEVATION_GRID;
  if (col < 0 || row < 0 || col >= G.w || row >= G.h) return -G.offsetM;
  return bytesOf()[row * G.w + col]! * G.stepM - G.offsetM;
}

/** 経度・緯度 (度) の標高 (m)。 */
export function elevationAt(lon: number, lat: number): number {
  const G = ELEVATION_GRID;
  const gx = (lon - G.west) / G.step;
  const gy = (lat - G.south) / G.step;
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const fx = gx - i0;
  const fy = gy - j0;
  const a = at(i0, j0);
  const b = at(i0 + 1, j0);
  const c = at(i0, j0 + 1);
  const d = at(i0 + 1, j0 + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
