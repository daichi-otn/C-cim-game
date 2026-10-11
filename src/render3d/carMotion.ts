/**
 * 車の動き (純粋な計算)。加速・減速は、前の車との車間距離で決まる (IDM という、実際の交通の研究でよく使う式)。
 * 向きは、急に変えず、速さに応じた速さで回す (カーブ・U ターンを滑らかに見せる)。単位は、距離がタイル、速さがタイル/秒、時間が秒。
 */
export const CAR = {
  /** 発進の加速 (タイル/秒²)。 */
  accel: 1.4,
  /** ブレーキの強さ (タイル/秒²)。 */
  decel: 2.5,
  /** 前の車との、安全な時間の間隔 (秒)。 */
  headway: 0.9,
  /** 停まったときの、前の車との最小の間隔 (タイル)。 */
  minGap: 0.6,
  /** 向きを変える速さの上限 (ラジアン/秒)。 */
  turnRate: 3.2,
} as const;

/**
 * 今の加速度。vTarget は目標の速さ、gap は前の車までの距離 (前がなければ null)、leaderV は前の車の速さ。
 * 負の値は減速 (ブレーキ)。
 */
export function idmAccel(v: number, vTarget: number, gap: number | null, leaderV: number): number {
  const vt = Math.max(vTarget, 0.01);
  const free = 1 - Math.pow(Math.max(v, 0) / vt, 4);
  if (gap === null) return CAR.accel * free;
  const dv = v - leaderV;
  const sStar = CAR.minGap + Math.max(0, v * CAR.headway + (v * dv) / (2 * Math.sqrt(CAR.accel * CAR.decel)));
  return CAR.accel * (free - Math.pow(sStar / Math.max(gap, 0.01), 2));
}

/** 速さを、加速度の分だけ変える。0 より下にはならない。 */
export function stepSpeed(v: number, accel: number, dt: number): number {
  return Math.max(0, v + accel * dt);
}

/** 角度を −π〜π に収める。 */
export function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/** 今の向き h を、目標の向き target へ、最大の回転速度 maxRate (ラジアン/秒) で近づける。 */
export function turnToward(h: number, target: number, maxRate: number, dt: number): number {
  const d = wrapAngle(target - h);
  const step = maxRate * dt;
  return wrapAngle(h + Math.max(-step, Math.min(step, d)));
}

/**
 * 止まるための速さの上限。残りの距離 dist (タイル) で、ブレーキをかけて止まれる速さ。
 * 行き止まりや、行き先で、ぴたりと止まるために使う。
 */
export function stopSpeed(dist: number): number {
  return Math.sqrt(2 * CAR.decel * Math.max(0, dist));
}
