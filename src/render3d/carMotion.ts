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

/** 点 (px,py) から線分 (a→b) への、一番近い点の位置 t (0〜1) と距離 (タイル)。 */
export function projectOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { t, dist: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) };
}

/** 点に一番近い線分の id と、その上の位置 t。線分がなければ null。道路が作り替えられた車を、今の道路へ戻すために使う。 */
export function nearestSegment(px: number, py: number, segs: readonly { id: number; ax: number; ay: number; bx: number; by: number }[]): { id: number; t: number } | null {
  let best: { id: number; t: number; dist: number } | null = null;
  for (const s of segs) {
    const r = projectOnSegment(px, py, s.ax, s.ay, s.bx, s.by);
    if (!best || r.dist < best.dist) best = { id: s.id, t: r.t, dist: r.dist };
  }
  return best ? { id: best.id, t: best.t } : null;
}

/**
 * 交差点で、今の車が譲るか。相手の車が、先に (交差点までの距離が短く) 着くなら譲る。
 * 距離が同じときは、車の番号 (seed) の小さい方が先。順番が一本に決まるので、互いに譲り合って止まることはない。
 */
export function yieldsTo(myDist: number, mySeed: number, otherDist: number, otherSeed: number): boolean {
  return otherDist < myDist || (otherDist === myDist && otherSeed < mySeed);
}

/** 車の長さ (前後の幅、タイル)。 */
export const CAR_LEN = 0.3;
/** 車線の中心から、車の中心までの横のずれ (タイル)。対向車線は、その 2 倍ずれる。 */
export const LANE_OFFSET = 0.14;

/**
 * 同じ車線で前にいる車との車間 (タイル、車の前後の長さを引いたもの)。前にいなければ null。
 * (mx,my) は自分の車線の位置、h は自分の向き、(ox,oy) は相手の車線の位置。look より先は見ない。
 */
export function aheadGap(mx: number, my: number, h: number, ox: number, oy: number, look: number): number | null {
  const fx = Math.cos(h);
  const fy = Math.sin(h);
  const rx = ox - mx;
  const ry = oy - my;
  const along = rx * fx + ry * fy;
  const lateral = Math.abs(-rx * fy + ry * fx);
  // 対向車線は、横に 2 倍の距離 (0.28) ずれているので、数えない。曲がり角のずれも許すように、少し広く見る
  if (along <= 0 || along > look || lateral > 0.2) return null;
  return along - CAR_LEN;
}

/** 同じ車線で、車どうしが重なっているか (前後の長さの中に、相手の中心がある)。 */
export function overlapsInLane(mx: number, my: number, h: number, ox: number, oy: number): boolean {
  const fx = Math.cos(h);
  const fy = Math.sin(h);
  const rx = ox - mx;
  const ry = oy - my;
  return Math.abs(rx * fx + ry * fy) < CAR_LEN && Math.abs(-rx * fy + ry * fx) <= 0.1;
}

/** 車線の上の、車の中心の位置 (タイル)。(ax,ay) は道路の中心線の上の点、h は車線の向き。左側を走る。 */
export function lanePoint(ax: number, ay: number, h: number): { x: number; y: number } {
  return { x: ax + Math.sin(h) * LANE_OFFSET, y: ay - Math.cos(h) * LANE_OFFSET };
}

