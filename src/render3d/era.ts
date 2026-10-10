/**
 * 建てた年代による建物の様式。建った年ごとに「時代」を決め、時代ごとに色の候補をずらす (同じ区画でも、昔と今で色が違う)。
 * 見た目だけの計算。街の計算には関わらない。
 */
import { DAYS_PER_YEAR } from "../sim/weather";

/** 時代が変わる間隔 (年)。 */
export const ERA_YEARS = 5;
/** 時代の数。最後の時代より後の年は、最後の時代のまま。 */
export const ERA_COUNT = 3;

/** 建った日から時代 (0 が一番古い) を求める。 */
export function eraOf(built: number): number {
  const year = Math.floor(Math.max(0, built) / DAYS_PER_YEAR);
  return Math.min(ERA_COUNT - 1, Math.floor(year / ERA_YEARS));
}

/** 時代ごとに、夜に灯る窓の割合の係数 (古い時代ほど明かりが少ない)。 */
export const LIT_SHARE = [0.6, 0.85, 1] as const;

/** 候補 len 個の中から、ハッシュ値 h と時代 era で色を 1 つ選ぶ。時代ごとに候補がずれる。 */
export function styleIndex(len: number, h: number, era: number): number {
  return (Math.floor(h * len) + era) % len;
}
