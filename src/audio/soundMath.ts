/**
 * 音の大きさと左右の位置 (純粋な計算)。音は、聞く人 (カメラの中心) から近いほど大きい。
 * 距離の単位はタイル。range より遠い音は聞こえない。
 */

/** 聞こえる距離 (タイル)。これより遠い音は、まったく聞こえない。 */
export const HEAR_RANGE = 14;

/** 距離 d (タイル) の音の大きさ (0〜1)。近いほど大きく、range で 0 になる。 */
export function falloff(d: number, range = HEAR_RANGE): number {
  if (d >= range) return 0;
  const t = 1 - Math.max(0, d) / range;
  return t * t;
}

/**
 * 音の左右の位置 (−1 = 左、+1 = 右)。dx, dy は聞く人から音までの差 (タイル)。
 * right は画面の右向きの単位ベクトル。遠くても左右の位置は変わるが、ほとんど聞こえないので気にしない。
 */
export function panOf(dx: number, dy: number, right: { x: number; y: number }, range = HEAR_RANGE): number {
  const side = dx * right.x + dy * right.y;
  return Math.max(-1, Math.min(1, side / range));
}

/** 人の話し声の大きさ。住んでいる人の数 (近くの合計) が多いほど、にぎやか。0〜1。 */
export function chatterLevel(residents: number): number {
  return Math.min(1, residents / 120);
}

/** 車の走行音の大きさ。近くを走る車の重み (距離×速さ) の合計を、0〜1 に収める。 */
export function trafficLevel(weight: number): number {
  return Math.min(1, weight / 6);
}
