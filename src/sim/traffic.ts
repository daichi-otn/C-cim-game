import { WORKER_RATIO } from "./demand";
import { ROAD_SPECS, RoadType, roadCapacity, roadSpeed } from "./roadTypes";
import { isCarEdge, projectOnSegment, type RoadGraph } from "./roadGraph";
import { ZONE_REACH, ZoneType, cellCapacity, type ZoneCell, type ZoneMap } from "./zoning";

/** 標準の道路 (通り) が 1 日にさばける車の数。これを超えると混む。道路の種類ごとの容量は roadTypes にある。 */
export const EDGE_CAPACITY = ROAD_SPECS[RoadType.Street].capacity;
/** 住民 1 人が 1 日に買い物へ出る回数 (商業の雇用が行き先)。通勤は WORKER_RATIO (住民の 6 割が働き、商業と工業が行き先)。 */
export const SHOP_TRIPS_PER_RESIDENT = 0.3;
/** 混雑具合 (流量 / 容量) がこの値を超えた区間は「渋滞」。 */
export const JAM_RATIO = 1;
/** 経路を求め直す回数。混んだ道を避けて、少しずつ流れを割り振り直す。 */
const ASSIGN_ITERATIONS = 4;
/** 混雑で通りにくくなる度合い。距離に (1 + この値 × 混雑具合²) をかけた長さで経路を選ぶ。 */
const CONGESTION_PENALTY = 1.5;

export interface TrafficResult {
  /** 道路の区間 id → 1 日の交通量 (台)。 */
  flow: Map<number, number>;
  /** 1 日の移動の総数 (通勤と買い物)。 */
  trips: number;
  /** 行き先がなくて出かけられない移動の数。 */
  stranded: number;
  /** 混雑具合 (流量 / 容量) が JAM_RATIO を超えた区間の数。 */
  jammed: number;
  /** 走行距離で重みづけした、混雑具合の平均。 */
  avgCongestion: number;
  /** 求めたときの道路の容量の倍率 (天気による。雨・雪で下がる)。混雑具合の表示に使う。 */
  capMult: number;
}

export const emptyTraffic = (): TrafficResult => ({ flow: new Map(), trips: 0, stranded: 0, jammed: 0, avgCongestion: 0, capMult: 1 });

/** 区間の混雑具合。1 で容量いっぱい。 */
export const congestionOf = (flow: number, capacity = EDGE_CAPACITY): number => flow / capacity;

/** 道路の区間 edgeId の混雑具合 (その種類の容量に対する交通量の比)。 */
export function edgeCongestion(graph: RoadGraph, edgeId: number, flow: number, capMult = 1): number {
  const e = graph.edges.get(edgeId);
  return e ? congestionOf(flow, Math.max(1, roadCapacity(e.type, e.oneWay !== 0, e.lanes, e.laneCount) * capMult)) : 0;
}

/** 渋滞が需要を下げる量 (0 以上)。平均の混雑具合が 0.8 を超えた分に比例し、最大 0.3。 */
export function trafficDemandPenalty(t: TrafficResult): number {
  return Math.min(0.3, Math.max(0, (t.avgCongestion - 0.8) * 0.5));
}

/** 小さな二分ヒープ (経路探索の優先度つき待ち行列)。 */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): { key: number; val: number } {
    const k = this.keys;
    const v = this.vals;
    const top = { key: k[0]!, val: v[0]! };
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1]! < k[c]!) c++;
        if (k[c]! >= lastK) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

interface Adj {
  /** 区間 (道路の区間をさらに細かく分けたもの) の番号。 */
  edge: number;
  to: number;
}

