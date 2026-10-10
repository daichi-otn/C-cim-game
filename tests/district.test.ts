import { describe, expect, it } from "vitest";
import { City, MAX_TAX_RATE } from "../src/sim/city";
import { FACILITY_SPECS, FacilityType } from "../src/sim/facilities";
import { DISTRICT_MAX_COUNT, DISTRICT_MAX_SIZE, DISTRICT_MIN_SIZE, densityAllowed, districtAt, districtRect, type District } from "../src/sim/district";
import { ZoneType, type Density } from "../src/sim/zoning";
import { findLand, forceFacility, SEED, setup } from "./helpers";

/** 住宅 (指定の密度) を並べた街。地区を作るのに使う。 */
function town(density: Density) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, 2 as never);
  city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 16, y1: roadY + 3 }, ZoneType.Residential, density);
  forceFacility(city, FacilityType.Power, x0 + 22, roadY + 1);
  forceFacility(city, FacilityType.Water, x0 + 24, roadY + 1);
  forceFacility(city, FacilityType.Sewage, x0 + 26, roadY + 1);
  forceFacility(city, FacilityType.Outside, x0 + 28, roadY - 2);
  return { city, x0, roadY };
}
const grow = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};
const buildings = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0 && c.part === undefined);

const sample: District = { id: 1, name: "a", color: 0, x0: 0, y0: 0, x1: 10, y1: 10, allowed: [true, true, true, true], wallet: 0, greenery: 1 };

describe("地区の囲みと範囲", () => {
  it("2 点から範囲を作り、向きを直す", () => {
    expect(districtRect(5, 9, 1, 3)).toEqual({ x0: 1, y0: 3, x1: 6, y1: 10 });
  });

  it("小さすぎる・大きすぎる囲みは作れない", () => {
    expect(districtRect(0, 0, DISTRICT_MIN_SIZE - 2, 5)).toBeNull();
    expect(districtRect(0, 0, DISTRICT_MAX_SIZE, 5)).toBeNull();
  });

  it("重なるところは、後から作った地区が優先する", () => {
    const a = { ...sample, id: 1 };
    const b = { ...sample, id: 2, x0: 5, y0: 5, x1: 20, y1: 20 };
    expect(districtAt([a, b], 6, 6)?.id).toBe(2);
    expect(districtAt([a, b], 1, 1)?.id).toBe(1);
    expect(districtAt([a, b], 30, 30)).toBeUndefined();
  });

  it("密度 0 (昔の区画) と地区の外は、いつも建てられる", () => {
    const off: District = { ...sample, allowed: [false, false, false, false] };
    expect(densityAllowed(undefined, 3)).toBe(true);
    expect(densityAllowed(off, 0)).toBe(true);
    expect(densityAllowed(off, 2)).toBe(false);
  });
});

describe("地区の管理", () => {
  it("作る・名前と色と税率と規制を変える・消す", () => {
    const city = new City(SEED);
    const r = city.addDistrict(0, 0, 4, 4);
    expect(r.ok).toBe(true);
    const id = r.id!;
    expect(city.districts[0]!.name).toBe(`地区${id}`);
    expect(city.updateDistrict(id, { name: "  新町  " })).toBe(true);
    expect(city.districts[0]!.name).toBe("新町");
    expect(city.updateDistrict(id, { name: "   " })).toBe(false);
    city.updateDistrict(id, { taxRate: 99 });
    expect(city.districts[0]!.taxRate).toBe(MAX_TAX_RATE);
    city.updateDistrict(id, { taxRate: undefined });
    expect(city.districts[0]!.taxRate).toBeUndefined();
    city.updateDistrict(id, { allowed: [false, true, false, true] });
    expect(city.districts[0]!.allowed).toEqual([false, true, false, true]);
    expect(city.removeDistrict(id)).toBe(true);
    expect(city.districts).toHaveLength(0);
  });

  it("木の多さは、初めは「ふつう」で、変えられる", () => {
    const city = new City(SEED);
    const id = city.addDistrict(0, 0, 4, 4).id!;
    expect(city.districts[0]!.greenery).toBe(1);
    expect(city.updateDistrict(id, { greenery: 2 })).toBe(true);
    expect(city.districts[0]!.greenery).toBe(2);
  });

  it("地区の数は上限まで", () => {
    const city = new City(SEED);
    for (let i = 0; i < DISTRICT_MAX_COUNT; i++) expect(city.addDistrict(0, 0, 4, 4).ok).toBe(true);
    expect(city.addDistrict(0, 0, 4, 4).ok).toBe(false);
  });
});

