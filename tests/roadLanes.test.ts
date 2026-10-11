import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { LANE, RoadType, roadCapacity, roadSpeed } from "../src/sim/roadTypes";
import { findLand } from "./helpers";

describe("車線の種類", () => {
  it("車線のない道路は、今までと同じ容量と速さ", () => {
    expect(roadCapacity(RoadType.Street, false)).toBe(roadCapacity(RoadType.Street, false, 0));
    expect(roadSpeed(RoadType.Street, false)).toBe(roadSpeed(RoadType.Street, false, 0));
  });

  it("中央分離帯は容量を増やし、路上駐車は容量を減らす", () => {
    const base = roadCapacity(RoadType.Arterial, false);
    expect(roadCapacity(RoadType.Arterial, false, LANE.Median)).toBeGreaterThan(base);
    expect(roadCapacity(RoadType.Arterial, false, LANE.Parking)).toBeLessThan(base);
  });

  it("車線を組み合わせると、倍率が掛け合わさる", () => {
    const one = roadCapacity(RoadType.Street, false, LANE.Parking);
    const both = roadCapacity(RoadType.Street, false, LANE.Parking | LANE.Bus);
    expect(both).toBeLessThan(one);
  });

  it("車線の種類は、保存して読み込むと残る。古いデータは車線なし", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, false, 0, 0, LANE.Bike | LANE.Median);
    const back = RoadGraph.fromData(JSON.parse(JSON.stringify(g.toData())));
    expect([...back.edges.values()].map((e) => e.lanes)).toEqual([LANE.Bike | LANE.Median]);
    const old = JSON.parse(JSON.stringify(g.toData()));
    old.edges = old.edges.map((e: unknown[]) => e.slice(0, 7));
    expect([...RoadGraph.fromData(old).edges.values()].every((e) => e.lanes === 0)).toBe(true);
  });

  it("不正な車線の値は拒否する", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, false, 0, 0, LANE.Bike);
    const bad = JSON.parse(JSON.stringify(g.toData()));
    bad.edges[0][7] = 99;
    expect(() => RoadGraph.fromData(bad)).toThrow();
  });

  it("車線つきの道路を分けても、車線は残る", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildPath([{ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 20.5, y: y0 + 0.5 }], RoadType.Street, false, LANE.Parking);
    city.buildPath([{ x: x0 + 10.5, y: y0 - 4.5 }, { x: x0 + 10.5, y: y0 + 0.5 }], RoadType.Street, false, 0);
    const parked = [...city.graph.edges.values()].filter((e) => e.lanes === LANE.Parking);
    expect(parked.length).toBeGreaterThanOrEqual(2);
  });
});
