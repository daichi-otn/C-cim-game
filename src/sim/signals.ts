import type { RoadGraph } from "./roadGraph";
import { LANE } from "./roadTypes";

/**
 * 交差点の信号 (純粋な計算)。3 本以上の道路が集まる交差点には、すべて信号がある。
 * 道路を、向きで 2 組 (東西・南北) に分け、組ごとに交互に青になる (間に黄色と、全部が赤の時間を挟む)。
 * 時間は、ゲームの時間 (秒)。一時停止の間は止まる。
 */

/** 青・黄色の長さ (秒)。 */
export const GREEN_SEC = 11;
export const YELLOW_SEC = 2;
/** 1 周期 (両方の組が 1 回ずつ青になる)。 */
export const CYCLE_SEC = 2 * (GREEN_SEC + YELLOW_SEC);
export const MIN_ADAPTIVE_GREEN_SEC = 7;
export const MAX_ADAPTIVE_GREEN_SEC = 18;

export type Light = "green" | "yellow" | "red";

/** 交差点ごとに、そこにつながる道路がどの組 (0 = 東西, 1 = 南北) か。信号のない交差点は含めない。 */
export type SignalPlan = Map<number, Map<number, number>>;

/** 交差点ごとの交通量に応じた信号時間。保存せず、道路と交通量から毎回求める。 */
export interface SignalTiming {
  green: [number, number];
  cycle: number;
  /** バスレーンがある組。公共交通の優先配分を示す。 */
  priorityGroup?: number;
}

export type SignalTimings = Map<number, SignalTiming>;

/** 道路の接続数から交差点の種類を数える。信号は3方向以上、十字以上は4方向以上。 */
export function intersectionStats(graph: RoadGraph): { t: number; cross: number; signal: number } {
  let t = 0; let cross = 0; let signal = 0;
  for (const node of graph.nodes.values()) {
    const degree = graph.degree(node.id);
    if (degree === 3) t++;
    else if (degree >= 4) cross++;
    if (degree >= 3) signal++;
  }
  return { t, cross, signal };
}

/** グラフから信号の計画を作る。道路が 3 本以上つながる交差点だけ。 */
export function buildSignalPlan(graph: RoadGraph): SignalPlan {
  const plan: SignalPlan = new Map();
  const count = new Map<number, number>();
  for (const e of graph.edges.values()) {
    count.set(e.a, (count.get(e.a) ?? 0) + 1);
    count.set(e.b, (count.get(e.b) ?? 0) + 1);
  }
  for (const e of graph.edges.values()) {
    for (const [node, other] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      if ((count.get(node) ?? 0) < 3) continue;
      const n = graph.nodes.get(node)!;
      const o = graph.nodes.get(other)!;
      // 交差点から道路の先へ向かう向き。東西に近ければ 0、南北に近ければ 1
      const dx = o.x - n.x;
      const dy = o.y - n.y;
      let m = plan.get(node);
      if (!m) plan.set(node, (m = new Map()));
      m.set(e.id, Math.abs(dx) >= Math.abs(dy) ? 0 : 1);
    }
  }
  return plan;
}

/** 組 (0 か 1) の信号の色。t は秒。 */
export function lightOf(group: number, t: number): Light {
  const c = ((t % CYCLE_SEC) + CYCLE_SEC) % CYCLE_SEC;
  // 組 0 は 0〜13 秒 (青 11 + 黄 2)、組 1 は 13〜26 秒
  const start = group === 0 ? 0 : GREEN_SEC + YELLOW_SEC;
  const rel = (c - start + CYCLE_SEC) % CYCLE_SEC;
  if (rel < GREEN_SEC) return "green";
  if (rel < GREEN_SEC + YELLOW_SEC) return "yellow";
  return "red";
}

/** 交差点の交通量から、青時間を組ごとに配分する。最低時間を確保して閑散側も進める。 */
export function buildSignalTimings(graph: RoadGraph, flow: ReadonlyMap<number, number>): SignalTimings {
  const plan = buildSignalPlan(graph);
  const timings: SignalTimings = new Map();
  for (const [node, approaches] of plan) {
    const demand: [number, number] = [0, 0];
    for (const [edge, group] of approaches) demand[group]! += Math.max(0, flow.get(edge) ?? 0);
    const priorityGroup = [...approaches].find(([edge]) => (graph.edges.get(edge)?.lanes ?? 0) & LANE.Bus)?.[1];
    const baseTotal = demand[0] + demand[1];
    if (priorityGroup !== undefined && baseTotal > 0) demand[priorityGroup]! += Math.max(1, baseTotal * 0.15);
    const total = demand[0] + demand[1];
    if (total <= 0) {
      timings.set(node, { green: [GREEN_SEC, GREEN_SEC], cycle: CYCLE_SEC, priorityGroup });
      continue;
    }
    const available = 2 * GREEN_SEC;
    const first = Math.max(MIN_ADAPTIVE_GREEN_SEC, Math.min(MAX_ADAPTIVE_GREEN_SEC, (available * demand[0]) / total));
    const second = Math.max(MIN_ADAPTIVE_GREEN_SEC, Math.min(MAX_ADAPTIVE_GREEN_SEC, available - first));
    timings.set(node, { green: [first, second], cycle: first + second + 2 * YELLOW_SEC, priorityGroup });
  }
  return timings;
}

/** 交通量で調整された信号の色。青時間の後ろに黄色・全赤を置く。 */
export function timedLightOf(group: number, t: number, timing?: SignalTiming): Light {
  if (!timing) return lightOf(group, t);
  const c = ((t % timing.cycle) + timing.cycle) % timing.cycle;
  const first = timing.green[0];
  const secondStart = first + YELLOW_SEC;
  const secondEnd = secondStart + timing.green[1];
  if (group === 0) {
    if (c < first) return "green";
    if (c < first + YELLOW_SEC) return "yellow";
    return "red";
  }
  if (c < secondStart) return "red";
  if (c < secondEnd) return "green";
  if (c < secondEnd + YELLOW_SEC) return "yellow";
  return "red";
}
