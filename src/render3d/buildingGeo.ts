/**
 * 区画の建物 (住宅・集合住宅・店・オフィス・高層ビル・工場) の 3D の形を、GeoBuilder に溜める。
 * 高さ・底・形の種類は render/buildingShape の計算を使う (座標は、three の x = 東、z = 南、y = 高さ)。
 */
import { baseRect, flatsStyle, isMixedShop, kindOf, steppedUpper, wallHeight } from "./buildingShape";
import { hash2 } from "../sim/rng";
import { ZoneType, type ZoneCell } from "../sim/zoning";
import { GeoBuilder, shade, type V3 } from "./geo";
import { RotatedSink, type Sink } from "./rotatedGeo";
import { mixColor } from "../render/lighting";
import { windows3D } from "./windows3d";
import { eraOf, styleIndex } from "./era";

const SEED = 0x51ed;

/** 住宅の壁・屋根の色: 漆喰、ベージュ、水色がかった灰、サーモン、灰白。 */
const HOUSE_WALLS = [0xe8dcc4, 0xd9c9a8, 0xc9d3d6, 0xe6c9b0, 0xdcd6c8];
/** 屋根: 赤瓦、スレート、茶、緑青、ベージュ。 */
const HOUSE_ROOFS = [0xb5503c, 0x58606b, 0x8a5a3c, 0x4f7a6e, 0xa8957a];
const FLAT_WALLS = [0xd8c9b4, 0xcfd2d6, 0xe0c8a8, 0xc7b8a6, 0xb9c6d4, 0xd9b8a0, 0xe6e0c8, 0xa9b8a0];
const BRICKS = [0xb86a50, 0xc08a68, 0xa85a48, 0xb07a5a];
const PASTELS = [0xe8c8c0, 0xc8dcc8, 0xe0dcb8, 0xc0cce0, 0xe8d0b0, 0xd8c0d8];
const BALCONIES = [0xc9453a, 0x2f7fd0, 0x2fa38a, 0xe0a030, 0xf2f2ee, 0x555b61];
const SHOP_ACCENTS = [0xd9483b, 0x2f7fd0, 0x2fa38a, 0xe0a030, 0x8a55c0];
const SHOP_WALLS = [0xe3ddd0, 0xd5d9de, 0xe6d3b8];
const GLASS_TONES = [0x6f93b8, 0x5f86ad, 0x7aa0a8, 0x6a7fa8];
const FACTORY_WALLS = [0x9aa3ad, 0xb09a6d, 0xa8a69c];

/** 建物の形を溜める先: 不透明な面・窓ガラス・夜に灯る窓。 */
export interface Parts {
  solid: GeoBuilder;
  glass: GeoBuilder;
  lit: GeoBuilder;
}

/** 建物の形を書く先 (GeoBuilder、または回す包み役)。 */
export interface ShapeParts {
  solid: Sink;
  glass: Sink;
  lit: Sink;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** いま形を作っている建物の地区の色 (あれば、建物の色を少しその色に寄せる)。addLot の間だけ入る。 */
let tint: number | undefined;
const TINT_AMOUNT = 0.22;

const pick = <T,>(list: readonly T[], c: ZoneCell, salt: number): T => {
  const base = list[styleIndex(list.length, hash2(SEED + salt, c.x, c.y), eraOf(c.built))]!;
  return tint === undefined ? base : (mixColor(base as number, tint, TINT_AMOUNT) as T);
};
const rectOf = (c: ZoneCell): Rect => {
  const b = baseRect(c);
  return { x: b.x, z: b.y, w: b.w, d: b.h };
};

/** 工場の煙突の位置と高さ (煙の出る所。EffectsView も使う)。 */
export function factoryChimney(c: ZoneCell): { x: number; z: number; r: number; y0: number; y1: number } {
  const b = rectOf(c);
  const d = wallHeight(c);
  return { x: b.x + b.w - 2.6, z: b.z + 3, r: 1.5 + 0.2 * c.building, y0: d, y1: d + 8 + 2 * c.building };
}

/** 窓ガラスと、夜に灯る窓を追加する。灯りは、供給があり、(住宅なら) 住民がいる建物だけ。 */
function addWindows(p: ShapeParts, c: ZoneCell, glassColor: number, lightsOn: boolean, litColor: number): void {
  for (const w of windows3D(c)) {
    p.glass.poly(w.pts, w.face === "e" || w.face === "w" ? shade(glassColor, 0.85) : glassColor);
    if (lightsOn && w.lit) p.lit.poly(w.pts.map((q) => ({ ...q })), litColor);
  }
}

/** 切妻屋根の家 1 軒。底 b、壁の高さ d。alongX なら棟は東西に走る。戻り値は屋根の高さ r。 */
function gableHouse(g: Sink, b: Rect, d: number, wall: number, roof: number, alongX: boolean): number {
  const r = Math.min((alongX ? b.d : b.w) * 0.42, 5.5);
  const oh = 0.7; // ひさし
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, roof);
  if (alongX) {
    const zm = b.z + b.d / 2;
    const dz = oh * (r / (b.d / 2));
    g.poly([{ x: b.x - oh, y: d - dz, z: b.z + b.d + oh }, { x: b.x + b.w + oh, y: d - dz, z: b.z + b.d + oh }, { x: b.x + b.w + oh, y: d + r, z: zm }, { x: b.x - oh, y: d + r, z: zm }], roof); // 南の屋根
    g.poly([{ x: b.x + b.w + oh, y: d - dz, z: b.z - oh }, { x: b.x - oh, y: d - dz, z: b.z - oh }, { x: b.x - oh, y: d + r, z: zm }, { x: b.x + b.w + oh, y: d + r, z: zm }], shade(roof, 0.9)); // 北の屋根
    g.poly([{ x: b.x + b.w, y: d, z: b.z + b.d }, { x: b.x + b.w, y: d, z: b.z }, { x: b.x + b.w, y: d + r, z: zm }], shade(wall, 0.95)); // 東の妻
    g.poly([{ x: b.x, y: d, z: b.z }, { x: b.x, y: d, z: b.z + b.d }, { x: b.x, y: d + r, z: zm }], shade(wall, 0.93)); // 西の妻
  } else {
    const xm = b.x + b.w / 2;
    const dx = oh * (r / (b.w / 2));
    g.poly([{ x: b.x + b.w + oh, y: d - dx, z: b.z + b.d + oh }, { x: b.x + b.w + oh, y: d - dx, z: b.z - oh }, { x: xm, y: d + r, z: b.z - oh }, { x: xm, y: d + r, z: b.z + b.d + oh }], roof); // 東の屋根
    g.poly([{ x: b.x - oh, y: d - dx, z: b.z - oh }, { x: b.x - oh, y: d - dx, z: b.z + b.d + oh }, { x: xm, y: d + r, z: b.z + b.d + oh }, { x: xm, y: d + r, z: b.z - oh }], shade(roof, 0.9)); // 西の屋根
    g.poly([{ x: b.x, y: d, z: b.z + b.d }, { x: b.x + b.w, y: d, z: b.z + b.d }, { x: xm, y: d + r, z: b.z + b.d }], wall); // 南の妻
    g.poly([{ x: b.x + b.w, y: d, z: b.z }, { x: b.x, y: d, z: b.z }, { x: xm, y: d + r, z: b.z }], shade(wall, 0.95)); // 北の妻
  }
  return r;
}

