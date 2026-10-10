import { describe, expect, it } from "vitest";
import { FACILITY_SPECS, FacilityType } from "../src/sim/facilities";
import { coolingTowers, facilityHeight, incineratorStack, sideOf, smokePoint, spot, steamPoints, windTurbines } from "../src/render3d/facilityShape3d";

const TILE = 16;
const TYPES = Object.keys(FACILITY_SPECS).map(Number) as FacilityType[];
const fac = (type: FacilityType, x = 10, y = 20) => ({ type, x, y, size: FACILITY_SPECS[type].size });

describe("施設の 3D の形の基準", () => {
  it("すべての種類に、正の高さがある", () => {
    expect(TYPES).toHaveLength(16);
    for (const t of TYPES) expect(facilityHeight(fac(t))).toBeGreaterThan(0);
  });

  it("高さは敷地が広いほど高い (同じ種類で、大きさだけ変える)", () => {
    const small = facilityHeight({ type: FacilityType.Hospital, x: 0, y: 0, size: 2 });
    const big = facilityHeight({ type: FacilityType.Hospital, x: 0, y: 0, size: 4 });
    expect(big).toBeCloseTo(small * 2);
  });

  it("煙突のあるごみ処理場と風車は高く、平らな太陽光や公園は低い", () => {
    expect(facilityHeight(fac(FacilityType.Garbage))).toBeGreaterThan(facilityHeight(fac(FacilityType.Hospital)));
    expect(facilityHeight(fac(FacilityType.Wind))).toBeGreaterThan(facilityHeight(fac(FacilityType.Hospital)));
    expect(facilityHeight(fac(FacilityType.Solar))).toBeLessThan(facilityHeight(fac(FacilityType.Sewage)));
    expect(facilityHeight(fac(FacilityType.Park))).toBeLessThan(facilityHeight(fac(FacilityType.Police)));
  });

  it("敷地の中の位置 (割合) は、世界の座標になる", () => {
    const f = fac(FacilityType.University, 3, 4);
    expect(sideOf(f)).toBe(4 * TILE);
    expect(spot(f, 0, 0)).toEqual({ x: 3 * TILE, z: 4 * TILE });
    expect(spot(f, 1, 1)).toEqual({ x: 7 * TILE, z: 8 * TILE });
    expect(spot(f, 0.5, 0.25)).toEqual({ x: 5 * TILE, z: 5 * TILE });
  });

  it("冷却塔は敷地の中にあり、蒸気は塔の先 (高さ h) から出る", () => {
    const f = fac(FacilityType.Power);
    const S = sideOf(f);
    const towers = coolingTowers(f);
    expect(towers).toHaveLength(2);
    for (const t of towers) {
      expect(t.x - t.r0).toBeGreaterThanOrEqual(f.x * TILE);
      expect(t.x + t.r0).toBeLessThanOrEqual(f.x * TILE + S);
      expect(t.z).toBeGreaterThan(f.y * TILE);
      expect(t.r1).toBeLessThan(t.r0); // 上ほど細い
    }
    const steam = steamPoints(f);
    steam.forEach((p, i) => {
      expect(p.y).toBeCloseTo(towers[i]!.h);
      expect(p.x).toBeCloseTo(towers[i]!.x);
      expect(p.z).toBeCloseTo(towers[i]!.z);
    });
  });

  it("ごみ処理場の煙は、煙突の先から出る (敷地いちばん高いもの)", () => {
    const f = fac(FacilityType.Garbage);
    const st = incineratorStack(f);
    const p = smokePoint(f);
    expect(p.y).toBeCloseTo(st.h);
    expect(st.h).toBeCloseTo(facilityHeight(f));
  });

  it("風車は、羽根の長さが正で、塔が敷地におさまり、塔の高さ = 羽根の中心の高さ", () => {
    const f = fac(FacilityType.Wind);
    const S = sideOf(f);
    const ts = windTurbines(f);
    expect(ts).toHaveLength(2);
    for (const t of ts) {
      expect(t.r).toBeGreaterThan(0);
      expect(t.h).toBeGreaterThan(t.r * 0.5);
      expect(t.x).toBeGreaterThan(f.x * TILE);
      expect(t.x).toBeLessThan(f.x * TILE + S);
      expect(t.z).toBeGreaterThan(f.y * TILE);
      expect(t.z).toBeLessThan(f.y * TILE + S);
    }
  });

  it("施設の位置が変わると、煙の出る所もその分ずれる", () => {
    const a = steamPoints(fac(FacilityType.Power, 10, 20))[0]!;
    const b = steamPoints(fac(FacilityType.Power, 12, 23))[0]!;
    expect(b.x - a.x).toBeCloseTo(2 * TILE);
    expect(b.z - a.z).toBeCloseTo(3 * TILE);
    expect(b.y).toBeCloseTo(a.y);
  });
});
