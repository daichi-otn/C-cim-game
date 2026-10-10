/**
 * 密度ごとの需要 (純粋な計算)。区画の種類の需要 (住む人・働く人が増えたいか) を土台に、
 * 街の中の高さのバランスで、密度ごとに上下させる: 目標の割合より少ない密度は需要が上がり、多い密度は下がる。
 */
/** 目標の割合 (低・中・高・超高 の順)。 */
export const DENSITY_TARGET_SHARE = [0.4, 0.3, 0.2, 0.1] as const;
/** 割合のずれを、需要に反映する強さ。 */
export const DENSITY_BALANCE_GAIN = 0.6;

/** 区画の種類の需要 (zoneDemand, -1〜1) と、密度ごとの建物の数 (counts[0] = 低 … counts[3] = 超高) から、密度ごとの需要を求める。 */
export function densityDemand(zoneDemand: number, counts: readonly number[]): number[] {
  const total = counts.reduce((s, n) => s + n, 0);
  return DENSITY_TARGET_SHARE.map((target, i) => {
    const share = total > 0 ? (counts[i] ?? 0) / total : 0;
    return Math.min(1, Math.max(-1, zoneDemand + DENSITY_BALANCE_GAIN * (target - share)));
  });
}
