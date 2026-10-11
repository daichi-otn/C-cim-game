import * as THREE from "three";
import type { City } from "../sim/city";
import { hash2 } from "../sim/rng";
import { ROAD_SPECS } from "../sim/roadTypes";
import { edgeCongestion } from "../sim/traffic";
import type { RoadGraph } from "../sim/roadGraph";
import { GeoBuilder } from "./geo";
import { CAR, idmAccel, nearestSegment, stepSpeed, stopSpeed, turnToward, wrapAngle, yieldsTo } from "./carMotion";
import type { Roads3D } from "./roads3d";
import { TILE } from "./terrain3d";
import type { ZoneCell } from "../sim/zoning";
import { ZoneType } from "../sim/zoning";
import { lotCenter } from "../sim/zoning";

/** 1 本の道路に同時に走らせる車の数の上限と、交通量 (台/日) あたりの台数。 */
const MAX_CARS_PER_EDGE = 12;
const FLOW_PER_CAR = 5;
/** 空いている道での車の速さ (タイル/秒)。混むと遅くなる。 */
const FREE_SPEED = 3;
const MIN_SPEED_RATIO = 0.15;
/** 車を描くときの、中心線からの距離 (px)。左側通行で、進行方向の左を走る。 */
const LANE_PX = TILE * 0.14;
const CAR_COLORS = [0xe8e8ea, 0xd9564a, 0x4a90e2, 0xf2c230, 0x5ec27a, 0x8a8f98];
const CAPACITY = 6000;

/** 混雑具合の色: 空いている = 緑、容量いっぱい = 黄、それ以上 = 赤。 */
export function congestionColor(ratio: number): number {
  const t = Math.min(1, ratio);
  if (t < 0.5) return lerp(0x5ec27a, 0xf2c230, t * 2);
  return lerp(0xf2c230, 0xe05a4f, (t - 0.5) * 2);
}
function lerp(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 道路の 1 区間を、どちら向きに進むか (1 = a から b、-1 = b から a)。 */
interface Step {
  edge: number;
  dir: number;
}

/** 走っている 1 台。edge の上の位置 p (0 = a 端、1 = b 端) と、進む向き dir、これから通る道順 (route)。 */
interface Car {
  edge: number;
  p: number;
  dir: number;
  route: Step[];
  seed: number;
  color: number;
}

/**
 * 区間の両端のつながり (どの区間が、どの交差点につながるか)。道路が変わったときだけ作り直す。
 * 一方通行は、進める向きだけつなぐ。
 */
export function travelFrom(graph: RoadGraph, node: number): Step[] {
  const out: Step[] = [];
  for (const e of graph.edges.values()) {
    if (e.a === node && e.oneWay !== -1) out.push({ edge: e.id, dir: 1 });
    else if (e.b === node && e.oneWay !== 1) out.push({ edge: e.id, dir: -1 });
  }
  return out;
}

/**
 * 出発の交差点から、目的地 (ランダムに選んだ交差点) までの道順を求める (最短の道のり)。
 * 行き先が届かないときは空の道順 (その場で引き返す)。見た目のための計算で、街の交通の計算には使わない。
 */
export function routeTo(graph: RoadGraph, from: number, seed: number, goal?: number): Step[] {
  const nodes = [...graph.nodes.keys()];
  if (nodes.length < 2) return [];
  const target = goal ?? nodes[Math.floor(hash2(seed, from, nodes.length) * nodes.length)]!;
  if (target === from || !graph.nodes.has(target)) return [];
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, Step & { from: number }>();
  const done = new Set<number>();
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) {
      best = d;
      cur = n;
    }
    if (cur < 0) return [];
    if (cur === target) break;
    done.add(cur);
    for (const st of travelFrom(graph, cur)) {
      const e = graph.edges.get(st.edge)!;
      const other = st.dir > 0 ? e.b : e.a;
      const a = graph.nodes.get(e.a)!;
      const b = graph.nodes.get(e.b)!;
      const nd = best + Math.hypot(b.x - a.x, b.y - a.y);
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        prev.set(other, { edge: st.edge, dir: st.dir, from: cur });
      }
    }
  }
  const steps: Step[] = [];
  for (let n = target; n !== from; ) {
    const p = prev.get(n)!;
    steps.unshift({ edge: p.edge, dir: p.dir });
    n = p.from;
  }
  return steps;
}

