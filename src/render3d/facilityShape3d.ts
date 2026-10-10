/**
 * 施設の 3D の形の基準 (純粋な計算)。敷地 (正方形、一辺 size タイル) の中の、主な構造物の高さと、
 * 煙・蒸気の出る所・風車の中心の位置を決める。位置は、敷地の一辺 S に対する割合で決めてあり、施設の大きさ (2×2〜4×4) に合わせて広がる。
 * 座標は three の x = 東、z = 南、y = 高さ (px)。
 */
import { FacilityType } from "../sim/facilities";
import type { V3 } from "./geo";

const TILE = 16;

export interface FacilityLike {
  type: FacilityType;
  x: number;
  y: number;
  size: number;
}

/** 敷地の一辺 (px)。 */
export const sideOf = (f: FacilityLike) => f.size * TILE;

/** 敷地の中の位置 (割合) を、世界の (x, z) にする。 */
export const spot = (f: FacilityLike, fx: number, fz: number): { x: number; z: number } => ({ x: f.x * TILE + fx * sideOf(f), z: f.y * TILE + fz * sideOf(f) });

/** 主な構造物の高さ (px)。影やバッジ、足場の高さの目安。敷地が広いほど高い。 */
export function facilityHeight(f: FacilityLike): number {
  const S = sideOf(f);
  switch (f.type) {
    case FacilityType.Power: return S * 0.45;
    case FacilityType.Water: return S * 0.3;
    case FacilityType.Sewage: return S * 0.22;
    case FacilityType.Outside: return S * 0.26;
    case FacilityType.Police: return S * 0.26;
    case FacilityType.Fire: return S * 0.42;
    case FacilityType.Hospital: return S * 0.34;
    case FacilityType.School: return S * 0.26;
    case FacilityType.MiddleSchool: return S * 0.26;
    case FacilityType.HighSchool: return S * 0.34;
    case FacilityType.University: return S * 0.36;
    case FacilityType.Park: return S * 0.16;
    case FacilityType.NoiseBarrier: return S * 0.26;
    case FacilityType.Garbage: return S * 0.62;
    case FacilityType.Wind: return S * 0.62;
    case FacilityType.Solar: return S * 0.1;
  }
}

/** 発電所の冷却塔: 中心 (x, z)・底の半径・上の半径・高さ。 */
export function coolingTowers(f: FacilityLike): { x: number; z: number; r0: number; r1: number; h: number }[] {
  const S = sideOf(f);
  return [
    { ...spot(f, 0.74, 0.3), r0: S * 0.15, r1: S * 0.1, h: S * 0.45 },
    { ...spot(f, 0.38, 0.28), r0: S * 0.12, r1: S * 0.085, h: S * 0.36 },
  ];
}

/** 蒸気の出る所 (冷却塔の先)。 */
export function steamPoints(f: FacilityLike): V3[] {
  return coolingTowers(f).map((t) => ({ x: t.x, y: t.h, z: t.z }));
}

/** ごみ処理場の煙突: 中心 (x, z)・半径・高さ。 */
export function incineratorStack(f: FacilityLike): { x: number; z: number; r: number; h: number } {
  const S = sideOf(f);
  return { ...spot(f, 0.82, 0.26), r: S * 0.05, h: S * 0.62 };
}

/** 煙の出る所 (煙突の先)。 */
export function smokePoint(f: FacilityLike): V3 {
  const s = incineratorStack(f);
  return { x: s.x, y: s.h, z: s.z };
}

/** 風力発電所の風車: 塔の根元 (x, z)・塔の高さ (= 羽根の中心の高さ)・羽根の長さ。羽根は、南を向いた円の面で回る。 */
export function windTurbines(f: FacilityLike): { x: number; z: number; h: number; r: number }[] {
  const S = sideOf(f);
  return [
    { ...spot(f, 0.3, 0.62), h: S * 0.62, r: S * 0.27 },
    { ...spot(f, 0.72, 0.4), h: S * 0.5, r: S * 0.21 },
  ];
}
