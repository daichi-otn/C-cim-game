import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH, ROAD_UPKEEP_PER_TILE } from "../src/sim/city";
import { NEUTRAL_HAPPINESS, calcDemand } from "../src/sim/demand";
import { COVERAGES, FACILITY_SPECS, FacilityType } from "../src/sim/facilities";
import { forceFacility, setup } from "./helpers";

const grow = (city: City, days = 200) => {
  for (let i = 0; i < days; i++) city.tick();
};
/** 建物のある場所のうち、半径 radius 以内の数を数える (city の計算とは別に求める)。 */
function countWithin(city: City, fx: number, fy: number, radius: number) {
  let n = 0;
  for (const c of city.zones.cells.values()) {
    if (c.building > 0 && Math.hypot(fx + 1 - (c.x + 0.5), fy + 1 - (c.y + 0.5)) <= radius) n++;
  }
  return n;
}
const buildingCount = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0).length;

describe("公共サービス施設の仕様", () => {
  it("警察署・消防署・病院・学校は、それぞれ別のサービスを届ける", () => {
    const kinds = [FacilityType.Police, FacilityType.Fire, FacilityType.Hospital, FacilityType.School].map((t) => FACILITY_SPECS[t].coverage);
    expect(new Set(kinds)).toEqual(new Set(COVERAGES));
  });
  it("公共サービス施設は電力などは供給せず、届く距離が決まっている", () => {
    for (const t of [FacilityType.Police, FacilityType.Fire, FacilityType.Hospital, FacilityType.School]) {
      expect(FACILITY_SPECS[t].service).toBeNull();
      expect(FACILITY_SPECS[t].radius).toBeGreaterThan(0);
    }
  });
});

describe("幸福度と需要", () => {
  const t = { population: 100, jobsC: 20, jobsI: 40, zones: 0 } as never;
  it("幸福度が省略されたら中立と同じ", () => {
    expect(calcDemand(t, 0.1)).toEqual(calcDemand(t, 0.1, NEUTRAL_HAPPINESS));
  });
  it("幸福度が高いほど、どの需要も上がる", () => {
    const base = calcDemand(t, 0.1, NEUTRAL_HAPPINESS);
    const happy = calcDemand(t, 0.1, 1);
    expect(happy.r).toBeGreaterThan(base.r);
    expect(happy.c).toBeGreaterThan(base.c);
    expect(happy.i).toBeGreaterThan(base.i);
  });
});

describe("サービス範囲", () => {
  it("施設がなければ、どれも届かず、幸福度は中立", () => {
    const { city } = setup();
    grow(city);
    expect(buildingCount(city)).toBeGreaterThan(0);
    for (const k of COVERAGES) expect(city.coverage[k].covered).toBe(0);
    expect(city.happiness).toBeLessThanOrEqual(NEUTRAL_HAPPINESS); // 公共サービスが届かないので上がらない (汚染があれば下がる)
  });

  it("警察署は、半径以内の建物にだけ治安を届ける", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    expect(city.placeFacility(FacilityType.Police, x0 + 9, roadY - 2)).toEqual({ ok: true });
    city.refresh();
    const radius = FACILITY_SPECS[FacilityType.Police].radius;
    const expected = countWithin(city, x0 + 9, roadY - 2, radius);
    expect(city.coverage.police.covered).toBe(expected);
    expect(city.coverage.police.total).toBe(buildingCount(city));
    expect(expected).toBeGreaterThan(0);
    // ほかのサービスは届かない
    expect(city.coverage.fire.covered).toBe(0);
    expect(city.coverage.health.covered).toBe(0);
    expect(city.coverage.education.covered).toBe(0);
  });

  it("同じ種類の施設が複数あっても、1 つの建物は 1 回しか数えない", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    city.placeFacility(FacilityType.Police, x0 + 9, roadY - 2);
    city.placeFacility(FacilityType.Police, x0 + 11, roadY - 2);
    city.refresh();
    expect(city.coverage.police.covered).toBeLessThanOrEqual(city.coverage.police.total);
    expect(city.coverage.police.covered).toBe(
      [...city.zones.cells.values()].filter((c) => c.building > 0 && [9, 11].some((dx) => Math.hypot(x0 + dx + 1 - (c.x + 0.5), roadY - 2 + 1 - (c.y + 0.5)) <= FACILITY_SPECS[FacilityType.Police].radius)).length,
    );
  });

  it("道路につながっていない施設は、近くても届かない", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    forceFacility(city, FacilityType.Hospital, x0 + 9, roadY - 9); // 道路から 3 タイル以上離れている
    city.refresh();
    expect(city.facilityNet.get([...city.facilities.keys()].pop()!)).toBe(0);
    expect(city.coverage.health.covered).toBe(0);
  });

  it("施設を取り壊すと届かなくなる", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    city.placeFacility(FacilityType.School, x0 + 9, roadY - 2);
    city.refresh();
    expect(city.coverage.education.covered).toBeGreaterThan(0);
    const school = [...city.facilities.values()].find((f) => f.type === FacilityType.School)!;
    city.removeFacility(school.id);
    city.refresh();
    expect(city.coverage.education.covered).toBe(0);
    expect(city.happiness).toBeLessThanOrEqual(NEUTRAL_HAPPINESS);
  });
});

