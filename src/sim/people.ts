/**
 * 住民の年齢層 (純粋な計算)。子どもは学校へ行き、大人は働き、高齢者は年金で暮らす。
 * 家ごとの年齢の割合は、家の場所と街の種から決まる (同じ街なら、いつも同じ割合)。
 */

export interface AgeMix {
  child: number;
  adult: number;
  senior: number;
}

/** 0〜1 の、場所と種から決まる値 (いつも同じ)。 */
export function placeHash(seed: number, x: number, y: number, salt: number): number {
  const v = Math.sin((seed % 100000) * 12.9898 + x * 78.233 + y * 37.719 + salt * 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

/** 家 (x, y) の年齢の割合。子どもは 2〜4 割、高齢者は 1〜3 割、残りが大人。 */
export function ageMixAt(seed: number, x: number, y: number): AgeMix {
  const child = 0.2 + 0.2 * placeHash(seed, x, y, 1);
  const senior = 0.1 + 0.2 * placeHash(seed, x, y, 2);
  return { child, senior, adult: 1 - child - senior };
}

/** 高齢者 1 人あたり、毎月の年金 (円)。 */
export const PENSION_PER_SENIOR = 900;

/** 学校に通えない子どもがいるとき、幸福度が下がる最大の量 (子どもの全員が通えないとき)。 */
export const UNSCHOOLED_HAPPINESS_PENALTY = 0.25;
