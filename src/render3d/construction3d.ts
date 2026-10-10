import * as THREE from "three";
import type { City } from "../sim/city";
import { FLOOR_PX, baseRect, wallHeight } from "./buildingShape";
import { addLot, type Parts } from "./buildingGeo";
import { applyFacadeShader } from "./facadeShader";
import { frontRotation } from "./orientation";
import { GeoBuilder } from "./geo";
import { basePose, buildStyleOf, constructionSeconds, cranePose, planSites, workerPose } from "./constructionShape";

/** 建設中の建物の 1 か所。本物と同じ形の建物を、地面から切り取り線まで見せる。 */
interface Site {
  key: string;
  age: number;
  dur: number;
  style: "hand" | "crane";
  /** 建物の高さ (px)。 */
  H: number;
  /** 切り取り (建物が見えている上端の高さ)。 */
  plane: THREE.Plane;
  group: THREE.Group;
  solid: THREE.Mesh | null;
  glass: THREE.Mesh | null;
  solidMat: THREE.MeshLambertMaterial;
  glassMat: THREE.MeshStandardMaterial;
  foot: { x: number; z: number; w: number; d: number };
  foundation: THREE.Mesh;
  /** 切り取り線の光る縁 (建物の四辺)。 */
  frontier: THREE.Mesh[];
  /** 手で作るときの作業員。 */
  workers: { root: THREE.Group; arm: THREE.Mesh; body: THREE.Mesh }[];
  /** クレーン (中・高い建物)。 */
  crane: { tower: THREE.Mesh; pivot: THREE.Group; jib: THREE.Mesh; hook: THREE.Mesh; load: THREE.Mesh; towerH: number; stock: number; target: number };
}

const SOIL = 0x8a7a64;
const STEEL = 0x8a8f96;
const CRANE = 0xe0a030;
const LOAD = 0xc2b59c;
const JIB_LEN = 16;
const COLUMN = 1.6;
const HOOK_ABOVE_CUT = 6;
const HOOK_REST = 1.5;

/**
 * 建設中の建物。建ち始めた建物は、本物と同じ形を地面から少しずつ見せる。低い建物は作業員が手で積み、中・高い建物はクレーンで資材を運ぶ。
 * Structures3D は、その場所を描かない。完成したら本物に戻す (形は同じなので、見た目はつながる)。見た目だけで、街の計算には関わらない。
 */