describe("幸福度", () => {
  it("届くサービスが増えるほど幸福度が上がり、1 を超えない", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    const slots: [FacilityType, number][] = [
      [FacilityType.Police, 9],
      [FacilityType.Fire, 11],
      [FacilityType.Hospital, 29], // 3×3 (道路の北、商業の東)
      [FacilityType.School, 33],
    ];
    let prev = city.happiness;
    for (const [type, dx] of slots) {
      expect(city.placeFacility(type, x0 + dx, roadY - FACILITY_SPECS[type].size)).toEqual({ ok: true }); // 道路に重ならない向きに置く
      city.refresh();
      expect(city.happiness).toBeGreaterThan(prev);
      expect(city.happiness).toBeLessThanOrEqual(1);
      prev = city.happiness;
    }
  });

  it("幸福度が高いと、住宅需要が上がる", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    city.refresh();
    const before = city.demand.r;
    city.placeFacility(FacilityType.Police, x0 + 9, roadY - 2);
    city.placeFacility(FacilityType.Fire, x0 + 11, roadY - 2);
    city.refresh();
    expect(city.demand.r).toBeGreaterThan(before);
  });

  it("建物がなければ中立のまま", () => {
    const { city, x0, roadY } = setup();
    city.placeFacility(FacilityType.Police, x0 + 9, roadY - 2);
    city.refresh();
    expect(city.happiness).toBeLessThanOrEqual(NEUTRAL_HAPPINESS);
  });
});

describe("維持費", () => {
  it("月末の支出に公共サービス施設の維持費が入る", () => {
    const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, false);
    city.placeFacility(FacilityType.Hospital, x0 + 9, roadY - 3);
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    const roadUpkeep = Math.round(city.graph.totalLength() * ROAD_UPKEEP_PER_TILE);
    expect(city.lastMonth.expense).toBe(roadUpkeep + FACILITY_SPECS[FacilityType.Hospital].upkeep);
  });
});

describe("セーブとロード", () => {
  it("公共サービス施設も保存・復元され、届き具合が同じになる", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    city.placeFacility(FacilityType.Police, x0 + 9, roadY - 2);
    city.placeFacility(FacilityType.School, x0 + 29, roadY - 2);
    city.refresh();
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    loaded.refresh();
    expect(loaded.coverage).toEqual(city.coverage);
    expect(loaded.happiness).toBeCloseTo(city.happiness);
    expect([...loaded.facilities.values()].map((f) => f.type).sort()).toEqual([...city.facilities.values()].map((f) => f.type).sort());
  });
  it("存在しない施設の種類は拒否する", () => {
    const { city } = setup();
    const data = JSON.parse(JSON.stringify(city.toData()));
    data.facilities.push({ id: 999, type: 99, x: 0, y: 0 });
    expect(() => City.fromData(data)).toThrow();
  });
});
