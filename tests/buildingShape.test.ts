import { describe, expect, it } from "vitest";
import { FLOOR_PX, TILE, baseRect, flatsStyle, kindOf, steppedUpper, wallHeight, type FlatsStyle } from "../src/render3d/buildingShape";
import { ZoneType, cleanEnv, type Density, type ZoneCell } from "../src/sim/zoning";

function cell(zone: ZoneType, density: Density, building: number, w = 1, h = 1, x = 3, y = 4): ZoneCell {
  return { x, y, zone, building, residents: 0, served: true, net: 1, roadCap: 100, density, w, h, env: cleanEnv(), built: 0, aging: 1 };
}
const R = ZoneType.Residential;
const C = ZoneType.Commercial;
const O = ZoneType.Office;
const I = ZoneType.Industrial;

describe("建物の種類と高さ", () => {
  it("密度と種類で見た目の分類が決まる", () => {
    expect(kindOf(cell(R, 1, 1))).toBe("house");
    expect(kindOf(cell(R, 2, 2))).toBe("flats");
    expect(kindOf(cell(R, 3, 3, 3, 3))).toBe("homeTower");
    expect(kindOf(cell(C, 1, 1))).toBe("shop");
    expect(kindOf(cell(C, 2, 2))).toBe("mall");
    expect(kindOf(cell(C, 3, 3, 3, 3))).toBe("shopTower");
    expect(kindOf(cell(O, 2, 2))).toBe("office");
    expect(kindOf(cell(O, 3, 3, 3, 3))).toBe("officeTower");
    expect(kindOf(cell(I, 2, 2))).toBe("factory");
    // 密度を決めない昔の区画は、建物の大きさ (1..3) で決まる
    expect(kindOf(cell(R, 0, 1))).toBe("house");
    expect(kindOf(cell(R, 0, 3))).toBe("flats");
  });

  it("同じ種類なら、密度が高いほど・敷地が広いほど高い", () => {
    const h = (z: ZoneType, d: Density, b: number, w = 1, hh = 1) => wallHeight(cell(z, d, b, w, hh));
    expect(h(R, 1, 1)).toBeLessThan(h(R, 2, 2, 2, 2));
    expect(h(R, 2, 2, 2, 2)).toBeLessThan(h(R, 3, 3, 3, 3));
    expect(h(R, 3, 3, 3, 3)).toBeLessThan(h(R, 3, 3, 4, 4));
    expect(h(C, 1, 1)).toBeLessThan(h(C, 3, 3, 3, 3));
    expect(h(O, 2, 2, 2, 2)).toBeLessThan(h(O, 3, 3, 3, 3));
    expect(h(O, 3, 3, 3, 3)).toBeGreaterThan(h(R, 2, 2, 2, 2)); // 超高層は、マンションより高い
  });

  it("住宅の低密度 (一軒家) は、どこでも 1 階ぶんの高さ。事務所などは場所ごとに少しばらつき、同じ場所ならいつも同じ", () => {
    const houses = new Set<number>();
    const offices = new Set<number>();
    for (let x = 0; x < 12; x++) {
      const h = cell(R, 1, 1, 1, 1, x, 5);
      expect(wallHeight(h)).toBe(wallHeight(h));
      houses.add(wallHeight(h));
      const o = cell(O, 1, 1, 1, 1, x, 5);
      expect(wallHeight(o)).toBe(wallHeight(o));
      offices.add(wallHeight(o));
    }
    expect(houses.size).toBe(1);
    expect(offices.size).toBeGreaterThan(3);
    for (const v of houses) expect(v).toBeGreaterThanOrEqual(FLOOR_PX);
  });

  it("建物の底は、敷地の内側におさまる", () => {
    for (const [w, h] of [[1, 1], [2, 2], [3, 3], [4, 3]] as const) {
      const c = cell(R, 3, 3, w, h);
      const b = baseRect(c);
      expect(b.x).toBeGreaterThanOrEqual(c.x * TILE);
      expect(b.y).toBeGreaterThanOrEqual(c.y * TILE);
      expect(b.x + b.w).toBeLessThanOrEqual((c.x + w) * TILE);
      expect(b.y + b.h).toBeLessThanOrEqual((c.y + h) * TILE);
    }
  });
});

