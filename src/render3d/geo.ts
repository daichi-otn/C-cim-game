import * as THREE from "three";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 三角形のメッシュを、色つきの頂点として溜めていく部品。道路・建物・施設など、形の多い物を少数のメッシュにまとめて描くために使う。
 * 座標は three の座標 (x = 東、y = 高さ、z = 南。単位 px)。色は 0xRRGGBB (sRGB)。
 */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  /** テクスチャの繰り返しの大きさ (px)。UV は地面の位置 / この値。 */
  uvScale = 48;
  private tmp = new THREE.Color();

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get isEmpty(): boolean {
    return this.idx.length === 0;
  }

  /** 凸多角形 (頂点を順に並べたもの) を塗る。向きは、法線が上 (または外) を向くように、頂点の並びから決まる。 */
  poly(pts: V3[], color: number, upward = false): void {
    if (pts.length < 3) return;
    const a = pts[0]!;
    const b = pts[1]!;
    const c = pts[2]!;
    let nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    let ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    let nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    let flip = false;
    if (upward && ny < 0) flip = true; // 水平な面は、いつも上向き
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    this.tmp.set(color);
    const base = this.vertexCount;
    for (const p of pts) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(nx, ny, nz);
      this.col.push(this.tmp.r, this.tmp.g, this.tmp.b);
      this.uv.push(p.x / this.uvScale, p.z / this.uvScale);
    }
    for (let i = 1; i + 1 < pts.length; i++) {
      if (flip) this.idx.push(base, base + i + 1, base + i);
      else this.idx.push(base, base + i, base + i + 1);
    }
  }

  /** 水平な長方形 (東西 w × 南北 d、高さ y)。 */
  rect(x: number, z: number, w: number, d: number, y: number, color: number): void {
    this.poly([{ x, y, z }, { x: x + w, y, z }, { x: x + w, y, z: z + d }, { x, y, z: z + d }], color, true);
  }

  /** 水平な帯: (ax,az) から (bx,bz) へ、幅 width、高さ y。 */
  strip(ax: number, az: number, bx: number, bz: number, width: number, y: number, color: number): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    this.poly(
      [
        { x: ax + nx, y, z: az + nz },
        { x: bx + nx, y, z: bz + nz },
        { x: bx - nx, y, z: bz - nz },
        { x: ax - nx, y, z: az - nz },
      ],
      color,
      true,
    );
  }

  /** 水平な円板 (中心 cx,cz、半径 r、高さ y)。 */
  disc(cx: number, cz: number, r: number, y: number, color: number, segments = 14): void {
    const pts: V3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y, z: cz + Math.sin(a) * r });
    }
    this.poly(pts, color, true);
  }

  /** 箱 (底は底面の長方形 x,z,w,d、高さ y0〜y1)。底面は描かない。 */
  box(x: number, z: number, w: number, d: number, y0: number, y1: number, wall: number, roof: number): void {
    const south = [{ x, y: y0, z: z + d }, { x: x + w, y: y0, z: z + d }, { x: x + w, y: y1, z: z + d }, { x, y: y1, z: z + d }];
    const east = [{ x: x + w, y: y0, z: z + d }, { x: x + w, y: y0, z }, { x: x + w, y: y1, z }, { x: x + w, y: y1, z: z + d }];
    const north = [{ x: x + w, y: y0, z }, { x, y: y0, z }, { x, y: y1, z }, { x: x + w, y: y1, z }];
    const west = [{ x, y: y0, z }, { x, y: y0, z: z + d }, { x, y: y1, z: z + d }, { x, y: y1, z }];
    // 面の明るさは 3D の光が付けるので、ここでは少しだけ差を付ける (影の側をわずかに暗く)
    this.poly(south, wall);
    this.poly(east, shade(wall, 0.92));
    this.poly(north, shade(wall, 0.95));
    this.poly(west, shade(wall, 0.93));
    this.poly([{ x, y: y1, z }, { x, y: y1, z: z + d }, { x: x + w, y: y1, z: z + d }, { x: x + w, y: y1, z }], roof, true);
  }

  /** 円柱・円すい台 (中心 cx,cz、底の半径 r0、上の半径 r1、高さ y0〜y1)。側面は丸く見えるよう、面ごとに法線を滑らかにする。 */
  frustum(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, color: number, top: number = shade(color, 1.12), segments = 14): void {
    this.tmp.set(color);
    const base = this.vertexCount;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = 0.7 + 0.3 * (c * 0.4 + s * 0.9); // 南東向きほど明るい
      const lr = this.tmp.r * k;
      const lg = this.tmp.g * k;
      const lb = this.tmp.b * k;
      this.pos.push(cx + c * r0, y0, cz + s * r0, cx + c * r1, y1, cz + s * r1);
      this.nor.push(c, 0.15, s, c, 0.15, s);
      this.col.push(lr, lg, lb, lr, lg, lb);
      this.uv.push(0, 0, 0, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    // 上面
    const pts: V3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r1, y: y1, z: cz + Math.sin(a) * r1 });
    }
    this.poly(pts, top, true);
  }

  /** 球 (中心 cx,cy,cz、半径 r)。低ポリゴンの球で、法線を滑らかにして丸く見せる。木の葉・ドーム・ライトに使う。 */
  ball(cx: number, cy: number, cz: number, r: number, color: number, sy = 1): void {
    const rings = 5;
    const seg = 8;
    this.tmp.set(color);
    const base = this.vertexCount;
    for (let i = 0; i <= rings; i++) {
      const phi = (i / rings) * Math.PI;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(th);
        this.pos.push(cx + nx * r, cy + ny * r * sy, cz + nz * r);
        this.nor.push(nx, ny, nz);
        this.col.push(this.tmp.r, this.tmp.g, this.tmp.b);
        this.uv.push(0, 0);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j;
        const b = a + seg + 1;
        this.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  /** 溜めた形を、メッシュ用の形状にする。空なら null。 */
  build(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

/** 色の明るさを k 倍にする (0xRRGGBB)。 */
export function shade(color: number, k: number): number {
  const r = Math.min(255, ((color >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((color >> 8) & 255) * k) | 0;
  const b = Math.min(255, (color & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

/** 高さの違う 2 点の間の水平な帯: (ax,az) の高さ ya から (bx,bz) の高さ yb へ、幅 width。 */
export function ribbon(g: GeoBuilder, ax: number, az: number, ya: number, bx: number, bz: number, yb: number, width: number, color: number): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const nx = (-dz / len) * (width / 2);
  const nz = (dx / len) * (width / 2);
  g.poly(
    [
      { x: ax + nx, y: ya, z: az + nz },
      { x: bx + nx, y: yb, z: bz + nz },
      { x: bx - nx, y: yb, z: bz - nz },
      { x: ax - nx, y: ya, z: az - nz },
    ],
    color,
    true,
  );
}

/** 地面に垂直な壁 (両面): (ax,az) から (bx,bz) へ、高さ y0〜y1。欄干・ガードレール・橋の側面用。 */
export function wall(g: GeoBuilder, ax: number, az: number, ya0: number, ya1: number, bx: number, bz: number, yb0: number, yb1: number, color: number): void {
  const pts = [
    { x: ax, y: ya0, z: az },
    { x: bx, y: yb0, z: bz },
    { x: bx, y: yb1, z: bz },
    { x: ax, y: ya1, z: az },
  ];
  g.poly(pts, color);
  g.poly([...pts].reverse(), color);
}

/** 向きのある箱 (坑口・料金所など): 中心 (cx,cz)、進行方向 (ux,uz)、幅 w (進行方向に直角)・奥行き d (進行方向)、高さ y0〜y1。 */
export function orientedBox(g: GeoBuilder, cx: number, cz: number, ux: number, uz: number, w: number, d: number, y0: number, y1: number, wall: number, roof: number): void {
  const nx = -uz;
  const nz = ux;
  const c = (a: number, b: number, y: number) => ({ x: cx + ux * (d / 2) * a + nx * (w / 2) * b, y, z: cz + uz * (d / 2) * a + nz * (w / 2) * b });
  // 4 隅 (a: 進行方向の前 +1・後ろ −1、b: 横の +1・−1)
  const corners = [c(-1, -1, 0), c(1, -1, 0), c(1, 1, 0), c(-1, 1, 0)];
  const faces: [number, number, number][] = [[0, 1, 1], [1, 2, 0.92], [2, 3, 0.96], [3, 0, 0.93]];
  for (const [i, j, k] of faces) {
    const p = corners[i]!;
    const q = corners[j]!;
    const quadPts = [{ ...p, y: y0 }, { ...q, y: y0 }, { ...q, y: y1 }, { ...p, y: y1 }];
    g.poly(quadPts, shade(wall, k));
    g.poly([...quadPts].reverse(), shade(wall, k));
  }
  g.poly(corners.map((p) => ({ ...p, y: y1 })), roof, true);
}
