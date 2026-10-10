import { RoadGraph } from "./roadGraph";
import { Tile, tileAt } from "./terrain";

/** 水と山には道路を敷けない。森は伐採して敷設できる。 */
export function isBuildableTile(t: Tile): boolean {
  return t !== Tile.Water && t !== Tile.Mountain;
}

/** タイル中心 (x.5, y.5) にスナップした座標を返す。 */
export function snapToTileCenter(x: number, y: number): { x: number; y: number } {
  return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
}

/** 既存ノードが近ければそこに、なければタイル中心にスナップする。 */
export function snapPoint(graph: RoadGraph, x: number, y: number, nodeRadius = 0.5): { x: number; y: number } {
  const n = graph.nearestNode(x, y, nodeRadius);
  return n ? { x: n.x, y: n.y } : snapToTileCenter(x, y);
}

/** 線分が通る全タイルが敷設可能か。細かくサンプリングして判定する。 */
export function isSegmentBuildable(seed: number, ax: number, ay: number, bx: number, by: number): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const tile = tileAt(seed, Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t));
    if (!isBuildableTile(tile)) return false;
  }
  return true;
}

/** 曲線道路を短い直線に分けたときの、1 区間のおよその長さ (タイル)。 */
export const CURVE_SEGMENT_LENGTH = 1.5;
/** 曲線の最小の分割数。 */
const CURVE_MIN_SEGMENTS = 4;

export interface Point {
  x: number;
  y: number;
}

/**
 * 始点 a、制御点 c、終点 b の二次ベジェ曲線を、短い直線の折れ線にした頂点列 (始点と終点を含む)。
 * 始点・終点はそのまま、間の頂点は小数のまま (道路網は小数の座標を扱える)。
 * 制御点が a-b の直線上にあれば、ほぼ直線になる。
 */
export function curvePoints(a: Point, c: Point, b: Point): Point[] {
  // およその長さ: 制御多角形の長さと弦の長さの平均
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const poly = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
  const length = (2 * chord + poly) / 3;
  const n = Math.max(CURVE_MIN_SEGMENTS, Math.ceil(length / CURVE_SEGMENT_LENGTH));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  pts[0] = { x: a.x, y: a.y };
  pts[n] = { x: b.x, y: b.y };
  return pts;
}

/** 折れ線のすべての区間が敷設可能か。 */
export function isPathBuildable(seed: number, pts: readonly Point[]): boolean {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (!isSegmentBuildable(seed, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y)) return false;
  }
  return pts.length >= 2;
}