export class Construction3D {
  readonly group = new THREE.Group();
  /** 建設中の場所の集まりが変わるたびに増える (建物の描画が作り直すかの判断用)。 */
  version = 0;
  private sites = new Map<string, Site>();
  private seen = new Map<string, number>();
  private first = true;
  private seenVersion = -1;
  private unit = new THREE.BoxGeometry(1, 1, 1);
  private jibGeo = new THREE.BoxGeometry(1, 1, 1);
  private ball = new THREE.IcosahedronGeometry(1, 1);
  private soilMat = new THREE.MeshLambertMaterial({ color: SOIL });
  private steelMat = new THREE.MeshLambertMaterial({ color: STEEL });
  private craneMat = new THREE.MeshLambertMaterial({ color: CRANE });
  private loadMat = new THREE.MeshLambertMaterial({ color: LOAD });
  private vestMat = new THREE.MeshLambertMaterial({ color: 0xf08a2a });
  private helmetMat = new THREE.MeshLambertMaterial({ color: 0xf5d020 });
  private skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a77c });
  private pantsMat = new THREE.MeshLambertMaterial({ color: 0x3b4250 });
  private frontierMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85, depthWrite: false });
  private snow = { value: 0 };

  constructor(private city: City) {
    this.unit.translate(0, 0.5, 0); // 底が原点
    this.jibGeo.translate(0.5, 0, 0); // 腕は塔の上の点から外へ伸びる
    this.frontierMat.toneMapped = false;
  }

  /** この場所の建物を、今は描かない (建設中のため)。 */
  isHidden(key: string): boolean {
    return this.sites.has(key);
  }

  update(dt: number): void {
    const { zones } = this.city;
    if (zones.version !== this.seenVersion) {
      this.seenVersion = zones.version;
      const now = new Map<string, number>();
      for (const c of zones.cells.values()) if (c.building > 0 && c.part === undefined) now.set(`${c.x},${c.y}`, c.built);
      if (this.first) {
        // 読み込んだ直後の建物は、建設の演出をしない
        this.seen = now;
        this.first = false;
      } else {
        const { start, stop } = planSites(this.seen, now);
        for (const k of stop) this.removeSite(k);
        for (const k of start) {
          const [x, y] = k.split(",").map(Number) as [number, number];
          const c = zones.get(x, y);
          if (c && c.building > 0 && c.part === undefined) this.startSite(k, c.x, c.y);
        }
        this.seen = now;
      }
    }
    for (const [k, s] of [...this.sites]) {
      s.age += dt;
      if (s.age >= s.dur) {
        this.removeSite(k);
        continue;
      }
      this.pose(s);
    }
  }

  private startSite(key: string, x: number, y: number): void {
    const cell = this.city.zones.get(x, y);
    if (!cell) return;
    const H = wallHeight(cell);
    const floors = Math.max(1, Math.ceil(H / FLOOR_PX));
    const style = buildStyleOf(floors);
    const r = baseRect(cell);
    // 本物と同じ形 (addLot) を作る。Structures3D と同じ、地区の色合いも付ける
    const parts: Parts = { solid: new GeoBuilder(), glass: new GeoBuilder(), lit: new GeoBuilder() };
    addLot(parts, cell, this.city.districtOf(cell)?.color, frontRotation(this.city.graph, cell));
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // 切り取り: 高さ (y) が切り取り線より下だけ見せる
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: [plane] });
    applyFacadeShader(solidMat, this.snow);
    solidMat.clipShadows = true;
    const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35, clippingPlanes: [plane] });
    glassMat.clipShadows = true;
    const group = new THREE.Group();
    const mesh = (b: GeoBuilder, mat: THREE.Material): THREE.Mesh | null => {
      const geo = b.build();
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    const solid = mesh(parts.solid, solidMat);
    const glass = mesh(parts.glass, glassMat);
    const foot = { x: r.x, z: r.y, w: r.w, d: r.h };
    const foundation = new THREE.Mesh(this.unit, this.soilMat);
    group.add(foundation);
    // 切り取り線の光る縁 (建物の四辺。面は塗らず、どこまで建ったかが分かるように)
    const frontier = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(this.unit, this.frontierMat);
      group.add(m);
      return m;
    });
    // 作業員 (手で作るとき)
    const workers = style === "hand" ? [0, 1].map(() => this.makeWorker(group)) : [];
    // クレーン (中・高い建物)
    const towerH = H + 12;
    const tx = r.x + r.w + 3;
    const tz = r.y - 3;
    const tower = new THREE.Mesh(this.unit, this.steelMat);
    group.add(tower);
    const pivot = new THREE.Group();
    pivot.position.set(tx, 0, tz);
    group.add(pivot);
    const jib = new THREE.Mesh(this.jibGeo, this.craneMat);
    jib.scale.set(JIB_LEN, 1.4, 1.4);
    pivot.add(jib);
    // 腕の先の荷を吊るフック。荷は、フックの下にぶら下がる
    const hook = new THREE.Mesh(this.unit, this.steelMat);
    hook.scale.set(1.6, 2, 1.6);
    pivot.add(hook);
    const load = new THREE.Mesh(this.unit, this.loadMat);
    pivot.add(load);
    // 腕の向き: 置き場 (横) から、建物の中心へ回す
    const cx = r.x + r.w / 2 - tx;
    const cz = r.y + r.h / 2 - tz;
    const target = Math.atan2(-cz, cx);
    const stock = target + 1.2;
    this.group.add(group);
    this.sites.set(key, {
      key,
      age: 0,
      dur: constructionSeconds(floors),
      style,
      H,
      plane,
      group,
      solid,
      glass,
      solidMat,
      glassMat,
      foot,
      foundation,
      frontier,
      workers,
      crane: { tower, pivot, jib, hook, load, towerH, stock, target },
    });
    this.version++;
    this.pose(this.sites.get(key)!);
  }

  /** 作業員 1 人 (ヘルメット・ベスト・作業ズボン・トンカチの腕)。高さは 4 px ほど。 */
  private makeWorker(parent: THREE.Group): { root: THREE.Group; arm: THREE.Mesh; body: THREE.Mesh } {
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.unit, this.vestMat);
    body.scale.set(1.3, 1.9, 0.9);
    body.position.y = 1.6;
    root.add(body);
    for (const dx of [-0.35, 0.35]) {
      const leg = new THREE.Mesh(this.unit, this.pantsMat);
      leg.scale.set(0.5, 1.6, 0.6);
      leg.position.set(dx, 0, 0);
      root.add(leg);
    }
    const head = new THREE.Mesh(this.ball, this.skinMat);
    head.scale.set(0.8, 0.8, 0.8);
    head.position.y = 3.9;
    root.add(head);
    const helmet = new THREE.Mesh(this.ball, this.helmetMat);
    helmet.scale.set(0.9, 0.5, 0.9);
    helmet.position.y = 4.3;
    root.add(helmet);
    const arm = new THREE.Mesh(this.unit, this.steelMat);
    arm.scale.set(0.35, 0.35, 1.6);
    arm.position.set(0.8, 2.6, 0.4);
    root.add(arm);
    parent.add(root);
    return { root, arm, body };
  }

  private removeSite(key: string): void {
    const s = this.sites.get(key);
    if (!s) return;
    this.group.remove(s.group);
    s.solid?.geometry.dispose();
    s.glass?.geometry.dispose();
    s.solidMat.dispose();
    s.glassMat.dispose();
    this.sites.delete(key);
    this.version++;
  }

  private pose(s: Site): void {
    const p = s.age / s.dur;
    const bp = basePose(p, s.style, s.H);
    const { x, z, w, d } = s.foot;
    const cut = s.H * bp.reveal;
    s.plane.constant = cut; // 切り取り線より上は見せない
    // 基礎: 建物の敷地の土
    place(s.foundation, x, 0, z, w, 0.4 * bp.foundation + 0.01, d);
    s.foundation.visible = bp.foundation > 0;
    // 切り取り線の光る縁 (建物の四辺)
    const edgeOn = bp.reveal > 0 && bp.reveal < 1;
    const edges: [number, number, number, number][] = [
      [x + w / 2, z, w + 1, 1],
      [x + w / 2, z + d, w + 1, 1],
      [x, z + d / 2, 1, d + 1],
      [x + w, z + d / 2, 1, d + 1],
    ];
    edges.forEach(([cx, cz, sx, sz], i) => {
      const m = s.frontier[i]!;
      m.visible = edgeOn;
      place(m, cx, cut, cz, sx, 0.6, sz);
    });
    if (s.style === "hand") {
      this.poseWorkers(s, p);
      s.crane.tower.visible = false;
      s.crane.pivot.visible = false;
      return;
    }
    // クレーン: 塔が立ち、腕が置き場と建物の上を往復し、荷を運ぶ
    const cr = cranePose(p);
    const c = s.crane;
    const top = c.towerH * cr.tower;
    c.tower.visible = cr.tower > 0;
    place(c.tower, x + w + 3 - COLUMN / 2, 0, z - 3 - COLUMN / 2, COLUMN, Math.max(0.01, top), COLUMN);
    c.pivot.visible = cr.tower > 0.2;
    c.pivot.position.set(x + w + 3, top, z - 3);
    c.pivot.rotation.y = c.stock + (c.target - c.stock) * cr.slew;
    const hookY = HOOK_REST + cr.hook * (cut + HOOK_ABOVE_CUT - HOOK_REST);
    c.hook.position.set(JIB_LEN * 0.8, hookY - top, 0);
    c.load.visible = cr.loaded;
    c.load.position.set(JIB_LEN * 0.8, hookY - top - 3.2, 0);
    c.load.scale.set(3, 2.6, 3);
  }

  /** 作業員を、建物の敷地のまわりで動かす。 */
  private poseWorkers(s: Site, p: number): void {
    const { x, z, w, d } = s.foot;
    s.workers.forEach((wk, i) => {
      const wp = workerPose(s.age, i);
      wk.root.visible = p > 0.15;
      wk.root.position.set(x + wp.u * w, wp.walk * 0.3, z + wp.v * d);
      wk.root.rotation.y = i === 0 ? 0 : Math.PI / 2;
      wk.arm.rotation.x = -wp.hammer * 0.9;
      wk.body.position.y = 1.6 - wp.walk * 0.2;
    });
  }

  dispose(): void {
    for (const k of [...this.sites.keys()]) this.removeSite(k);
    this.unit.dispose();
    this.jibGeo.dispose();
    this.ball.dispose();
    for (const m of [this.soilMat, this.steelMat, this.craneMat, this.loadMat, this.vestMat, this.helmetMat, this.skinMat, this.pantsMat, this.frontierMat]) m.dispose();
  }
}

/** 底が (x, y, z) で、大きさ (sx, sy, sz) の箱を置く。 */
function place(m: THREE.Mesh, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
}
