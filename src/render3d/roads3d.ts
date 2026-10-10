import * as THREE from "three";
import { hash2 } from "../sim/rng";
import type { RoadGraph, RoadNode } from "../sim/roadGraph";
import { RoadType } from "../sim/roadTypes";
import { Structure } from "../sim/structures";
import { GeoBuilder, orientedBox, ribbon, shade, wall } from "./geo";
import { TILE, WATER_Z } from "./terrain3d";

/** 道路全体 (歩道を含む) と、車道の幅。 */
const SIDEWALK_WIDTH = TILE * 0.9;
const ROAD_WIDTH = TILE * 0.62;
const DASH = 4.5;
const GAP = 4.5;
/** 横断歩道を描く、交差点からの距離 (px) と縞の数。 */
const CROSSWALK_DIST = TILE * 0.62;
const CROSSWALK_STRIPES = 4;
/** 橋の桁の高さ (路面)・桁の厚み・橋脚の間隔。 */
export const BRIDGE_Y = 2.6;
const DECK_THICK = 1.5;
const PIER_GAP = 22;
/** 路面の高さ (地面の上のわずかな浮き。層ごとにずらして、面が重なってちらつくのを避ける)。 */
const Y_SIDEWALK = 0.12;
const Y_ROAD = 0.3;
const Y_MARK = 0.62;

type CenterMark = "none" | "dash" | "double" | "dashWhite" | "median";

interface RoadStyle {
  /** 歩道を含めた幅 (px)。0 なら歩道なし。 */
  sidewalk: number;
  walk: number;
  /** 車道の幅 (px)。 */
  road: number;
  curb: number;
  /** アスファルトの色合い (1 倍の白で標準)。plain があればそちらの色で塗る。 */
  tint: number;
  plain: number | null;
  edgeLine: boolean;
  center: CenterMark;
  trees: "none" | "side" | "median";
}

const STYLES: Record<RoadType, RoadStyle> = {
  [RoadType.Lane]: { sidewalk: 0, walk: 0, road: TILE * 0.4, curb: 0x7d7a72, tint: 0xd8d4cc, plain: null, edgeLine: false, center: "none", trees: "none" },
  [RoadType.Street]: { sidewalk: SIDEWALK_WIDTH, walk: 0xc4c0b6, road: ROAD_WIDTH, curb: 0x6e6b64, tint: 0xffffff, plain: null, edgeLine: true, center: "dash", trees: "none" },
  [RoadType.TreeStreet]: { sidewalk: SIDEWALK_WIDTH + 2, walk: 0xbdc7a8, road: ROAD_WIDTH, curb: 0x6e6b64, tint: 0xffffff, plain: null, edgeLine: true, center: "dash", trees: "side" },
  [RoadType.Avenue]: { sidewalk: TILE * 1.02, walk: 0xc4c0b6, road: TILE * 0.78, curb: 0x6e6b64, tint: 0xf2f2f2, plain: null, edgeLine: true, center: "double", trees: "none" },
  [RoadType.TreeAvenue]: { sidewalk: TILE * 1.08, walk: 0xbdc7a8, road: TILE * 0.8, curb: 0x6e6b64, tint: 0xf2f2f2, plain: null, edgeLine: true, center: "median", trees: "median" },
  [RoadType.Industrial]: { sidewalk: 0, walk: 0, road: TILE * 0.7, curb: 0x7a756a, tint: 0xcfc8b8, plain: null, edgeLine: true, center: "dashWhite", trees: "none" },
  [RoadType.Arterial]: { sidewalk: TILE * 1.0, walk: 0xb4b8bc, road: TILE * 0.84, curb: 0x5f6064, tint: 0xe6e6ea, plain: null, edgeLine: true, center: "dashWhite", trees: "none" },
  [RoadType.Highway]: { sidewalk: 0, walk: 0, road: TILE * 0.9, curb: 0x4a4b50, tint: 0xa8a8b4, plain: null, edgeLine: true, center: "dashWhite", trees: "none" },
  [RoadType.Footpath]: { sidewalk: 0, walk: 0, road: TILE * 0.26, curb: 0xa89874, tint: 0xffffff, plain: 0xd9c9a0, edgeLine: false, center: "none", trees: "none" },
  [RoadType.Alley]: { sidewalk: 0, walk: 0, road: TILE * 0.4, curb: 0x7a7a74, tint: 0xffffff, plain: 0xa6a39a, edgeLine: false, center: "none", trees: "none" },
};

