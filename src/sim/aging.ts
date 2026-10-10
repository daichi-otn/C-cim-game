import { DAYS_PER_YEAR } from "./weather";

/** 1 年ごとに、定員・雇用が下がる割合。 */
export const AGING_PER_YEAR = 0.05;
/** 定員・雇用の下限 (これより下がらない)。 */
export const AGING_FLOOR = 0.6;
/** この年数を過ぎた建物は、需要があるとき建て替えの候補になる。 */
export const REBUILD_YEARS = 8;
/** 建て替えの候補の建物が、1 日に建て替わる確率。 */
export const REBUILD_CHANCE = 0.02;

/** 建ってから days 日たった建物の、定員・雇用の割合 (AGING_FLOOR〜1)。 */
export function agingFactor(days: number): number {
  const years = Math.max(0, days) / DAYS_PER_YEAR;
  return Math.max(AGING_FLOOR, 1 - AGING_PER_YEAR * years);
}

/** 建て替えの候補か (建ってから REBUILD_YEARS 年以上)。 */
export function isOldEnough(days: number): boolean {
  return Math.max(0, days) >= REBUILD_YEARS * DAYS_PER_YEAR;
}
