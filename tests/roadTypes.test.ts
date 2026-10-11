import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH, ROAD_COST_PER_TILE, ROAD_UPKEEP_PER_TILE } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { DEFAULT_ROAD_TYPE, ROAD_SPECS, ROAD_TYPES, RoadType, carsCanUse } from "../src/sim/roadTypes";
import { calcTraffic, edgeCongestion } from "../src/sim/traffic";
import { ZoneType } from "../src/sim/zoning";
import { SEED, findLand, setup } from "./helpers";

const types = (g: RoadGraph) => [...g.edges.values()].map((e) => e.type);

describe("道路の種類のデータ", () => {
  it("10 種類以上あり、名前が重ならない", () => {
    expect(ROAD_TYPES.length).toBeGreaterThanOrEqual(10);
    const names = ROAD_TYPES.map((t) => ROAD_SPECS[t].name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("標準の「通り」は、これまでの道路と同じ費用・維持費・容量", () => {
    expect(DEFAULT_ROAD_TYPE).toBe(RoadType.Street);
    expect(ROAD_SPECS[RoadType.Street].cost).toBe(ROAD_COST_PER_TILE);
    expect(ROAD_SPECS[RoadType.Street].upkeep).toBe(ROAD_UPKEEP_PER_TILE);
    expect(ROAD_SPECS[RoadType.Street].capacity).toBe(100);
  });
  it("大きい道路ほど高く、容量が大きい (細道 < 通り < 大通り < 幹線 < 高速)", () => {
    const order = [RoadType.Lane, RoadType.Street, RoadType.Avenue, RoadType.Arterial, RoadType.Highway];
    for (let i = 1; i < order.length; i++) {
      expect(ROAD_SPECS[order[i]!].cost).toBeGreaterThan(ROAD_SPECS[order[i - 1]!].cost);
      expect(ROAD_SPECS[order[i]!].capacity).toBeGreaterThan(ROAD_SPECS[order[i - 1]!].capacity);
    }
    expect(carsCanUse(RoadType.Footpath)).toBe(false);
  });
});

describe("道路網と種類", () => {
  it("敷いた道路は指定した種類になり、既定は通り", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Avenue);
    g.addRoad(0, 5, 10, 5);
    expect(types(g).sort()).toEqual([RoadType.Street, RoadType.Avenue].sort());
  });
  it("途中で分割された区間は、元の種類を引き継ぐ", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Arterial);
    g.addRoad(5, -5, 5, 5, RoadType.Lane); // 交差して分割される
    expect(types(g).filter((t) => t === RoadType.Arterial).length).toBe(2);
    expect(types(g).filter((t) => t === RoadType.Lane).length).toBe(2);
  });
  it("重なる部分は新しい種類に変わり、変更として記録される", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street);
    expect(g.addRoad(0, 0, 10, 0, RoadType.Street)).toBe(0);
    expect(g.addRoad(0, 0, 10, 0, RoadType.Avenue)).toBe(1);
    expect(g.lastChange.changed).toEqual([{ length: 10, from: RoadType.Street, to: RoadType.Avenue, structure: 0, fromLanes: 2, toLanes: 2 }]);
    expect(types(g)).toEqual([RoadType.Avenue]);
  });
  it("保存して読み込むと種類も戻り、種類のない古いデータは通りになる", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Highway);
    const back = RoadGraph.fromData(JSON.parse(JSON.stringify(g.toData())));
    expect(types(back)).toEqual([RoadType.Highway]);
    const old = g.toData();
    old.edges = old.edges.map(([id, a, b]) => [id, a, b]);
    expect(types(RoadGraph.fromData(old))).toEqual([RoadType.Street]);
    const bad = g.toData();
    bad.edges = bad.edges.map(([id, a, b]) => [id, a, b, 99]);
    expect(() => RoadGraph.fromData(bad)).toThrow();
  });
});