/** 種類ごとの道路の幅 (px)。 */
export const roadWidthPx = (t: RoadType) => STYLES[t].road;

let asphaltCache: THREE.CanvasTexture | null = null;

/** アスファルトの細かいざらつきを描いた、タイルして使うテクスチャ。作り直さず使い回す。 */
function asphaltTexture(): THREE.CanvasTexture {
  if (asphaltCache) return asphaltCache;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = hash2(9001, x, y);
      const v = 78 + (n - 0.5) * 26 + (hash2(9002, x >> 3, y >> 3) - 0.5) * 10 + 60; // 3D の光で暗くなるぶん、少し明るく
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 1;
      img.data[i + 2] = v + 3;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  asphaltCache = tex;
  return tex;
}

interface Seg {
  structure: Structure;
  oneWay: number;
  a: RoadNode;
  b: RoadNode;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  len: number;
  type: RoadType;
  /** 端の持ち上がり (橋のとき。0 = 地面の高さに下りる、1 = 桁の高さのまま)。 */
  liftA: number;
  liftB: number;
}

/** 道路網の 3D 表示 (路面・歩道・白線・橋・トンネル・並木)。graph.version が変わったときだけ作り直す。プレビューも持つ。 */
export class Roads3D {
  readonly group = new THREE.Group();
  private road: THREE.Mesh | null = null;
  private asphalt: THREE.Mesh | null = null;
  private trees: THREE.Group | null = null;
  private drawnVersion = -1;
  private preview = new PreviewLayer();
  /** 区間ごとの、橋の高さの計算に使う情報 (車が橋の上を走るときの高さ)。 */
  private edgeInfo = new Map<number, { structure: Structure; len: number; liftA: number; liftB: number }>();

  constructor(private graph: RoadGraph) {
    this.group.name = "roads";
    this.group.add(this.preview.group);
  }

  dispose(): void {
    this.clear();
    this.preview.dispose();
  }

  private clear(): void {
    for (const m of [this.road, this.asphalt]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.road = this.asphalt = null;
    if (this.trees) {
      this.group.remove(this.trees);
      for (const c of this.trees.children) (c as THREE.InstancedMesh).dispose();
      this.trees = null;
    }
  }

  update(): void {
    this.preview.flush();
    if (this.drawnVersion === this.graph.version) return;
    this.drawnVersion = this.graph.version;
    this.clear();
    const plain = new GeoBuilder();
    const asph = new GeoBuilder();
    asph.uvScale = 40;
    const treePos: { x: number; z: number; r: number }[] = [];
    this.build(plain, asph, treePos);
    const pg = plain.build();
    if (pg) {
      this.road = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.road.receiveShadow = true;
      this.group.add(this.road);
    }
    const ag = asph.build();
    if (ag) {
      this.asphalt = new THREE.Mesh(ag, new THREE.MeshLambertMaterial({ vertexColors: true, map: asphaltTexture() }));
      this.asphalt.receiveShadow = true;
      this.group.add(this.asphalt);
    }
    if (treePos.length > 0) this.buildTrees(treePos);
  }

  private build(g: GeoBuilder, ga: GeoBuilder, treePos: { x: number; z: number; r: number }[]): void {
    const { nodes, edges } = this.graph;
    // 橋の両端が、橋でない道路につながっているか (つながっていれば、そこで地面の高さに下りる)
    const bridgeEnds = new Map<number, { bridge: number; other: number }>();
    for (const e of edges.values()) {
      for (const nid of [e.a, e.b]) {
        const c = bridgeEnds.get(nid) ?? { bridge: 0, other: 0 };
        if (e.structure === Structure.Bridge) c.bridge++;
        else c.other++;
        bridgeEnds.set(nid, c);
      }
    }
    const all: Seg[] = [...edges.values()].map((e) => {
      const a = nodes.get(e.a)!;
      const b = nodes.get(e.b)!;
      const ax = a.x * TILE;
      const az = a.y * TILE;
      const bx = b.x * TILE;
      const bz = b.y * TILE;
      const lift = (nid: number) => (e.structure === Structure.Bridge && (bridgeEnds.get(nid)?.other ?? 0) === 0 ? 1 : 0);
      return { structure: e.structure, oneWay: e.oneWay, a, b, ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az), type: e.type, liftA: lift(e.a), liftB: lift(e.b) };
    });
    this.edgeInfo.clear();
    [...edges.values()].forEach((e, i) => this.edgeInfo.set(e.id, { structure: all[i]!.structure, len: all[i]!.len, liftA: all[i]!.liftA, liftB: all[i]!.liftB }));
    const byType = new Map<RoadType, Seg[]>();
    for (const sg of all) {
      let list = byType.get(sg.type);
      if (!list) byType.set(sg.type, (list = []));
      list.push(sg);
    }
    // 下の層 (歩道・路面) は、種類の幅が広い順に重ねる (広い道路が上)
    const types = [...byType.keys()].sort((p, q) => STYLES[p].road - STYLES[q].road);
    const rank = new Map(types.map((t, i) => [t, i]));
    const yAt = (sg: Seg, t: number) => {
      if (sg.structure !== Structure.Bridge) return 0;
      // 橋: 両端は、地面とつながるなら地面の高さに下り、中ほどは桁の高さ
      const ramp = Math.min(1, (TILE * 1.2) / Math.max(sg.len, 1));
      const sA = sg.liftA ? 1 : smooth01(t / ramp);
      const sB = sg.liftB ? 1 : smooth01((1 - t) / ramp);
      return BRIDGE_Y * Math.min(sA, sB);
    };
    const steps = (sg: Seg) => (sg.structure === Structure.Bridge ? Math.max(2, Math.ceil(sg.len / 6)) : 1);
    /** 道路の区間を、幅 w・高さ yBase の帯として (橋なら段々に高さを変えて) 描く。 */
    const band = (b: GeoBuilder, sg: Seg, w: number, yBase: number, color: number) => {
      const n = steps(sg);
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        ribbon(b, sg.ax + (sg.bx - sg.ax) * t0, sg.az + (sg.bz - sg.az) * t0, yBase + yAt(sg, t0), sg.ax + (sg.bx - sg.ax) * t1, sg.az + (sg.bz - sg.az) * t1, yBase + yAt(sg, t1), w, color);
      }
    };

