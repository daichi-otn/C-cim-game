import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { calcDemand } from "../src/sim/demand";
import { buildingLoad } from "../src/sim/facilities";
import { RoadType } from "../src/sim/roadTypes";
import {
  COMMERCIAL_JOBS,
  DENSITY_CAPACITY,
  DENSITY_MIN_ROAD_CAPACITY,
  INDUSTRIAL_JOBS,
  RESIDENT_CAPACITY,
  ZONE_NAMES,
  ZoneType,
  capacityOf,
  type Density,
} from "../src/sim/zoning";
import { setup } from "./helpers";

const R = ZoneType.Residential;
const C = ZoneType.Commercial;
const I = ZoneType.Industrial;
const O = ZoneType.Office;

/** 標準の道路と供給・外部接続はあるが、ゾーンはない街。 */
const bare = () => setup({ r: false, c: false, i: false });
const grow = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};

describe("密度ごとの定員・雇用", () => {
  it("高密度ほど大きく、昔の表 (密度 0) は変わらない", () => {
    for (const z of [R, C, I, O] as const) {
      const t = DENSITY_CAPACITY[z];
      expect(t[0]!).toBeLessThan(t[1]!);
      expect(t[1]!).toBeLessThan(t[2]!);
      expect(ZONE_NAMES[z]).toHaveLength(4); // すべての区画に超高密度がある
    }
    expect(DENSITY_CAPACITY[R][3]).toBe(100);
    for (let tier = 1; tier <= 3; tier++) {
      expect(capacityOf(R, tier, 0)).toBe(RESIDENT_CAPACITY[tier - 1]);
      expect(capacityOf(C, tier, 0)).toBe(COMMERCIAL_JOBS[tier - 1]);
      expect(capacityOf(I, tier, 0)).toBe(INDUSTRIAL_JOBS[tier - 1]);
    }
    expect(capacityOf(R, 3, 3)).toBe(DENSITY_CAPACITY[R][2]);
    expect(capacityOf(O, 2, 0)).toBe(DENSITY_CAPACITY[O][1]); // オフィスに昔の表はない
  });
  it("使うサービスの量は人数に比例し、オフィスの電力は 1.5 倍、工業は 2 倍", () => {
    expect(buildingLoad(R, 3, 3)).toEqual({ power: 48, water: 48, sewage: 48 });
    expect(buildingLoad(O, 2, 2)).toEqual({ power: 24 * 1.5, water: 24, sewage: 24 });
    expect(buildingLoad(I, 1, 1)).toEqual({ power: 8, water: 4, sewage: 4 });
    expect(buildingLoad(R, 3)).toEqual({ power: 12, water: 12, sewage: 12 }); // 昔の区画
  });
});

