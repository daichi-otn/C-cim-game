/**
 * 建物の窓 (3D)。壁の高さから階数、幅から列数が決まり、東西南北の 4 面すべての壁に並ぶ。純粋な計算 (描画ライブラリには依存しない)。
 * 窓は、壁から少し外へ出した四角形 (4 点) で返す。灯っているかは、場所ごとに決まる (昼は暗い窓ガラス、夜に灯る)。
 */
import { baseRect, flatsStyle, kindOf, steppedUpper, wallHeight } from "./buildingShape";
import { hash2 } from "../sim/rng";
import { ZoneType, type ZoneCell } from "../sim/zoning";
import { LIT_SHARE, eraOf } from "./era";
import type { V3 } from "./geo";

export interface Window3D {
  pts: V3[];
  lit: boolean;
  /** 壁の向き: s = 南、e = 東、n = 北、w = 西。 */
  face: "s" | "e" | "n" | "w";
}

/** 窓を壁から浮かせる量 (px)。壁と重なってちらつくのを避ける。 */
const LIFT = 0.07;

interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** 1 つの箱 (底 b、高さ zStart〜top) の、4 面の窓。part は、同じ建物の中の箱の番号 (灯りの乱数をずらす)。 */
function faceWindows(c: ZoneCell, b: Box, zStart: number, top: number, part: number): Window3D[] {
  const kind = kindOf(c);
  const glass = kind === "homeTower" || kind === "shopTower" || kind === "officeTower" || kind === "office";
  const floorH = glass ? 3.4 : kind === "factory" || kind === "shop" || kind === "mall" ? 99 : 4.6;
  const span = top - zStart;
  const floors = kind === "factory" ? 1 : Math.max(1, Math.floor((span - 1.5) / floorH));
  const out: Window3D[] = [];
  const colW = glass ? 3.2 : 4.4;
  const litRate = (c.zone === ZoneType.Residential ? 0.55 : c.zone === ZoneType.Industrial ? 0.35 : 0.8) * LIT_SHARE[eraOf(c.built)]!; // 古い時代の建物は、明かりが少ない
  const winH = Math.min(glass ? floorH * 0.62 : Math.min(3.1, floorH * 0.6), (span - 1.2) * 0.7);
  const winW = glass ? colW * 0.78 : colW * 0.5;
  const salt = part * 977;
  const homey = kind === "house" || kind === "flats" || kind === "homeTower";
  for (let f = 0; f < floors; f++) {
    const y0 = zStart + 1.4 + f * ((span - 2) / floors) + (kind === "house" ? 0.6 : 0);
    if (y0 + winH > top - 0.4) continue;
    const y1 = y0 + winH;
    const faces: { face: Window3D["face"]; len: number; place: (t0: number, t1: number) => [V3, V3] }[] = [
      { face: "s", len: b.w, place: (t0, t1) => [{ x: b.x + t0, y: 0, z: b.z + b.d + LIFT }, { x: b.x + t1, y: 0, z: b.z + b.d + LIFT }] },
      { face: "n", len: b.w, place: (t0, t1) => [{ x: b.x + b.w - t0, y: 0, z: b.z - LIFT }, { x: b.x + b.w - t1, y: 0, z: b.z - LIFT }] },
      { face: "e", len: b.d, place: (t0, t1) => [{ x: b.x + b.w + LIFT, y: 0, z: b.z + b.d - t0 }, { x: b.x + b.w + LIFT, y: 0, z: b.z + b.d - t1 }] },
      { face: "w", len: b.d, place: (t0, t1) => [{ x: b.x - LIFT, y: 0, z: b.z + t0 }, { x: b.x - LIFT, y: 0, z: b.z + t1 }] },
    ];
    for (const fc of faces) {
      const cols = Math.max(1, Math.floor(fc.len / (fc.face === "s" || fc.face === "n" ? colW : colW * 1.25)));
      const ww = fc.face === "s" || fc.face === "n" ? winW : winW * 0.8;
      for (let i = 0; i < cols; i++) {
        if (fc.face === "s" && homey && zStart === 0 && f === 0 && i === Math.floor(cols / 2)) continue; // 出入口
        const t0 = (fc.len / cols) * i + (fc.len / cols - ww) / 2;
        const [p0, p1] = fc.place(t0, t0 + ww);
        const salt2 = fc.face === "s" ? 0 : fc.face === "e" ? 5000 : fc.face === "n" ? 9000 : 13000;
        out.push({
          pts: [{ ...p0, y: y0 }, { ...p1, y: y0 }, { ...p1, y: y1 }, { ...p0, y: y1 }],
          lit: hash2(0x31 + (fc.face === "s" ? 0 : 7), c.x * 31 + i * 7 + f + salt + salt2, c.y) < litRate * (fc.face === "s" ? 1 : 0.85),
          face: fc.face,
        });
      }
    }
  }
  return out;
}

/** 建物 (アンカーのセル) の、すべての窓。段のある集合住宅は、下の壁と上の壁の両方に並ぶ。 */
export function windows3D(c: ZoneCell): Window3D[] {
  const r = baseRect(c);
  const b: Box = { x: r.x, z: r.y, w: r.w, d: r.h };
  const d = wallHeight(c);
  if (kindOf(c) === "flats" && flatsStyle(c) === "stepped") {
    const up = steppedUpper(c);
    const u: Box = { x: up.rect.x, z: up.rect.y, w: up.rect.w, d: up.rect.h };
    return [...faceWindows(c, b, 0, up.z0, 0), ...faceWindows(c, u, up.z0, d, 1)];
  }
  return faceWindows(c, b, 0, d, 0);
}