describe("地区の建物の規制", () => {
  it("規制で禁止した密度は、地区の中に建たない (ほかの密度は建つ)", () => {
    const control = town(2);
    grow(control.city, 150);
    expect(buildings(control.city).some((c) => c.density === 2)).toBe(true);

    const { city, x0, roadY } = town(2);
    city.addDistrict(x0 + 1, roadY + 1, x0 + 16, roadY + 3);
    city.updateDistrict(city.districts[0]!.id, { allowed: [true, false, true, true] });
    grow(city, 150);
    expect(buildings(city).some((c) => c.density === 2)).toBe(false);
  });
});

describe("地区の税と財布", () => {
  it("地区の税は地区の財布に入り、税率 0 なら入らない", () => {
    const { city, x0, roadY } = town(1);
    const id = city.addDistrict(x0 + 1, roadY + 1, x0 + 16, roadY + 3).id!;
    grow(city, 150);
    const wallet = city.districts[0]!.wallet;
    expect(wallet).toBeGreaterThan(0);

    const zero = town(1);
    const zid = zero.city.addDistrict(zero.x0 + 1, zero.roadY + 1, zero.x0 + 16, zero.roadY + 3).id!;
    zero.city.updateDistrict(zid, { taxRate: 0 });
    grow(zero.city, 150);
    expect(zero.city.districts[0]!.wallet).toBe(0);
    expect(id).toBeGreaterThan(0);
  });

  it("地区の施設の維持費は、地区の財布から先に払う", () => {
    const { city, x0, roadY } = town(1);
    city.addDistrict(x0 + 20, roadY, x0 + 22, roadY + 3); // 電力施設 (x0+22) だけを囲む
    const g = city.districts[0]!;
    city.updateDistrict(g.id, { taxRate: 0 });
    const upkeep = FACILITY_SPECS[FacilityType.Power].upkeep;
    g.wallet = upkeep + 500;
    grow(city, 30); // 月末 (1 回締める)
    expect(g.wallet).toBe(500);
  });

  it("財布が足りないぶんは、市のお金から払う", () => {
    const { city, x0, roadY } = town(1);
    city.addDistrict(x0 + 20, roadY, x0 + 22, roadY + 3); // 電力施設 (x0+22) だけを囲む
    const g = city.districts[0]!;
    city.updateDistrict(g.id, { taxRate: 0 });
    g.wallet = 0;
    grow(city, 30);
    expect(g.wallet).toBe(0);
    expect(city.lastMonth.expense).toBeGreaterThanOrEqual(FACILITY_SPECS[FacilityType.Power].upkeep);
  });
});

describe("地区の保存", () => {
  it("地区を保存して読み込むと、同じ地区になる", () => {
    const { city, x0, roadY } = town(1);
    const id = city.addDistrict(x0 + 1, roadY + 1, x0 + 16, roadY + 3).id!;
    city.updateDistrict(id, { name: "中央", taxRate: 0.1, allowed: [true, false, true, false] });
    city.districts[0]!.wallet = 42;
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    expect(loaded.districts).toEqual(city.districts);
  });

  it("木の多さも保存され、古いデータは「ふつう」になる", () => {
    const { city, x0, roadY } = town(1);
    const id = city.addDistrict(x0 + 1, roadY + 1, x0 + 16, roadY + 3).id!;
    city.updateDistrict(id, { greenery: 0 });
    const data = JSON.parse(JSON.stringify(city.toData()));
    expect(City.fromData(data).districts[0]!.greenery).toBe(0);
    delete data.districts[0].greenery;
    expect(City.fromData(data).districts[0]!.greenery).toBe(1);
  });

  it("地区のない古いデータも読み込める", () => {
    const { city } = setup();
    const data = JSON.parse(JSON.stringify(city.toData()));
    delete data.districts;
    expect(City.fromData(data).districts).toEqual([]);
  });

  it("不正な地区のデータは拒否する", () => {
    const { city, x0, roadY } = town(1);
    city.addDistrict(x0 + 1, roadY + 1, x0 + 16, roadY + 3);
    const good = JSON.parse(JSON.stringify(city.toData()));
    const bad = (mutate: (g: Record<string, unknown>) => void) => {
      const d = JSON.parse(JSON.stringify(good));
      mutate(d.districts[0]);
      return () => City.fromData(d);
    };
    expect(bad((g) => (g.x1 = (g.x0 as number) + 1))).toThrow();
    expect(bad((g) => (g.allowed = [true, true]))).toThrow();
    expect(bad((g) => (g.taxRate = NaN))).toThrow();
    expect(bad((g) => (g.wallet = "x"))).toThrow();
    expect(bad((g) => (g.name = "x".repeat(21)))).toThrow();
    expect(bad((g) => (g.color = -1))).toThrow();
    expect(bad((g) => (g.greenery = 5))).toThrow();
  });
});