describe("密度を選んで塗る", () => {
  it("塗った密度が区画に残り、同じ密度で塗り直しても変わらない。違う密度なら塗り直され、建物は取り壊される", () => {
    const { city, x0, roadY } = bare();
    const { graph, zones } = city;
    const rect = { x0: x0 + 1, y0: roadY + 1, x1: x0 + 3, y1: roadY + 1 };
    expect(zones.paintRect(graph, rect, R, 2)).toBe(3);
    expect([...zones.cells.values()].every((c) => c.density === 2)).toBe(true);
    expect(zones.paintRect(graph, rect, R, 2)).toBe(0);
    zones.grow(() => 0, 1);
    expect([...zones.cells.values()].every((c) => c.building === 2)).toBe(true);
    expect(zones.paintRect(graph, rect, R, 3)).toBe(3);
    expect([...zones.cells.values()].every((c) => c.density === 3 && c.building === 0)).toBe(true);
  });
  it("密度を選んだ区画は、その密度の建物が建つ (大きさは場所で変わらない)", () => {
    const { city, x0, roadY } = bare();
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 8, y1: roadY + 3 }, C, 1);
    city.zones.grow(() => 0, 1);
    const tiers = new Set([...city.zones.cells.values()].filter((c) => c.building > 0).map((c) => c.building));
    expect([...tiers]).toEqual([1]);
  });
  it("住宅は密度ごとの定員まで住民が入る", () => {
    const { city, x0, roadY } = bare();
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 1, y1: roadY + 1 }, R, 2);
    city.zones.paintRect(city.graph, { x0: x0 + 3, y0: roadY + 1, x1: x0 + 3, y1: roadY + 1 }, R, 1);
    city.zones.grow(() => 0, 1);
    for (let i = 0; i < 100; i++) city.zones.fillResidents();
    const cap = (dx: number) => city.zones.get(x0 + dx, roadY + 1)!.residents;
    expect(cap(1)).toBe(DENSITY_CAPACITY[R][1]);
    expect(cap(3)).toBe(DENSITY_CAPACITY[R][0]);
  });
  it("オフィスの雇用は、人口と並んで totals に数えられる", () => {
    const { city, x0, roadY } = bare();
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Avenue);
    city.zones.paintRect(city.graph, { x0: x0 + 14, y0: roadY - 3, x1: x0 + 14, y1: roadY - 3 }, O, 3);
    // 働き手 (住民) がいないとオフィスの需要は上がらないので、住宅も塗る
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 6, y1: roadY + 2 }, R, 2);
    grow(city, 250);
    // 老朽化: 建ってから年数がたった建物は、定員が少し減る (定員は整数に切り捨て)
    const expected = [...city.zones.cells.values()].filter((c) => c.building > 0 && c.zone === O).reduce((s, c) => s + Math.floor(DENSITY_CAPACITY[O][2]! * c.aging), 0);
    expect(city.zones.totals().jobsO).toBe(expected);
  });
});

describe("道路の太さと密度", () => {
  const paintAll = (city: City, x0: number, roadY: number, density: Density) =>
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 4, y1: roadY + 2 }, R, density);
  const builtCount = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0).length;

  it("低密度はどんな道路でも、中密度は通り以上、高密度は大通り以上でないと建たない", () => {
    expect(DENSITY_MIN_ROAD_CAPACITY[1]).toBe(0);
    for (const [density, type, builds] of [
      [1, RoadType.Lane, true],
      [2, RoadType.Lane, false],
      [2, RoadType.Street, true],
      [3, RoadType.Street, false],
      [3, RoadType.Avenue, true],
    ] as const) {
      const { city, x0, roadY } = bare();
      city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, type);
      paintAll(city, x0, roadY, density);
      grow(city, 60);
      expect(builtCount(city) > 0, `${density} 密度 / 道路 ${type}`).toBe(builds);
    }
  });
  it("道路を太くすると、建たなかった区画に建つ。案内も出る", () => {
    const { city, x0, roadY } = bare();
    paintAll(city, x0, roadY, 3);
    grow(city, 60);
    expect(builtCount(city)).toBe(0);
    expect(city.notices().some((n) => n.includes("道路が細くて"))).toBe(true);
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Avenue);
    grow(city, 60);
    expect(builtCount(city)).toBeGreaterThan(0);
    expect(city.notices().some((n) => n.includes("道路が細くて"))).toBe(false);
  });
  it("昔の区画 (密度 0) は、道路の太さに関係なく建つ", () => {
    const { city, x0, roadY } = bare();
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Lane);
    paintAll(city, x0, roadY, 0);
    grow(city, 60);
    expect(builtCount(city)).toBeGreaterThan(0);
  });
});

describe("オフィスの需要", () => {
  it("働き手が余っているとオフィスの需要が高く、幸福度が高いほど高い", () => {
    const t = { population: 400, jobsC: 20, jobsI: 20, jobsO: 0 };
    const base = calcDemand(t, 0.1);
    expect(base.o).toBeGreaterThan(0);
    expect(calcDemand(t, 0.1, 0.9).o).toBeGreaterThan(base.o);
    expect(calcDemand(t, 0.1, 0.2).o).toBeLessThan(base.o);
    // オフィスの雇用が増えるほど、需要は下がる
    expect(calcDemand({ ...t, jobsO: 400 }, 0.1).o).toBeLessThan(base.o);
  });
  it("住民のいない街では、オフィスの需要は低い", () => {
    expect(calcDemand({ population: 0, jobsC: 0, jobsI: 0, jobsO: 0 }, 0.1).o).toBeLessThan(0.1);
  });
});