/** 建物が道路に出入りするタイル: 敷地のうち、車の通れる道路にいちばん近いもの (1×1 なら、そのタイル)。 */
function frontTile(graph: RoadGraph, zones: ZoneMap, c: ZoneCell): { x: number; y: number } {
  if (c.w * c.h <= 1) return c;
  let best: { x: number; y: number } = c;
  let bestDist = Infinity;
  for (const t of zones.lotCells(c)) {
    const d = graph.distanceToRoad(t.x + 0.5, t.y + 0.5, ZONE_REACH, isCarEdge);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/**
 * 建物のタイルが道路に出入りする場所。いちばん近い道路の区間の、真横の位置 (1 タイル刻み)。
 * 区間の端なら元のノード、途中なら「edge:位置」で表す。道路が届かなければ null。
 */
function accessPoint(graph: RoadGraph, x: number, y: number): { key: string; edgeId: number; pos: number } | null {
  const e = graph.nearestEdge(x + 0.5, y + 0.5, ZONE_REACH, isCarEdge);
  if (!e) return null;
  const a = graph.nodes.get(e.a)!;
  const b = graph.nodes.get(e.b)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const pos = Math.round(projectOnSegment(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y).t * len);
  if (pos <= 0) return { key: `n${e.a}`, edgeId: e.id, pos: 0 };
  if (pos >= len) return { key: `n${e.b}`, edgeId: e.id, pos: len };
  return { key: `e${e.id}:${pos}`, edgeId: e.id, pos };
}

/**
 * 1 日ぶんの交通量を求める。
 * 供給のある住宅の住民が、通勤 (商業・工業の雇用へ) と買い物 (商業の雇用へ) に出かける。
 * 行き先は、雇用の多さに比例し、遠いほど選ばれにくい。道路でつながっていない建物へは行けない。
 * 経路は、混んでいない道を選ぶ。何度か割り振り直して、混んだ道を避ける流れに近づける (結果は毎回同じ)。
 * 建物が道路の途中に面しているときは、そこで道路の区間を分けて、出入りする場所にする。
 * capMult: 天気による道路の容量の倍率 (雨・雪で下がる)。
 */
export function calcTraffic(graph: RoadGraph, zones: ZoneMap, capMult = 1): TrafficResult {
  // 建物の出入口を集める
  interface Site {
    key: string;
    homes: number;
    jobsC: number;
    jobsI: number;
  }
  const sites = new Map<string, Site>();
  const cuts = new Map<number, Set<number>>(); // 道路の区間 id → 途中で分ける位置
  let stranded = 0;
  for (const c of zones.cells.values()) {
    if (c.building === 0 || !c.served) continue;
    const isHome = c.zone === ZoneType.Residential;
    if (isHome && c.residents === 0) continue;
    const front = frontTile(graph, zones, c);
    const ap = accessPoint(graph, front.x, front.y);
    if (!ap) {
      if (isHome) stranded += c.residents * (WORKER_RATIO + SHOP_TRIPS_PER_RESIDENT);
      continue;
    }
    let site = sites.get(ap.key);
    if (!site) sites.set(ap.key, (site = { key: ap.key, homes: 0, jobsC: 0, jobsI: 0 }));
    if (isHome) site.homes += c.residents;
    else if (c.zone === ZoneType.Commercial) site.jobsC += cellCapacity(c);
    else site.jobsI += cellCapacity(c); // 工業とオフィス: 通勤の行き先にだけなる
    if (ap.key.startsWith("e")) {
      let set = cuts.get(ap.edgeId);
      if (!set) cuts.set(ap.edgeId, (set = new Set()));
      set.add(ap.pos);
    }
  }

  // 道路網を、出入口で区切った区間の隣接リストにする
  const index = new Map<string, number>();
  const nodeOf = (key: string) => {
    let i = index.get(key);
    if (i === undefined) index.set(key, (i = index.size));
    return i;
  };
  for (const id of graph.nodes.keys()) nodeOf(`n${id}`);
  const adj: Adj[][] = [];
  const edgeIds: number[] = []; // 区間 (細かい) → 元の道路の区間 id
  const edgeLen: number[] = [];
  const edgeCap: number[] = []; // 区間ごとの容量 (道路の種類による)
  const edgeSpeed: number[] = [];
  for (const e of graph.edges.values()) {
    const spec = ROAD_SPECS[e.type];
    if (spec.capacity === 0) continue; // 歩行者道は車が通れない
    const a = graph.nodes.get(e.a)!;
    const b = graph.nodes.get(e.b)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const stops = [{ pos: 0, key: `n${e.a}` }, ...[...(cuts.get(e.id) ?? [])].sort((p, q) => p - q).map((pos) => ({ pos, key: `e${e.id}:${pos}` })), { pos: len, key: `n${e.b}` }];
    for (let k = 0; k + 1 < stops.length; k++) {
      const from = nodeOf(stops[k]!.key);
      const to = nodeOf(stops[k + 1]!.key);
      const slot = edgeIds.length;
      edgeIds.push(e.id);
      edgeLen.push(stops[k + 1]!.pos - stops[k]!.pos);
      edgeCap.push(roadCapacity(e.type, e.oneWay !== 0, e.lanes, e.laneCount) * capMult);
      edgeSpeed.push(roadSpeed(e.type, e.oneWay !== 0));
      // 一方通行は、決まった向きにだけ進める (a → b なら、道路の始端から終端へ)
      if (e.oneWay !== -1) (adj[from] ??= []).push({ edge: slot, to });
      if (e.oneWay !== 1) (adj[to] ??= []).push({ edge: slot, to: from });
    }
  }
  const n = index.size;
  for (let i = 0; i < n; i++) adj[i] ??= [];
  const residents = new Float64Array(n);
  const jobsC = new Float64Array(n);
  const jobsI = new Float64Array(n);
  for (const site of sites.values()) {
    const i = index.get(site.key)!;
    residents[i]! += site.homes;
    jobsC[i]! += site.jobsC;
    jobsI[i]! += site.jobsI;
  }
  const origins: number[] = [];
  for (let i = 0; i < n; i++) if (residents[i]! > 0) origins.push(i);

  const totalTrips = origins.reduce((s, o) => s + residents[o]! * (WORKER_RATIO + SHOP_TRIPS_PER_RESIDENT), 0);
  const flow = new Float64Array(edgeIds.length);
  let reached = totalTrips;

  /** 起点 o から出る移動を、行き先ごとに経路へ割り振る (結果は next に足す)。行き先に着けた移動の数を返す。 */
  const assign = (o: number, cost: number[], next: Float64Array): number => {
    const dist = new Float64Array(n).fill(Infinity);
    const viaEdge = new Int32Array(n).fill(-1);
    const from = new Int32Array(n).fill(-1);
    dist[o] = 0;
    const heap = new MinHeap();
    heap.push(0, o);
    const order: number[] = [];
    while (heap.size > 0) {
      const { key, val } = heap.pop();
      if (key > dist[val]!) continue;
      order.push(val);
      for (const a of adj[val]!) {
        const d = key + cost[a.edge]!;
        if (d < dist[a.to]!) {
          dist[a.to] = d;
          viaEdge[a.to] = a.edge;
          from[a.to] = val;
          heap.push(d, a.to);
        }
      }
    }
    // 行き先の重み = 雇用数 / (1 + 距離)。通勤は商業と工業、買い物は商業だけ
    const load = new Float64Array(n);
    let delivered = 0;
    for (const [trips, useIndustry] of [[residents[o]! * WORKER_RATIO, true], [residents[o]! * SHOP_TRIPS_PER_RESIDENT, false]] as const) {
      let sum = 0;
      for (const d of order) sum += (jobsC[d]! + (useIndustry ? jobsI[d]! : 0)) / (1 + dist[d]!);
      if (sum === 0) continue;
      for (const d of order) {
        const w = (jobsC[d]! + (useIndustry ? jobsI[d]! : 0)) / (1 + dist[d]!);
        if (w > 0) load[d]! += (trips * w) / sum;
      }
      delivered += trips;
    }
    // 遠い所から順に、流れを起点へ向けてたどって、通った区間に足す
    for (let k = order.length - 1; k > 0; k--) {
      const v = order[k]!;
      const l = load[v]!;
      if (l === 0) continue;
      next[viaEdge[v]!]! += l;
      load[from[v]!]! += l;
    }
    return delivered;
  };

  if (origins.length > 0) {
    const avg = new Float64Array(edgeIds.length);
    for (let iter = 1; iter <= ASSIGN_ITERATIONS; iter++) {
      const cost = edgeLen.map((len, s) => (len / edgeSpeed[s]!) * (1 + CONGESTION_PENALTY * congestionOf(avg[s]!, edgeCap[s]!) ** 2));
      const next = new Float64Array(edgeIds.length);
      reached = 0;
      for (const o of origins) reached += assign(o, cost, next);
      // 移動平均で、前の割り振りと混ぜる
      for (let s = 0; s < next.length; s++) avg[s] = avg[s]! + (next[s]! - avg[s]!) / iter;
    }
    flow.set(avg);
  }

  const result = emptyTraffic();
  result.capMult = capMult;
  result.trips = Math.round(totalTrips + stranded); // 車で出入りできる道路がなくて出かけられない人の分も含む
  result.stranded = Math.max(0, Math.round(stranded + (totalTrips - reached)));
  let weighted = 0;
  let weight = 0;
  for (let s = 0; s < edgeIds.length; s++) {
    const f = flow[s]!;
    if (f <= 0) continue;
    // 1 本の道路が出入口で分かれているときは、いちばん混んだ部分をその道路の交通量にする
    result.flow.set(edgeIds[s]!, Math.max(f, result.flow.get(edgeIds[s]!) ?? 0));
    weighted += congestionOf(f, edgeCap[s]!) * f * edgeLen[s]!;
    weight += f * edgeLen[s]!;
  }
  for (const [id, f] of result.flow) if (edgeCongestion(graph, id, f, capMult) > JAM_RATIO) result.jammed++;
  result.avgCongestion = weight > 0 ? weighted / weight : 0;
  return result;
}
