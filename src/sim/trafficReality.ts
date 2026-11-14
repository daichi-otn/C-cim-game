import { LANE } from "./roadTypes";
import type { RoadGraph, RoadEdge } from "./roadGraph";

/** 交差点での進行方向。日本の左側通行を前提に、画面上の左右で表す。 */
export type TurnMovement = "left" | "straight" | "right" | "uturn";

/** 交通規制の種類。事故・工事は短時間の通行規制として扱う。 */
export type TrafficRestrictionKind = "accident" | "construction";

export interface TrafficRestriction {
  kind: TrafficRestrictionKind;
  /** ゲーム内の日数。終了日を含まない。 */
  until: number;
  /** 0 は通行止め、それ以外は容量・速度に掛ける倍率。 */
  capacity: number;
  speed: number;
}

/** エッジの向きに沿った単位ベクトル。 */
function direction(graph: RoadGraph, edgeId: number, dir: number): { x: number; y: number } | null {
  const edge = graph.edges.get(edgeId);
  if (!edge) return null;
  const a = graph.nodes.get(edge.a);
  const b = graph.nodes.get(edge.b);
  if (!a || !b) return null;
  const dx = (b.x - a.x) * (dir >= 0 ? 1 : -1);
  const dy = (b.y - a.y) * (dir >= 0 ? 1 : -1);
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : null;
}

/** 交差点へ入る道路と、交差点から出る道路の進行方向を比較する。 */
export function movementOf(
  graph: RoadGraph,
  nodeId: number,
  incoming: { edge: number; dir: number },
  outgoing: { edge: number; dir: number },
): TurnMovement | null {
  const node = graph.nodes.get(nodeId);
  const inEdge = graph.edges.get(incoming.edge);
  const outEdge = graph.edges.get(outgoing.edge);
  if (!node || !inEdge || !outEdge) return null;
  const inOther = inEdge.a === nodeId ? inEdge.b : inEdge.a;
  const outOther = outEdge.a === nodeId ? outEdge.b : outEdge.a;
  if (!graph.nodes.has(inOther) || !graph.nodes.has(outOther)) return null;
  // incoming は車が進んできた向き、outgoing は交差点から出る向き。
  const incomingVector = direction(graph, incoming.edge, incoming.dir);
  const outgoingVector = direction(graph, outgoing.edge, outgoing.dir);
  if (!incomingVector || !outgoingVector) return null;
  const dot = incomingVector.x * outgoingVector.x + incomingVector.y * outgoingVector.y;
  const cross = incomingVector.x * outgoingVector.y - incomingVector.y * outgoingVector.x;
  if (dot < -0.92) return "uturn";
  if (Math.abs(cross) < 0.22) return "straight";
  // 座標の y は南向きなので、外積の正は画面上の右折になる。
  return cross > 0 ? "right" : "left";
}

/** 右折は対向車を横切るため、左折より待ち時間を長くする。 */
export function turnDelaySeconds(movement: TurnMovement): number {
  switch (movement) {
    case "right": return 2.4;
    case "left": return 0.8;
    case "uturn": return 3.2;
    default: return 0;
  }
}

/** 曲がる車が交差点手前で選ぶ横位置。道路の中心からの追加分。 */
export function turnLaneOffset(movement: TurnMovement, edge: Pick<RoadEdge, "lanes">): number {
  const busLane = (edge.lanes & LANE.Bus) !== 0;
  // バスレーンは公共交通の優先通過用に空ける。一般車は曲がる側へ少し寄せる。
  if (busLane) return movement === "left" ? -0.05 : movement === "right" ? 0.05 : 0;
  if (movement === "left") return -0.08;
  if (movement === "right") return 0.08;
  return 0;
}

/** 事故・工事が指定期間中に道路へ与える実効倍率。 */
export function restrictionFactors(
  restriction: TrafficRestriction | undefined,
  day: number,
): { capacity: number; speed: number; closed: boolean } {
  if (!restriction || day >= restriction.until) return { capacity: 1, speed: 1, closed: false };
  const capacity = Math.max(0, Math.min(1, restriction.capacity));
  const speed = Math.max(0, Math.min(1, restriction.speed));
  return { capacity, speed, closed: capacity === 0 || speed === 0 };
}

