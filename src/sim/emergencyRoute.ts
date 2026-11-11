import { isCarEdge, projectOnSegment, type RoadGraph } from "./roadGraph";

export interface EmergencyStep { edge: number; from: number; to: number }

/** 道路上の部分区間を含む最短経路。一方通行と車が通れない道路を尊重する。 */
export function emergencyRoute(graph: RoadGraph, start: { x: number; y: number }, end: { x: number; y: number }, reach = 4): EmergencyStep[] | null {
  const first = graph.nearestEdge(start.x, start.y, reach, isCarEdge);
  const last = graph.nearestEdge(end.x, end.y, reach, isCarEdge);
  if (!first || !last) return null;
  const project = (e: typeof first, p: typeof start) => {
    const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!;
    return projectOnSegment(p.x, p.y, a.x, a.y, b.x, b.y).t;
  };
  const startT = project(first, start), endT = project(last, end);
  type Arc = { target: string; step: EmergencyStep; length: number };
  const adj = new Map<string, Arc[]>();
  const add = (a: string, b: string, step: EmergencyStep, length: number) => {
    const list = adj.get(a) ?? []; list.push({ target: b, step, length }); adj.set(a, list);
  };
  for (const e of graph.edges.values()) {
    if (!isCarEdge(e)) continue;
    const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!;
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    const points = [{ t: 0, key: `n${e.a}` }, { t: 1, key: `n${e.b}` }];
    if (e.id === first.id) points.push({ t: startT, key: "start" });
    if (e.id === last.id) points.push({ t: endT, key: "end" });
    points.sort((x, y) => x.t - y.t);
    for (let i = 0; i + 1 < points.length; i++) {
      const p = points[i]!, q = points[i + 1]!;
      const d = (q.t - p.t) * length;
      if (e.oneWay !== -1 || d < 1e-9) add(p.key, q.key, { edge: e.id, from: p.t, to: q.t }, d);
      if (e.oneWay !== 1 || d < 1e-9) add(q.key, p.key, { edge: e.id, from: q.t, to: p.t }, d);
    }
  }
  const dist = new Map<string, number>([["start", 0]]);
  const prev = new Map<string, { key: string; step: EmergencyStep }>();
  const done = new Set<string>();
  for (;;) {
    let node: string | undefined, best = Infinity;
    for (const [key, value] of dist) if (!done.has(key) && value < best) { node = key; best = value; }
    if (node === undefined) return null;
    if (node === "end") break;
    done.add(node);
    for (const arc of adj.get(node) ?? []) {
      const next = best + arc.length;
      if (next < (dist.get(arc.target) ?? Infinity)) { dist.set(arc.target, next); prev.set(arc.target, { key: node, step: arc.step }); }
    }
  }
  const steps: EmergencyStep[] = [];
  for (let key = "end"; key !== "start";) { const p = prev.get(key)!; steps.unshift(p.step); key = p.key; }
  return steps.filter((s) => Math.abs(s.from - s.to) > 1e-9);
}
