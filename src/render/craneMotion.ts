/**
 * クレーンの動き (純粋な計算。描画は持たない)。ゲーム内の建設と、タイトルの背景で同じものを使う。
 * 1 回の往復を、位相 (0〜1) で表す。動きは、加速・等速・減速の台形で、急に止まらない。
 * 荷は、旋回を止めたあとに振れて、だんだん収まる (振り子)。
 */

export interface CraneMotion {
  /** 腕の向き: 0 = 置き場 (荷を取る側)、1 = 建物の上 (荷を置く側)。 */
  slew: number;
  /** 吊り具の位置 (腕の上): 0 = 塔の近く、1 = 腕の先。 */
  trolley: number;
  /** フックの高さ: 0 = 下 (地面・床)、1 = 上 (運ぶ高さ)。 */
  hook: number;
  /** 荷の振れ (腕の方向に直角、-1〜1)。 */
  sway: number;
  /** 荷を吊っているか。 */
  loaded: boolean;
}

/** 台形の動き: 0〜1 の時間 t を、0〜1 の進み具合にする。a は加速・減速の割合。 */
export function trapezoid(t: number, a = 0.3): number {
  const x = Math.min(1, Math.max(0, t));
  const v = 1 / (1 - a);
  if (x <= a) return (0.5 * v * x * x) / a;
  if (x <= 1 - a) return 0.5 * v * a + v * (x - a);
  const r = 1 - x;
  return 1 - (0.5 * v * r * r) / a;
}

/** 区間 [from, to] の中の進み具合 (0〜1、台形の動き)。 */
function seg(phase: number, from: number, to: number): number {
  return trapezoid((phase - from) / (to - from));
}

/** 荷が振れる: 旋回が止まった時点から、ゆっくり減衰する振り子。 */
function pendulum(phase: number, start: number): number {
  if (phase < start) return 0;
  const t = phase - start;
  return Math.sin(t * 38) * Math.exp(-t * 9) * 0.35;
}

/** 位相 phase (0〜1) でのクレーンの姿。 */
export function craneMotion(phase: number): CraneMotion {
  const p = ((phase % 1) + 1) % 1;
  const hoistUp = seg(p, 0, 0.12);
  const turnOut = seg(p, 0.12, 0.42);
  const lower = seg(p, 0.42, 0.58);
  const hoistEmpty = seg(p, 0.64, 0.76);
  const turnBack = seg(p, 0.76, 0.98);
  const hookBack = seg(p, 0.92, 1);
  const hook = hoistUp - lower + hoistEmpty - hookBack;
  const slew = turnOut - turnBack;
  const sway = p >= 0.42 ? pendulum(p, 0.42) : p >= 0.12 && p < 0.42 ? 0 : 0;
  return {
    slew: Math.min(1, Math.max(0, slew)),
    trolley: Math.min(1, Math.max(0, turnOut - turnBack)),
    hook: Math.min(1, Math.max(0, hook)),
    sway,
    loaded: p >= 0.03 && p < 0.6,
  };
}
