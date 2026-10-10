/**
 * 建物の形の基準 (純粋な計算。描画ライブラリには依存しない): 見た目の種類・集合住宅の形・壁の高さ・敷地の中の底の範囲。
 * 座標は世界の px (1 タイル = 16)。3D の描画 (render3d) が、この基準で建物の形を作る。
 */
import { hash2 } from "../sim/rng";
import { ZoneType, type ZoneCell } from "../sim/zoning";

/** 1 タイルの大きさ (px)。terrain3d の TILE と同じ。 */
export const TILE = 16;
/** 建物の種類の見た目の分類。 */
export type Kind = "house" | "flats" | "homeTower" | "shop" | "mall" | "shopTower" | "office" | "officeTower" | "factory";

export function kindOf(c: ZoneCell): Kind {
  const d = c.density;
  if (c.zone === ZoneType.Residential) return d >= 3 ? "homeTower" : (d === 0 ? c.building : d === 2 ? 3 : 1) === 3 ? "flats" : "house";
  if (c.zone === ZoneType.Commercial) return d >= 3 ? "shopTower" : (d === 0 ? c.building : d === 2 ? 3 : 1) === 3 ? "mall" : "shop";
  if (c.zone === ZoneType.Office) return c.building >= 3 ? "officeTower" : "office";
  return "factory";
}

/**
 * 中密度住宅 (集合住宅) の形。建物ごとに、場所から決まる (同じ場所ならいつも同じ)。
 * slab = 板状のマンション、court = 中庭のある建物、stepped = 上が一段ひっこむテラス型、terrace = 連棟の住宅、point = 細くて高い棟。
 * 敷地が狭いと、中庭・段・連棟は選ばれにくい。
 */
export type FlatsStyle = "slab" | "court" | "stepped" | "terrace" | "point";

export function flatsStyle(c: ZoneCell): FlatsStyle {
  const area = c.w * c.h;
  const table: [FlatsStyle, number][] =
    area >= 4
      ? [["slab", 0.26], ["court", 0.2], ["stepped", 0.2], ["terrace", 0.2], ["point", 0.14]]
      : area >= 2
        ? [["slab", 0.35], ["terrace", 0.3], ["stepped", 0.2], ["point", 0.15]]
        : [["slab", 0.6], ["point", 0.4]];
  const r = hash2(0xf1a7, c.x, c.y);
  let acc = 0;
  for (const [style, p] of table) {
    acc += p;
    if (r < acc) return style;
  }
  return "slab";
}

/** 集合住宅の形ごとの、壁の高さの倍率。 */
const FLATS_HEIGHT: Record<FlatsStyle, number> = { slab: 1, court: 0.85, stepped: 1.1, terrace: 0.72, point: 1.35 };

const jitter = (c: ZoneCell, salt: number) => 0.9 + hash2(0x7a11 + salt, c.x, c.y) * 0.25;

/** 1 階の高さ (px)。窓の段は、この高さで数える (windows3d)。ガラスの高層棟だけは、もう少し低い階の高さ。 */
export const FLOOR_PX = 4.6;
export const GLASS_FLOOR_PX = 3.4;
/** 壁の上の余り (px)。窓の段が、階数どおりに数えられるように、階の高さの合計より少し高くする。 */
const FLOOR_MARGIN = 1.6;

/**
 * 住宅の階数。密度で決まる: 低密度は一軒家 (1 階建て)、中密度は 3 階建て以上、高密度は 15 階建て以上。
 * 集合住宅 (中密度) の階数は形ごとに少し変わり、高層マンション (高密度) は敷地の広さで少し高くなる。昔の区画 (密度 0) は、種類 (1〜3) で同じように決める。
 */
export function residentialFloors(c: ZoneCell): number {
  const k = kindOf(c);
  if (k === "homeTower") {
    // 超高密度は、高層マンションよりさらに高い (30 階建て以上)
    if (c.density === 4) return 30 + 2 * (Math.max(c.w, c.h) - 1) + Math.floor(hash2(0x7a14, c.x, c.y) * 6);
    return 15 + 2 * (Math.max(c.w, c.h) - 2) + Math.floor(hash2(0x7a12, c.x, c.y) * 4);
  }
  if (k === "flats") return Math.max(3, Math.round(4 * FLATS_HEIGHT[flatsStyle(c)] * (0.9 + hash2(0x7a13, c.x, c.y) * 0.25)));
  return 1;
}

/** 雑居ビル: 1 階が店で、上に住まいや事務所がある 3 階建ての小さなビル (小さい店の区画の一部)。 */
export function isMixedShop(c: ZoneCell): boolean {
  return kindOf(c) === "shop" && hash2(0x51ab, c.x, c.y) < 0.45;
}

/** 壁の高さ (px)。種類・密度・敷地の広さで決まり、建物ごとに少しばらつく。住宅は階数で決まる。 */
export function wallHeight(c: ZoneCell): number {
  const side = Math.max(c.w, c.h);
  const k = kindOf(c);
  if (isMixedShop(c)) return 3 * FLOOR_PX + FLOOR_MARGIN;
  if (c.zone === ZoneType.Residential) {
    if (k === "homeTower") return residentialFloors(c) * GLASS_FLOOR_PX + FLOOR_MARGIN;
    return residentialFloors(c) * FLOOR_PX + FLOOR_MARGIN;
  }
  const base: Record<Kind, number> = {
    house: 5,
    flats: 10,
    homeTower: 16 + 7 * (side - 2), // 住宅は上で決めるので、ここは使わない
    shop: 6,
    mall: 9,
    shopTower: 18 + 6 * (side - 2),
    office: c.building === 1 ? 8 : 15,
    officeTower: 26 + 7 * (side - 2),
    factory: [7, 9, 11][Math.min(c.building, 3) - 1] ?? 8,
  };
  // 超高密度 (住宅以外) は、高密度よりずっと高い。高さを 1.8 倍にして、超高層らしく見せる
  const super_ = c.density === 4 ? 1.8 : 1; // 住宅は上で別に決めている
  return Math.max(4, base[k] * (k === "flats" ? FLATS_HEIGHT[flatsStyle(c)] : 1) * jitter(c, 1) * super_);
}

/** 敷地の中で、建物を置く範囲 (底)。種類 (1..3) が大きいほど敷地いっぱいに建つ。 */
export function baseRect(c: ZoneCell): { x: number; y: number; w: number; h: number } {
  const tier = c.building;
  let inset = k(c) === "homeTower" || k(c) === "shopTower" || k(c) === "officeTower" ? 2.4 : [3.6, 2.8, 2][tier - 1]!;
  // 細くて高い棟は、敷地の真ん中に細く建つ
  if (k(c) === "flats" && flatsStyle(c) === "point") inset += Math.min(c.w, c.h) * TILE * 0.14;
  return { x: c.x * TILE + inset, y: c.y * TILE + inset, w: c.w * TILE - inset * 2, h: c.h * TILE - inset * 2 };
}
const k = kindOf;

/** 上が一段ひっこんだ建物 (stepped) の、上の部分の底 (下の部分の屋根の上に載る)。下の部分の高さは壁の高さの 5.5 割。 */
export function steppedUpper(c: ZoneCell): { rect: { x: number; y: number; w: number; h: number }; z0: number } {
  const b = baseRect(c);
  return { rect: { x: b.x + b.w * 0.16, y: b.y + b.h * 0.1, w: b.w * 0.66, h: b.h * 0.72 }, z0: wallHeight(c) * 0.55 };
}