/** 車 1 台。edge の上の位置 p (0 = a 端、1 = b 端)、進む向き dir、今の速さ speed (タイル/秒)、向き heading (ラジアン)。 */
interface Car {
  edge: number;
  p: number;
  dir: number;
  /** 今いる区間の、先の道順 (今の区間は含まない)。 */
  route: Step[];
  seed: number;
  color: number;
  speed: number;
  heading: number;
  /** 行き先 (交差点)。-1 は、まだ決めていない。 */
  dest: number;
  /** いまの目的: 職場へ行く (work) か、住宅へ帰る (home) か。 */
  goal: "work" | "home";
  /** 目的地で止まっている残りの時間 (秒)。0 なら走る。 */
  dwell: number;
  /** U ターンの進み (秒)。-1 なら、U ターンしていない。 */
  uturn: number;
  braking: boolean;
  /** 車の中心の位置 (タイル)。道路が作り替わったとき、いまの道路へ戻すために使う。 */
  ax: number;
  ay: number;
}

const DWELL_MIN = 3;
const DWELL_MAX = 8;
const UTURN_SEC = 1.2;

/** 道路のつながりを見る: 建物 (住宅・職場) の前の交差点。道路が変わるたびに作り直す。 */
function frontNodeOf(graph: RoadGraph, c: ZoneCell): number | null {
  const { x, y } = lotCenter(c);
  const e = graph.nearestEdge(x, y, 4);
  if (!e) return null;
  const a = graph.nodes.get(e.a);
  const b = graph.nodes.get(e.b);
  if (!a || !b) return null;
  const da = Math.hypot(a.x - x, a.y - y);
  const db = Math.hypot(b.x - x, b.y - y);
  return da <= db ? e.a : e.b;
}

/** 混雑の色: 空いている = 緑、容量いっぱい = 黄、それ以上 = 赤。 */

/** 道路を走る車 (箱の車体と窓)・夜のライト・ブレーキのライト・混雑の色。車は住宅と職場を行き来し、前の車との間隔で加速・減速し、行き止まりでは U ターンする (見た目のみ)。 */
export class Traffic3D {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private cabin: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private tail: THREE.InstancedMesh;
  private brake: THREE.InstancedMesh;
  private heatMesh: THREE.Mesh | null = null;
  private cars: Car[] = [];
  private drawnKey = "";
  private destKey = "";
  /** 住宅の前の交差点と、職場の前の交差点。 */
  private homeNodes: number[] = [];
  private workNodes: number[] = [];
  /** 交通量が変わったときの、車の数の倍率。 */
  private carScale = 1;
  /** 混雑の色を道路に重ねるか。 */
  showHeat = false;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpC = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private carSerial = 0;

