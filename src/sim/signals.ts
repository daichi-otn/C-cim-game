import type { RoadGraph } from "./roadGraph";

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

export type Light = "green" | "yellow" | "red";

/** 交差点ごとに、そこにつながる道路がどの組 (0 = 東西, 1 = 南北) か。信号のない交差点は含めない。 */
export type SignalPlan = Map<number, Map<number, number>>;

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
