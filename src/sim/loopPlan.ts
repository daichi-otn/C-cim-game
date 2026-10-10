/**
 * 四角い道路の枠を一度に引くための計算 (純粋な計算)。2 つの角から、枠の 4 辺と、内側の区切りの道路を決める。
 * 区画は 6 マスちょうどになるように、道路の中心どうしを 7 マス間隔にそろえる (区切りの道路 1 マス + 区画 6 マス)。
 * 1 タイルは 8 m として、辺の長さを表示する。道路の敷設そのものは City の buildPath を使う。
 */
export const METERS_PER_TILE = 8;
/** 区画の幅 (マス)。 */
export const BLOCK_TILES = 6;
/** 道路 1 本ぶん (マス)。道路の中心どうしの間隔は、区画 + 道路 1 本。 */
export const LOOP_STEP = BLOCK_TILES + 1;
export const LOOP_MAX_BLOCKS = 9;

export interface LoopPlan {
  ok: boolean;
  reason?: string;
  /** 枠の 4 つの角 (A → B → C → D の順。閉じるときは A に戻る)。 */
  corners: { x: number; y: number }[];
  /** 内側の区切りの道路 (1 本ずつの 2 点)。 */
  dividers: { x: number; y: number }[][];
  /** 枠の辺の長さ (m)。 */
  sideMeters: [number, number];
}

/** 道路の中心 (タイル + 0.5) に揃えた値にする。 */
const center = (v: number) => Math.floor(v) + 0.5;

/** 2 点の差を、LOOP_STEP の倍数 (1 区画以上) にそろえる。向き (正負) は保つ。 */
function snapLength(d: number): number {
  const sign = d < 0 ? -1 : 1;
  const blocks = Math.min(LOOP_MAX_BLOCKS, Math.max(1, Math.round(Math.abs(d) / LOOP_STEP)));
  return sign * blocks * LOOP_STEP;
}

/** 2 つの角 (a と b、対角) から、枠と区切りを決める。withBlocks が true なら、長い辺に区画 6 マスごとの区切りを入れる。 */
export function planLoop(a: { x: number; y: number }, b: { x: number; y: number }, withBlocks: boolean): LoopPlan {
  const ax = center(a.x);
  const ay = center(a.y);
  const w = snapLength(center(b.x) - ax);
  const h = snapLength(center(b.y) - ay);
  const x0 = Math.min(ax, ax + w);
  const y0 = Math.min(ay, ay + h);
  const x1 = x0 + Math.abs(w);
  const y1 = y0 + Math.abs(h);
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const dividers: { x: number; y: number }[][] = [];
  if (withBlocks) {
    if (Math.abs(w) >= Math.abs(h)) {
      // 横に長い枠は、区画ごとに縦の区切り (道路の中心どうしは LOOP_STEP 間隔)
      for (let x = x0 + LOOP_STEP; x < x1 - 1e-9; x += LOOP_STEP) dividers.push([{ x, y: y0 }, { x, y: y1 }]);
    } else {
      for (let y = y0 + LOOP_STEP; y < y1 - 1e-9; y += LOOP_STEP) dividers.push([{ x: x0, y }, { x: x1, y }]);
    }
  }
  return {
    ok: true,
    corners,
    dividers,
    sideMeters: [Math.abs(w) * METERS_PER_TILE, Math.abs(h) * METERS_PER_TILE],
  };
}
