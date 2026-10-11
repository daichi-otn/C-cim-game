import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { DEFAULT_LANE_COUNT, RoadType, roadCapacity } from "../src/sim/roadTypes";

describe("車線の数と容量", () => {
  it("車線が 2 倍になれば、容量も 2 倍 (既定の 2 車線が 1 倍)", () => {
    const base = roadCapacity(RoadType.Avenue, false, 0, DEFAULT_LANE_COUNT);
    expect(roadCapacity(RoadType.Avenue, false, 0, 4)).toBe(base * 2);
    expect(roadCapacity(RoadType.Avenue, false, 0)).toBe(base);
  });
  it("道路を引くとき車線の数を決められ、保存すると残る", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, false, 0, 0, 0, 8);
    const e = [...g.edges.values()][0]!;
    expect(e.laneCount).toBe(8);
    const back = RoadGraph.fromData(g.toData());
    expect([...back.edges.values()][0]!.laneCount).toBe(8);
  });
  it("古いデータ (車線の数がない) は、2 車線として読む", () => {
    const g = RoadGraph.fromData({ nextId: 3, nodes: [[1, 0, 0], [2, 10, 0]], edges: [[1, 1, 2, RoadType.Street, 0, 0, 0, 0]] });
    expect([...g.edges.values()][0]!.laneCount).toBe(DEFAULT_LANE_COUNT);
  });
  it("範囲 (2〜20) の外の車線の数は、読み込めない", () => {
    const bad = (n: number) => () => RoadGraph.fromData({ nextId: 3, nodes: [[1, 0, 0], [2, 10, 0]], edges: [[1, 1, 2, RoadType.Street, 0, 0, 0, 0, n]] });
    expect(bad(1)).toThrow();
    expect(bad(21)).toThrow();
    expect(bad(20)).not.toThrow();
  });
  it("車線を増やすと、建設費も増える", () => {
    const city = new City(1);
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const two = city.quotePath(pts, RoadType.Street, false, 0, 2).cost;
    const eight = city.quotePath(pts, RoadType.Street, false, 0, 8).cost;
    expect(eight).toBeCloseTo(two * 4, 6);
  });
});
