/**
 * 施設 16 種類の 3D の形を、GeoBuilder に溜める。敷地の地面 (舗装・芝・グラウンド) と、立つもの (建物・タンク・塔) を作る。
 * 位置は敷地の一辺 S に対する割合で決めてある (座標は three の x = 東、z = 南、y = 高さ)。
 */
import { FacilityType } from "../sim/facilities";
import { GeoBuilder, shade } from "./geo";
import { coolingTowers, facilityHeight, incineratorStack, sideOf, spot, windTurbines, type FacilityLike } from "./facilityShape3d";
import type { Parts } from "./buildingGeo";

/** 施設の種類ごとのバッジ色 (ツールバーや案内と揃える)。 */
export const FACILITY_COLORS: Record<FacilityType, number> = {
  [FacilityType.Power]: 0xf2c230,
  [FacilityType.Water]: 0x3f9fe0,
  [FacilityType.Sewage]: 0x9b7b4f,
  [FacilityType.Outside]: 0x6bbf59,
  [FacilityType.Police]: 0x4a78d0,
  [FacilityType.Fire]: 0xd9483b,
  [FacilityType.Hospital]: 0xf2f2f2,
  [FacilityType.School]: 0xe0a040,
  [FacilityType.MiddleSchool]: 0xd9863a,
  [FacilityType.HighSchool]: 0xc9622f,
  [FacilityType.University]: 0x8a56b8,
  [FacilityType.Park]: 0x5fbf6a,
  [FacilityType.NoiseBarrier]: 0x8a97a8,
  [FacilityType.Garbage]: 0x7f9a4a,
  [FacilityType.Wind]: 0x9fdcef,
  [FacilityType.Solar]: 0xf5d25a,
};

