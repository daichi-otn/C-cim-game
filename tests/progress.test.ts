import { describe, expect, it } from "vitest";
import { milestonesOf, nextGoalOf, statisticsOf } from "../src/sim/progress";

function source(population = 120) {
  return {
    zones: { totals: () => ({ population }), stats: () => ({ R: { buildings: 12 } }) },
    facilities: new Map([[1, { size: 2 }], [2, { size: 2 }], [3, { size: 2 }]]),
    graph: { edges: new Map(Array.from({ length: 24 }, (_, i) => [i, {}])) },
    money: 123456,
    demand: { r: 0.4, c: 0.2, i: -0.1, o: 0.3 },
    health: { meanRisk: 0.1, sick: 0 },
    traffic: { jammed: 0, flow: 24 },
  };
}

describe("M14 統計と目標", () => {
  it("現在の街から統計を作る", () => {
    const s = statisticsOf(source());
    expect(s.population).toBe(120);
    expect(s.facilities).toBe(3);
    expect(s.roads).toBe(24);
  });
  it("達成状況と次の目標を求める", () => {
    const s = statisticsOf(source());
    const ms = milestonesOf(s);
    expect(ms.find((m) => m.id === "population-100")?.done).toBe(true);
    expect(nextGoalOf(s, ms)).toContain("人口 500 人");
  });
});