/** 南の壁の出入口 (扉)。x は扉の中心。 */
function door(g: Sink, b: Rect, x: number, color = 0x6b4a32): void {
  const z = b.z + b.d + 0.06;
  g.poly([{ x: x - 0.9, y: 0, z }, { x: x + 0.9, y: 0, z }, { x: x + 0.9, y: 2.6, z }, { x: x - 0.9, y: 2.6, z }], color);
}

/** 屋上の小さな設備 (空調機・受水槽など)。 */
function rooftopUnits(g: Sink, c: ZoneCell, count: number, y: number, area: Rect, tone = 0x8d9298): void {
  for (let i = 0; i < count; i++) {
    const w = 2 + hash2(SEED + 10 + i, c.x, c.y) * 1.6;
    const d = 2 + hash2(SEED + 20 + i, c.x, c.y) * 1.4;
    const x = area.x + 1.5 + hash2(SEED + 30 + i, c.x, c.y) * Math.max(0.5, area.w - w - 3);
    const z = area.z + 1.5 + hash2(SEED + 40 + i, c.x, c.y) * Math.max(0.5, area.d - d - 3);
    g.box(x, z, w, d, y, y + 1.6, tone, shade(tone, 1.15));
  }
}

/** 建てた時代ごとの屋上の設備: 古い時代は受水槽、中の時代はアンテナ、新しい時代は太陽光パネル。 */
function eraRoofGear(g: Sink, c: ZoneCell, inner: Rect, y: number): void {
  const era = eraOf(c.built);
  if (era === 0) {
    g.box(inner.x + 0.5, inner.z + 0.5, 1.9, 1.9, y, y + 2.4, 0x8f96a0, 0xa9b0b9); // 受水槽
  } else if (era === 1) {
    const mx = inner.x + inner.w - 0.9;
    const mz = inner.z + 0.9;
    g.box(mx, mz, 0.18, 0.18, y, y + 5.5, 0x444a52, 0x555c66); // アンテナ
    g.box(mx - 0.5, mz + 0.5, 1, 0.12, y + 4.6, y + 4.8, 0x444a52, 0x555c66);
  } else {
    g.box(inner.x + 0.6, inner.z + 0.6, Math.min(3.2, inner.w - 1.2), 1.4, y, y + 0.5, 0x1f4f8f, 0x2c63b3); // 太陽光パネル
  }
}

/** 平らな屋根の飾り: 設備・緑化・太陽光パネル・木のデッキのどれか。屋根の高さ y、範囲 area。 */
function flatRoof(g: Sink, c: ZoneCell, area: Rect, y: number, salt = 0): void {
  const r = hash2(SEED + 80 + salt, c.x, c.y);
  const inner: Rect = { x: area.x + 0.9, z: area.z + 0.9, w: area.w - 1.8, d: area.d - 1.8 };
  if (inner.w < 2 || inner.d < 2) return;
  eraRoofGear(g, c, inner, y + 0.05);
  const face = (color: number) => g.rect(inner.x, inner.z, inner.w, inner.d, y + 0.05, color);
  if (r < 0.3) {
    face(0x6f6c66);
    rooftopUnits(g, c, 2 + Math.floor((c.w * c.h) / 2), y, inner);
  } else if (r < 0.55) {
    face(0x6aa35a);
    for (let i = 0; i < 6; i++) g.ball(inner.x + 1 + hash2(SEED + 90 + i + salt, c.x, c.y) * (inner.w - 2), y + 0.6, inner.z + 1 + hash2(SEED + 100 + i + salt, c.x, c.y) * (inner.d - 2), 0.9, i % 2 ? 0x8cc27a : 0x4f8a45, 0.7);
    rooftopUnits(g, c, 1, y, inner);
  } else if (r < 0.8) {
    face(0x7d7a74);
    const rows = Math.max(1, Math.floor(inner.d / 2.6));
    for (let i = 0; i < rows; i++) {
      const z0 = inner.z + 0.5 + (i * (inner.d - 1)) / rows;
      const ph = (inner.d - 1) / rows - 0.6;
      const pw = inner.w - 1.4;
      g.poly([{ x: inner.x + 0.7, y: y + 0.9, z: z0 }, { x: inner.x + 0.7 + pw, y: y + 0.9, z: z0 }, { x: inner.x + 0.7 + pw, y: y + 0.2, z: z0 + ph }, { x: inner.x + 0.7, y: y + 0.2, z: z0 + ph }], 0x1f4f8f);
    }
  } else {
    face(0xb08a5a);
    for (let i = 0; i < 2; i++) {
      const px = inner.x + inner.w * (0.3 + i * 0.4);
      const pz = inner.z + inner.d * 0.55;
      g.frustum(px, pz, 0.15, 0.15, y, y + 1.4, 0x444444, 0x444444, 5);
      g.frustum(px, pz, 1.6, 0.2, y + 1.3, y + 1.9, BALCONIES[Math.floor(hash2(SEED + 110 + i, c.x, c.y) * 6) % 6]!, BALCONIES[i]!, 8);
    }
  }
}

/** 各階の床にベランダの手すりの帯 (南の壁の前に張り出す)。 */
function balconies(g: Sink, b: Rect, y0: number, y1: number, accent: number, floorH = 4.6): void {
  const floors = Math.max(1, Math.floor((y1 - y0 - 1.5) / floorH));
  for (let f = 1; f < floors + 1; f++) {
    const y = y0 + 1.4 + f * ((y1 - y0 - 2) / floors) - 0.4;
    if (y > y1 - 0.8) continue;
    g.box(b.x + 0.4, b.z + b.d, b.w - 0.8, 0.8, y, y + 0.8, accent, accent);
  }
}

function addHouse(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(HOUSE_WALLS, c, 1);
  const roof = pick(HOUSE_ROOFS, c, 2);
  const alongX = b.w >= b.d;
  if (hash2(SEED + 203, c.x, c.y) < 0.35) hipRoof(g, b, d, roof); // 寄棟の屋根 (切妻のほかに)
  else gableHouse(g, b, d, wall, roof, alongX);
  const r = Math.min(b.w, b.d) * 0.36;
  door(g, b, b.x + b.w / 2);
  addWindows(p, c, 0x6f8fa6, lights, 0xffc766);
  if (hash2(SEED + 2, c.x, c.y) > 0.5) g.box(b.x + b.w * (alongX ? 0.68 : 0.3), b.z + b.d * (alongX ? 0.3 : 0.62), 1.6, 1.6, d + r * 0.55, d + r + 2.4, 0x8a5a4a, 0x4a3a32);
}

function addSlab(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(FLAT_WALLS, c, 3);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0xa9a79f);
  addWindows(p, c, 0x6c8296, lights, 0xffc766);
  balconies(g, b, 0, d, pick(BALCONIES, c, 8));
  const sx = b.x + b.w * 0.82;
  g.box(sx, b.z + b.d, 2.2, 0.5, 0, d + 0.3, shade(wall, 1.12), shade(wall, 1.12)); // 階段室
  door(g, b, b.x + b.w * 0.45, 0x4a4f55);
  flatRoof(g, c, b, d);
}

