/** 道路網。座標はタイル単位 (1 = 1タイル)。ノードは交差点・端点、エッジはその間の直線区間。 */
export interface RoadNode {
  id: number;
  x: number;
  y: number;
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  type: RoadType;
  /** 一方通行の向き。0 = 両方向、1 = a から b だけ、-1 = b から a だけ。 */
  oneWay: OneWay;
  /** 曲線道路の一続きの番号。0 = 曲線ではない。同じ番号の区間は、撤去のとき一緒に消える。 */
  chain: number;
  /** 橋・トンネルか。 */
  structure: Structure;
  /** 車線の種類 (LANE のビットの組み合わせ)。0 = 普通の道路。 */
  lanes: number;
  /** 車線の数 (両方向の合計。2〜20)。容量と建設費に効く。 */
  laneCount: number;
}

export type OneWay = 0 | 1 | -1;

/** 直近の addRoad で、新しく敷いた区間と、種類を変えた (アップグレードした) 区間。費用の計算に使う。 */
export interface RoadChange {
  built: { length: number; type: RoadType; structure: Structure; laneCount: number }[];
  changed: { length: number; from: RoadType; to: RoadType; structure: Structure; fromLanes: number; toLanes: number }[];
}

import { Structure, isStructure, upkeepMultOf } from "./structures";
import { DEFAULT_LANE_COUNT, DEFAULT_ROAD_TYPE, MAX_LANE_COUNT, MIN_LANE_COUNT, ROAD_SPECS, isRoadType, roadCapacity, type RoadType } from "./roadTypes";

/** 建物の出入口になれる道路か (高速道路は不可)。 */
export const isAccessEdge = (e: RoadEdge) => ROAD_SPECS[e.type].access && e.structure === Structure.None;
/** 車が走れる道路か (歩行者道は不可)。 */
export const isCarEdge = (e: RoadEdge) => ROAD_SPECS[e.type].capacity > 0;

/** 道路が交差点でこれ以上曲がらなければ、同じ道路が続くとみなす (約 25 度)。 */
const MAX_RUN_TURN_COS = Math.cos((25 * Math.PI) / 180);

const EPS = 1e-6;

const nodeKey = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 点 p を線分 ab に射影する。t は線分上の位置 (0..1)、dist は線分までの距離。 */
export function projectOnSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const raw = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  const t = Math.min(1, Math.max(0, raw));
  return { t, dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
}

/** 線分 a1a2 と b1b2 の交点。平行 (重なり含む) なら null。t は前者、u は後者上の位置。 */
function intersect(
  a1x: number, a1y: number, a2x: number, a2y: number,
  b1x: number, b1y: number, b2x: number, b2y: number,
): { x: number; y: number; t: number; u: number } | null {
  const d1x = a2x - a1x;
  const d1y = a2y - a1y;
  const d2x = b2x - b1x;
  const d2y = b2y - b1y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const cx = b1x - a1x;
  const cy = b1y - a1y;
  const t = (cx * d2y - cy * d2x) / denom;
  const u = (cx * d1y - cy * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1x + t * d1x, y: a1y + t * d1y, t, u };
}

/** 保存用の道路網。ノードは [id, x, y]、エッジは [id, 端点a, 端点b, 種類, 一方通行の向き, 曲線の番号, 橋・トンネル]。種類・向き・曲線の番号・橋トンネルがない古い保存データは「通り」「両方向」「曲線ではない」「普通の道路」とみなす。 */
export interface RoadGraphData {
  nextId: number;
  nodes: [number, number, number][];
  edges: [number, number, number, number?, number?, number?, number?, number?, number?][];
}

export class RoadGraph {
  readonly nodes = new Map<number, RoadNode>();
  readonly edges = new Map<number, RoadEdge>();
  /** 変更のたびに増える。描画側が再描画の要否を判断するのに使う。 */
  version = 0;
  /** 直近の addRoad の結果。 */
  lastChange: RoadChange = { built: [], changed: [] };

  private nodeByKey = new Map<string, number>();
  private edgeByPair = new Map<string, number>();
  private adj = new Map<number, Set<number>>();
  private nextId = 1;