    const bridges = all.filter((sg) => sg.structure === Structure.Bridge);
    const tunnels = all.filter((sg) => sg.structure === Structure.Tunnel);

    // 0. 橋の桁 (側面) と橋脚
    for (const sg of bridges) {
      if (sg.len < 1e-6) continue;
      const w = STYLES[sg.type].road + 3;
      const nx = -(sg.bz - sg.az) / sg.len;
      const nz = (sg.bx - sg.ax) / sg.len;
      const n = steps(sg);
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const t0 = i / n;
          const t1 = (i + 1) / n;
          const x0 = sg.ax + (sg.bx - sg.ax) * t0 + nx * (w / 2) * side;
          const z0 = sg.az + (sg.bz - sg.az) * t0 + nz * (w / 2) * side;
          const x1 = sg.ax + (sg.bx - sg.ax) * t1 + nx * (w / 2) * side;
          const z1 = sg.az + (sg.bz - sg.az) * t1 + nz * (w / 2) * side;
          const y0 = yAt(sg, t0);
          const y1 = yAt(sg, t1);
          wall(g, x0, z0, y0 + Y_ROAD - DECK_THICK, y0 + Y_ROAD, x1, z1, y1 + Y_ROAD - DECK_THICK, y1 + Y_ROAD, 0xb9bcc2);
        }
      }
      // 桁の裏 (下から見えるように)
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        ribbon(g, sg.ax + (sg.bx - sg.ax) * t0, sg.az + (sg.bz - sg.az) * t0, yAt(sg, t0) + Y_ROAD - DECK_THICK, sg.ax + (sg.bx - sg.ax) * t1, sg.az + (sg.bz - sg.az) * t1, yAt(sg, t1) + Y_ROAD - DECK_THICK, w, 0x8d9096);
      }
      // 橋脚 (水の上の、桁が高いところだけ)
      for (let d = PIER_GAP / 2; d < sg.len; d += PIER_GAP) {
        const t = d / sg.len;
        const y = yAt(sg, t);
        if (y < BRIDGE_Y * 0.7) continue;
        const px = sg.ax + (sg.bx - sg.ax) * t;
        const pz = sg.az + (sg.bz - sg.az) * t;
        g.box(px - 1.6, pz - 1.6, 3.2, 3.2, WATER_Z * 1.4 - 1, y + Y_ROAD - DECK_THICK, 0xa7aab0, 0x8d9096);
      }
    }

    // 1. 歩道 (縁石の影 → 縁石 → 舗装)
    for (const t of types) {
      const st = STYLES[t];
      if (st.sidewalk === 0) continue;
      const r = rank.get(t)! * 0.01;
      for (const sg of byType.get(t)!) {
        band(g, sg, st.sidewalk + 0.8, Y_SIDEWALK + r, 0x8b8880);
        band(g, sg, st.sidewalk - 0.6, Y_SIDEWALK + r + 0.005, st.walk);
      }
      for (const n of nodesOf(byType.get(t)!)) {
        g.disc(n.x, n.z, (st.sidewalk + 0.8) / 2, n.y + Y_SIDEWALK + r, 0x8b8880, 12);
        g.disc(n.x, n.z, (st.sidewalk - 0.6) / 2, n.y + Y_SIDEWALK + r + 0.005, st.walk, 12);
      }
    }
    // 2. 車道 (縁石の段差 → 路面)。歩行者道と路地は舗装の色で塗り、ほかはアスファルトの質感
    for (const t of types) {
      const st = STYLES[t];
      const r = rank.get(t)! * 0.01;
      const surface = st.plain === null ? ga : g;
      const color = st.plain === null ? st.tint : st.plain;
      for (const sg of byType.get(t)!) {
        band(g, sg, st.road + 1.2, Y_ROAD + r, st.curb);
        band(surface, sg, st.road, Y_ROAD + r + 0.005, color);
      }
      for (const n of nodesOf(byType.get(t)!)) {
        g.disc(n.x, n.z, (st.road + 1.2) / 2, n.y + Y_ROAD + r, st.curb, 12);
        surface.disc(n.x, n.z, st.road / 2, n.y + Y_ROAD + r + 0.005, color, 12);
      }
    }
    // 路地の石畳、歩行者道の砂利のつぶ
    for (const t of types) {
      const st = STYLES[t];
      if (st.plain === null) continue;
      for (const sg of byType.get(t)!) {
        const ux = (sg.bx - sg.ax) / sg.len;
        const uz = (sg.bz - sg.az) / sg.len;
        for (let d = 2; d < sg.len; d += 3.2) {
          const o = (hash2(31, Math.round(sg.ax + ux * d), Math.round(sg.az + uz * d)) - 0.5) * st.road * 0.7;
          g.disc(sg.ax + ux * d - uz * o, sg.az + uz * d + ux * o, 0.7, Y_MARK - 0.1, shade(st.plain, 0.8), 6);
        }
      }
    }

    // 橋の欄干
    for (const sg of bridges) {
      if (sg.len < 1e-6) continue;
      const nx = -(sg.bz - sg.az) / sg.len;
      const nz = (sg.bx - sg.ax) / sg.len;
      const off = STYLES[sg.type].road / 2 + 1.1;
      const n = steps(sg);
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const t0 = i / n;
          const t1 = (i + 1) / n;
          const y0 = yAt(sg, t0) + Y_ROAD;
          const y1 = yAt(sg, t1) + Y_ROAD;
          wall(g, sg.ax + (sg.bx - sg.ax) * t0 + nx * off * side, sg.az + (sg.bz - sg.az) * t0 + nz * off * side, y0, y0 + 1.5, sg.ax + (sg.bx - sg.ax) * t1 + nx * off * side, sg.az + (sg.bz - sg.az) * t1 + nz * off * side, y1, y1 + 1.5, 0xe4e6ea);
        }
      }
    }
    // トンネル: 山肌の色の被せものと、出入口の坑口
    if (tunnels.length > 0) {
      const ends = new Map<number, { x: number; z: number; ux: number; uz: number; w: number; n: number }>();
      for (const sg of tunnels) {
        for (const [node, dir] of [[sg.a, 1], [sg.b, -1]] as const) {
          const cur = ends.get(node.id);
          if (cur) cur.n++;
          else ends.set(node.id, { x: node.x * TILE, z: node.y * TILE, ux: ((sg.bx - sg.ax) / sg.len) * dir, uz: ((sg.bz - sg.az) / sg.len) * dir, w: STYLES[sg.type].road, n: 1 });
        }
      }
      for (const e of ends.values()) {
        if (e.n !== 1) continue; // 両側がトンネルの点は坑口ではない
        // 坑口: 山へ向かう向き (ux,uz は道路の進む向き = 山の中へ) に、石の枠と暗い穴
        orientedBox(g, e.x + e.ux * 1.2, e.z + e.uz * 1.2, e.ux, e.uz, e.w * 1.5, 2.6, 0, e.w * 0.75, 0x6b655a, 0x4f4a42);
        const ox = e.x - e.ux * 0.2;
        const oz = e.z - e.uz * 0.2;
        const nx = -e.uz;
        const nz = e.ux;
        const hw = e.w * 0.55;
        g.poly([{ x: ox + nx * hw, y: 0.2, z: oz + nz * hw }, { x: ox - nx * hw, y: 0.2, z: oz - nz * hw }, { x: ox - nx * hw, y: e.w * 0.55, z: oz - nz * hw }, { x: ox + nx * hw, y: e.w * 0.55, z: oz + nz * hw }], 0x0e0e12);
        g.poly([{ x: ox + nx * hw, y: 0.2, z: oz + nz * hw }, { x: ox + nx * hw, y: e.w * 0.55, z: oz + nz * hw }, { x: ox - nx * hw, y: e.w * 0.55, z: oz - nz * hw }, { x: ox - nx * hw, y: 0.2, z: oz - nz * hw }], 0x0e0e12);
      }
    }

    // 3. 車線の縁取り線
    for (const t of types) {
      const st = STYLES[t];
      if (!st.edgeLine) continue;
      const off = st.road * 0.38;
      for (const sg of byType.get(t)!) {
        if (sg.len < 1e-6) continue;
        const nx = -(sg.bz - sg.az) / sg.len;
        const nz = (sg.bx - sg.ax) / sg.len;
        for (const side of [-1, 1]) {
          const n = steps(sg);
          for (let i = 0; i < n; i++) {
            const t0 = i / n;
            const t1 = (i + 1) / n;
            ribbon(g, sg.ax + (sg.bx - sg.ax) * t0 + nx * off * side, sg.az + (sg.bz - sg.az) * t0 + nz * off * side, yAt(sg, t0) + Y_MARK, sg.ax + (sg.bx - sg.ax) * t1 + nx * off * side, sg.az + (sg.bz - sg.az) * t1 + nz * off * side, yAt(sg, t1) + Y_MARK, 0.6, 0xc9c9c2);
          }
        }
      }
    }

    // 4. 中央の表示。交差点 (3 本以上が交わるノード) の手前は途切れさせる
    for (const t of types) {
      const st = STYLES[t];
      if (st.center === "none") continue;
      if (st.center === "median") {
        for (const sg of byType.get(t)!) {
          band(g, sg, 3.4, Y_MARK, 0x5d5a52);
          band(g, sg, 2.4, Y_MARK + 0.05, 0x5fa054);
        }
        continue;
      }
      const skip = CROSSWALK_DIST + 1.5;
      for (const sg of byType.get(t)!) {
        if (sg.len < 1e-6) continue;
        const ux = (sg.bx - sg.ax) / sg.len;
        const uz = (sg.bz - sg.az) / sg.len;
        const nx = -uz;
        const nz = ux;
        const from = this.graph.degree(sg.a.id) >= 3 ? skip : 0;
        const to = sg.len - (this.graph.degree(sg.b.id) >= 3 ? skip : 0);
        const lines = st.center === "double" ? [-0.9, 0.9] : [0];
        for (const off of lines) {
          for (let d = from; d < to; d += DASH + GAP) {
            const d2 = Math.min(d + DASH, to);
            const y0 = yAt(sg, d / sg.len) + Y_MARK;
            const y1 = yAt(sg, d2 / sg.len) + Y_MARK;
            ribbon(g, sg.ax + ux * d + nx * off, sg.az + uz * d + nz * off, y0, sg.ax + ux * d2 + nx * off, sg.az + uz * d2 + nz * off, y1, 0.9, st.center === "dashWhite" ? 0xf0f0ec : 0xe0c040);
          }
        }
      }
    }
    // 高速道路のガードレール
    for (const sg of byType.get(RoadType.Highway) ?? []) {
      if (sg.len < 1e-6) continue;
      const nx = -(sg.bz - sg.az) / sg.len;
      const nz = (sg.bx - sg.ax) / sg.len;
      const off = STYLES[RoadType.Highway].road / 2 + 0.6;
      for (const side of [-1, 1]) wall(g, sg.ax + nx * off * side, sg.az + nz * off * side, Y_ROAD, Y_ROAD + 1.3, sg.bx + nx * off * side, sg.bz + nz * off * side, Y_ROAD, Y_ROAD + 1.3, 0xb9bcc2);
    }
    // 一方通行の矢印
    for (const sg of all) {
      const dir = sg.oneWay;
      if (dir === 0 || sg.len < 1e-6) continue;
      const ux = ((sg.bx - sg.ax) / sg.len) * dir;
      const uz = ((sg.bz - sg.az) / sg.len) * dir;
      const st = STYLES[sg.type];
      for (let d = TILE * 0.7; d < sg.len - 3; d += TILE * 1.4) {
        const x = sg.ax + ((sg.bx - sg.ax) / sg.len) * d;
        const z = sg.az + ((sg.bz - sg.az) / sg.len) * d;
        const h = Math.min(3.2, st.road * 0.32);
        const y = yAt(sg, d / sg.len) + Y_MARK + 0.02;
        g.poly(
          [
            { x: x + ux * h, y, z: z + uz * h },
            { x: x - ux * h - uz * h * 0.9, y, z: z - uz * h + ux * h * 0.9 },
            { x: x - ux * h * 0.3, y, z: z - uz * h * 0.3 },
            { x: x - ux * h + uz * h * 0.9, y, z: z - uz * h - ux * h * 0.9 },
          ],
          0xf5f5f0,
          true,
        );
      }
    }
    // 並木・街路樹の位置 (3D の木は、あとでまとめて立てる)
    for (const t of types) {
      const st = STYLES[t];
      if (st.trees === "none") continue;
      for (const sg of byType.get(t)!) {
        if (sg.len < 1e-6) continue;
        const ux = (sg.bx - sg.ax) / sg.len;
        const uz = (sg.bz - sg.az) / sg.len;
        const offs = st.trees === "median" ? [0] : [-(st.sidewalk / 2 - 0.3), st.sidewalk / 2 - 0.3];
        for (let d = TILE * 0.3; d < sg.len; d += TILE * 0.55) {
          if ((this.graph.degree(sg.a.id) >= 3 && d < CROSSWALK_DIST + 2) || (this.graph.degree(sg.b.id) >= 3 && sg.len - d < CROSSWALK_DIST + 2)) continue;
          for (const o of offs) treePos.push({ x: sg.ax + ux * d - uz * o, z: sg.az + uz * d + ux * o, r: 1.9 + hash2(5, Math.round(d), Math.round(o * 10)) * 0.5 });
        }
      }
    }

    // 5. 交差点: 路面を広げ、各方向に横断歩道を描く
    const nodeWidth = new Map<number, number>();
    for (const sg of all) for (const n of [sg.a, sg.b]) nodeWidth.set(n.id, Math.max(nodeWidth.get(n.id) ?? 0, STYLES[sg.type].road));
    for (const n of nodes.values()) {
      if (this.graph.degree(n.id) < 3) continue;
      const touchesBridge = (bridgeEnds.get(n.id)?.bridge ?? 0) > 0;
      if (touchesBridge) continue;
      g.disc(n.x * TILE, n.y * TILE, (nodeWidth.get(n.id) ?? ROAD_WIDTH) * 0.62, Y_ROAD + 0.2, 0x4e4e52, 14);
    }
    for (const sg of all) {
      const st = STYLES[sg.type];
      if (sg.len < CROSSWALK_DIST * 2 || st.sidewalk === 0 || sg.type === RoadType.Highway || sg.structure !== Structure.None) continue;
      const ux = (sg.bx - sg.ax) / sg.len;
      const uz = (sg.bz - sg.az) / sg.len;
      const nx = -uz;
      const nz = ux;
      for (const [node, dir] of [[sg.a, 1], [sg.b, -1]] as const) {
        if (this.graph.degree(node.id) < 3) continue;
        const px = node.x * TILE + ux * dir * CROSSWALK_DIST;
        const pz = node.y * TILE + uz * dir * CROSSWALK_DIST;
        const half = st.road * 0.46;
        const step = (half * 2) / CROSSWALK_STRIPES;
        for (let i = 0; i < CROSSWALK_STRIPES; i++) {
          const o = -half + step * (i + 0.5);
          ribbon(g, px + nx * o - ux * 1.4, pz + nz * o - uz * 1.4, Y_MARK + 0.04, px + nx * o + ux * 1.4, pz + nz * o + uz * 1.4, Y_MARK + 0.04, 1.8, 0xf2f2ee);
        }
      }
    }
  }

  private buildTrees(pos: { x: number; z: number; r: number }[]): void {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a32 }), pos.length);
    const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x4a8f3f }), pos.length);
    const m = new THREE.Matrix4();
    pos.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, Y_SIDEWALK + 0.1, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      trunk.setMatrixAt(i, m);
      const s = p.r * 1.25;
      m.compose(new THREE.Vector3(p.x, Y_SIDEWALK + 3.8 + s * 0.4, p.z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.95, s));
      crown.setMatrixAt(i, m);
    });
    crown.castShadow = true;
    trunk.castShadow = true;
    group.add(trunk, crown);
    this.group.add(group);
    this.trees = group;
  }

  /** 道路の区間 id の、位置 t (0 = a 端、1 = b 端) での路面の高さ (車の高さ)。橋の上では桁の高さ。 */
  heightOnEdge(id: number, t: number): number {
    const info = this.edgeInfo.get(id);
    if (!info || info.structure !== Structure.Bridge) return Y_ROAD;
    const ramp = Math.min(1, (TILE * 1.2) / Math.max(info.len, 1));
    const sA = info.liftA ? 1 : smooth01(t / ramp);
    const sB = info.liftB ? 1 : smooth01((1 - t) / ramp);
    return BRIDGE_Y * Math.min(sA, sB) + Y_ROAD;
  }

  // ---- ツールのプレビュー ----

  showPreview(seg: { ax: number; ay: number; bx: number; by: number; valid: boolean; type?: RoadType; oneWay?: boolean; points?: { x: number; y: number }[]; control?: { x: number; y: number }; extra?: { x: number; y: number }[][] } | null): void {
    this.preview.setPreview(seg);
  }

  showEdges(ids: readonly number[] | null, color: number): void {
    this.preview.setEdges(ids && ids.length > 0 ? ids.map((id) => this.graph.edges.get(id)).filter((e) => e).map((e) => {
      const a = this.graph.nodes.get(e!.a)!;
      const b = this.graph.nodes.get(e!.b)!;
      return { ax: a.x * TILE, az: a.y * TILE, bx: b.x * TILE, bz: b.y * TILE };
    }) : null, color);
  }

  showCursor(p: { x: number; y: number } | null, color: number): void {
    this.preview.setCursor(p, color);
  }
}