function addCourt(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const t = Math.max(3.2, Math.min(b.w, b.d) * 0.34);
  if (b.w - 2 * t < 2 || b.d - 2 * t < 2) return addSlab(p, c, lights);
  const wall = pick(BRICKS, c, 9);
  const inner: Rect = { x: b.x + t, z: b.z + t, w: b.w - 2 * t, d: b.d - 2 * t };
  g.rect(inner.x, inner.z, inner.w, inner.d, 0.2, 0x7fae66); // 中庭
  const cx = inner.x + inner.w / 2;
  const cz = inner.z + inner.d / 2;
  g.frustum(cx, cz, 0.35, 0.3, 0.2, 3, 0x6b4a32, 0x6b4a32, 6);
  g.ball(cx, 4.6, cz, 2.4, 0x3f8a3a);
  const wings: Rect[] = [
    { x: b.x, z: b.z, w: b.w, d: t },
    { x: b.x, z: b.z + t, w: t, d: b.d - 2 * t },
    { x: b.x + b.w - t, z: b.z + t, w: t, d: b.d - 2 * t },
    { x: b.x, z: b.z + b.d - t, w: b.w, d: t },
  ];
  for (const w of wings) g.box(w.x, w.z, w.w, w.d, 0, d, wall, 0xa9a79f);
  addWindows(p, c, 0x7a8fa0, lights, 0xffc766);
  balconies(g, b, 0, d, pick(BALCONIES, c, 8));
  door(g, b, b.x + b.w / 2, 0x3a3f45);
  rooftopUnits(g, c, 1, d, wings[3]!);
}

function addStepped(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const up = steppedUpper(c);
  const u: Rect = { x: up.rect.x, z: up.rect.y, w: up.rect.w, d: up.rect.h };
  const wall = pick(FLAT_WALLS, c, 3);
  g.box(b.x, b.z, b.w, b.d, 0, up.z0, wall, 0xa49d8f);
  for (let i = 0; i < 4; i++) g.ball(b.x + 1.5 + hash2(SEED + 120 + i, c.x, c.y) * (b.w - 3), up.z0 + 0.6, b.z + b.d - 1.6, 0.9, 0x4f8a45, 0.8); // プランター
  g.box(u.x, u.z, u.w, u.d, up.z0, d, shade(wall, 1.06), 0xb9b3a6);
  addWindows(p, c, 0x6c8296, lights, 0xffc766);
  balconies(g, b, 0, up.z0, pick(BALCONIES, c, 8));
  door(g, b, b.x + b.w * 0.5, 0x4a4f55);
  flatRoof(g, c, u, d, 1);
}

function addTerrace(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const rowAlongX = b.w >= b.d;
  const len = rowAlongX ? b.w : b.d;
  const n = Math.max(2, Math.min(5, Math.round(len / 7)));
  for (let i = 0; i < n; i++) {
    const u: Rect = rowAlongX ? { x: b.x + (b.w * i) / n, z: b.z, w: b.w / n, d: b.d } : { x: b.x, z: b.z + (b.d * i) / n, w: b.w, d: b.d / n };
    const wall = PASTELS[Math.floor(hash2(SEED + 130 + i, c.x, c.y) * PASTELS.length)]!;
    const roof = HOUSE_ROOFS[Math.floor(hash2(SEED + 140 + i, c.x, c.y) * HOUSE_ROOFS.length)]!;
    gableHouse(g, u, d, wall, roof, !rowAlongX);
    door(g, u, u.x + u.w * 0.3);
  }
  addWindows(p, c, 0x6f8fa6, lights, 0xffc766);
}

function addPoint(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(FLAT_WALLS, c, 3);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0xb9b3a6);
  addWindows(p, c, 0x5f7a92, lights, 0xffc766);
  balconies(g, b, 0, d, pick(BALCONIES, c, 8), 4.2);
  g.box(b.x + b.w * 0.5 - 1.1, b.z + b.d, 2.2, 0.5, 0, d + 0.5, shade(wall, 0.82), shade(wall, 0.82));
  door(g, b, b.x + b.w * 0.5, 0x3a3f45);
  g.box(b.x + b.w * 0.28, b.z + b.d * 0.28, b.w * 0.44, b.d * 0.44, d, d + 2.6, shade(wall, 0.85), 0xb9b3a6);
  g.box(b.x + b.w / 2 - 0.2, b.z + b.d / 2 - 0.2, 0.4, 0.4, d + 2.6, d + 6, 0x555b61, 0x555b61);
}

function addFlats(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  switch (flatsStyle(c)) {
    case "court": return addCourt(p, c, lights);
    case "stepped": return addStepped(p, c, lights);
    case "terrace": return addTerrace(p, c, lights);
    case "point": return addPoint(p, c, lights);
    default: return addSlab(p, c, lights);
  }
}

/** 近未来的なモダンな塔の色: 深い紺のガラス、銀の鏡面、白い陶板。 */
const MODERN_BODY = [0x2d3f55, 0x3f5d78, 0xdfe7ef, 0x1d2836];
/** 光る帯・光る輪の色 (夜は明るく光る)。 */
const MODERN_GLOW = 0x7fe9ff;

/** モダンな塔にするか。超高密度は必ずモダン、ほかの高層住宅は半分ほど。 */
function modernOf(c: ZoneCell): boolean {
  return c.density === 4 || hash2(SEED + 90, c.x, c.y) < 0.5;
}

/**
 * 近未来的なモダンな塔: 縦のルーバーが壁を囲み、3 階ごとに光る帯が回り、屋上に光の輪。
 * 屋上の緑 (空中庭園) がある塔もある。
 */