describe("道路の費用と維持費", () => {
  const fresh = () => new City(SEED);
  it("種類ごとの建設費がかかる", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    const m = city.money;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Avenue)).toBe(true);
    expect(m - city.money).toBe(10 * ROAD_SPECS[RoadType.Avenue].cost);
  });
  it("見積もりは街を変えない", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    const q = city.quoteRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Arterial);
    expect(q).toMatchObject({ ok: true, cost: 10 * ROAD_SPECS[RoadType.Arterial].cost, sections: 1 });
    expect(city.graph.edges.size).toBe(0);
  });
  it("アップグレードは建設費の差額だけ払い、安い種類への変更は無料", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Street);
    let m = city.money;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Avenue)).toBe(true);
    expect(m - city.money).toBe(10 * (ROAD_SPECS[RoadType.Avenue].cost - ROAD_SPECS[RoadType.Street].cost));
    m = city.money;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Lane)).toBe(true);
    expect(city.money).toBe(m);
    expect(types(city.graph)).toEqual([RoadType.Lane]);
  });
  it("同じ種類の道路を重ねても何も起きない", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Avenue);
    const m = city.money;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Avenue)).toBe(false);
    expect(city.money).toBe(m);
  });
  it("お金が足りなければ敷けない", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    city.money = 5 * ROAD_SPECS[RoadType.Highway].cost;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Highway)).toBe(false);
    expect(city.graph.edges.size).toBe(0);
  });
  it("維持費は種類ごとの維持費 × 長さ", () => {
    const [x0, y0] = findLand();
    const city = fresh();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Arterial);
    city.buildRoad(x0 + 0.5, y0 + 3.5, x0 + 5.5, y0 + 3.5, RoadType.Lane);
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    expect(city.lastMonth.expense).toBe(Math.round(10 * ROAD_SPECS[RoadType.Arterial].upkeep + 5 * ROAD_SPECS[RoadType.Lane].upkeep));
  });
});

describe("建物の出入口", () => {
  it("高速道路の脇だけでは、ゾーンを塗れない (通りがあれば塗れる)", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 4.5, x0 + 30.5, y0 + 4.5, RoadType.Highway);
    expect(city.zones.paintRect(city.graph, { x0: x0 + 5, y0: y0 + 5, x1: x0 + 8, y1: y0 + 6 }, ZoneType.Residential)).toBe(0);
    city.buildRoad(x0 + 0.5, y0 + 7.5, x0 + 30.5, y0 + 7.5, RoadType.Street);
    expect(city.zones.paintRect(city.graph, { x0: x0 + 5, y0: y0 + 5, x1: x0 + 8, y1: y0 + 6 }, ZoneType.Residential)).toBeGreaterThan(0);
  });
  it("歩行者道だけに面した住宅からは、車で出かけられない", () => {
    const { city, x0, roadY } = setup({ r: true, c: true, i: true });
    for (let i = 0; i < 200; i++) city.tick();
    expect(city.traffic.stranded).toBe(0);
    // 主道路を歩行者道に変えると、車が走れず、すべての移動が出かけられなくなる
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Footpath);
    city.refresh();
    expect(city.traffic.flow.size).toBe(0);
    expect(city.traffic.stranded).toBe(city.traffic.trips);
  });
});

describe("道路の種類と交通", () => {
  /** 同じ街で、主道路の種類だけ変えて交通量を求める。 */
  function peakCongestion(type: RoadType) {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, type);
    const t = calcTraffic(city.graph, city.zones);
    return Math.max(0, ...[...t.flow].map(([id, f]) => edgeCongestion(city.graph, id, f)));
  }
  it("容量の大きい道路ほど、同じ交通量でも混雑しにくい", () => {
    const lane = peakCongestion(RoadType.Lane);
    const street = peakCongestion(RoadType.Street);
    const arterial = peakCongestion(RoadType.Arterial);
    expect(lane).toBeGreaterThan(street);
    expect(street).toBeGreaterThan(arterial);
  });
});
