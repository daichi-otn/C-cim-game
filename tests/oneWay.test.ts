import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { ONE_WAY_CAPACITY, ROAD_SPECS, RoadType, roadCapacity } from "../src/sim/roadTypes";
import { calcTraffic, edgeCongestion } from "../src/sim/traffic";
import { SEED, findLand, setup } from "./helpers";

const dirs = (g: RoadGraph) => [...g.edges.values()].map((e) => e.oneWay);

describe("一方通行の道路網", () => {
  it("描いた向きに一方通行になる (a → b)", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, true);
    const e = [...g.edges.values()][0]!;
    expect(e.oneWay).toBe(1);
    expect(g.nodes.get(e.a)!.x).toBe(0);
    expect(g.nodes.get(e.b)!.x).toBe(10);
  });
  it("逆向きになぞると、向きが逆になる。両方向でなぞると両方向に戻る", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, true);
    expect(g.addRoad(10, 0, 0, 0, RoadType.Street, true)).toBe(1);
    expect(dirs(g)).toEqual([-1]);
    expect(g.addRoad(0, 0, 10, 0, RoadType.Street, false)).toBe(1);
    expect(dirs(g)).toEqual([0]);
    expect(g.addRoad(0, 0, 10, 0, RoadType.Street, false)).toBe(0);
  });
  it("交差して分割された区間は向きを引き継ぐ", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, true);
    g.addRoad(5, -5, 5, 5);
    expect(dirs(g).filter((d) => d === 1).length).toBe(2);
    expect(dirs(g).filter((d) => d === 0).length).toBe(2);
  });
  it("保存して読み込むと向きも戻り、向きのない古いデータは両方向になる", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, true);
    expect(dirs(RoadGraph.fromData(JSON.parse(JSON.stringify(g.toData()))))).toEqual([1]);
    const old = g.toData();
    old.edges = old.edges.map(([id, a, b]) => [id, a, b]);
    expect(dirs(RoadGraph.fromData(old))).toEqual([0]);
    const bad = g.toData();
    bad.edges = bad.edges.map(([id, a, b, t]) => [id, a, b, t, 5]);
    expect(() => RoadGraph.fromData(bad)).toThrow();
  });
  it("向きを変えるだけなら無料。種類の変更と同時なら差額だけ", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Street);
    const m = city.money;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Street, true)).toBe(true);
    expect(city.money).toBe(m);
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Avenue, true)).toBe(true);
    expect(m - city.money).toBe(10 * (ROAD_SPECS[RoadType.Avenue].cost - ROAD_SPECS[RoadType.Street].cost));
  });
});

describe("一方通行の交通", () => {
  it("容量は減る (同じ種類の 0.75 倍)", () => {
    expect(roadCapacity(RoadType.Street, false)).toBe(100);
    expect(roadCapacity(RoadType.Street, true)).toBe(Math.round(100 * ONE_WAY_CAPACITY));
  });
  it("向きに逆らう移動はできない: 住宅から見て行き先が逆向きの一方通行だけだと出かけられない", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 200; i++) city.tick();
    expect(city.traffic.stranded).toBe(0);
    // 主道路を、住宅 (西) から商業・工業 (東) とは逆の、東から西への一方通行にする
    city.buildRoad(x0 + 39.5, roadY + 0.5, x0 + 0.5, roadY + 0.5, RoadType.Street, true);
    city.refresh();
    expect(city.traffic.stranded).toBeGreaterThan(0);
    // 向きを直せば、また出かけられる
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Street, true);
    city.refresh();
    expect(city.traffic.stranded).toBe(0);
    expect(city.traffic.flow.size).toBeGreaterThan(0);
  });
  it("並行する一方通行の組で、一方通行にすると流れが一方に偏る", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    const t = calcTraffic(city.graph, city.zones);
    const before = Math.max(...[...t.flow].map(([id, f]) => edgeCongestion(city.graph, id, f)));
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, RoadType.Street, true);
    const t2 = calcTraffic(city.graph, city.zones);
    const after = Math.max(...[...t2.flow].map(([id, f]) => edgeCongestion(city.graph, id, f)));
    // 容量が 0.75 倍になるので、同じ交通量なら混雑具合は 1/0.75 倍になる
    expect(after).toBeGreaterThan(before);
  });
});