describe("オフィスと交通・環境", () => {
  it("オフィスは通勤の行き先になるが、買い物の行き先にはならない", () => {
    const { city, x0, roadY } = bare();
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 6, y1: roadY + 2 }, R, 2);
    city.zones.paintRect(city.graph, { x0: x0 + 14, y0: roadY - 3, x1: x0 + 20, y1: roadY - 1 }, O, 2); // 道路の北 (施設の置き場がない所)
    grow(city, 250);
    const t = city.traffic;
    expect(t.trips).toBeGreaterThan(0);
    expect(t.flow.size).toBeGreaterThan(0); // 通勤で道路を走る
    expect(t.stranded).toBeGreaterThan(0); // 買い物の行き先がない
    expect(t.stranded / t.trips).toBeCloseTo(0.3 / 0.9, 1);
  });
  it("重工業は軽工業より、近くの住宅の大気汚染が大きい", () => {
    const airNear = (density: Density) => {
      const { city, x0, roadY } = bare();
      city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 2, y1: roadY + 1 }, R, 1);
      city.zones.paintRect(city.graph, { x0: x0 + 5, y0: roadY + 1, x1: x0 + 6, y1: roadY + 1 }, I, density);
      grow(city, 100);
      return Math.max(...[...city.zones.cells.values()].filter((c) => c.zone === R && c.building > 0).map((c) => c.env.air));
    };
    // 重工業 (密度 3) は大通り以上でないと建たないので、道路を太くした街で比べる
    const heavy = (() => {
      const { city, x0, roadY } = bare();
      city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Avenue);
      city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 2, y1: roadY + 1 }, R, 1);
      city.zones.paintRect(city.graph, { x0: x0 + 5, y0: roadY + 1, x1: x0 + 6, y1: roadY + 1 }, I, 3);
      grow(city, 100);
      return Math.max(...[...city.zones.cells.values()].filter((c) => c.zone === R && c.building > 0).map((c) => c.env.air));
    })();
    expect(heavy).toBeGreaterThan(airNear(1));
  });
});

describe("保存", () => {
  it("密度も保存され、密度のない古いデータは昔の区画になり、不正な値は拒否される", () => {
    const { city, x0, roadY } = bare();
    city.zones.paintRect(city.graph, { x0: x0 + 14, y0: roadY - 3, x1: x0 + 15, y1: roadY - 3 }, O, 2);
    city.zones.paintRect(city.graph, { x0: x0 + 4, y0: roadY + 1, x1: x0 + 5, y1: roadY + 1 }, R, 1);
    grow(city, 100);
    const back = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    expect([...back.zones.cells.values()].map((c) => `${c.zone}:${c.density}:${c.building}`).sort()).toEqual(
      [...city.zones.cells.values()].map((c) => `${c.zone}:${c.density}:${c.building}`).sort(),
    );
    const old = city.toData();
    old.zones = old.zones.map(([x, y, z, b, r]) => [x, y, z, b, r]);
    const legacy = City.fromData(old);
    expect([...legacy.zones.cells.values()].every((c) => c.density === 0)).toBe(true);
    const bad = city.toData();
    bad.zones = bad.zones.map(([x, y, z, b, r]) => [x, y, z, b, r, 7]);
    expect(() => City.fromData(bad)).toThrow();
    const over = city.toData();
    over.zones = over.zones.map(([x, y]) => [x, y, ZoneType.Residential, 1, 999, 1]);
    expect(() => City.fromData(over)).toThrow();
  });
});