describe("集合住宅 (中密度住宅) の形", () => {
  const styleCount = (w: number, h: number) => {
    const n = new Map<FlatsStyle, number>();
    for (let x = 0; x < 60; x++) for (let y = 0; y < 20; y++) {
      const s = flatsStyle(cell(R, 2, 2, w, h, x, y));
      n.set(s, (n.get(s) ?? 0) + 1);
    }
    return n;
  };

  it("広い敷地では 5 種類の形がすべて現れ、特定の形に偏りすぎない", () => {
    const n = styleCount(2, 2);
    for (const s of ["slab", "court", "stepped", "terrace", "point"] as const) expect(n.get(s) ?? 0).toBeGreaterThan(60);
    expect(Math.max(...n.values())).toBeLessThan(1200 * 0.4);
  });

  it("狭い敷地では、中庭・段・連棟は選ばれない (1×1 は板状か細い棟だけ、2 マスでは中庭がない)", () => {
    expect([...styleCount(1, 1).keys()].sort()).toEqual(["point", "slab"]);
    const two = styleCount(2, 1);
    expect(two.has("court")).toBe(false);
    expect(two.has("terrace")).toBe(true);
  });

  it("形は場所から決まり、同じ場所ならいつも同じ", () => {
    for (let x = 0; x < 30; x++) expect(flatsStyle(cell(R, 2, 2, 2, 2, x, 3))).toBe(flatsStyle(cell(R, 2, 2, 2, 2, x, 3)));
  });

  it("形ごとに高さが違う: 連棟は低く、細い棟は高い", () => {
    const byStyle = new Map<FlatsStyle, number[]>();
    for (let x = 0; x < 60; x++) {
      const c = cell(R, 2, 2, 2, 2, x, 5);
      const s = flatsStyle(c);
      byStyle.set(s, [...(byStyle.get(s) ?? []), wallHeight(c)]);
    }
    const avg = (s: FlatsStyle) => byStyle.get(s)!.reduce((a, b) => a + b, 0) / byStyle.get(s)!.length;
    expect(avg("terrace")).toBeLessThan(avg("court"));
    expect(avg("court")).toBeLessThan(avg("slab"));
    expect(avg("slab")).toBeLessThan(avg("stepped"));
    expect(avg("stepped")).toBeLessThan(avg("point"));
  });

  it("細い棟は、敷地の真ん中に細く建つ", () => {
    let point: ZoneCell | undefined;
    let slab: ZoneCell | undefined;
    for (let x = 0; x < 60 && !(point && slab); x++) {
      const c = cell(R, 2, 2, 2, 2, x, 5);
      if (flatsStyle(c) === "point") point = c;
      if (flatsStyle(c) === "slab") slab = c;
    }
    expect(baseRect(point!).w).toBeLessThan(baseRect(slab!).w);
  });

  it("段のある形: 上の部分は下の部分の中におさまり、下の部分は壁の高さより低い", () => {
    let c: ZoneCell | undefined;
    for (let x = 0; x < 80 && !c; x++) {
      const t = cell(R, 2, 2, 3, 2, x, 5);
      if (flatsStyle(t) === "stepped") c = t;
    }
    expect(c).toBeDefined();
    const b = baseRect(c!);
    const up = steppedUpper(c!);
    expect(up.rect.x).toBeGreaterThanOrEqual(b.x);
    expect(up.rect.x + up.rect.w).toBeLessThanOrEqual(b.x + b.w);
    expect(up.rect.y + up.rect.h).toBeLessThan(b.y + b.h); // 上の部分は手前 (南) からひっこむ
    expect(up.z0).toBeLessThan(wallHeight(c!));
  });
});