function addModernTower(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const body = pick(MODERN_BODY, c, 91);
  g.box(b.x, b.z, b.w, b.d, 0, d, shade(body, 0.6), shade(body, 0.95));
  addWindows(p, c, 0x9fd6ff, lights, 0xcdf6ff);
  // 縦のルーバー: 4 面の壁から少し出た細い板 (銀色)
  const fin = shade(body, 1.6);
  const FIN = 2.4;
  const runX = Math.max(2, Math.round(b.w / FIN));
  const runZ = Math.max(2, Math.round(b.d / FIN));
  for (let i = 0; i < runX; i++) {
    const fx = b.x + ((i + 0.5) * b.w) / runX - 0.25;
    g.box(fx, b.z + b.d, 0.5, 0.5, 0, d, fin, fin);
    g.box(fx, b.z - 0.5, 0.5, 0.5, 0, d, fin, fin);
  }
  for (let i = 0; i < runZ; i++) {
    const fz = b.z + ((i + 0.5) * b.d) / runZ - 0.25;
    g.box(b.x + b.w, fz, 0.5, 0.5, 0, d, fin, fin);
    g.box(b.x - 0.5, fz, 0.5, 0.5, 0, d, fin, fin);
  }
  // 光る帯: 3 階ごとに、壁の外側を回る細い帯 (昼は白く、夜は光る)
  for (let y = 3 * 3.4; y < d - 1; y += 3 * 3.4) {
    const h = 0.6;
    for (const [x, z, w, dd] of [[b.x - 0.6, b.z - 0.6, b.w + 1.2, 0.6], [b.x - 0.6, b.z + b.d, b.w + 1.2, 0.6], [b.x - 0.6, b.z - 0.6, 0.6, b.d + 1.2], [b.x + b.w, b.z - 0.6, 0.6, b.d + 1.2]] as const) {
      g.box(x, z, w, dd, y, y + h, 0xe6fbff, 0xe6fbff);
      p.lit.box(x, z, w, dd, y, y + h, MODERN_GLOW, MODERN_GLOW);
    }
  }
  // 屋上: ガラスの箱と、その縁を回る光の輪
  const pent: Rect = { x: b.x + b.w * 0.2, z: b.z + b.d * 0.2, w: b.w * 0.6, d: b.d * 0.6 };
  g.box(pent.x, pent.z, pent.w, pent.d, d, d + 2.5, shade(body, 0.7), shade(body, 1));
  const ring = 10;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const rx = pent.x + pent.w / 2 + Math.cos(a) * (pent.w / 2 + 0.6);
    const rz = pent.z + pent.d / 2 + Math.sin(a) * (pent.d / 2 + 0.6);
    g.box(rx - 0.4, rz - 0.4, 0.8, 0.8, d + 2.5, d + 3.3, MODERN_GLOW, MODERN_GLOW);
  }
  if (hash2(SEED + 92, c.x, c.y) < 0.33) {
    // 空中庭園: 屋上に緑の芝と木
    g.rect(b.x + 1, b.z + 1, b.w - 2, b.d - 2, d + 0.05, 0x6aa35a);
    g.ball(b.x + b.w * 0.3, d + 1.6, b.z + b.d * 0.3, 1.1, 0x4f8a45, 0.7);
    g.ball(b.x + b.w * 0.7, d + 1.6, b.z + b.d * 0.65, 1.0, 0x8cc27a, 0.7);
  }
  g.ball(pent.x + pent.w / 2, d + 4.5, pent.z + pent.d / 2, 0.7, 0xe05a4f); // 航空障害灯
}

function addGlassTower(p: ShapeParts, c: ZoneCell, lights: boolean, accent?: number, helipad = false): void {
  if (accent === undefined && !helipad && modernOf(c)) {
    addModernTower(p, c, lights);
    return;
  }
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const tone = pick(GLASS_TONES, c, 4);
  g.box(b.x, b.z, b.w, b.d, 0, d, shade(tone, 0.55), shade(tone, 0.9));
  addWindows(p, c, tone, lights, c.zone === ZoneType.Residential ? 0xffc766 : 0xcfe8ff);
  if (accent !== undefined) {
    // 看板の帯 (屋上の近く、南の壁)
    g.box(b.x, b.z + b.d, b.w, 0.4, d * 0.8, d * 0.9, accent, accent);
  }
  const pent: Rect = { x: b.x + b.w * 0.25, z: b.z + b.d * 0.25, w: b.w * 0.5, d: b.d * 0.5 };
  g.box(pent.x, pent.z, pent.w, pent.d, d, d + 3, shade(tone, 0.5), shade(tone, 0.8));
  if (helipad) {
    g.disc(b.x + b.w / 2, b.z + b.d / 2, Math.min(b.w, b.d) * 0.2, d + 3.06, 0xf5f5f0, 14);
    g.disc(b.x + b.w / 2, b.z + b.d / 2, Math.min(b.w, b.d) * 0.16, d + 3.08, 0x3a4a5a, 14);
  } else {
    g.box(pent.x + pent.w / 2 - 0.25, pent.z + pent.d / 2 - 0.25, 0.5, 0.5, d + 3, d + 8 + c.w, 0x555b61, 0x555b61);
  }
  g.ball(pent.x + pent.w / 2, d + 8.4 + c.w, pent.z + pent.d / 2, 0.7, 0xe05a4f); // 航空障害灯
}

function addShop(p: ShapeParts, c: ZoneCell, lights: boolean, big: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(SHOP_WALLS, c, 5);
  const accent = pick(SHOP_ACCENTS, c, 6);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0xe9ebed);
  // 店先のガラス
  const z = b.z + b.d + 0.06;
  p.glass.poly([{ x: b.x + 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: d * 0.55, z }, { x: b.x + 0.8, y: d * 0.55, z }], 0x4f7fa8);
  if (lights) p.lit.poly([{ x: b.x + 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: d * 0.55, z: z + 0.02 }, { x: b.x + 0.8, y: d * 0.55, z: z + 0.02 }], 0xffe9b0);
  // 庇 (手前に張り出す)
  const az = d * 0.62;
  g.poly([{ x: b.x, y: az, z: b.z + b.d }, { x: b.x + b.w, y: az, z: b.z + b.d }, { x: b.x + b.w, y: az - 1.2, z: b.z + b.d + 1.7 }, { x: b.x, y: az - 1.2, z: b.z + b.d + 1.7 }], accent);
  // 屋上: 天窓と設備
  g.rect(b.x + 1.6, b.z + 1.6, Math.max(2, b.w * 0.34), Math.max(2, b.d * 0.28), d + 0.05, 0x7fb4d6);
  rooftopUnits(g, c, big ? 3 + c.w * c.h : 2, d, b);
  if (big) g.box(b.x + 1, b.z + b.d - 0.8, b.w - 2, 0.5, d + 1, d + 3.2, accent, accent); // 屋上の看板
  addWindows(p, c, 0x6f8fa6, lights, 0xfff0c0);
}

function addOffice(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  g.box(b.x, b.z, b.w, b.d, 0, d, 0xc7ccd4, 0xe3e6eb);
  addWindows(p, c, 0x4f86b8, lights, 0xcfe8ff);
  rooftopUnits(g, c, 1 + c.w * c.h, d, b);
}

function addFactory(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const tone = pick(FACTORY_WALLS, c, 7);
  g.box(b.x, b.z, b.w, b.d, 0, d, tone, shade(tone, 1.08));
  // 搬入口 (南の壁)
  const gx = b.x + b.w * 0.2;
  const gw = Math.min(5, b.w * 0.3);
  const z = b.z + b.d + 0.06;
  g.poly([{ x: gx, y: 0, z }, { x: gx + gw, y: 0, z }, { x: gx + gw, y: d * 0.7, z }, { x: gx, y: d * 0.7, z }], shade(tone, 0.4));
  // のこぎり屋根: 北向きの採光窓が並ぶ
  const teeth = Math.max(2, Math.round(b.d / 3.2));
  for (let i = 0; i < teeth; i++) {
    const zs = b.z + b.d - (b.d * i) / teeth; // 南の縁 (低い)
    const zn = b.z + b.d - (b.d * (i + 1)) / teeth; // 北の縁 (高い)
    g.poly([{ x: b.x, y: d, z: zs }, { x: b.x + b.w, y: d, z: zs }, { x: b.x + b.w, y: d + 1.7, z: zn }, { x: b.x, y: d + 1.7, z: zn }], shade(tone, i % 2 ? 1.18 : 1.02));
    const gl = [{ x: b.x, y: d, z: zn }, { x: b.x + b.w, y: d, z: zn }, { x: b.x + b.w, y: d + 1.7, z: zn }, { x: b.x, y: d + 1.7, z: zn }];
    p.glass.poly(gl, 0x5f86a8);
    p.glass.poly([...gl].reverse(), 0x5f86a8);
  }
  if (c.building >= 3) {
    for (let i = 0; i < Math.min(3, Math.max(1, c.w)); i++) {
      const cx = b.x + 3 + i * 5;
      const cz = b.z + b.d + 2.2;
      g.frustum(cx, cz, 1.9, 1.9, 0, 4.2, 0xd8dadc, 0xeceef0, 10);
    }
  }
  if (c.building >= 2) {
    const ch = factoryChimney(c);
    g.frustum(ch.x, ch.z, ch.r, ch.r * 0.8, ch.y0, ch.y1, 0x8d7f78, 0x2f2a28, 8);
    g.frustum(ch.x, ch.z, ch.r * 0.83, ch.r * 0.8, ch.y1 - 1.6, ch.y1 - 0.9, 0xc9453a, 0xc9453a, 8);
  }
  addWindows(p, c, 0x5f7a8a, lights, 0xffe49a);
}

