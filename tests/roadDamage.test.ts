import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { hash2 } from "../src/sim/rng";
import { calcTraffic } from "../src/sim/traffic";
import { setup } from "./helpers";

function prepared() {
  const { city } = setup();
  for (let i = 0; i < 90; i++) city.tick();
  city.refresh(); city.disastersEnabled = true;
  const edge = [...city.graph.edges.values()][0]!;
  return { city, edge };
}

describe("道路の地震被害", () => {
  it("震源の近くの道路区間が損傷する", () => {
    const { city, edge } = prepared();
    let start = city.day;
    while (hash2(city.seed ^ start ^ 0x329d, edge.id, 0) >= 0.35) start++;
    const a = city.graph.nodes.get(edge.a)!;
    city.day = start; city.quake = { x: Math.round(a.x), y: Math.round(a.y), started: start };
    city.tick();
    expect(city.roadDamage.get(edge.id)).toBe(city.day + 8);
    expect(city.notices().some((s) => s.includes("道路区間が損傷"))).toBe(true);
  });

  it("損傷で道路容量が下がり、交通の混雑が増える", () => {
    const { city, edge } = prepared();
    const normal = calcTraffic(city.graph, city.zones);
    expect(normal.avgCongestion).toBeGreaterThan(0);
    const damaged = calcTraffic(city.graph, city.zones, 1, new Map([[edge.id, city.day + 8]]));
    expect(damaged.avgCongestion).toBeGreaterThan(normal.avgCongestion);
  });

  it("即時修理は資金を要し、8日で自動復旧もする", () => {
    const { city, edge } = prepared();
    city.roadDamage.set(edge.id, city.day + 2); city.refresh();
    city.money = 999_999;
    expect(city.repairRoadDamage(edge.id)).toBe(false);
    city.money = 1_000_000;
    expect(city.repairRoadDamage(edge.id)).toBe(true);
    expect(city.money).toBe(0);
    city.roadDamage.set(edge.id, city.day + 2); city.refresh();
    city.tick(); expect(city.roadDamage.has(edge.id)).toBe(true);
    city.tick(); expect(city.roadDamage.has(edge.id)).toBe(false);
  });

  it("保存・旧データ・不正データ・撤去を扱う", () => {
    const { city, edge } = prepared();
    city.roadDamage.set(edge.id, city.day + 8);
    const data = city.toData();
    expect(City.fromData(data).roadDamage.get(edge.id)).toBe(city.day + 8);
    const old = { ...data }; delete old.roadDamage;
    expect(City.fromData(old).roadDamage.size).toBe(0);
    expect(() => City.fromData({ ...data, roadDamage: [[999999, 10]] })).toThrow();
    expect(() => City.fromData({ ...data, roadDamage: [[edge.id, 10], [edge.id, 11]] })).toThrow();
    city.graph.removeEdge(edge.id); city.syncRoads();
    expect(city.roadDamage.size).toBe(0);
    expect(city.toData().roadDamage).toEqual([]);
  });
});