  constructor(private city: City, private roads: Roads3D) {
    this.group.name = "traffic";
    const bodyGeo = new THREE.BoxGeometry(4.6, 1.3, 2.3);
    bodyGeo.translate(0, 0.9, 0);
    const cabinGeo = new THREE.BoxGeometry(2.4, 1, 2.0);
    cabinGeo.translate(-0.2, 2, 0);
    this.body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), CAPACITY);
    this.cabin = new THREE.InstancedMesh(cabinGeo, new THREE.MeshStandardMaterial({ color: 0x24303d, roughness: 0.2, metalness: 0.4 }), CAPACITY);
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 0.6);
    this.head = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), CAPACITY * 2);
    this.tail = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff4a3a }), CAPACITY * 2);
    // ブレーキのライトは、昼でも光る (減速したとき、大きく赤く)
    const brakeGeo = new THREE.BoxGeometry(0.7, 0.7, 0.6);
    this.brake = new THREE.InstancedMesh(brakeGeo, new THREE.MeshBasicMaterial({ color: 0xff1a10 }), CAPACITY * 2);
    for (const m of [this.body, this.cabin, this.head, this.tail, this.brake]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.body.castShadow = true;
    this.cabin.castShadow = true;
  }

  /** グラフィック設定から、車の台数の倍率を決める (0 で車を出さない)。 */
  setCarScale(v: number): void {
    this.carScale = v;
  }

  /** simDt: 前回からの経過秒 (ゲームの速度をかけたもの。一時停止中は 0)。night: 夜の度合い。 */
  update(simDt: number, night: number): void {
    const { city } = this;
    const graph = city.graph;
    const destKey = `${city.zones.version}:${graph.version}`;
    if (destKey !== this.destKey) {
      this.destKey = destKey;
      this.rebuildDestinations();
      for (const c of this.cars) {
        c.route = [];
        c.dest = -1;
      }
    }
    const key = `${city.trafficVersion}:${graph.version}:${this.showHeat}:${this.carScale}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.rebuild();
    }
    let n = 0;
    let ln = 0;
    let bn = 0;
    const lit = night > 0.1;
    for (const car of this.cars) {
      if (n >= CAPACITY) break;
      const dt = simDt;
      this.step(car, dt);
      const e = graph.edges.get(car.edge);
      if (!e) continue;
      const a = graph.nodes.get(e.a)!;
      const b = graph.nodes.get(e.b)!;
      const p = car.p;
      car.ax = a.x + (b.x - a.x) * p;
      car.ay = a.y + (b.y - a.y) * p;
      const dx = Math.cos(car.heading);
      const dz = Math.sin(car.heading);
      // 進行方向の左側を走る (y が南向きなので、進行方向 (dx,dz) の左は (dz,-dx))
      const x = (a.x + (b.x - a.x) * p) * TILE + dz * LANE_PX;
      const z = (a.y + (b.y - a.y) * p) * TILE - dx * LANE_PX;
      const y = this.roads.heightOnEdge(car.edge, p);
      this.tmpQ.setFromAxisAngle(this.up, -car.heading);
      this.tmpM.compose(new THREE.Vector3(x, y, z), this.tmpQ, new THREE.Vector3(1, 1, 1));
      this.body.setMatrixAt(n, this.tmpM);
      this.cabin.setMatrixAt(n, this.tmpM);
      this.body.setColorAt(n, this.tmpC.setHex(car.color));
      n++;
      const fx = x + dx * 2.3;
      const fz = z + dz * 2.3;
      const bx = x - dx * 2.3;
      const bz = z - dz * 2.3;
      if (lit) {
        for (const s of [-0.8, 0.8]) {
          this.tmpM.compose(new THREE.Vector3(fx - dz * s, y + 0.9, fz + dx * s), this.tmpQ, new THREE.Vector3(1, 1, 1));
          this.head.setMatrixAt(ln, this.tmpM);
          this.tmpM.compose(new THREE.Vector3(bx - dz * s, y + 0.9, bz + dx * s), this.tmpQ, new THREE.Vector3(1, 1, 1));
          this.tail.setMatrixAt(ln, this.tmpM);
          ln++;
        }
      }
      if (car.braking) {
        for (const s of [-0.8, 0.8]) {
          this.tmpM.compose(new THREE.Vector3(bx - dz * s, y + 0.9, bz + dx * s), this.tmpQ, new THREE.Vector3(1, 1, 1));
          this.brake.setMatrixAt(bn, this.tmpM);
          bn++;
        }
      }
    }
    this.body.count = n;
    this.cabin.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.head.count = ln;
    this.tail.count = ln;
    this.head.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
    this.brake.count = bn;
    this.brake.instanceMatrix.needsUpdate = true;
  }

  /** 1 台を 1 フレーム動かす: 止まる・U ターン・前の車との間隔・交差点。 */
  private step(car: Car, dt: number): void {
    const graph = this.city.graph;
    if (dt <= 0) {
      car.braking = false;
      return;
    }
    // 目的地で止まっている
    if (car.dwell > 0) {
      car.dwell = Math.max(0, car.dwell - dt);
      car.speed = stepSpeed(car.speed, -CAR.decel, dt);
      car.braking = car.speed > 0.05;
      if (car.dwell === 0) this.nextTrip(car);
      return;
    }
    // U ターン中: その場で向きを変えてから、逆向きに走り出す
    if (car.uturn >= 0) {
      car.uturn += dt;
      const target = car.heading + Math.PI;
      car.heading = turnToward(car.heading, target, Math.PI / UTURN_SEC, dt);
      car.braking = false;
      if (car.uturn >= UTURN_SEC) {
        car.uturn = -1;
        car.dir = -car.dir;
        car.heading = wrapAngle(car.heading);
        car.route = [];
        this.planFrom(car, this.endNode(car));
      }
      return;
    }
    const e = graph.edges.get(car.edge);
    if (!e) return;
    const a = graph.nodes.get(e.a)!;
    const b = graph.nodes.get(e.b)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ratio = edgeCongestion(graph, car.edge, this.city.traffic.flow.get(car.edge) ?? 0, this.city.traffic.capMult);
    let vTarget = FREE_SPEED * ROAD_SPECS[e.type].speed * Math.max(MIN_SPEED_RATIO, 1 - 0.85 * Math.min(1, ratio));
    const distToEnd = (car.dir > 0 ? 1 - car.p : car.p) * len;
    // 行き先 (または行き止まり) の手前では、ぴたりと止まるように減速する
    if (car.route.length === 0) vTarget = Math.min(vTarget, stopSpeed(distToEnd) + 0.05);
    // 次の区間が大きく曲がるときは、交差点の手前で速さを落とす (カーブ)
    else if (distToEnd < 1.5) {
      const next = car.route[0]!;
      const nd = Math.abs(this.headingOf(next) - car.heading);
      if (Math.min(nd, Math.PI * 2 - nd) > 0.6) vTarget = Math.min(vTarget, 1.4);
    }
    // 交差点: 先に着く車がいるなら、手前で止まって譲る (車が交差点の中で重ならないように)
    if (distToEnd < 3 && distToEnd > 0.5 && this.mustYield(car, distToEnd)) vTarget = Math.min(vTarget, stopSpeed(distToEnd - 0.4) + 0.05);
    // 前の車との間隔
    const leader = this.leaderOf(car, len);
    const accel = idmAccel(car.speed, vTarget, leader?.gap ?? null, leader?.speed ?? 0);
    car.speed = stepSpeed(car.speed, accel, dt);
    car.braking = accel < -0.8;
    car.p += (car.dir * car.speed * dt) / len;
    // 向きは、今の区間の向きへ、急に変えずに回す
    car.heading = turnToward(car.heading, this.headingOf({ edge: car.edge, dir: car.dir }), CAR.turnRate, dt);
    if (car.p >= 1 || car.p <= 0) this.arrive(car);
  }

  /** 交差点へ向かう、ほかの車 (動いていて、同じ交差点へ向かう) が、先に着くか。 */
  private mustYield(car: Car, distToEnd: number): boolean {
    const node = this.endNode(car);
    for (const o of this.cars) {
      if (o === car || o.dwell > 0 || o.uturn >= 0 || o.speed < 0.3) continue;
      if (o.edge === car.edge && o.dir === car.dir) continue; // 同じ車線の前の車は、間隔の計算で扱う
      if (this.endNode(o) !== node) continue;
      const oe = this.city.graph.edges.get(o.edge);
      if (!oe) continue;
      const olen = Math.hypot(this.city.graph.nodes.get(oe.b)!.x - this.city.graph.nodes.get(oe.a)!.x, this.city.graph.nodes.get(oe.b)!.y - this.city.graph.nodes.get(oe.a)!.y) || 1;
      const oDist = (o.dir > 0 ? 1 - o.p : o.p) * olen;
      if (oDist < 3 && yieldsTo(distToEnd, car.seed, oDist, o.seed)) return true;
    }
    return false;
  }

  /** 区間の向き (ラジアン)。 */
  private headingOf(st: Step): number {
    const e = this.city.graph.edges.get(st.edge);
    if (!e) return 0;
    const a = this.city.graph.nodes.get(e.a)!;
    const b = this.city.graph.nodes.get(e.b)!;
    return Math.atan2((b.y - a.y) * st.dir, (b.x - a.x) * st.dir);
  }

  /** 今の区間の、進む先の交差点。 */
  private endNode(car: Car): number {
    const e = this.city.graph.edges.get(car.edge)!;
    return car.dir > 0 ? e.b : e.a;
  }

  /** 前にいる車 (同じ区間・同じ向き) との距離 (タイル) と、その速さ。 */
  private leaderOf(car: Car, len: number): { gap: number; speed: number } | null {
    let best: { gap: number; speed: number } | null = null;
    for (const o of this.cars) {
      if (o === car || o.edge !== car.edge || o.dir !== car.dir) continue;
      const ahead = (car.dir > 0 ? o.p - car.p : car.p - o.p) * len;
      if (ahead <= 0) continue;
      if (!best || ahead < best.gap) best = { gap: ahead, speed: o.speed };
    }
    return best;
  }

  /** 交差点に着いた: 次の区間へ進む、目的地で止まる、行き止まりで U ターンする。 */
  private arrive(car: Car): void {
    const graph = this.city.graph;
    const reached = this.endNode(car);
    car.p = car.p >= 1 ? 1 : 0;
    if (car.route.length === 0) {
      if (car.dest === reached) {
        car.dest = -1;
        car.dwell = DWELL_MIN + (DWELL_MAX - DWELL_MIN) * hash2(car.seed, reached, this.carSerial++);
        car.speed = 0;
        return;
      }
      // 行き止まり (道順がない): その場で U ターン
      car.speed = 0;
      car.uturn = 0;
      return;
    }
    const step = car.route.shift()!;
    if (!graph.edges.has(step.edge)) {
      car.route = [];
      car.speed = 0;
      car.uturn = 0;
      return;
    }
    car.edge = step.edge;
    car.dir = step.dir;
    car.p = step.dir > 0 ? 0 : 1;
    // 次の区間へ進んだので、その先の道順が要る (route は次の区間より先の分)
    if (car.route.length === 0 && car.dest !== -1) this.planFrom(car, this.endNode(car));
  }

  /** 目的地を決める (住宅と職場を行き来する)。 */
  private nextTrip(car: Car): void {
    car.goal = car.goal === "work" ? "home" : "work";
    car.dest = -1;
    this.planFrom(car, this.endNode(car));
  }

  /** いまの交差点から、目的地までの道順を作る。目的地が決まっていなければ、目的の種類 (住宅か職場) から選ぶ。 */
  private planFrom(car: Car, from: number): void {
    if (car.dest < 0) {
      const list = car.goal === "work" ? this.workNodes : this.homeNodes;
      const pool = list.length > 0 ? list : [...this.city.graph.nodes.keys()];
      car.dest = pool[Math.floor(hash2(car.seed, from + this.carSerial++, pool.length) * pool.length)] ?? -1;
      if (car.dest === from) car.dest = -1;
    }
    car.route = car.dest >= 0 ? routeTo(this.city.graph, from, car.seed, car.dest) : [];
    if (car.dest >= 0 && car.route.length === 0 && from !== car.dest) car.dest = -1; // 届かない場所は、選び直す
  }

  /** 住宅の前と、職場の前の交差点を集める。 */
  private rebuildDestinations(): void {
    this.homeNodes = [];
    this.workNodes = [];
    const graph = this.city.graph;
    for (const c of this.city.zones.cells.values()) {
      if (c.building === 0 || c.part !== undefined || !c.served) continue;
      if (c.zone === ZoneType.Residential) {
        if (c.residents <= 0) continue;
        const n = frontNodeOf(graph, c);
        if (n !== null) this.homeNodes.push(n);
      } else if (c.zone === ZoneType.Commercial || c.zone === ZoneType.Industrial || c.zone === ZoneType.Office) {
        const n = frontNodeOf(graph, c);
        if (n !== null) this.workNodes.push(n);
      }
    }
  }

  /** 交通量が変わったので、車の台数を合わせ直し、混雑の色を作り直す。 */
  private rebuild(): void {
    const { city } = this;
    // 道路が作り替わると、車の区間が消える (交差点で分割された等)。車は消さず、いまの位置に近い区間へ移す
    const kept: Car[] = [];
    if (this.carScale > 0) {
      let segs: { id: number; ax: number; ay: number; bx: number; by: number }[] | null = null;
      for (const c of this.cars) {
        if (city.graph.edges.has(c.edge)) {
          kept.push(c);
          continue;
        }
        segs ??= [...city.graph.edges.values()].map((e) => {
          const a = city.graph.nodes.get(e.a)!;
          const b = city.graph.nodes.get(e.b)!;
          return { id: e.id, ax: a.x, ay: a.y, bx: b.x, by: b.y };
        });
        const near = nearestSegment(c.ax, c.ay, segs);
        if (!near) continue;
        const e = city.graph.edges.get(near.id)!;
        const a = city.graph.nodes.get(e.a)!;
        const b = city.graph.nodes.get(e.b)!;
        c.edge = near.id;
        c.p = near.t;
        // 向きは、いまの車の向きに近い方 (一方通行なら、その向き)
        c.dir = e.oneWay !== 0 ? e.oneWay : Math.cos(c.heading) * (b.x - a.x) + Math.sin(c.heading) * (b.y - a.y) >= 0 ? 1 : -1;
        c.route = [];
        this.planFrom(c, this.endNode(c));
        kept.push(c);
      }
    }
    for (const [id, flow] of city.traffic.flow) {
      if (!city.graph.edges.has(id)) continue;
      const want = this.carScale <= 0 ? 0 : Math.round(Math.min(MAX_CARS_PER_EDGE, Math.max(1, Math.round(flow / FLOW_PER_CAR))) * this.carScale);
      const oneWayDir = city.graph.edges.get(id)!.oneWay;
      const here = kept.filter((c) => c.edge === id);
      while (here.length > want) {
        const removed = here.pop()!;
        kept.splice(kept.indexOf(removed), 1);
      }
      for (let i = here.length; i < want; i++) {
        const seed = hash2(id, i, 3) * 1e6;
        const dir = oneWayDir !== 0 ? oneWayDir : i % 2 === 0 ? 1 : -1;
        const a = city.graph.nodes.get(city.graph.edges.get(id)!.a)!;
        const b = city.graph.nodes.get(city.graph.edges.get(id)!.b)!;
        const car: Car = {
          edge: id,
          p: hash2(id, i, 4),
          dir,
          route: [],
          seed,
          color: CAR_COLORS[Math.floor(hash2(id, i, 7) * CAR_COLORS.length)]!,
          speed: 0,
          heading: Math.atan2((b.y - a.y) * dir, (b.x - a.x) * dir),
          dest: -1,
          goal: hash2(id, i, 9) < 0.5 ? "work" : "home",
          dwell: 0,
          uturn: -1,
          braking: false,
          ax: a.x + (b.x - a.x) * hash2(id, i, 4),
          ay: a.y + (b.y - a.y) * hash2(id, i, 4),
        };
        this.planFrom(car, this.endNode(car));
        here.push(car);
        kept.push(car);
      }
    }
    this.cars = kept;

    if (this.heatMesh) {
      this.group.remove(this.heatMesh);
      this.heatMesh.geometry.dispose();
      (this.heatMesh.material as THREE.Material).dispose();
      this.heatMesh = null;
    }
    if (!this.showHeat) return;
    const g = new GeoBuilder();
    for (const e of city.graph.edges.values()) {
      const flow = city.traffic.flow.get(e.id);
      if (!flow) continue;
      const a = city.graph.nodes.get(e.a)!;
      const b = city.graph.nodes.get(e.b)!;
      const color = congestionColor(edgeCongestion(city.graph, e.id, flow, city.traffic.capMult));
      g.strip(a.x * TILE, a.y * TILE, b.x * TILE, b.y * TILE, TILE * 0.5, 1.0, color);
    }
    const geo = g.build();
    if (!geo) return;
    this.heatMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthTest: false }));
    this.heatMesh.renderOrder = 8;
    this.group.add(this.heatMesh);
  }

  dispose(): void {
    for (const m of [this.body, this.cabin, this.head, this.tail, this.brake]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    if (this.heatMesh) {
      this.heatMesh.geometry.dispose();
      (this.heatMesh.material as THREE.Material).dispose();
    }
  }
}