/** いろいろな建物の色: 洋館のレンガと濃い屋根、アパートのパステル、コンビニの緑、スーパーの白、食品工場の白と銀、研究所の灰、官公庁の白い石、IT ビルのティール。 */
const VICTORIAN_WALLS = [0x9c5a48, 0x8a5040, 0xb07a62];
const VICTORIAN_ROOF = [0x3d3a48, 0x2f3b3a];
const CONBINI_GREEN = 0x2f9b5b;
const FOOD_WALLS = [0xf4f2ec, 0xe8e6e0];
const LAB_WALLS = [0x8f98a3, 0xa3acb5];
const GOV_STONE = [0xeeeae0, 0xe0dccd];
const IT_TEAL = [0x2f8f8f, 0x3aa39c, 0x267a80];

/** 洋館: 急な屋根の家に、張り出し窓 (ベイウィンドウ) と白い縁取り。 */
function addVictorian(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(VICTORIAN_WALLS, c, 110);
  const roof = pick(VICTORIAN_ROOF, c, 111);
  gableHouse(g, b, d, wall, roof, b.w >= b.d);
  // 張り出し窓 (南の壁から少し出た箱)
  g.box(b.x + b.w * 0.3, b.z + b.d, b.w * 0.4, 1.4, 0.8, d * 0.75, shade(wall, 1.1), shade(wall, 1.1));
  addWindows(p, c, 0x5f7a8a, lights, 0xffe49a);
  door(g, b, b.x + b.w * 0.75, 0x3a2a1e);
}

/** アパート: 2〜3 階の低いアパート。パステルの壁、外付けの階段、ベランダの手すり。 */
function addApartment(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(PASTELS, c, 112);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0x8d8a84);
  addWindows(p, c, 0x6c8296, lights, 0xffc766);
  // 外付けの階段 (東の壁の外)
  const floors = Math.max(2, Math.round(d / 4.6));
  for (let f = 0; f < floors; f++) {
    const y = (d * f) / floors;
    g.box(b.x + b.w, b.z + b.d * 0.2, 1.6, b.d * 0.5, y, y + 0.4, 0x9a9690, 0x9a9690);
  }
  // ベランダの手すり (南)
  balconies(g, b, 0, d, pick(BALCONIES, c, 113));
  door(g, b, b.x + b.w * 0.5, 0x4a4f55);
}

/** コンビニ: 1 階建ての小さな店。緑の看板帯、大きなガラスの店先、屋根の上の看板。 */
function addConbini(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  g.box(b.x, b.z, b.w, b.d, 0, d, 0xf2f2ee, 0xd9dce0);
  const z = b.z + b.d + 0.06;
  // 緑の看板帯 (店先の上)
  g.box(b.x, b.z + b.d, b.w, 0.6, d * 0.72, d * 0.95, CONBINI_GREEN, CONBINI_GREEN);
  // 店先のガラス (大きく)
  p.glass.poly([{ x: b.x + 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: d * 0.68, z }, { x: b.x + 0.8, y: d * 0.68, z }], 0x7fb8d8);
  if (lights) p.lit.poly([{ x: b.x + 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: d * 0.68, z: z + 0.02 }, { x: b.x + 0.8, y: d * 0.68, z: z + 0.02 }], 0xffffff);
  // 屋根の上の看板
  g.box(b.x + b.w * 0.2, b.z + b.d * 0.4, b.w * 0.6, 0.6, d, d + 1.8, CONBINI_GREEN, CONBINI_GREEN);
}

/** スーパー: 大きな白い箱。屋根に天窓、緑の帯、正面は大きなガラス。 */
function addSuper(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  g.box(b.x, b.z, b.w, b.d, 0, d, 0xf1efe9, 0xd5d8dc);
  const z = b.z + b.d + 0.06;
  p.glass.poly([{ x: b.x + 1.5, y: 0.6, z }, { x: b.x + b.w - 1.5, y: 0.6, z }, { x: b.x + b.w - 1.5, y: d * 0.6, z }, { x: b.x + 1.5, y: d * 0.6, z }], 0x6f9fc0);
  if (lights) p.lit.poly([{ x: b.x + 1.5, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 1.5, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 1.5, y: d * 0.6, z: z + 0.02 }, { x: b.x + 1.5, y: d * 0.6, z: z + 0.02 }], 0xfff4d6);
  g.box(b.x, b.z + b.d, b.w, 0.6, d * 0.7, d * 0.82, CONBINI_GREEN, CONBINI_GREEN);
  // 屋根の天窓の列
  for (let i = 0; i < 3; i++) g.rect(b.x + 1.5 + i * ((b.w - 3) / 3), b.z + 1.5, (b.w - 3) / 3 - 1, b.d - 3, d + 0.05, 0x9ccbe6);
}

/** 食品工場: 白い箱、銀色のサイロ (2 基)、配管。 */
function addFoodPlant(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(FOOD_WALLS, c, 114);
  g.box(b.x, b.z, b.w * 0.7, b.d, 0, d, wall, 0xb8bcc2);
  // サイロ
  const r = Math.min(b.w, b.d) * 0.14;
  g.frustum(b.x + b.w * 0.82, b.z + b.d * 0.3, r, r, 0, d + 9, 0xc9ced4, 0xdde2e8);
  g.frustum(b.x + b.w * 0.82, b.z + b.d * 0.7, r, r, 0, d + 7, 0xc9ced4, 0xdde2e8);
  // 配管 (サイロと本体をつなぐ)
  g.box(b.x + b.w * 0.7, b.z + b.d * 0.5, b.w * 0.12, 0.6, d * 0.6, d * 0.7, 0x7d8790, 0x7d8790);
  // 屋根の換気口
  g.box(b.x + 1, b.z + 1, 1.2, 1.2, d, d + 1.8, 0x8f9aa6, 0x8f9aa6);
  addWindows(p, c, 0x8fa6b8, lights, 0xffe49a);
}