const smooth01 = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** 区間の端のノードを (重複なしで) 集め、その高さ (橋の端なら、橋の高さにそろえる) とともに返す。 */
function nodesOf(segs: Seg[]): { x: number; z: number; y: number }[] {
  const out = new Map<number, { x: number; z: number; y: number }>();
  for (const sg of segs) {
    out.set(sg.a.id, { x: sg.ax, z: sg.az, y: sg.structure === Structure.Bridge && sg.liftA ? BRIDGE_Y : 0 });
    out.set(sg.b.id, { x: sg.bx, z: sg.bz, y: sg.structure === Structure.Bridge && sg.liftB ? BRIDGE_Y : 0 });
  }
  return [...out.values()];
}

/**
 * 道路ツールのプレビュー (緑 = 敷ける、赤 = 敷けない) と、カーソルの丸、アップグレード対象の色付け。
 * 呼び出しは毎フレームなので、内容が変わったときだけ作り直す。
 */
class PreviewLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private ring: THREE.Mesh | null = null;
  private line: THREE.Line | null = null;
  private seg: Parameters<Roads3D["showPreview"]>[0] = null;
  private edges: { ax: number; az: number; bx: number; bz: number }[] | null = null;
  private edgeColor = 0;
  private cursor: { x: number; y: number } | null = null;
  private cursorColor = 0;
  private builtKey = "";

  setPreview(seg: Parameters<Roads3D["showPreview"]>[0]): void {
    this.seg = seg;
    this.cursor = null; // 呼び出し順は、showPreview → showCursor
    this.edges = null;
  }

  setEdges(edges: { ax: number; az: number; bx: number; bz: number }[] | null, color: number): void {
    this.edges = edges;
    this.edgeColor = color;
    this.seg = null;
    this.cursor = null;
  }

  setCursor(p: { x: number; y: number } | null, color: number): void {
    this.cursor = p;
    this.cursorColor = color;
  }

  flush(): void {
    const key = JSON.stringify([this.seg, this.edges, this.edgeColor, this.cursor, this.cursorColor]);
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.clear();
    const g = new GeoBuilder();
    const Y = 1.2;
    if (this.seg) {
      const seg = this.seg;
      const color = seg.valid ? 0x7bd88f : 0xe05a4f;
      const st = STYLES[seg.type ?? RoadType.Street];
      const pts = seg.points ?? [{ x: seg.ax, y: seg.ay }, { x: seg.bx, y: seg.by }];
      for (let i = 0; i + 1 < pts.length; i++) {
        g.strip(pts[i]!.x * TILE, pts[i]!.y * TILE, pts[i + 1]!.x * TILE, pts[i + 1]!.y * TILE, Math.max(st.sidewalk, st.road + 2), Y, color);
      }
      for (const p of pts) g.disc(p.x * TILE, p.y * TILE, Math.max(st.sidewalk, st.road + 2) / 2, Y, color, 12);
      // 枠の中の区切りの道路も、同じ半透明の帯で見せる
      for (const line of seg.extra ?? []) {
        for (let i = 0; i + 1 < line.length; i++) g.strip(line[i]!.x * TILE, line[i]!.y * TILE, line[i + 1]!.x * TILE, line[i + 1]!.y * TILE, Math.max(st.sidewalk, st.road + 2), Y, color);
        for (const p of line) g.disc(p.x * TILE, p.y * TILE, Math.max(st.sidewalk, st.road + 2) / 2, Y, color, 12);
      }
      if (seg.control) {
        g.disc(seg.control.x * TILE, seg.control.y * TILE, 3, Y + 0.1, 0xffffff, 10);
        this.addLine([{ x: seg.ax, y: seg.ay }, seg.control, { x: seg.bx, y: seg.by }], 0xffffff);
      }
      if (seg.oneWay) {
        const i = Math.max(0, Math.floor(pts.length / 2) - 1);
        const p = pts[i]!;
        const q = pts[Math.min(pts.length - 1, i + 1)]!;
        const len = Math.hypot(q.x - p.x, q.y - p.y) * TILE;
        if (len > 1e-6) {
          const ux = ((q.x - p.x) * TILE) / len;
          const uz = ((q.y - p.y) * TILE) / len;
          const x = ((p.x + q.x) / 2) * TILE;
          const z = ((p.y + q.y) / 2) * TILE;
          g.poly([{ x: x + ux * 5, y: Y + 0.1, z: z + uz * 5 }, { x: x - ux * 4 - uz * 4, y: Y + 0.1, z: z - uz * 4 + ux * 4 }, { x: x - ux * 4 + uz * 4, y: Y + 0.1, z: z - uz * 4 - ux * 4 }], 0xffffff, true);
        }
      }
    }
    if (this.edges) for (const e of this.edges) {
      g.strip(e.ax, e.az, e.bx, e.bz, TILE * 0.95, Y, this.edgeColor);
      g.disc(e.ax, e.az, TILE * 0.475, Y, this.edgeColor, 12);
      g.disc(e.bx, e.bz, TILE * 0.475, Y, this.edgeColor, 12);
    }
    const geo = g.build();
    if (geo) {
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthTest: false }));
      this.mesh.renderOrder = 10;
      this.group.add(this.mesh);
    }
    if (this.cursor) {
      const ringGeo = new THREE.RingGeometry(TILE * 0.32, TILE * 0.4, 24);
      ringGeo.rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: this.cursorColor, depthTest: false }));
      this.ring.position.set(this.cursor.x * TILE, Y + 0.2, this.cursor.y * TILE);
      this.ring.renderOrder = 11;
      this.group.add(this.ring);
    }
  }

  private addLine(pts: { x: number; y: number }[], color: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x * TILE, 1.5, p.y * TILE)));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthTest: false }));
    this.line.renderOrder = 11;
    this.group.add(this.line);
  }

  private clear(): void {
    for (const o of [this.mesh, this.ring, this.line]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.mesh = this.ring = this.line = null;
  }

  dispose(): void {
    this.clear();
  }
}
