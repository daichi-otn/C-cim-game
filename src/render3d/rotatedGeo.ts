/**
 * 建物の形を、敷地の中心のまわりに回す (道路に沿って向けるため。角度はラジアン)。
 * GeoBuilder と同じ部品を持つ包み役: 点を回してから、もとの GeoBuilder に渡す。面の向き (表と裏) は、回しても変わらない。
 */
import type { V3 } from "./geo";
import { shade } from "./geo";

/** 建物の形を溜める先の部品 (GeoBuilder と同じ形)。 */
export interface Sink {
  poly(pts: V3[], color: number, upward?: boolean): void;
  rect(x: number, z: number, w: number, d: number, y: number, color: number): void;
  strip(ax: number, az: number, bx: number, bz: number, width: number, y: number, color: number): void;
  disc(cx: number, cz: number, r: number, y: number, color: number, segments?: number): void;
  box(x: number, z: number, w: number, d: number, y0: number, y1: number, wall: number, roof: number): void;
  frustum(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, color: number, top?: number, segments?: number): void;
  ball(cx: number, cy: number, cz: number, r: number, color: number, sy?: number): void;
}

/** (x, z) を、(cx, cz) のまわりに theta (ラジアン) 回す。 */
export function rotateXZ(theta: number, x: number, z: number, cx: number, cz: number): [number, number] {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [cx + dx * c - dz * s, cz + dx * s + dz * c];
}

/** 面の頂点 (順に並べたもの) の向きを、外側 (outward) に合わせる。poly と同じ法線の計算。 */
function faceFacing(pts: V3[], outward: { x: number; z: number }): V3[] {
  const [a, b, c] = pts as [V3, V3, V3];
  const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
  const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const horizontal = nx * outward.x + nz * outward.z;
  return horizontal < 0 || (Math.abs(horizontal) < 1e-9 && ny < 0) ? [...pts].reverse() : pts;
}

export class RotatedSink implements Sink {
  constructor(
    private t: Sink,
    private theta: number,
    private cx: number,
    private cz: number,
  ) {}

  private r(x: number, z: number): [number, number] {
    return rotateXZ(this.theta, x, z, this.cx, this.cz);
  }

  poly(pts: V3[], color: number, upward = false): void {
    this.t.poly(
      pts.map((p) => {
        const [x, z] = this.r(p.x, p.z);
        return { x, y: p.y, z };
      }),
      color,
      upward,
    );
  }

  rect(x: number, z: number, w: number, d: number, y: number, color: number): void {
    this.poly(
      [
        { x, y, z },
        { x: x + w, y, z },
        { x: x + w, y, z: z + d },
        { x, y, z: z + d },
      ],
      color,
      true,
    );
  }

  strip(ax: number, az: number, bx: number, bz: number, width: number, y: number, color: number): void {
    const [a1, a2] = this.r(ax, az);
    const [b1, b2] = this.r(bx, bz);
    this.t.strip(a1, a2, b1, b2, width, y, color);
  }

  disc(cx: number, cz: number, r: number, y: number, color: number, segments?: number): void {
    const [x, z] = this.r(cx, cz);
    this.t.disc(x, z, r, y, color, segments);
  }

  ball(cx: number, cy: number, cz: number, r: number, color: number, sy?: number): void {
    const [x, z] = this.r(cx, cz);
    this.t.ball(x, cy, z, r, color, sy);
  }

  frustum(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, color: number, top?: number, segments?: number): void {
    const [x, z] = this.r(cx, cz);
    this.t.frustum(x, z, r0, r1, y0, y1, color, top, segments);
  }

  /** 箱: 4 つの側面と屋根。側面の向きは、箱の中心から外へ向くように揃える。 */
  box(x: number, z: number, w: number, d: number, y0: number, y1: number, wall: number, roof: number): void {
    const corners = [
      [x, z],
      [x + w, z],
      [x + w, z + d],
      [x, z + d],
    ].map(([px, pz]) => this.r(px!, pz!));
    const mx = corners.reduce((s, [px]) => s + px, 0) / 4;
    const mz = corners.reduce((s, [, pz]) => s + pz, 0) / 4;
    const shades = [0.95, 0.92, 0.95, 0.93];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]!;
      const [bx, bz] = corners[(i + 1) % 4]!;
      const ex = (ax + bx) / 2 - mx;
      const ez = (az + bz) / 2 - mz;
      const pts = faceFacing(
        [
          { x: ax, y: y0, z: az },
          { x: bx, y: y0, z: bz },
          { x: bx, y: y1, z: bz },
          { x: ax, y: y1, z: az },
        ],
        { x: ex, z: ez },
      );
      this.t.poly(pts, shade(wall, shades[i]!));
    }
    this.t.poly(
      corners.map(([px, pz]) => ({ x: px, y: y1, z: pz })),
      roof,
      true,
    );
  }
}