interface R {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** 敷地の地面: 舗装と縁石に、種類ごとの地面 (芝・グラウンド・車線・砂利など)。 */
function addPad(g: GeoBuilder, f: FacilityLike, connected: boolean): void {
  const S = sideOf(f);
  const ox = f.x * 16;
  const oz = f.y * 16;
  const r = (a: number, b: number, c: number, d: number): R => ({ x: ox + a * S, z: oz + b * S, w: (c - a) * S, d: (d - b) * S });
  const fill = (q: R, color: number, y: number) => g.rect(q.x, q.z, q.w, q.d, y, color);
  fill({ x: ox, z: oz, w: S, d: S }, 0x9a9da0, 0.1);
  fill({ x: ox + 1, z: oz + 1, w: S - 2, d: S - 2 }, connected ? 0xb2b5b7 : 0xd9a8a4, 0.16); // 道路につながっていない施設は、舗装が赤みを帯びる
  switch (f.type) {
    case FacilityType.Outside:
      fill(r(0.03, 0.03, 0.97, 0.97), 0x4a4d52, 0.2);
      fill(r(0.03, 0.49, 0.97, 0.51), 0xe0c040, 0.24);
      for (let i = 0; i < 4; i++) {
        fill(r(0.08 + i * 0.22, 0.28, 0.17 + i * 0.22, 0.3), 0xf2f2ee, 0.24);
        fill(r(0.08 + i * 0.22, 0.7, 0.17 + i * 0.22, 0.72), 0xf2f2ee, 0.24);
      }
      g.poly([spot(f, 0.25, 0.4), spot(f, 0.5, 0.4), spot(f, 0.5, 0.33), spot(f, 0.7, 0.5), spot(f, 0.5, 0.67), spot(f, 0.5, 0.6), spot(f, 0.25, 0.6)].map((p) => ({ x: p.x, y: 0.26, z: p.z })), 0xffffff, true);
      break;
    case FacilityType.Park: {
      fill(r(0.03, 0.03, 0.97, 0.97), 0x6fb25a, 0.2);
      // 園路 (くねる帯) と池
      const path = [spot(f, 0.04, 0.78), spot(f, 0.25, 0.62), spot(f, 0.45, 0.7), spot(f, 0.7, 0.45), spot(f, 0.96, 0.32)];
      for (let i = 0; i + 1 < path.length; i++) g.strip(path[i]!.x, path[i]!.z, path[i + 1]!.x, path[i + 1]!.z, S * 0.07, 0.24, 0xe3d6b4);
      const pc = spot(f, 0.68, 0.7);
      g.disc(pc.x, pc.z, S * 0.17, 0.26, 0x2f7aa8, 16);
      g.disc(pc.x, pc.z, S * 0.15, 0.28, 0x4d9fd6, 16);
      break;
    }
    case FacilityType.Wind: fill(r(0.03, 0.03, 0.97, 0.97), 0x86bb6c, 0.2); break;
    case FacilityType.Solar: fill(r(0.03, 0.03, 0.97, 0.97), 0xa9b0a0, 0.2); break;
    case FacilityType.School:
    case FacilityType.MiddleSchool:
    case FacilityType.HighSchool: {
      const yard = r(0.06, f.type === FacilityType.School ? 0.62 : 0.66, 0.94, 0.94);
      fill(yard, f.type === FacilityType.HighSchool ? 0x8bb870 : 0xc9a46c, 0.2);
      g.strip(yard.x, yard.z, yard.x + yard.w, yard.z, 0.7, 0.24, 0xf2f2ee);
      g.strip(yard.x, yard.z + yard.d, yard.x + yard.w, yard.z + yard.d, 0.7, 0.24, 0xf2f2ee);
      g.strip(yard.x, yard.z, yard.x, yard.z + yard.d, 0.7, 0.24, 0xf2f2ee);
      g.strip(yard.x + yard.w, yard.z, yard.x + yard.w, yard.z + yard.d, 0.7, 0.24, 0xf2f2ee);
      if (f.type === FacilityType.HighSchool) g.strip(yard.x + yard.w / 2, yard.z, yard.x + yard.w / 2, yard.z + yard.d, 0.7, 0.24, 0xf2f2ee);
      else g.disc(yard.x + yard.w / 2, yard.z + yard.d / 2, Math.min(yard.w, yard.d) * 0.3, 0.24, 0xf2f2ee, 16);
      break;
    }
    case FacilityType.University: fill(r(0.04, 0.78, 0.96, 0.96), 0xc9bfa0, 0.2); break;
    case FacilityType.Sewage: fill(r(0.04, 0.04, 0.96, 0.96), 0xa8a496, 0.2); break;
    default: break;
  }
}

/** 窓の並び (南の壁)。rows 階 × cols 列、壁 w の幅・高さ y0〜y1 の範囲に、窓ガラスを描く。 */
function windowGrid(p: Parts, wall: R, y0: number, y1: number, rows: number, cols: number, color: number, lit = false): void {
  const z = wall.z + wall.d + 0.07;
  const ph = (y1 - y0) / rows;
  const pw = wall.w / cols;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const x0 = wall.x + pw * (i + 0.18);
      const x1 = wall.x + pw * (i + 0.82);
      const ya = y0 + ph * (r + 0.2);
      const yb = y0 + ph * (r + 0.8);
      const pts = [{ x: x0, y: ya, z }, { x: x1, y: ya, z }, { x: x1, y: yb, z }, { x: x0, y: yb, z }];
      p.glass.poly(pts, color);
      if (lit) p.lit.poly(pts.map((q) => ({ ...q, z: q.z + 0.02 })), 0xcfe8ff);
    }
  }
}

