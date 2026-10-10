import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { densityAllowed, type District } from "../src/sim/district";
import { LOT_SIZES, DENSITY_MIN_ROAD_CAPACITY, ZoneType, cellCapacity, capacityOf, densitiesOf, lotArea } from "../src/sim/zoning";
import { kindOf, residentialFloors } from "../src/render3d/buildingShape";
import { findLand, setup } from "./helpers";

const R = ZoneType.Residential;
const C = ZoneType.Commercial;

describe("超高密度住宅 (1 マス 100 人)", () => {
  it("定員は 1 マス 100 人。建物 (2×2) では 400 人", () => {
    expect(capacityOf(R, 1, 4)).toBe(100);
    const cell = { x: 0, y: 0, zone: R, building: 1, residents: 0, served: true, net: 1, roadCap: 400, density: 4 as const, w: 2, h: 2, env: {} as never, built: 0, aging: 1 };
    expect(cellCapacity(cell)).toBe(400);
  });

  it("建物は小さめ (1〜4 マス)。約 200 人の 2×1 が中心", () => {
    for (const [w, h] of LOT_SIZES[4]) {
      expect(lotArea({ w, h })).toBeGreaterThanOrEqual(2);
      expect(lotArea({ w, h })).toBeLessThanOrEqual(4);
    }
    expect(LOT_SIZES[4].some(([w, h]) => w * h === 2)).toBe(true);
  });

  it("建つには幹線道路 (容量 380) が必要", () => {
    expect(DENSITY_MIN_ROAD_CAPACITY[4]).toBe(380);
  });

  it("すべての区画が 4 段階 (低・中・高・超高)", () => {
    expect(densitiesOf(R)).toEqual([1, 2, 3, 4]);
    expect(densitiesOf(C)).toEqual([1, 2, 3, 4]);
  });

  it("超高密度の住宅は、高層マンションより高い塔になる (30 階建て以上)", () => {
    const cell = { x: 4, y: 4, zone: R, building: 1, residents: 0, served: true, net: 1, roadCap: 400, density: 4 as const, w: 2, h: 2, env: {} as never, built: 0, aging: 1 };
    expect(kindOf(cell)).toBe("homeTower");
    expect(residentialFloors(cell)).toBeGreaterThanOrEqual(30);
  });

  it("どの区画にも超高密度を塗れる", () => {
    const { city } = setup();
    const [x0, y0] = findLand();
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: y0 + 1, x1: x0 + 2, y1: y0 + 2 }, C, 4);
    expect(city.zones.get(x0 + 1, y0 + 1)?.density).toBe(4);
    city.zones.paintRect(city.graph, { x0: x0 + 3, y0: y0 + 1, x1: x0 + 4, y1: y0 + 2 }, R, 4);
    expect(city.zones.get(x0 + 3, y0 + 1)?.density).toBe(4);
  });

  it("保存の読み込み: 超高密度は、どの区画でも読める。段階の外の値は拒否する", () => {
    const { city } = setup();
    const [x0, y0] = findLand();
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: y0 + 1, x1: x0 + 2, y1: y0 + 2 }, R, 4);
    const good = JSON.parse(JSON.stringify(city.toData()));
    expect(() => City.fromData(good)).not.toThrow();
    const bad = JSON.parse(JSON.stringify(good));
    bad.zones.push([x0 + 9, y0 + 9, ZoneType.Commercial, 0, 0, 5]);
    expect(() => City.fromData(bad)).toThrow();
  });

  it("地区の規制: 超高密度は 4 つ目。古いデータ (3 段階) は超高密度を建ててよい扱い", () => {
    const d: District = { id: 1, name: "a", color: 0, x0: 0, y0: 0, x1: 4, y1: 4, allowed: [true, true, true, false], wallet: 0, greenery: 1 };
    expect(densityAllowed(d, 4)).toBe(false);
    expect(densityAllowed(d, 3)).toBe(true);
  });
});
