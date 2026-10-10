import { describe, expect, it } from "vitest";
import { City, ROAD_UPKEEP_PER_TILE } from "../src/sim/city";
import { FACILITY_SPECS, FacilityType } from "../src/sim/facilities";
import { ZoneType } from "../src/sim/zoning";
import { SEED, findLand, forceFacility, setup } from "./helpers";

const grow = (city: City, days = 300) => {
  for (let i = 0; i < days; i++) city.tick();
};
const residents = (city: City) => [...city.zones.cells.values()].reduce((n, c) => n + c.residents, 0);
const homes = (city: City) => [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.building > 0).length;

describe("外部接続", () => {
  it("外部接続がないと、住宅が建っても住民は引っ越してこない", () => {
    const { city } = setup(undefined, undefined, false);
    grow(city, 300);
    expect(homes(city)).toBeGreaterThan(0); // 建物は建つ
    expect(residents(city)).toBe(0); // が、だれも住まない
    expect(city.zones.totals().population).toBe(0);
  });
  it("外部接続があれば住民が引っ越してくる", () => {
    const { city } = setup();
    grow(city, 300);
    expect(residents(city)).toBeGreaterThan(0);
    expect(city.zones.totals().population).toBe(residents(city));
  });
  it("外部接続がない街の注意書きに、住民が来ない理由が出る", () => {
    const { city } = setup(undefined, undefined, false);
    grow(city, 5);
    expect(city.notices()).toContain("外部接続がありません (住民が引っ越してきません)");
    expect(city.outsideNets.size).toBe(0);
  });
  it("外部接続があれば、その注意書きは出ない", () => {
    const { city } = setup();
    grow(city, 5);
    expect(city.notices().some((n) => n.includes("外部接続"))).toBe(false);
    expect(city.outsideNets.size).toBe(1);
  });
  it("ゾーンがまだない街では注意書きを出さない", () => {
    const { city } = setup({ r: false, c: false, i: false }, {}, false);
    grow(city, 3);
    expect(city.notices()).toEqual([]);
  });
  it("外部接続を取り壊すと、新しい住民は来なくなる (すでにいる住民はそのまま)", () => {
    const { city } = setup();
    grow(city, 20);
    const before = residents(city);
    expect(before).toBeGreaterThan(0);
    for (const f of [...city.facilities.values()]) if (f.type === FacilityType.Outside) city.removeFacility(f.id);
    grow(city, 200);
    // 取り壊した後は、住宅が新しく建っても、すでにいる住民の分から増えない
    expect(residents(city)).toBeLessThanOrEqual(before);
    expect(city.outsideNets.size).toBe(0);
  });
  it("外部接続を建て直すと、住民が来はじめる", () => {
    const { city, x0, roadY } = setup(undefined, undefined, false);
    grow(city, 100);
    expect(residents(city)).toBe(0);
    forceFacility(city, FacilityType.Outside, x0 + 26, roadY - 2);
    grow(city, 100);
    expect(residents(city)).toBeGreaterThan(0);
  });
  it("外部接続につながっていない別の道路網の住宅には住民が来ない", () => {
    const { city, x0, y0 } = setup(); // 主道路には外部接続がある
    // 北に別の道路網を作り、そこに住宅と 3 つのサービスを置く (外部接続はなし)
    const y2 = y0 - 12;
    city.buildRoad(x0 + 0.5, y2 + 0.5, x0 + 30.5, y2 + 0.5);
    forceFacility(city, FacilityType.Power, x0 + 22, y2 + 1);
    forceFacility(city, FacilityType.Power, x0 + 25, y2 + 1);
    forceFacility(city, FacilityType.Water, x0 + 28, y2 + 1);
    forceFacility(city, FacilityType.Sewage, x0 + 18, y2 + 1);
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: y2 - 3, x1: x0 + 12, y1: y2 - 1 }, ZoneType.Residential);
    grow(city, 300);
    const isolated = [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.y < y2);
    expect(isolated.length).toBeGreaterThan(0);
    expect(isolated.every((c) => c.residents === 0)).toBe(true);
    expect(city.notices()).toContain("外部接続につながっていない住宅があります");
    // 主道路の住宅には住民が来ている
    expect(residents(city)).toBeGreaterThan(0);
  });
  it("道路でつなぐと、別の道路網の住宅にも住民が来る", () => {
    const { city, x0, y0, roadY } = setup();
    const y2 = y0 - 12;
    city.buildRoad(x0 + 0.5, y2 + 0.5, x0 + 30.5, y2 + 0.5);
    forceFacility(city, FacilityType.Power, x0 + 22, y2 + 1);
    forceFacility(city, FacilityType.Power, x0 + 25, y2 + 1);
    forceFacility(city, FacilityType.Water, x0 + 28, y2 + 1);
    forceFacility(city, FacilityType.Sewage, x0 + 18, y2 + 1);
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: y2 - 3, x1: x0 + 12, y1: y2 - 1 }, ZoneType.Residential);
    grow(city, 100);
    city.buildRoad(x0 + 39.5, roadY + 0.5, x0 + 39.5, y2 + 0.5); // 主道路の東端から北の道路へ
    city.buildRoad(x0 + 39.5, y2 + 0.5, x0 + 30.5, y2 + 0.5);
    grow(city, 300);
    const isolated = [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.y < y2);
    expect(isolated.some((c) => c.residents > 0)).toBe(true);
  });
  it("外部接続は電力・水道・下水を供給しない", () => {
    const { city } = setup({ r: false, c: false, i: false }, {}, true);
    grow(city, 3);
    expect(city.utilities.power.supply).toBe(0);
    expect(city.utilities.water.supply).toBe(0);
    expect(city.utilities.sewage.supply).toBe(0);
  });
  it("道路から離れた外部接続は、どの道路網ともつながらず入口にならない", () => {
    const { city, x0, roadY } = setup(undefined, undefined, false);
    forceFacility(city, FacilityType.Outside, x0 + 26, roadY + 20); // 道路から遠い
    grow(city, 200);
    expect(city.outsideNets.size).toBe(0);
    expect(residents(city)).toBe(0);
  });
  it("建設費と維持費がかかる", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const roadY = y0 + 4;
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
    const money = city.money;
    expect(city.placeFacility(FacilityType.Outside, x0 + 20, roadY + 1)).toEqual({ ok: true });
    expect(money - city.money).toBe(FACILITY_SPECS[FacilityType.Outside].cost);
    const length = city.graph.totalLength();
    for (let i = 0; i < 30; i++) city.tick();
    expect(city.lastMonth.expense).toBe(Math.round(length * ROAD_UPKEEP_PER_TILE) + FACILITY_SPECS[FacilityType.Outside].upkeep);
  });
});
