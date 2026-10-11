import { describe, expect, it } from "vitest";
import { buildSignalPlan, CYCLE_SEC, GREEN_SEC, lightOf, YELLOW_SEC } from "../src/sim/signals";
import { RoadGraph } from "../src/sim/roadGraph";
import { RoadType } from "../src/sim/roadTypes";

/** 十字路交差点: 東西と南北の道が (5,5) で交わる。交差点の場所を探して返す。 */
function cross(): { graph: RoadGraph; center: number } {
  const g = new RoadGraph();
  g.addRoad(0, 5, 10, 5, RoadType.Street);
  g.addRoad(5, 0, 5, 10, RoadType.Street);
  const center = [...g.nodes.values()].find((n) => n.x === 5 && n.y === 5)!.id;
  return { graph: g, center };
}

describe("信号の計画", () => {
  it("3 本以上つながる交差点には信号があり、東西と南北に組が分かれる", () => {
    const { graph, center } = cross();
    const plan = buildSignalPlan(graph);
    const m = plan.get(center)!;
    expect(m.size).toBe(4);
    const groups = [...m.values()];
    expect(groups.filter((g) => g === 0).length).toBe(2);
    expect(groups.filter((g) => g === 1).length).toBe(2);
  });
  it("道が 2 本だけの角には信号がない", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 5, 0, RoadType.Street);
    g.addRoad(5, 0, 5, 5, RoadType.Street);
    const corner = [...g.nodes.values()].find((n) => n.x === 5 && n.y === 0)!.id;
    expect(buildSignalPlan(g).has(corner)).toBe(false);
  });
});

describe("信号の色", () => {
  it("組 0 が青のとき、組 1 は赤。黄色を挟んで入れ替わる", () => {
    expect(lightOf(0, 1)).toBe("green");
    expect(lightOf(1, 1)).toBe("red");
    expect(lightOf(0, GREEN_SEC + 0.5)).toBe("yellow");
    expect(lightOf(1, GREEN_SEC + YELLOW_SEC + 1)).toBe("green");
    expect(lightOf(0, GREEN_SEC + YELLOW_SEC + 1)).toBe("red");
  });
  it("周期が過ぎると、同じ色に戻る", () => {
    expect(lightOf(0, 3)).toBe(lightOf(0, 3 + CYCLE_SEC));
  });
});