/** 研究所: 灰色の低い箱に、横長のガラスの帯。屋上にパラボラアンテナ。 */
function addLab(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(LAB_WALLS, c, 115);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0x6f7780);
  const z = b.z + b.d + 0.06;
  for (let f = 1; f <= 2; f++) {
    const y0 = (d * f) / 3 + 0.4;
    p.glass.poly([{ x: b.x + 0.6, y: y0, z }, { x: b.x + b.w - 0.6, y: y0, z }, { x: b.x + b.w - 0.6, y: y0 + d / 4, z }, { x: b.x + 0.6, y: y0 + d / 4, z }], 0x5f9ab8);
    if (lights && f === 2) p.lit.poly([{ x: b.x + 0.6, y: y0, z: z + 0.02 }, { x: b.x + b.w - 0.6, y: y0, z: z + 0.02 }, { x: b.x + b.w - 0.6, y: y0 + d / 4, z: z + 0.02 }, { x: b.x + 0.6, y: y0 + d / 4, z: z + 0.02 }], 0xcff3ff);
  }
  // パラボラアンテナ (屋上)
  g.box(b.x + b.w * 0.7, b.z + b.d * 0.5, 0.4, 0.4, d, d + 4, 0x555b61, 0x555b61);
  g.disc(b.x + b.w * 0.7, b.z + b.d * 0.5, 1.8, d + 4, 0xe6e8ea, 12);
}

/** 官公庁: 白い石の建物。正面に柱 (列柱) と三角の破風、屋上に旗竿。 */
function addGov(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const stone = pick(GOV_STONE, c, 116);
  g.box(b.x, b.z, b.w, b.d, 0, d, stone, 0xc9c4b6);
  addWindows(p, c, 0x44566a, lights, 0xffd98a);
  // 列柱 (南の壁の前)
  const n = Math.max(3, Math.round(b.w / 2.4));
  for (let i = 0; i <= n; i++) g.box(b.x + (i * b.w) / n - 0.4, b.z + b.d, 0.8, 1.2, 0, d * 0.82, shade(stone, 1.05), shade(stone, 1.05));
  // 破風 (三角の屋根飾り)
  g.poly([{ x: b.x + b.w * 0.3, y: d * 0.82, z: b.z + b.d + 0.4 }, { x: b.x + b.w * 0.7, y: d * 0.82, z: b.z + b.d + 0.4 }, { x: b.x + b.w * 0.5, y: d + 3, z: b.z + b.d + 0.4 }], shade(stone, 1.1));
  // 旗竿と旗
  g.box(b.x + b.w * 0.5, b.z + b.d * 0.5, 0.3, 0.3, d, d + 9, 0x6b6f75, 0x6b6f75);
  g.box(b.x + b.w * 0.5 + 0.3, b.z + b.d * 0.5, 3.2, 0.1, d + 6.5, d + 8.5, 0xc23b3b, 0xc23b3b);
}

/** IT ビル: 低い箱をティールのガラスで包み、階ごとの帯と、屋上の緑。 */
function addITBuilding(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const tone = pick(IT_TEAL, c, 117);
  g.box(b.x, b.z, b.w, b.d, 0, d, shade(tone, 0.6), shade(tone, 0.9));
  // 階ごとの横の帯 (明るいガラス)
  for (let y = 3.4; y < d - 1; y += 3.4 * 2) g.box(b.x - 0.3, b.z - 0.3, b.w + 0.6, b.d + 0.6, y, y + 0.5, 0xd8f3f0, 0xd8f3f0);
  addWindows(p, c, 0x9fd9d6, lights, 0xcdf6ff);
  // 屋上の緑
  g.rect(b.x + 1, b.z + 1, b.w - 2, b.d - 2, d + 0.05, 0x6aa35a);
  g.ball(b.x + b.w * 0.4, d + 1.4, b.z + b.d * 0.4, 1.0, 0x4f8a45, 0.7);
}

/** 追加の種類を、区画の一部に出す (同じ場所なら同じ種類になる)。 */
const pickOf = (c: ZoneCell, salt: number, share: number) => hash2(SEED + salt, c.x, c.y) < share;
const victorianOf = (c: ZoneCell) => pickOf(c, 120, 0.3);
const apartmentOf = (c: ZoneCell) => pickOf(c, 121, 0.35);
const conbiniOf = (c: ZoneCell) => pickOf(c, 122, 0.4);
const superOf = (c: ZoneCell) => pickOf(c, 123, 0.5);
const foodOf = (c: ZoneCell) => pickOf(c, 124, 0.5);
const labOf = (c: ZoneCell) => pickOf(c, 125, 0.5);
const govOf = (c: ZoneCell) => pickOf(c, 126, 0.4);
const itOf = (c: ZoneCell) => pickOf(c, 127, 0.5);

/** 団地の板状マンションにするか (板状の集合住宅の一部)。 */
function danchiOf(c: ZoneCell): boolean {
  return flatsStyle(c) === "slab" && hash2(SEED + 100, c.x, c.y) < 0.4;
}
/** 古いオフィスビルにするか (小さいオフィスの一部)。 */
function oldOfficeOf(c: ZoneCell): boolean {
  return hash2(SEED + 106, c.x, c.y) < 0.5;
}
/** 倉庫にするか (小さい工場の一部)。 */
function warehouseOf(c: ZoneCell): boolean {
  return hash2(SEED + 107, c.x, c.y) < 0.5;
}

/** 現実的な建物の色: 団地のレンガ、古いビルの石、倉庫の波板、雑居ビルのクリーム色。 */
const DANCHI_BRICKS = [0xb5654a, 0xa85a44, 0xc27b5b];
const OLD_STONE = [0xb9ab97, 0xa39a8a, 0xc4b9a3];
const WAREHOUSE_WALLS = [0x9aa39c, 0xa9b1b8, 0x8f9a92];
const MIXED_WALLS = [0xefe6d4, 0xe6dccb, 0xf3ece0];

/** 団地の板状マンション: レンガの壁、白いベランダの縞、屋上の階段室と受水槽。 */
function addDanchi(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const brick = pick(DANCHI_BRICKS, c, 101);
  g.box(b.x, b.z, b.w, b.d, 0, d, brick, 0x8a8f94);
  addWindows(p, c, 0x6c8296, lights, 0xffc766);
  // 白いベランダの縞 (階ごと)
  balconies(g, b, 0, d, 0xf2f0ea);
  // 屋上の階段室と受水槽
  g.box(b.x + b.w * 0.15, b.z + b.d * 0.4, 2.4, 2.4, d, d + 3.2, 0xd8d4cc, 0xe6e2da);
  g.box(b.x + b.w * 0.7, b.z + b.d * 0.5, 2, 2, d, d + 2.2, 0x8f9ba6, 0xa9b4bf);
  door(g, b, b.x + b.w * 0.45, 0x4a4f55);
}

