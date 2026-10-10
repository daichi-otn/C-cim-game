import * as THREE from "three";
import type { City } from "../sim/city";
import { hash2 } from "../sim/rng";
import { ROAD_SPECS } from "../sim/roadTypes";
import { edgeCongestion } from "../sim/traffic";
import type { RoadGraph } from "../sim/roadGraph";
import { GeoBuilder } from "./geo";
import type { Roads3D } from "./roads3d";
import { TILE } from "./terrain3d";

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
export function routeTo(graph: RoadGraph, from: number, seed: number): Step[] {
  const nodes = [...graph.nodes.keys()];
  if (nodes.length < 2) return [];
  const target = nodes[Math.floor(hash2(seed, from, nodes.length) * nodes.length)]!;
  if (target === from) return [];
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

/** 道路を走る車 (箱の車体と窓)・夜のライト・混雑の色。車は、今いる道路から、行き先までの道順を、交差点ごとに曲がりながら走る (見た目のみ)。 */
export class Traffic3D {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private cabin: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private tail: THREE.InstancedMesh;
  private heatMesh: THREE.Mesh | null = null;
  private cars: Car[] = [];
  private drawnKey = "";
  private graphVersionForRoutes = -1;
  /** 混雑の色を道路に重ねるか。 */
  showHeat = false;
  /** 車の台数の倍率 (グラフィック設定。0 で車を出さない)。 */
  private carScale = 1;

  setCarScale(v: number): void {
    this.carScale = v;
  }
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
    for (const m of [this.body, this.cabin, this.head, this.tail]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.body.castShadow = true;
    this.cabin.castShadow = true;
  }

  /** simDt: 前回からの経過秒 (ゲームの速度をかけたもの。一時停止中は 0)。night: 夜の度合い。 */
  update(simDt: number, night: number): void {
    const { city } = this;
    const graph = city.graph;
    const key = `${city.trafficVersion}:${graph.version}:${this.showHeat}:${this.carScale}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.rebuild();
    }
    let n = 0;
    let ln = 0;
    const lit = night > 0.1;
    for (const car of this.cars) {
      if (n >= CAPACITY) break;
      const e = graph.edges.get(car.edge);
      if (!e) continue;
      const a = graph.nodes.get(e.a)!;
      const b = graph.nodes.get(e.b)!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const ratio = edgeCongestion(graph, car.edge, city.traffic.flow.get(car.edge) ?? 0, city.traffic.capMult);
      const speed = FREE_SPEED * ROAD_SPECS[e.type].speed * Math.max(MIN_SPEED_RATIO, 1 - 0.85 * Math.min(1, ratio));
      car.p += (car.dir * speed * simDt) / len;
      if (car.p >= 1 || car.p <= 0) this.turn(car, graph, len);
      const p = car.p;
      const e2 = graph.edges.get(car.edge)!;
      const a2 = graph.nodes.get(e2.a)!;
      const b2 = graph.nodes.get(e2.b)!;
      const len2 = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1;
      const ux = (b2.x - a2.x) / len2;
      const uz = (b2.y - a2.y) / len2;
      const dx = ux * car.dir;
      const dz = uz * car.dir;
      // 進行方向の左側を走る (y が南向きなので、進行方向 (dx,dz) の左は (dz,-dx))
      const x = (a2.x + (b2.x - a2.x) * p) * TILE + dz * LANE_PX;
      const z = (a2.y + (b2.y - a2.y) * p) * TILE - dx * LANE_PX;
      const y = this.roads.heightOnEdge(car.edge, p);
      this.tmpQ.setFromAxisAngle(this.up, -Math.atan2(dz, dx));
      this.tmpM.compose(new THREE.Vector3(x, y, z), this.tmpQ, new THREE.Vector3(1, 1, 1));
      this.body.setMatrixAt(n, this.tmpM);
      this.cabin.setMatrixAt(n, this.tmpM);
      this.body.setColorAt(n, this.tmpC.setHex(car.color));
      n++;
      if (lit) {
        const fx = x + dx * 2.3;
        const fz = z + dz * 2.3;
        const bx = x - dx * 2.3;
        const bz = z - dz * 2.3;
        for (const s of [-0.8, 0.8]) {
          this.tmpM.compose(new THREE.Vector3(fx - dz * s, y + 0.9, fz + dx * s), this.tmpQ, new THREE.Vector3(1, 1, 1));
          this.head.setMatrixAt(ln, this.tmpM);
          this.tmpM.compose(new THREE.Vector3(bx - dz * s, y + 0.9, bz + dx * s), this.tmpQ, new THREE.Vector3(1, 1, 1));
          this.tail.setMatrixAt(ln, this.tmpM);
          ln++;
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
  }

  /**
   * 交差点に着いた車を、道順の次の区間へ進める。道順がなければ、行き先を決め直す。
   * 行き先が届かなければ、その場で引き返す。p は、新しい区間の上の位置に直す。
   */
  private turn(car: Car, graph: RoadGraph, len: number): void {
    const e = graph.edges.get(car.edge)!;
    const reached = car.dir > 0 ? e.b : e.a;
    const over = car.p >= 1 ? car.p - 1 : -car.p;
    if (car.route.length === 0) {
      car.route = routeTo(graph, reached, car.seed + this.carSerial++);
    }
    const step = car.route.shift();
    if (step && graph.edges.has(step.edge)) {
      const ne = graph.edges.get(step.edge)!;
      const from = step.dir > 0 ? ne.a : ne.b;
      if (from === reached) {
        car.edge = step.edge;
        car.dir = step.dir;
        const nl = Math.hypot(graph.nodes.get(ne.b)!.x - graph.nodes.get(ne.a)!.x, graph.nodes.get(ne.b)!.y - graph.nodes.get(ne.a)!.y) || 1;
        car.p = step.dir > 0 ? Math.min(1, over / (nl / len)) : Math.max(0, 1 - over / (nl / len));
        return;
      }
    }
    // 道順が使えないときは、来た道を引き返す (行き止まり)
    car.route = [];
    car.dir = -car.dir;
    car.p = car.p >= 1 ? 1 : 0;
  }

  /** 交通量が変わったので、車の台数を合わせ直し、混雑の色を作り直す。 */
  private rebuild(): void {
    const { city } = this;
    if (city.graph.version !== this.graphVersionForRoutes) {
      // 道路が変わったら、走っている車は道順を決め直す
      this.graphVersionForRoutes = city.graph.version;
      for (const c of this.cars) c.route = [];
    }
    // 走っている車は、道路がなくならない限り消さない (交差点を曲がった先の道路は、交通量がないことがある)
    const kept: Car[] = this.carScale <= 0 ? [] : this.cars.filter((c) => city.graph.edges.has(c.edge) && !city.traffic.flow.has(c.edge));
    for (const [id, flow] of city.traffic.flow) {
      if (!city.graph.edges.has(id)) continue;
      const want = this.carScale <= 0 ? 0 : Math.round(Math.min(MAX_CARS_PER_EDGE, Math.max(1, Math.round(flow / FLOW_PER_CAR))) * this.carScale);
      const oneWayDir = city.graph.edges.get(id)!.oneWay;
      const here = this.cars.filter((c) => c.edge === id);
      while (here.length > want) here.pop();
      for (let i = here.length; i < want; i++) {
        const seed = hash2(id, i, 3) * 1e6;
        here.push({
          edge: id,
          p: hash2(id, i, 4),
          dir: oneWayDir !== 0 ? oneWayDir : i % 2 === 0 ? 1 : -1,
          route: [],
          seed,
          color: CAR_COLORS[Math.floor(hash2(id, i, 7) * CAR_COLORS.length)]!,
        });
      }
      kept.push(...here);
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
    for (const m of [this.body, this.cabin, this.head, this.tail]) {
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
