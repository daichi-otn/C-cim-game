import { describe, expect, it } from "vitest";
import { emergencyRoute } from "../src/sim/emergencyRoute";
import { RoadGraph } from "../src/sim/roadGraph";
import { RoadType } from "../src/sim/roadTypes";

describe("緊急車両の経路", () => {
  it("同一区間の部分経路と一方通行を扱う", () => {
    const graph = new RoadGraph(); graph.addRoad(0, 0, 10, 0, RoadType.Street, true);
    const edge = [...graph.edges.values()][0]!;
    expect(emergencyRoute(graph, { x: 2, y: 1 }, { x: 8, y: 1 })).toEqual([{ edge: edge.id, from: 0.2, to: 0.8 }]);
    expect(emergencyRoute(graph, { x: 8, y: 1 }, { x: 2, y: 1 })).toBeNull();
  });
  it("交差点を通り、遠回りでも一方通行に沿う", () => {
    const graph = new RoadGraph();
    graph.addRoad(0, 0, 10, 0, RoadType.Street, true);
    graph.addRoad(10, 0, 10, 10, RoadType.Street, true);
    graph.addRoad(10, 10, 0, 10, RoadType.Street, true);
    graph.addRoad(0, 10, 0, 0, RoadType.Street, true);
    const route = emergencyRoute(graph, { x: 8, y: 0 }, { x: 2, y: 0 });
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThanOrEqual(4);
    expect(route!.every((s) => s.to >= s.from)).toBe(true);
  });
  it("車が通れない道路と離れた道路では出動できない", () => {
    const graph = new RoadGraph(); graph.addRoad(0, 0, 10, 0, RoadType.Footpath);
    expect(emergencyRoute(graph, { x: 1, y: 0 }, { x: 9, y: 0 })).toBeNull();
    graph.addRoad(20, 0, 30, 0);
    expect(emergencyRoute(graph, { x: 21, y: 0 }, { x: 100, y: 0 })).toBeNull();
  });
});