/** 古いオフィスビル: 石の壁、柱形 (ピラスター)、上の軒蛇腹、屋上の煙突。 */
function addOldOffice(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const stone = pick(OLD_STONE, c, 102);
  g.box(b.x, b.z, b.w, b.d, 0, d, stone, 0x7d766b);
  addWindows(p, c, 0x3f5566, lights, 0xffd98a);
  // 柱形: 正面の壁から少し出た縦の帯
  const n = Math.max(2, Math.round(b.w / 4));
  for (let i = 0; i <= n; i++) {
    const x = b.x + (i * b.w) / n - 0.4;
    g.box(x, b.z + b.d, 0.8, 0.6, 0, d, shade(stone, 1.08), shade(stone, 1.08));
  }
  // 軒蛇腹: 屋上の縁を回る明るい帯
  g.box(b.x - 0.5, b.z - 0.5, b.w + 1, b.d + 1, d - 0.8, d + 0.8, shade(stone, 1.2), shade(stone, 1.2));
  // 煙突 (2 本)
  g.box(b.x + b.w * 0.25, b.z + b.d * 0.3, 1.6, 1.6, d + 0.8, d + 5, 0x7a5a48, 0x7a5a48);
  g.box(b.x + b.w * 0.7, b.z + b.d * 0.6, 1.6, 1.6, d + 0.8, d + 4, 0x7a5a48, 0x7a5a48);
  door(g, b, b.x + b.w * 0.5, 0x3a3f45);
}

/** 雑居ビル: 1 階は店 (ガラスの店先と庇)、2 階より上は窓の並ぶ住まい・事務所。屋上に看板。 */
function addMixed(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(MIXED_WALLS, c, 103);
  const accent = pick(SHOP_ACCENTS, c, 104);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0xd9d4ca);
  // 1 階の店先のガラスと庇
  const z = b.z + b.d + 0.06;
  p.glass.poly([{ x: b.x + 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: 0.6, z }, { x: b.x + b.w - 0.8, y: 3.8, z }, { x: b.x + 0.8, y: 3.8, z }], 0x4f7fa8);
  if (lights) p.lit.poly([{ x: b.x + 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: 0.6, z: z + 0.02 }, { x: b.x + b.w - 0.8, y: 3.8, z: z + 0.02 }, { x: b.x + 0.8, y: 3.8, z: z + 0.02 }], 0xffe9b0);
  g.poly([{ x: b.x, y: 4.2, z: b.z + b.d }, { x: b.x + b.w, y: 4.2, z: b.z + b.d }, { x: b.x + b.w, y: 3.0, z: b.z + b.d + 1.6 }, { x: b.x, y: 3.0, z: b.z + b.d + 1.6 }], accent);
  // 2 階より上: 窓の並び (南の壁)
  for (let f = 1; f <= 2; f++) {
    const y0 = 4.6 * f + 1;
    const cols = Math.max(2, Math.floor(b.w / 2.6));
    for (let i = 0; i < cols; i++) {
      const x0 = b.x + 0.9 + (i * (b.w - 1.8)) / cols;
      const x1 = x0 + ((b.w - 1.8) / cols) * 0.6;
      p.glass.poly([{ x: x0, y: y0, z }, { x: x1, y: y0, z }, { x: x1, y: y0 + 2.2, z }, { x: x0, y: y0 + 2.2, z }], 0x6f8fa6);
      if (lights && (i + f) % 3 === 0) p.lit.poly([{ x: x0, y: y0, z: z + 0.02 }, { x: x1, y: y0, z: z + 0.02 }, { x: x1, y: y0 + 2.2, z: z + 0.02 }, { x: x0, y: y0 + 2.2, z: z + 0.02 }], 0xfff0c0);
    }
  }
  // 屋上: 看板と設備
  g.box(b.x + 1, b.z + b.d - 0.8, b.w - 2, 0.5, d + 0.6, d + 2.6, accent, accent);
  rooftopUnits(g, c, 1, d, b);
}

/** 倉庫: 低く平らな屋根の大きな箱。南の壁に、トラックが入るシャッター (横の縞)。 */
function addWarehouse(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const g = p.solid;
  const b = rectOf(c);
  const d = wallHeight(c);
  const wall = pick(WAREHOUSE_WALLS, c, 105);
  g.box(b.x, b.z, b.w, b.d, 0, d, wall, 0x6f7780);
  // 波板の縞 (東西の壁)
  for (let i = 1; i < 5; i++) {
    const y = (d * i) / 5;
    g.box(b.x + b.w, b.z, 0.2, b.d, y, y + 0.4, shade(wall, 0.9), shade(wall, 0.9));
  }
  // シャッター: 南の壁に、トラックが入る口 (濃い縞)
  const gx = b.x + b.w * 0.25;
  const gw = Math.min(6, b.w * 0.4);
  const z = b.z + b.d + 0.06;
  g.poly([{ x: gx, y: 0, z }, { x: gx + gw, y: 0, z }, { x: gx + gw, y: d * 0.72, z }, { x: gx, y: d * 0.72, z }], 0x5b6168);
  for (let i = 1; i < 6; i++) {
    const y = (d * 0.72 * i) / 6;
    g.poly([{ x: gx, y, z: z + 0.02 }, { x: gx + gw, y, z: z + 0.02 }, { x: gx + gw, y: y + 0.25, z: z + 0.02 }, { x: gx, y: y + 0.25, z: z + 0.02 }], 0x3a3f45);
  }
  if (lights) p.lit.poly([{ x: b.x + 0.8, y: d * 0.8, z }, { x: b.x + 2.2, y: d * 0.8, z }, { x: b.x + 2.2, y: d * 0.8 + 0.8, z }, { x: b.x + 0.8, y: d * 0.8 + 0.8, z }], 0xffe9b0);
  // 屋上: 換気口と、小さな設備
  rooftopUnits(g, c, 2, d, b, 0x9aa0a6);
}

/** 面を、中心 (cx, cy, cz) の外へ向けて描く (面の向きが裏返らないように)。 */
function outFace(g: Sink, pts: V3[], color: number, cx: number, cy: number, cz: number): void {
  const [a, b, c] = pts as [V3, V3, V3];
  const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
  const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const mx = pts.reduce((t, q) => t + q.x, 0) / pts.length - cx;
  const my = pts.reduce((t, q) => t + q.y, 0) / pts.length - cy;
  const mz = pts.reduce((t, q) => t + q.z, 0) / pts.length - cz;
  g.poly(nx * mx + ny * my + nz * mz < 0 ? [...pts].reverse() : pts, color);
}

/** 寄棟の屋根 (4 方向に下がる屋根が、中央の棟で合う)。底は d、棟は d + r。 */
function hipRoof(g: Sink, b: Rect, d: number, roof: number): void {
  const r = Math.min(b.w, b.d) * 0.36;
  const x0 = b.x - 0.6;
  const x1 = b.x + b.w + 0.6;
  const z0 = b.z - 0.6;
  const z1 = b.z + b.d + 0.6;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const cy = d + r;
  const ridgeHalf = Math.max(0.5, Math.min(b.w, b.d) * 0.2);
  const cxa = cx - ridgeHalf;
  const cxb = cx + ridgeHalf;
  const southOut = [{ x: x0, y: d, z: z1 }, { x: x1, y: d, z: z1 }, { x: cxb, y: cy, z: cz }, { x: cxa, y: cy, z: cz }];
  const northOut = [{ x: x1, y: d, z: z0 }, { x: x0, y: d, z: z0 }, { x: cxa, y: cy, z: cz }, { x: cxb, y: cy, z: cz }];
  const eastOut = [{ x: x1, y: d, z: z0 }, { x: x1, y: d, z: z1 }, { x: cxb, y: cy, z: cz }];
  const westOut = [{ x: x0, y: d, z: z1 }, { x: x0, y: d, z: z0 }, { x: cxa, y: cy, z: cz }];
  for (const f of [southOut, northOut, eastOut, westOut]) outFace(g, f, roof, cx, d, cz);
  g.box(cxa, cz - 0.1, cxb - cxa, 0.2, cy, cy + 0.2, shade(roof, 0.8), shade(roof, 0.8));
}

