/**
 * 地区 (ディストリクト)。プレイヤーが矩形で囲んで決める。地区ごとに、税率・建ててよい密度・財布 (地区の税収で、地区の施設の維持費を払う) を持つ。
 * 地区が重なるときは、後から作った地区が優先する。純粋な計算だけ (描画には関わらない)。
 */
import type { Density } from "./zoning";

export const DISTRICT_MIN_SIZE = 3;
export const DISTRICT_MAX_SIZE = 64;
export const DISTRICT_MAX_COUNT = 24;
/** 地区の色の候補 (作った順に使う)。 */
export const DISTRICT_COLORS = [0x3d8bd6, 0xd6503d, 0x3da86b, 0xd6a13d, 0x8b5cd6, 0x3dbfc6, 0xc64f9a, 0x7a8b3d];

/** 地区の木の多さ: 0 少ない (森の木を間引く) / 1 ふつう / 2 多い (森の木を増やし、草地にも植える)。 */
export type Greenery = 0 | 1 | 2;
export const GREENERY_NAMES = ["少ない", "ふつう", "多い"] as const;

/** 建ててよい密度 (低・中・高・超高 の順)。 */
export type Allowed = [boolean, boolean, boolean, boolean];

export interface District {
  id: number;
  name: string;
  /** 0xRRGGBB。地図の囲みと、建物の色合いに使う。 */
  color: number;
  /** 囲んだ範囲 (タイル)。x0 以上 x1 未満、y0 以上 y1 未満。 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 地区の税率。省略すると市の税率に従う。 */
  taxRate?: number;
  /** 低・中・高の密度で、建ててよいか (順に 1・2・3)。空き地と昔の区画 (密度 0) は、いつも建つ。 */
  allowed: Allowed;
  /** 地区の財布。地区の税収が入り、地区の施設の維持費を払う。 */
  wallet: number;
  /** 地区の木の多さ。 */
  greenery: Greenery;
}

export const inDistrict = (d: District, x: number, y: number): boolean => x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1;

/** (x, y) を囲んでいる地区のうち、いちばん後から作ったもの。 */
export function districtAt(list: readonly District[], x: number, y: number): District | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (inDistrict(list[i]!, x, y)) return list[i];
  return undefined;
}

/** 建物の密度を、その地区で建ててよいか。 */
export function densityAllowed(d: District | undefined, density: Density): boolean {
  if (!d || density === 0) return true;
  return d.allowed[density - 1] ?? true;
}

/** 囲みの 2 点から、地区の範囲を正しい向きに直す。小さすぎる・大きすぎるなら null。 */
export function districtRect(ax: number, ay: number, bx: number, by: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = Math.min(ax, bx);
  const y0 = Math.min(ay, by);
  const x1 = Math.max(ax, bx) + 1;
  const y1 = Math.max(ay, by) + 1;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < DISTRICT_MIN_SIZE || h < DISTRICT_MIN_SIZE || w > DISTRICT_MAX_SIZE || h > DISTRICT_MAX_SIZE) return null;
  return { x0, y0, x1, y1 };
}
