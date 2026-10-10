import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { curvePoints } from "../src/sim/roadPlacement";
import { ROAD_SPECS, RoadType } from "../src/sim/roadTypes";
import { edgeCongestion } from "../src/sim/traffic";
import { SEED, findLand, setup } from "./helpers";

const lengthOf = (g: RoadGraph, ids: number[]) =>
  ids.reduce((s, id) => {
    const e = g.edges.get(id)!;
    const a = g.nodes.get(e.a)!;
    const b = g.nodes.get(e.b)!;
    return s + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
const leftmost = (g: RoadGraph) => [...g.edges.values()].reduce((m, e) => (Math.min(g.nodes.get(e.a)!.x, g.nodes.get(e.b)!.x) < Math.min(g.nodes.get(m.a)!.x, g.nodes.get(m.b)!.x) ? e : m));

describe("ひとつながりの道路", () => {
  it("交差点で分かれていても、まっすぐ続く区間は同じ道路。交わる道路は別", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 20, 0);
    g.addRoad(10, -5, 10, 5); // 十字に交わる
    expect(g.edges.size).toBe(4);
    const run = g.roadRun(leftmost(g).id);
    expect(run).toHaveLength(2);
    expect(lengthOf(g, run)).toBeCloseTo(20, 6);
  });
  it("T 字の枝は別の道路", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 20, 0);
    g.addRoad(10, 0, 10, 6);
    const run = g.roadRun(leftmost(g).id);
    expect(lengthOf(g, run)).toBeCloseTo(20, 6);
  });
  it("直角に曲がる所では、続かない", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    g.addRoad(10, 0, 10, 10);
    expect(g.roadRun(leftmost(g).id)).toHaveLength(1);
  });
  it("ゆるい角度なら続く", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    g.addRoad(10, 0, 20, 2); // 約 11 度
    expect(g.roadRun(leftmost(g).id)).toHaveLength(2);
  });
  it("種類・一方通行の有無・橋の別が違う区間では止まる", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street);
    g.addRoad(10, 0, 20, 0, RoadType.Avenue);
    expect(g.roadRun(leftmost(g).id)).toHaveLength(1);
    const h = new RoadGraph();
    h.addRoad(0, 0, 10, 0, RoadType.Street);
    h.addRoad(10, 0, 20, 0, RoadType.Street, true);
    expect(h.roadRun(leftmost(h).id)).toHaveLength(1);
  });
  it("曲線は、折れ曲がりが急でも全体が同じ道路", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const pts = curvePoints({ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 14.5, y: y0 + 0.5 }, { x: x0 + 14.5, y: y0 + 14.5 });
    city.buildPath(pts);
    const first = [...city.graph.edges.values()][0]!;
    expect(city.graph.roadRun(first.id)).toHaveLength(city.graph.edges.size);
  });
  it("存在しない区間は空", () => {
    expect(new RoadGraph().roadRun(5)).toEqual([]);
  });
});

describe("道路のアップグレード", () => {
  function town() {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 20.5, y0 + 0.5, RoadType.Street);
    city.buildRoad(x0 + 10.5, y0 - 4.5, x0 + 10.5, y0 + 4.5, RoadType.Street); // 十字
    return { city, x0, y0 };
  }
  it("費用は建設費の差額 × 長さで、変わる区間の数も分かる。見積もりは何も変えない", () => {
    const { city } = town();
    const id = leftmost(city.graph).id;
    const q = city.quoteUpgrade(id, RoadType.Avenue);
    expect(q.sections).toBe(2);
    expect(q.cost).toBe(20 * (ROAD_SPECS[RoadType.Avenue].cost - ROAD_SPECS[RoadType.Street].cost));
    expect([...city.graph.edges.values()].every((e) => e.type === RoadType.Street)).toBe(true);
  });
  it("ひとつながりの道路だけが変わり、お金が引かれる。交わる道路はそのまま", () => {
    const { city } = town();
    const m = city.money;
    const q = city.quoteUpgrade(leftmost(city.graph).id, RoadType.Avenue);
    expect(city.upgradeRoad(leftmost(city.graph).id, RoadType.Avenue)).toBe(true);
    expect(m - city.money).toBe(q.cost);
    const avenue = [...city.graph.edges.values()].filter((e) => e.type === RoadType.Avenue);
    expect(avenue).toHaveLength(2);
    expect(lengthOf(city.graph, avenue.map((e) => e.id))).toBeCloseTo(20, 6);
    expect([...city.graph.edges.values()].filter((e) => e.type === RoadType.Street)).toHaveLength(2);
  });
  it("安い種類への変更は無料で、返金もない。同じ種類なら何も起きない", () => {
    const { city } = town();
    const id = leftmost(city.graph).id;
    const m = city.money;
    expect(city.upgradeRoad(id, RoadType.Lane)).toBe(true);
    expect(city.money).toBe(m);
    expect(city.quoteUpgrade(id, RoadType.Lane).sections).toBe(0);
    expect(city.upgradeRoad(id, RoadType.Lane)).toBe(false);
  });
  it("お金が足りなければ変えない", () => {
    const { city } = town();
    city.money = 1000;
    expect(city.upgradeRoad(leftmost(city.graph).id, RoadType.Highway)).toBe(false);
    expect([...city.graph.edges.values()].every((e) => e.type === RoadType.Street)).toBe(true);
  });
  it("一方通行の向きや曲線の番号は変わらない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5, RoadType.Street, true);
    const before = [...city.graph.edges.values()][0]!;
    const dir = before.oneWay;
    city.upgradeRoad(before.id, RoadType.Avenue);
    const after = [...city.graph.edges.values()][0]!;
    expect(after.type).toBe(RoadType.Avenue);
    expect(after.oneWay).toBe(dir);
  });
  it("容量が増えるので、混んだ道路を太くすると混雑が和らぐ", () => {
    const { city, roadY } = (() => {
      const t = setup();
      return { city: t.city, roadY: t.roadY };
    })();
    for (let i = 0; i < 300; i++) city.tick();
    const peak = (c: City) => Math.max(0, ...[...c.traffic.flow].map(([id, f]) => edgeCongestion(c.graph, id, f)));
    const before = peak(city);
    expect(before).toBeGreaterThan(0);
    const main = [...city.graph.edges.values()].find((e) => Math.abs(city.graph.nodes.get(e.a)!.y - (roadY + 0.5)) < 1e-6)!;
    expect(city.upgradeRoad(main.id, RoadType.Arterial)).toBe(true);
    city.refresh();
    expect(peak(city)).toBeLessThan(before);
  });
});