/** 壁の模様: 縦の縞、または横の目地 (壁の南の面に、薄い線を重ねる)。 */
function facadePattern(g: Sink, b: Rect, d: number, kind: number): void {
  const z = b.z + b.d + 0.05;
  if (kind === 1) {
    const n = Math.max(3, Math.floor(b.w / 2));
    for (let i = 0; i < n; i++) {
      const xa = b.x + ((i + 0.3) * b.w) / n;
      const xb = b.x + ((i + 0.6) * b.w) / n;
      g.poly([{ x: xa, y: 0.5, z }, { x: xb, y: 0.5, z }, { x: xb, y: d - 0.5, z }, { x: xa, y: d - 0.5, z }], 0xffffff);
    }
  } else {
    for (let y = 2.3; y < d - 1; y += 2.3) g.box(b.x + 0.2, z, b.w - 0.4, 0.15, y, y + 0.12, 0xd9d4c9, 0xd9d4c9);
  }
}

/** 丸窓: 壁の南の面に、円のガラスを並べる。 */
function roundWindows(p: ShapeParts, b: Rect, d: number, lights: boolean): void {
  const r = Math.min(1.2, b.w / 6);
  const n = Math.max(1, Math.floor(b.w / 4));
  const z = b.z + b.d + 0.08;
  for (let i = 0; i < n; i++) {
    const cx = b.x + ((i + 0.5) * b.w) / n;
    const cy = d * 0.7;
    const pts: V3[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
    }
    p.glass.poly(pts, 0x8fb6d0);
    if (lights && i % 2 === 0) p.lit.poly(pts.map((q) => ({ ...q, z: q.z + 0.02 })), 0xfff0c0);
  }
}

/** 屋上の飾り: 小さな塔 (ドーム付き)、屋上の看板、屋上の庭。 */
function roofOrnament(g: Sink, b: Rect, d: number, kind: number): void {
  if (kind === 1) {
    const cx = b.x + b.w * 0.5;
    const cz = b.z + b.d * 0.5;
    g.box(cx - 1.2, cz - 1.2, 2.4, 2.4, d, d + 4, 0xe6e2da, 0xe6e2da);
    g.ball(cx, d + 4.8, cz, 1.6, 0x3f7fa8, 0.8);
  } else if (kind === 2) {
    g.box(b.x + 1, b.z + b.d - 0.8, b.w - 2, 0.5, d + 0.6, d + 2.4, 0xd9483b, 0xd9483b);
  } else {
    g.rect(b.x + 1, b.z + 1, b.w - 2, b.d - 2, d + 0.05, 0x6aa35a);
    g.ball(b.x + b.w * 0.35, d + 1.2, b.z + b.d * 0.4, 0.9, 0x4f8a45, 0.7);
  }
}

/** 建物ごとの個性を重ねる: 壁の模様・丸窓・屋上の飾り。同じ場所なら、いつも同じ。 */
function addTouches(p: ShapeParts, c: ZoneCell, lights: boolean): void {
  const b = rectOf(c);
  const d = wallHeight(c);
  const pattern = hash2(SEED + 200, c.x, c.y);
  if (pattern < 0.25) facadePattern(p.solid, b, d, 1);
  else if (pattern < 0.4) facadePattern(p.solid, b, d, 2);
  if (hash2(SEED + 201, c.x, c.y) < 0.18) roundWindows(p, b, d, lights);
  const decor = hash2(SEED + 202, c.x, c.y);
  if (decor < 0.12) roofOrnament(p.solid, b, d, 1);
  else if (decor < 0.22) roofOrnament(p.solid, b, d, 2);
  else if (decor < 0.3) roofOrnament(p.solid, b, d, 3);
}

/**
 * 建物 (アンカーのセル) の形を、parts に追加する。districtColor があれば、建物の色をその地区の色に寄せる。
 * rot は道路に沿う向き (ラジアン。敷地の中心のまわりに回す)。
 */
export function addLot(p: ShapeParts, c: ZoneCell, districtColor?: number, rot = 0): void {
  tint = districtColor;
  try {
    if (Math.abs(rot) < 1e-9) {
      addLotShape(p, c);
      return;
    }
    const b = rectOf(c);
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    addLotShape({ solid: new RotatedSink(p.solid, rot, cx, cz), glass: new RotatedSink(p.glass, rot, cx, cz), lit: new RotatedSink(p.lit, rot, cx, cz) }, c);
  } finally {
    tint = undefined;
  }
}

function addLotShape(p: ShapeParts, c: ZoneCell): void {
  const served = c.served;
  const occupied = c.zone !== ZoneType.Residential || c.residents > 0;
  const lights = served && occupied;
  switch (kindOf(c)) {
    case "house": (victorianOf(c) ? addVictorian : addHouse)(p, c, lights); break;
    case "flats": (danchiOf(c) ? addDanchi : apartmentOf(c) ? addApartment : addFlats)(p, c, lights); break;
    case "homeTower": addGlassTower(p, c, lights); break;
    case "shop": (isMixedShop(c) ? addMixed : conbiniOf(c) ? addConbini : (q: ShapeParts, cc: ZoneCell, l: boolean) => addShop(q, cc, l, false))(p, c, lights); break;
    case "mall": (superOf(c) ? addSuper : (q: ShapeParts, cc: ZoneCell, l: boolean) => addShop(q, cc, l, true))(p, c, lights); break;
    case "shopTower": addGlassTower(p, c, lights, pick(SHOP_ACCENTS, c, 6)); break;
    case "office": (c.building === 1 && oldOfficeOf(c) ? addOldOffice : c.building === 2 && govOf(c) ? addGov : c.building === 2 && itOf(c) ? addITBuilding : addOffice)(p, c, lights); break;
    case "officeTower": addGlassTower(p, c, lights, undefined, true); break;
    case "factory": (c.building === 1 && warehouseOf(c) ? addWarehouse : c.building === 2 && foodOf(c) ? addFoodPlant : c.building >= 3 && labOf(c) ? addLab : addFactory)(p, c, lights); break;
  }
  const tall = kindOf(c) === "homeTower" || kindOf(c) === "shopTower" || kindOf(c) === "officeTower" || kindOf(c) === "factory";
  if (!tall) addTouches(p, c, lights); // 高層の塔と工場は、もとの形を保つ
  if (!served) {
    // 供給のない建物: 屋根の上に赤い警告の球
    const b = rectOf(c);
    const d = wallHeight(c);
    p.solid.ball(b.x + b.w - 1.5, d + 5, b.z + 1.5, 2.4, 0xe05a4f);
    p.solid.box(b.x + b.w - 2.1, b.z + 0.9, 1.2, 1.2, d, d + 2.7, 0xffffff, 0xffffff);
  }
}