  /**
   * (ax,ay)-(bx,by) の道路を敷く。既存の道路との交差点・T字・重なりは自動で区間に分割する。
   * 新しく敷いた区間と、種類を変えた区間の数の合計を返す (すでに全部同じ種類で敷設済みなら 0)。既存エッジの分割は数えない。
   * 既存の道路と重なった部分は、type が違えばその種類に変わる (アップグレード・ダウングレード)。
   * oneWay なら、始点 (ax,ay) から終点 (bx,by) へ向かう一方通行になる。重なった部分も、向きがその通りに変わる。
   */
  addRoad(ax: number, ay: number, bx: number, by: number, type: RoadType = DEFAULT_ROAD_TYPE, oneWay = false, chain = 0, structure: Structure = Structure.None, lanes = 0, laneCount = DEFAULT_LANE_COUNT): number {
    this.lastChange = { built: [], changed: [] };
    if (Math.hypot(bx - ax, by - ay) < EPS) return 0;

    // 1. 端点が既存エッジの途中にあるなら、そこで既存エッジを分割する (T字・重なり対策)
    for (const [px, py] of [[ax, ay], [bx, by]] as const) {
      for (const e of [...this.edges.values()]) {
        const na = this.nodes.get(e.a)!;
        const nb = this.nodes.get(e.b)!;
        const { dist } = projectOnSegment(px, py, na.x, na.y, nb.x, nb.y);
        if (dist < EPS && Math.hypot(px - na.x, py - na.y) > EPS && Math.hypot(px - nb.x, py - nb.y) > EPS) {
          this.splitEdge(e, this.getOrCreateNode(px, py));
        }
      }
    }

    // 2. 既存エッジとの交差点で、既存エッジを分割する
    for (const e of [...this.edges.values()]) {
      const na = this.nodes.get(e.a)!;
      const nb = this.nodes.get(e.b)!;
      const hit = intersect(ax, ay, bx, by, na.x, na.y, nb.x, nb.y);
      if (hit && hit.t > EPS && hit.t < 1 - EPS && hit.u > EPS && hit.u < 1 - EPS) {
        this.splitEdge(e, this.getOrCreateNode(hit.x, hit.y));
      }
    }

    // 3. 線分上にある全ノード (端点・交点・既存ノード) を順に結ぶ
    const start = this.getOrCreateNode(ax, ay);
    const end = this.getOrCreateNode(bx, by);
    const cuts: { t: number; id: number }[] = [];
    for (const n of this.nodes.values()) {
      const { t, dist } = projectOnSegment(n.x, n.y, ax, ay, bx, by);
      if (dist < EPS || n.id === start.id || n.id === end.id) cuts.push({ t, id: n.id });
    }
    cuts.sort((p, q) => p.t - q.t);
    let changes = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i]!.id;
      const b = cuts[i + 1]!.id;
      const na = this.nodes.get(a)!;
      const nb = this.nodes.get(b)!;
      const length = Math.hypot(nb.x - na.x, nb.y - na.y);
      const existing = this.edgeByPair.get(pairKey(a, b));
      if (existing === undefined) {
        if (this.addEdgeRaw(a, b, type, oneWay ? 1 : 0, chain, structure, lanes, laneCount)) {
          this.lastChange.built.push({ length, type, structure, laneCount });
          changes++;
        }
      } else {
        const e = this.edges.get(existing)!;
        // 描いた向き (a → b) が、既存の区間の向きと同じなら 1、逆なら -1
        const want: OneWay = oneWay ? (e.a === a ? 1 : -1) : 0;
        if (e.type !== type || e.oneWay !== want || e.lanes !== lanes || e.laneCount !== laneCount) {
          this.lastChange.changed.push({ length, from: e.type, to: type, structure: e.structure, fromLanes: e.laneCount, toLanes: laneCount });
          e.type = type;
          e.oneWay = want;
          e.lanes = lanes;
          e.laneCount = laneCount;
          this.version++;
          changes++;
        }
      }
    }
    return changes;
  }

  /** 保存用のデータにする。 */
  toData(): RoadGraphData {
    return {
      nextId: this.nextId,
      nodes: [...this.nodes.values()].map((n) => [n.id, n.x, n.y]),
      edges: [...this.edges.values()].map((e) => [e.id, e.a, e.b, e.type, e.oneWay, e.chain, e.structure, e.lanes, e.laneCount]),
    };
  }

  /** 保存用のデータから復元する。壊れたデータなら Error を投げる。 */
  static fromData(d: RoadGraphData): RoadGraph {
    const g = new RoadGraph();
    let maxId = 0;
    for (const [id, x, y] of d.nodes) {
      if (!Number.isInteger(id) || id < 1 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error("道路のノードが不正です");
      const key = nodeKey(x, y);
      if (g.nodes.has(id) || g.nodeByKey.has(key)) throw new Error("道路のノードが重複しています");
      g.nodes.set(id, { id, x, y });
      g.nodeByKey.set(key, id);
      g.adj.set(id, new Set());
      maxId = Math.max(maxId, id);
    }
    for (const [id, a, b, rawType, rawOneWay, rawChain, rawStructure, rawLanes, rawLaneCount] of d.edges) {
      const structure = rawStructure === undefined ? Structure.None : rawStructure;
      if (!isStructure(structure)) throw new Error("橋・トンネルの種類が不正です");
      const chain = rawChain === undefined ? 0 : rawChain;
      if (!Number.isInteger(chain) || chain < 0) throw new Error("曲線道路の番号が不正です");
      const type = rawType === undefined ? DEFAULT_ROAD_TYPE : rawType;
      if (!isRoadType(type)) throw new Error("道路の種類が不正です");
      const oneWay = rawOneWay === undefined ? 0 : rawOneWay;
      if (oneWay !== 0 && oneWay !== 1 && oneWay !== -1) throw new Error("道路の向きが不正です");
      if (!Number.isInteger(id) || id < 1 || !g.nodes.has(a) || !g.nodes.has(b) || a === b) throw new Error("道路のエッジが不正です");
      const pair = pairKey(a, b);
      if (g.edges.has(id) || g.edgeByPair.has(pair)) throw new Error("道路のエッジが重複しています");
      const lanes = rawLanes === undefined ? 0 : rawLanes;
      if (!Number.isInteger(lanes) || lanes < 0 || lanes > 15) throw new Error("車線の種類が不正です");
      // 車線の数は、古いデータでは既定の 2 車線
      const laneCount = rawLaneCount === undefined ? DEFAULT_LANE_COUNT : rawLaneCount;
      if (!Number.isInteger(laneCount) || laneCount < MIN_LANE_COUNT || laneCount > MAX_LANE_COUNT) throw new Error("車線の数が不正です");
      g.edges.set(id, { id, a, b, type, oneWay, chain, structure, lanes, laneCount });
      g.edgeByPair.set(pair, id);
      g.adj.get(a)!.add(id);
      g.adj.get(b)!.add(id);
      maxId = Math.max(maxId, id);
    }
    if (!Number.isInteger(d.nextId) || d.nextId <= maxId) throw new Error("道路の番号が不正です");
    g.nextId = d.nextId;
    g.version++;
    return g;
  }

  /** 道路を撤去する。端点のノードが孤立したら一緒に消す。 */
  removeEdge(id: number): boolean {
    const e = this.edges.get(id);
    if (!e) return false;
    this.deleteEdge(e);
    for (const nid of [e.a, e.b]) {
      if ((this.adj.get(nid)?.size ?? 0) === 0) this.deleteNode(nid);
    }
    this.version++;
    return true;
  }

  /**
   * 橋やトンネルの途中 (両側が橋・トンネルの点) で、別の道路が交わったり枝分かれしたりしていないか。
   * していれば、その点の座標を返す (なければ null)。橋の上やトンネルの中では交差できない。
   */
  structureJunction(): { x: number; y: number } | null {
    for (const n of this.nodes.values()) {
      const inc = [...(this.adj.get(n.id) ?? [])].map((id) => this.edges.get(id)!);
      // 同じ橋・トンネル (同じ番号) の区間が 2 本以上つながる点が、ほかの道路ともつながっていたら、途中での交差
      const perChain = new Map<number, number>();
      for (const e of inc) if (e.structure !== Structure.None) perChain.set(e.chain, (perChain.get(e.chain) ?? 0) + 1);
      if (inc.length > 2 && [...perChain.values()].some((k) => k >= 2)) return { x: n.x, y: n.y };
    }
    return null;
  }

  /** (x,y) から maxDist 以内にある、建物の出入口になれる道路の容量 (台/日) の最大。なければ 0。 */
  maxAccessCapacity(x: number, y: number, maxDist: number): number {
    let best = 0;
    for (const e of this.edges.values()) {
      if (!isAccessEdge(e)) continue;
      const na = this.nodes.get(e.a)!;
      const nb = this.nodes.get(e.b)!;
      if (projectOnSegment(x, y, na.x, na.y, nb.x, nb.y).dist > maxDist) continue;
      best = Math.max(best, roadCapacity(e.type, e.oneWay !== 0, e.lanes, e.laneCount));
    }
    return best;
  }

  /**
   * edgeId の道路と「ひとつながり」の区間の番号を返す (edgeId を含む。順序は決まっていない)。
   * 交差点で区間が分かれていても、ほぼまっすぐに続く (向きの違いが約 25 度以内)、または同じ曲線の区間なら、同じ道路とみなす。
   * 種類・橋/トンネルの別・一方通行の有無が同じ区間だけをたどる。
   */
  roadRun(edgeId: number): number[] {
    const start = this.edges.get(edgeId);
    if (!start) return [];
    const run = new Set<number>([edgeId]);
    const dirOut = (e: RoadEdge, from: number) => {
      const a = this.nodes.get(from)!;
      const b = this.nodes.get(e.a === from ? e.b : e.a)!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    };
    const walk = (first: RoadEdge, fromNode: number) => {
      let e = first;
      let node = fromNode; // e の、これから進む向きの端点ではなく、進んできた側の端点
      for (;;) {
        const next = e.a === node ? e.b : e.a; // 進む先の端点
        const heading = dirOut(e, node);
        let best: RoadEdge | null = null;
        let bestCos = -2;
        for (const id of this.adj.get(next) ?? []) {
          const c = this.edges.get(id)!;
          if (run.has(c.id) || c.type !== e.type || c.structure !== e.structure || (c.oneWay === 0) !== (e.oneWay === 0) || c.lanes !== e.lanes || c.laneCount !== e.laneCount) continue;
          const d = dirOut(c, next);
          const cos = heading.x * d.x + heading.y * d.y;
          const sameCurve = c.chain !== 0 && c.chain === e.chain;
          if ((sameCurve ? cos > -0.2 : cos >= MAX_RUN_TURN_COS) && cos > bestCos) {
            best = c;
            bestCos = cos;
          }
        }
        if (!best) return;
        run.add(best.id);
        e = best;
        node = next;
      }
    };
    walk(start, start.a); // b の側へ
    walk(start, start.b); // a の側へ
    return [...run];
  }

  /**
   * 区間 id の種類を type に変える。変えた内容 (長さ・前後の種類・橋トンネルの別) を返す。同じ種類なら null。
   * 向き・曲線の番号・橋トンネルの別は変わらない。
   */
  retype(edgeId: number, type: RoadType, laneCount = DEFAULT_LANE_COUNT): { length: number; from: RoadType; to: RoadType; structure: Structure; fromLanes: number; toLanes: number } | null {
    const e = this.edges.get(edgeId);
    if (!e || (e.type === type && e.laneCount === laneCount)) return null;
    const a = this.nodes.get(e.a)!;
    const b = this.nodes.get(e.b)!;
    const change = { length: Math.hypot(b.x - a.x, b.y - a.y), from: e.type, to: type, structure: e.structure, fromLanes: e.laneCount, toLanes: laneCount };
    e.type = type;
    e.laneCount = laneCount;
    this.version++;
    return change;
  }

  /** 新しい曲線の番号を発行する (addRoad の chain に渡す)。 */
  newChain(): number {
    return this.nextId++;
  }

  /**
   * 曲線道路を、一続きの全体で撤去する。edgeId が曲線の一部なら、同じ番号の区間をすべて消す。曲線でなければその 1 区間だけ。
   * 消した区間の数を返す。
   */
  removeChain(edgeId: number): number {
    const e = this.edges.get(edgeId);
    if (!e) return 0;
    if (e.chain === 0) return this.removeEdge(edgeId) ? 1 : 0;
    let n = 0;
    for (const other of [...this.edges.values()]) {
      if (other.chain === e.chain && this.removeEdge(other.id)) n++;
    }
    return n;
  }

  /** (x,y) から maxDist 以内で最も近いエッジ。filter があれば、それに合う道路だけを探す (isAccessEdge: 建物の出入口になれる道路、isCarEdge: 車が走れる道路)。 */
  nearestEdge(x: number, y: number, maxDist: number, filter?: (e: RoadEdge) => boolean): RoadEdge | null {
    let best: RoadEdge | null = null;
    let bestDist = maxDist;
    for (const e of this.edges.values()) {
      if (filter && !filter(e)) continue;
      const na = this.nodes.get(e.a)!;
      const nb = this.nodes.get(e.b)!;
      const { dist } = projectOnSegment(x, y, na.x, na.y, nb.x, nb.y);
      if (dist <= bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best;
  }

  /** 道路でつながった範囲ごとに 1 から番号を振る。ノード id → 番号。 */
  components(): Map<number, number> {
    const comp = new Map<number, number>();
    let next = 1;
    for (const start of this.nodes.keys()) {
      if (comp.has(start)) continue;
      const stack = [start];
      comp.set(start, next);
      while (stack.length > 0) {
        const id = stack.pop()!;
        for (const eid of this.adj.get(id) ?? []) {
          const e = this.edges.get(eid)!;
          const other = e.a === id ? e.b : e.a;
          if (!comp.has(other)) {
            comp.set(other, next);
            stack.push(other);
          }
        }
      }
      next++;
    }
    return comp;
  }

  /** 毎月の道路の維持費の合計 (円)。種類ごとの維持費 × 長さ。 */
  totalUpkeep(): number {
    let sum = 0;
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.a)!;
      const b = this.nodes.get(e.b)!;
      sum += Math.hypot(b.x - a.x, b.y - a.y) * ROAD_SPECS[e.type].upkeep * upkeepMultOf(e.structure);
    }
    return sum;
  }

  /** 全道路の長さの合計 (タイル)。 */
  totalLength(): number {
    let sum = 0;
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.a)!;
      const b = this.nodes.get(e.b)!;
      sum += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return sum;
  }

  /** (x,y) から最も近い道路までの距離。maxDist を超える (または道路がない) 場合は Infinity。 */
  distanceToRoad(x: number, y: number, maxDist: number, filter?: (e: RoadEdge) => boolean): number {
    const e = this.nearestEdge(x, y, maxDist, filter);
    if (!e) return Infinity;
    const na = this.nodes.get(e.a)!;
    const nb = this.nodes.get(e.b)!;
    return projectOnSegment(x, y, na.x, na.y, nb.x, nb.y).dist;
  }

  /** (x,y) から radius 以内で最も近いノード。 */
  nearestNode(x: number, y: number, radius: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bestDist = radius;
    for (const n of this.nodes.values()) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }

  /** ノードに接続しているエッジ数。 */
  /** この交差点につながる道路の区間。 */
  edgesAt(nodeId: number): RoadEdge[] {
    return [...(this.adj.get(nodeId) ?? [])].map((id) => this.edges.get(id)!);
  }

  degree(nodeId: number): number {
    return this.adj.get(nodeId)?.size ?? 0;
  }

  // ---- 内部処理 ----

  private getOrCreateNode(x: number, y: number): RoadNode {
    const key = nodeKey(x, y);
    const existing = this.nodeByKey.get(key);
    if (existing !== undefined) return this.nodes.get(existing)!;
    const node: RoadNode = { id: this.nextId++, x, y };
    this.nodes.set(node.id, node);
    this.nodeByKey.set(key, node.id);
    this.adj.set(node.id, new Set());
    this.version++;
    return node;
  }

  /** エッジを追加する。自己ループや重複なら何もせず false。 */
  private addEdgeRaw(a: number, b: number, type: RoadType, oneWay: OneWay = 0, chain = 0, structure: Structure = Structure.None, lanes = 0, laneCount = DEFAULT_LANE_COUNT): boolean {
    if (a === b) return false;
    const key = pairKey(a, b);
    if (this.edgeByPair.has(key)) return false;
    const edge: RoadEdge = { id: this.nextId++, a, b, type, oneWay, chain, structure, lanes, laneCount };
    this.edges.set(edge.id, edge);
    this.edgeByPair.set(key, edge.id);
    this.adj.get(a)!.add(edge.id);
    this.adj.get(b)!.add(edge.id);
    this.version++;
    return true;
  }

  private splitEdge(e: RoadEdge, n: RoadNode): void {
    if (n.id === e.a || n.id === e.b) return;
    this.deleteEdge(e);
    this.addEdgeRaw(e.a, n.id, e.type, e.oneWay, e.chain, e.structure, e.lanes, e.laneCount);
    this.addEdgeRaw(n.id, e.b, e.type, e.oneWay, e.chain, e.structure, e.lanes, e.laneCount);
  }

  private deleteEdge(e: RoadEdge): void {
    this.edges.delete(e.id);
    this.edgeByPair.delete(pairKey(e.a, e.b));
    this.adj.get(e.a)?.delete(e.id);
    this.adj.get(e.b)?.delete(e.id);
  }

  private deleteNode(id: number): void {
    const n = this.nodes.get(id);
    if (!n) return;
    this.nodes.delete(id);
    this.nodeByKey.delete(nodeKey(n.x, n.y));
    this.adj.delete(id);
  }
}
