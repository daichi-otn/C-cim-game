/**
 * 建物の向き: 建物の出入口 (南の壁) が、目の前の道路の方を向くように、回す角度を決める。
 * 向きは 90 度ごとに揃える (斜めに回すと、建物の角が道路や隣の建物にはみ出して、ぐちゃぐちゃに見えるため)。
 * 道路が曲がっていれば、建物の前の道路の向きに一番近い 4 方向のどれかに揃う。四角でない敷地は、0 度か 180 度だけ。
 * 工場は向きを変えない。見た目だけで、街の計算には関わらない。
 */
import type { RoadGraph } from "../sim/roadGraph";
import type { ZoneCell } from "../sim/zoning";
import { kindOf } from "./buildingShape";

/** この距離 (タイル) の中の道路を、建物の向きの手がかりにする。 */
const ORIENT_REACH = 3;
/** 向きを揃える刻み (90 度)。斜めに回すと、建物の角がはみ出すので、90 度ごとに揃える。 */
export const ORIENT_STEP = Math.PI / 2;

/** 建物を回す角度 (ラジアン。0 が南向き = 出入口が南)。道路がなければ 0。 */
export function frontRotation(graph: RoadGraph, c: ZoneCell): number {
  // 工場は、煙突の位置を回さない計算で出しているので、向きは変えない
  if (kindOf(c) === "factory") return 0;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  const e = graph.nearestEdge(cx, cy, ORIENT_REACH);
  if (!e) return 0;
  const a = graph.nodes.get(e.a);
  const b = graph.nodes.get(e.b);
  if (!a || !b) return 0;
  // 建物の中心から、道路 (線分) のいちばん近い点の方向。そこが、目の前の道路になる
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((cx - a.x) * dx + (cy - a.y) * dz) / len2)) : 0;
  const vx = a.x + dx * t - cx;
  const vz = a.y + dz * t - cy;
  if (Math.hypot(vx, vz) < 1e-6) return 0;
  // 出入口 (南 = +z) を、道路の方向へ向ける
  const theta = Math.atan2(vz, vx) - Math.PI / 2;
  if (c.w !== c.h) return Math.round(theta / Math.PI) * Math.PI; // 四角でない敷地は 0 か 180 度だけ
  return Math.round(theta / ORIENT_STEP) * ORIENT_STEP; // 四角は 90 度ごと
}
