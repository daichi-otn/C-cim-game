import { ROAD_SPECS } from "./roadTypes";

/** 地価を決める 4 つの材料と、その重み (合計 1)。 */
export const LAND_WEIGHTS = { road: 0.3, services: 0.25, environment: 0.2, amenities: 0.25 } as const;
/** 好ましい施設 (公園・学校・病院・警察・消防) が数えられる範囲 (タイル)。 */
export const AMENITY_REACH = 8;
/** 地価による税の上乗せの最大 (地価の平均が 1 のとき、税収が 1 + この値 になる)。 */
export const LAND_TAX_BONUS = 0.5;

const MAX_ROAD_CAP = Math.max(...Object.values(ROAD_SPECS).map((s) => s.capacity));

export interface LandParts {
  /** 道路網への近さ: 出入口になれる道路の容量の最大 (台/日)。 */
  roadCap: number;
  /** 届いている公共サービスの種類の数 (0〜4)。 */
  services: number;
  /** 環境の悪さ (0〜1、住宅だけ分かる。分からないときは null)。 */
  risk: number | null;
  /** 範囲内にある好ましい施設の数。 */
  amenities: number;
}

/** 地価 (0〜1)。道路が太く、サービスが届き、環境が良く、好ましい施設が近いほど高い。 */
export function landValueOf(p: LandParts): number {
  const road = Math.min(1, p.roadCap / MAX_ROAD_CAP);
  const services = p.services / 4;
  const environment = p.risk === null ? 0.5 : 1 - Math.min(1, p.risk);
  const amenities = Math.min(1, p.amenities / 3);
  const v =
    LAND_WEIGHTS.road * road +
    LAND_WEIGHTS.services * services +
    LAND_WEIGHTS.environment * environment +
    LAND_WEIGHTS.amenities * amenities;
  return Math.min(1, Math.max(0, v));
}

/** 地価を色にする (0 = 青、0.5 = 黄、1 = 赤)。地価マップで使う。 */
export function landColor(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  const a = t < 0.5 ? [0x3b, 0x6e, 0xc8] : [0xf2, 0xc2, 0x30];
  const b = t < 0.5 ? [0xf2, 0xc2, 0x30] : [0xd9, 0x48, 0x3b];
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const ch = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * k);
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}