/** 施設の立体を、parts に追加する (敷地の地面、立つもの、種類のバッジ、道路につながっていない警告)。 */
export function addFacility(p: Parts, f: FacilityLike, connected: boolean, lit: boolean): void {
  const g = p.solid;
  addPad(g, f, connected);
  const S = sideOf(f);
  const ox = f.x * 16;
  const oz = f.y * 16;
  const r = (a: number, b: number, c: number, d: number): R => ({ x: ox + a * S, z: oz + b * S, w: (c - a) * S, d: (d - b) * S });
  const box = (q: R, y0: number, y1: number, wall: number, roof: number) => g.box(q.x, q.z, q.w, q.d, y0, y1, wall, roof);
  const at = (a: number, b: number) => spot(f, a, b);
  switch (f.type) {
    case FacilityType.Power: {
      for (const t of coolingTowers(f)) g.frustum(t.x, t.z, t.r0, t.r1, 0, t.h, 0xb9bec3, 0xdadde0, 16);
      const hall = r(0.08, 0.5, 0.62, 0.88);
      box(hall, 0, S * 0.2, 0x7a8087, 0x5d6269);
      for (let i = 0; i < 4; i++) g.rect(hall.x, hall.z + (hall.d * (i + 0.5)) / 4, hall.w, hall.d * 0.12, S * 0.2 + 0.06, 0x7a8087);
      box(r(0.7, 0.58, 0.93, 0.84), 0, S * 0.1, 0x41464b, 0x575c62);
      const tw = at(0.78, 0.9);
      g.box(tw.x - 0.3, tw.z - 0.3, 0.6, 0.6, 0, S * 0.3, 0x8d9298, 0x8d9298);
      g.box(tw.x - 2, tw.z - 0.3, 4, 0.5, S * 0.26, S * 0.28, 0x8d9298, 0x8d9298);
      break;
    }
    case FacilityType.Water: {
      g.frustum(at(0.36, 0.4).x, at(0.36, 0.4).z, S * 0.2, S * 0.2, 0, S * 0.22, 0xc9ccd0, 0x3a8fd6, 16);
      g.frustum(at(0.76, 0.3).x, at(0.76, 0.3).z, S * 0.1, S * 0.1, 0, S * 0.3, 0xc9ccd0, 0x3a8fd6, 14);
      box(r(0.5, 0.62, 0.92, 0.92), 0, S * 0.14, 0xd8d3c4, 0x4f7fb0);
      g.box(ox + S * 0.2, oz + S * 0.76, S * 0.3, 1.2, 0.2, 1.6, 0x6c7c8c, 0x6c7c8c);
      break;
    }
    case FacilityType.Sewage: {
      for (const [fx, fy, fr] of [[0.28, 0.3, 0.2], [0.62, 0.3, 0.15]] as const) {
        g.frustum(at(fx, fy).x, at(fx, fy).z, S * fr, S * fr, 0, S * 0.06, 0xcfd2d4, 0x7f8a55, 18);
        g.box(at(fx, fy).x, at(fx, fy).z - 0.3, S * fr * 0.9, 0.6, S * 0.06, S * 0.06 + 0.5, 0x575f38, 0x575f38);
      }
      g.frustum(at(0.85, 0.34).x, at(0.85, 0.34).z, S * 0.09, S * 0.09, 0, S * 0.12, 0xb8bcbf, 0xcfd2d4, 14);
      g.ball(at(0.85, 0.34).x, S * 0.12, at(0.85, 0.34).z, S * 0.09, 0xdadde0, 1.3);
      box(r(0.08, 0.62, 0.52, 0.92), 0, S * 0.14, 0x8a7a60, 0x6e6250);
      box(r(0.6, 0.66, 0.92, 0.92), 0, S * 0.1, 0xb0a58e, 0x8f8672);
      break;
    }
    case FacilityType.Outside: {
      box(r(0.4, 0.4, 0.6, 0.6), 0, S * 0.14, 0xd8d3c4, 0x3f6fa8);
      const l = at(0.1, 0.9);
      const rr = at(0.9, 0.9);
      g.box(l.x - 0.6, l.z - 0.6, 1.2, 1.2, 0, S * 0.26, 0x777a7e, 0x777a7e);
      g.box(rr.x - 0.6, rr.z - 0.6, 1.2, 1.2, 0, S * 0.26, 0x777a7e, 0x777a7e);
      g.box(l.x, l.z - 0.4, rr.x - l.x, 0.8, S * 0.16, S * 0.26, 0x1f7a3f, 0x1f7a3f); // 案内標識
      g.box(l.x + (rr.x - l.x) * 0.2, l.z + 0.45, (rr.x - l.x) * 0.6, 0.2, S * 0.2, S * 0.215, 0xffffff, 0xffffff);
      break;
    }
    case FacilityType.Police: {
      const hall = r(0.1, 0.12, 0.9, 0.62);
      box(hall, 0, S * 0.22, 0xdfe3e8, 0x3b64b8);
      g.box(hall.x - 0.2, hall.z + hall.d, hall.w + 0.4, 0.5, S * 0.19, S * 0.22, 0x3b64b8, 0x3b64b8); // 青い帯
      windowGrid(p, hall, S * 0.05, S * 0.17, 1, 4, 0x8aa6d6, lit);
      box(r(0.14, 0.72, 0.36, 0.86), 0, S * 0.06, 0xf2f2ee, 0xdfe3e8); // パトカー
      g.ball(at(0.22, 0.79).x, S * 0.09, at(0.22, 0.79).z, 0.7, 0xe05a4f);
      g.ball(at(0.28, 0.79).x, S * 0.09, at(0.28, 0.79).z, 0.7, 0x3b64b8);
      const fp = at(0.86, 0.7);
      g.box(fp.x - 0.25, fp.z - 0.25, 0.5, 0.5, 0, S * 0.34, 0xdddddd, 0xdddddd);
      g.box(fp.x, fp.z - 0.2, 3, 0.4, S * 0.28, S * 0.34, 0x3b64b8, 0x3b64b8);
      break;
    }
    case FacilityType.Fire: {
      const tw = r(0.72, 0.08, 0.94, 0.36);
      box(tw, 0, S * 0.42, 0xc9c3b3, 0xb83a30);
      windowGrid(p, tw, S * 0.28, S * 0.36, 1, 1, 0x8aa6d6, lit);
      const gar = r(0.08, 0.3, 0.66, 0.86);
      box(gar, 0, S * 0.24, 0xd8d3c4, 0xb83a30);
      for (let i = 0; i < 2; i++) {
        const x0 = gar.x + gar.w * (0.08 + i * 0.46);
        g.poly([{ x: x0, y: 0, z: gar.z + gar.d + 0.07 }, { x: x0 + gar.w * 0.38, y: 0, z: gar.z + gar.d + 0.07 }, { x: x0 + gar.w * 0.38, y: S * 0.19, z: gar.z + gar.d + 0.07 }, { x: x0, y: S * 0.19, z: gar.z + gar.d + 0.07 }], 0xc9453a);
        for (let j = 1; j < 5; j++) g.poly([{ x: x0, y: (S * 0.19 * j) / 5, z: gar.z + gar.d + 0.09 }, { x: x0 + gar.w * 0.38, y: (S * 0.19 * j) / 5, z: gar.z + gar.d + 0.09 }, { x: x0 + gar.w * 0.38, y: (S * 0.19 * j) / 5 + 0.25, z: gar.z + gar.d + 0.09 }, { x: x0, y: (S * 0.19 * j) / 5 + 0.25, z: gar.z + gar.d + 0.09 }], 0x8f2f27);
      }
      break;
    }
    case FacilityType.Hospital: {
      const hall = r(0.08, 0.1, 0.92, 0.7);
      const H = S * 0.34;
      box(hall, 0, H, 0xf0f0ee, 0xdfe3e6);
      windowGrid(p, hall, H * 0.05, H * 0.7, 3, 7, 0x8fb8d8, lit);
      const cx0 = hall.x + hall.w * 0.46;
      const cw = hall.w * 0.08;
      const z = hall.z + hall.d + 0.1;
      g.poly([{ x: cx0, y: H * 0.72, z }, { x: cx0 + cw, y: H * 0.72, z }, { x: cx0 + cw, y: H * 0.98, z }, { x: cx0, y: H * 0.98, z }], 0xe05a4f);
      g.poly([{ x: cx0 - cw * 0.5, y: H * 0.82, z }, { x: cx0 + cw * 1.5, y: H * 0.82, z }, { x: cx0 + cw * 1.5, y: H * 0.88, z }, { x: cx0 - cw * 0.5, y: H * 0.88, z }], 0xe05a4f);
      g.disc(hall.x + hall.w * 0.25, hall.z + hall.d * 0.45, S * 0.1, H + 0.06, 0x4a78d0, 16); // ヘリポート
      g.disc(hall.x + hall.w * 0.25, hall.z + hall.d * 0.45, S * 0.085, H + 0.08, 0xf2f2ee, 16);
      g.rect(hall.x + hall.w * 0.25 - 0.9, hall.z + hall.d * 0.45 - 1.3, 0.6, 2.6, H + 0.1, 0x4a78d0);
      g.rect(hall.x + hall.w * 0.25 + 0.3, hall.z + hall.d * 0.45 - 1.3, 0.6, 2.6, H + 0.1, 0x4a78d0);
      g.rect(hall.x + hall.w * 0.25 - 0.9, hall.z + hall.d * 0.45 - 0.3, 1.8, 0.6, H + 0.1, 0x4a78d0);
      box(r(0.4, 0.74, 0.7, 0.92), 0, S * 0.08, 0xcfd3d8, 0xe05a4f);
      break;
    }
    case FacilityType.School: {
      const b = r(0.08, 0.08, 0.92, 0.5);
      box(b, 0, S * 0.22, 0xe3d6b4, 0xa8503f);
      windowGrid(p, b, S * 0.04, S * 0.2, 2, 5, 0x8aa6d6, lit);
      box(r(0.42, 0.14, 0.58, 0.32), S * 0.22, S * 0.36, 0xd9ccaa, 0xa8503f);
      g.poly([{ x: at(0.5, 0.325).x - S * 0.03, y: S * 0.3, z: at(0.5, 0.325).z + 0.1 }, { x: at(0.5, 0.325).x + S * 0.03, y: S * 0.3, z: at(0.5, 0.325).z + 0.1 }, { x: at(0.5, 0.325).x + S * 0.03, y: S * 0.34, z: at(0.5, 0.325).z + 0.1 }, { x: at(0.5, 0.325).x - S * 0.03, y: S * 0.34, z: at(0.5, 0.325).z + 0.1 }], 0xffffff);
      break;
    }
    case FacilityType.MiddleSchool: {
      const b = r(0.08, 0.08, 0.62, 0.52);
      box(b, 0, S * 0.26, 0xe3d6b4, 0x3f6fa8);
      windowGrid(p, b, S * 0.04, S * 0.24, 3, 5, 0x8aa6d6, lit);
      const gym = r(0.68, 0.18, 0.94, 0.52);
      box(gym, 0, S * 0.15, 0xcfd3d8, 0x4a7fc0);
      g.poly([{ x: gym.x, y: S * 0.15, z: gym.z + gym.d }, { x: gym.x + gym.w, y: S * 0.15, z: gym.z + gym.d }, { x: gym.x + gym.w, y: S * 0.21, z: gym.z + gym.d / 2 }, { x: gym.x, y: S * 0.21, z: gym.z + gym.d / 2 }], 0x5a8fd0);
      g.poly([{ x: gym.x + gym.w, y: S * 0.15, z: gym.z }, { x: gym.x, y: S * 0.15, z: gym.z }, { x: gym.x, y: S * 0.21, z: gym.z + gym.d / 2 }, { x: gym.x + gym.w, y: S * 0.21, z: gym.z + gym.d / 2 }], shade(0x5a8fd0, 0.85));
      break;
    }
    case FacilityType.HighSchool: {
      const b = r(0.05, 0.1, 0.95, 0.5);
      const H = S * 0.3;
      box(b, 0, H, 0xe3d6b4, 0x8f3f2f);
      box(r(0.05, 0.1, 0.3, 0.5), 0, H + 1.4, 0xd9ccaa, 0x8f3f2f);
      box(r(0.7, 0.1, 0.95, 0.5), 0, H + 1.4, 0xd9ccaa, 0x8f3f2f);
      windowGrid(p, b, H * 0.1, H * 0.92, 3, 8, 0x8aa6d6, lit);
      box(r(0.42, 0.16, 0.58, 0.34), H, H + S * 0.14, 0xd9ccaa, 0x8f3f2f);
      break;
    }
    case FacilityType.University: {
      const hall = r(0.06, 0.3, 0.94, 0.72);
      const H = S * 0.24;
      box(hall, 0, H, 0xefe9d8, 0x6a4a90);
      for (let i = 0; i < 9; i++) {
        const x0 = hall.x + hall.w * (0.05 + i * 0.105);
        g.box(x0, hall.z + hall.d, 1.4, 0.8, 0, H * 0.92, 0xffffff, 0xffffff);
      }
      box(r(0.06, 0.08, 0.3, 0.3), 0, H * 0.85, 0xe3dcc6, 0x6a4a90);
      box(r(0.7, 0.08, 0.94, 0.3), 0, H * 0.85, 0xe3dcc6, 0x6a4a90);
      box(r(0.34, 0.22, 0.66, 0.42), H, H + S * 0.06, 0xe3dcc6, 0x7d5ca8);
      g.ball(at(0.5, 0.32).x, H + S * 0.06, at(0.5, 0.32).z, S * 0.15, 0x7d5ca8, 0.9);
      g.box(at(0.5, 0.32).x - 0.3, at(0.5, 0.32).z - 0.3, 0.6, 0.6, H + S * 0.19, H + S * 0.27, 0x8a8470, 0x8a8470);
      for (let i = 0; i < 5; i++) {
        const t = at(0.12 + i * 0.19, 0.9);
        g.box(t.x - 0.3, t.z - 0.3, 0.6, 0.6, 0, S * 0.07, 0x6b4a32, 0x6b4a32);
        g.ball(t.x, S * 0.1, t.z, S * 0.045, 0x3f8a3a);
      }
      break;
    }
    case FacilityType.Park: {
      for (const [fx, fy, h, rr] of [[0.2, 0.2, 0.2, 0.1], [0.5, 0.14, 0.17, 0.08], [0.14, 0.62, 0.15, 0.07], [0.86, 0.22, 0.2, 0.09], [0.4, 0.88, 0.14, 0.06]] as const) {
        const t = at(fx, fy);
        g.frustum(t.x, t.z, 0.5, 0.35, 0, S * h * 0.7, 0x6b4a32, 0x6b4a32, 6);
        g.ball(t.x, S * h, t.z, S * rr, 0x3f8a3a);
        g.ball(t.x - S * rr * 0.3, S * h + S * rr * 0.3, t.z - S * rr * 0.3, S * rr * 0.55, 0x62b15a);
      }
      box(r(0.34, 0.5, 0.5, 0.64), 0, S * 0.1, 0xd8c9a8, 0xb5503c); // 東屋
      box(r(0.18, 0.76, 0.32, 0.8), 0, S * 0.03, 0x8a5a2c, 0x6b4320); // ベンチ
      break;
    }
    case FacilityType.NoiseBarrier: {
      const w = r(0.04, 0.42, 0.96, 0.62);
      const H = S * 0.26;
      box(w, 0, H, 0x6c7279, 0xb8bcc2);
      for (let i = 0; i < 12; i++) g.box(w.x + (w.w * (i + 0.5)) / 12 - 0.2, w.z + w.d, 0.4, 0.3, H * 0.08, H * 0.88, 0x4a4f55, 0x4a4f55);
      for (let i = 0; i < 7; i++) g.ball(w.x + (w.w * (i + 0.5)) / 7, H + 0.8, w.z + w.d / 2, 1.5, i % 2 ? 0x4f9a46 : 0x62b15a, 0.9);
      break;
    }
    case FacilityType.Garbage: {
      const hall = r(0.08, 0.4, 0.62, 0.82);
      box(hall, 0, S * 0.28, 0x7a7f6a, 0x5a5f4c);
      for (let i = 1; i < 5; i++) g.box(hall.x, hall.z + hall.d, hall.w, 0.25, (S * 0.28 * i) / 5, (S * 0.28 * i) / 5 + 0.3, 0x4a4f40, 0x4a4f40);
      box(r(0.1, 0.14, 0.4, 0.38), 0, S * 0.12, 0x6e6552, 0x8a7a60);
      const st = incineratorStack(f);
      g.frustum(st.x, st.z, st.r * 1.3, st.r, 0, st.h, 0x8d8a82, 0x3a3834, 10);
      g.frustum(st.x, st.z, st.r * 1.08, st.r * 1.05, st.h * 0.86, st.h * 0.92, 0xc9453a, 0xc9453a, 10);
      box(r(0.1, 0.86, 0.34, 0.97), 0, S * 0.06, 0x3c7fb8, 0x4f95d0); // 収集車
      box(r(0.62, 0.78, 0.92, 0.96), 0, S * 0.05, 0x4f9a46, 0x62b15a); // コンテナ
      break;
    }
    case FacilityType.Wind: {
      box(r(0.58, 0.78, 0.9, 0.96), 0, S * 0.08, 0xd8d3c4, 0x5d8fc0);
      for (const t of windTurbines(f)) {
        g.frustum(t.x, t.z, S * 0.032, S * 0.016, 0, t.h, 0xeceff2, 0xc9ced4, 8);
        g.ball(t.x, t.h, t.z, S * 0.03, 0xc9ced4); // 羽根の中心 (ナセル)
      }
      break;
    }
    case FacilityType.Solar: {
      const cols = 4;
      const rows = 3;
      for (let rr = 0; rr < rows; rr++) {
        for (let i = 0; i < cols; i++) {
          const x0 = ox + S * 0.08 + (S * 0.78 * i) / cols;
          const z0 = oz + S * 0.1 + (S * 0.62 * rr) / rows;
          const pw = (S * 0.78) / cols - 1.6;
          const ph = (S * 0.62) / rows - 2.2;
          // 南へ傾いたパネル (奥が高い)
          const hi = S * 0.1;
          const lo = S * 0.04;
          g.poly([{ x: x0, y: lo, z: z0 + ph }, { x: x0 + pw, y: lo, z: z0 + ph }, { x: x0 + pw, y: hi, z: z0 }, { x: x0, y: hi, z: z0 }], 0x1f4f8f);
          p.glass.poly([{ x: x0 + 0.2, y: lo + 0.05, z: z0 + ph - 0.1 }, { x: x0 + pw - 0.2, y: lo + 0.05, z: z0 + ph - 0.1 }, { x: x0 + pw - 0.2, y: hi + 0.05, z: z0 + 0.1 }, { x: x0 + 0.2, y: hi + 0.05, z: z0 + 0.1 }], 0x2a63ad);
          g.box(x0 + pw / 2 - 0.2, z0 + ph / 2, 0.4, 0.4, 0, (lo + hi) / 2, 0x777a7e, 0x777a7e);
        }
      }
      box(r(0.8, 0.84, 0.95, 0.96), 0, S * 0.07, 0xd8d3c4, 0x8d9298);
      break;
    }
  }
  // 道路につながっていない施設: 赤い縁取りと警告の球
  if (!connected) {
    g.strip(ox, oz, ox + S, oz, 1.2, 0.3, 0xe05a4f);
    g.strip(ox + S, oz, ox + S, oz + S, 1.2, 0.3, 0xe05a4f);
    g.strip(ox + S, oz + S, ox, oz + S, 1.2, 0.3, 0xe05a4f);
    g.strip(ox, oz + S, ox, oz, 1.2, 0.3, 0xe05a4f);
    g.ball(ox + 6, Math.max(facilityHeight(f) * 0.4, 3) + 5, oz + S - 6, 3, 0xe05a4f);
  }
}
