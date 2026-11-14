import { describe, expect, it } from "vitest";
import { RoadGraph } from "../src/sim/roadGraph";
import { RoadType, LANE } from "../src/sim/roadTypes";
import { movementOf, restrictionFactors, turnDelaySeconds, turnLaneOffset } from "../src/sim/trafficReality";
import { calcTraffic } from "../src/sim/traffic";
import { setup } from "./helpers";

function cross(): { graph: RoadGraph; center: number; west: number; east: number; north: number; south: number } {
  const graph = new RoadGraph();
  graph.addRoad(0, 5, 10, 5, RoadType.Street);
  graph.addRoad(5, 0, 5, 10, RoadType.Street);
  const center = [...graph.nodes.values()].find((n) => n.x === 5 && n.y === 5)!.id;
  const edgeTo = (x: number, y: number) => [...graph.edges.values()].find((e) => {
    const a = graph.nodes.get(e.a)!; const b = graph.nodes.get(e.b)!;
    return (a.id === center && b.x === x && b.y === y) || (b.id === center && a.x === x && a.y === y);
  })!.id;
  return { graph, center, west: edgeTo(0, 5), east: edgeTo(10, 5), north: edgeTo(5, 0), south: edgeTo(5, 10) };
}

describe("M22 の右左折モデル", () => {
  it("交差点で左折・直進・右折・Uターンを判定する", () => {
    const { graph, center, west, east, north, south } = cross();
    expect(movementOf(graph, center, { edge: west, dir: 1 }, { edge: south, dir: 1 })).toBe("right");
    expect(movementOf(graph, center, { edge: west, dir: 1 }, { edge: north, dir: -1 })).toBe("left");
    expect(movementOf(graph, center, { edge: west, dir: 1 }, { edge: east, dir: 1 })).toBe("straight");
    expect(movementOf(graph, center, { edge: west, dir: 1 }, { edge: west, dir: -1 })).toBe("uturn");
  });

  it("右折とUターンほど待ち時間が長く、曲がる側へ車線を寄せる", () => {
    expect(turnDelaySeconds("right")).toBeGreaterThan(turnDelaySeconds("left"));
    expect(turnDelaySeconds("uturn")).toBeGreaterThan(turnDelaySeconds("right"));
    expect(turnLaneOffset("left", { lanes: 0 })).toBeLessThan(0);
    expect(turnLaneOffset("right", { lanes: 0 })).toBeGreaterThan(0);
    expect(turnLaneOffset("right", { lanes: LANE.Bus })).toBeLessThan(turnLaneOffset("right", { lanes: 0 }));
  });
});

describe("M22 の通行規制", () => {
  it("事故・工事の期間と倍率を検証し、終了後に通常へ戻す", () => {
    const restriction = { kind: "construction" as const, until: 5, capacity: 0.35, speed: 0.5 };
    expect(restrictionFactors(restriction, 4)).toEqual({ capacity: 0.35, speed: 0.5, closed: false });
    expect(restrictionFactors(restriction, 5).closed).toBe(false);
    expect(restrictionFactors({ ...restriction, capacity: 0 }, 4).closed).toBe(true);
  });

  it("通行止めの道路を交通量の経路から外す", () => {
    const { city } = setup();
    for (let i = 0; i < 120; i++) city.tick();
    city.refresh();
    const edge = [...city.graph.edges.values()][0]!;
    const restrictions = new Map([[edge.id, { kind: "accident" as const, until: city.day + 3, capacity: 0, speed: 0 }]]);
    const traffic = calcTraffic(city.graph, city.zones, 1, new Map(), restrictions, city.day);
    expect(traffic.flow.has(edge.id)).toBe(false);
  });
});

