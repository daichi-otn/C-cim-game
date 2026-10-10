import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph, isAccessEdge } from "../src/sim/roadGraph";
import { ROAD_SPECS, RoadType } from "../src/sim/roadTypes";
import { STRUCTURE_SPECS, Structure, planPath } from "../src/sim/structures";
import { Tile, tileAt } from "../src/sim/terrain";
import { SEED } from "./helpers";

/** 横方向に「陸 → 指定の地形が len タイル → 陸」と並ぶ場所を探す (len が min〜max)。 */
function findCrossing(kind: Tile, min: number, max: number) {
  const land = (t: Tile) => t !== Tile.Water && t !== Tile.Mountain;
  for (let y = -200; y < 200; y++) {
    for (let x = -200; x < 200; x++) {
      if (!land(tileAt(SEED, x, y)) || tileAt(SEED, x + 1, y) !== kind) continue;
      let k = 1;
      while (tileAt(SEED, x + 1 + k, y) === kind && k <= max + 1) k++;
      if (k < min || k > max || !land(tileAt(SEED, x + 1 + k, y))) continue;
      // 前後 2 タイルは陸 (道路の端をおける)
      if (![x - 2, x - 1, x + 2 + k, x + 3 + k].every((tx) => land(tileAt(SEED, tx, y)))) continue;
      return { x, y, len: k };
    }
  }
  return null;
}
const water = findCrossing(Tile.Water, 3, 8);
const tunnel = findCrossing(Tile.Mountain, 3, 8);
const pts = (c: { x: number; y: number; len: number }) => [{ x: c.x - 1.5 + 0.5, y: c.y + 0.5 }, { x: c.x + c.len + 3.5, y: c.y + 0.5 }];

describe("経路の分割", () => {
  it("水を渡る道は「陸 → 橋 → 陸」に分かれる", () => {
    expect(water).toBeTruthy();
    const plan = planPath(SEED, pts(water!));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pieces.map((p) => p.structure)).toEqual([Structure.None, Structure.Bridge, Structure.None]);
    expect(plan.bridge).toBeGreaterThanOrEqual(water!.len - 1);
    expect(plan.bridge).toBeLessThanOrEqual(water!.len + 1);
    expect(plan.tunnel).toBe(0);
    expect(plan.pieces[1]!.run).toBe(1);
    expect(plan.pieces[0]!.run).toBe(0);
  });
  it("山を抜ける道は「陸 → トンネル → 陸」に分かれる", () => {
    expect(tunnel).toBeTruthy();
    const plan = planPath(SEED, pts(tunnel!));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pieces.map((p) => p.structure)).toEqual([Structure.None, Structure.Tunnel, Structure.None]);
  });
  it("陸だけの道は 1 区間のまま", () => {
    const plan = planPath(SEED, [{ x: water!.x - 6.5, y: water!.y + 0.5 }, { x: water!.x - 1.5, y: water!.y + 0.5 }]);
    expect(plan.ok && plan.pieces.length).toBe(1);
  });
  it("水や山の中から始めたり終えたりはできない", () => {
    const w = water!;
    expect(planPath(SEED, [{ x: w.x + 1.5, y: w.y + 0.5 }, { x: w.x - 3.5, y: w.y + 0.5 }]).ok).toBe(false);
    expect(planPath(SEED, [{ x: w.x - 3.5, y: w.y + 0.5 }, { x: w.x + 1.5, y: w.y + 0.5 }]).ok).toBe(false);
    expect(planPath(SEED, [{ x: 0.5, y: 0.5 }]).ok).toBe(false);
  });
  it("長すぎる橋は渡れない", () => {
    const wide = findCrossing(Tile.Water, STRUCTURE_SPECS[Structure.Bridge].maxLength + 2, 60);
    if (!wide) return; // この地図に、それほど広い水がなければ確かめない
    const plan = planPath(SEED, pts(wide));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain("橋");
  });
});

describe("橋とトンネルを敷く", () => {
  it("橋の区間は 3 倍の建設費になり、橋の印がつく", () => {
    const city = new City(SEED);
    const p = pts(water!);
    const q = city.quotePath(p, RoadType.Street);
    expect(q.ok).toBe(true);
    const base = ROAD_SPECS[RoadType.Street].cost;
    const landLen = Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y) - q.bridge;
    expect(Math.abs(q.cost - (landLen * base + q.bridge * base * 3))).toBeLessThan(5);
    const m = city.money;
    expect(city.buildPath(p, RoadType.Street)).toBe(true);
    expect(m - city.money).toBe(q.cost);
    const kinds = [...city.graph.edges.values()].map((e) => e.structure);
    expect(kinds.filter((k) => k === Structure.Bridge).length).toBe(1);
    expect(kinds.filter((k) => k === Structure.None).length).toBe(2);
  });
  it("トンネルは 4 倍", () => {
    const city = new City(SEED);
    const q = city.quotePath(pts(tunnel!), RoadType.Street);
    expect(q.ok).toBe(true);
    expect(q.tunnel).toBeGreaterThan(0);
    const base = ROAD_SPECS[RoadType.Street].cost;
    const p = pts(tunnel!);
    const total = Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y);
    expect(Math.abs(q.cost - ((total - q.tunnel) * base + q.tunnel * base * 4))).toBeLessThan(5);
  });
  it("維持費も橋は 2 倍", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0, RoadType.Street, false, 0, Structure.None);
    const plain = g.totalUpkeep();
    const h = new RoadGraph();
    h.addRoad(0, 0, 10, 0, RoadType.Street, false, 1, Structure.Bridge);
    expect(h.totalUpkeep()).toBeCloseTo(plain * STRUCTURE_SPECS[Structure.Bridge].upkeepMult, 6);
  });
  it("敷けない経路は何も変えず false", () => {
    const city = new City(SEED);
    const w = water!;
    expect(city.buildPath([{ x: w.x + 1.5, y: w.y + 0.5 }, { x: w.x - 3.5, y: w.y + 0.5 }])).toBe(false);
    expect(city.graph.edges.size).toBe(0);
    expect(city.quotePath([{ x: w.x + 1.5, y: w.y + 0.5 }, { x: w.x - 3.5, y: w.y + 0.5 }]).reason).toBeTruthy();
  });
  it("橋の撤去は橋の区間だけが一緒に消え、両側の道路は残る", () => {
    const city = new City(SEED);
    city.buildPath(pts(water!));
    const bridge = [...city.graph.edges.values()].find((e) => e.structure === Structure.Bridge)!;
    expect(city.graph.removeChain(bridge.id)).toBeGreaterThanOrEqual(1);
    expect([...city.graph.edges.values()].every((e) => e.structure === Structure.None)).toBe(true);
    expect(city.graph.edges.size).toBe(2);
  });
  it("橋の途中では、ほかの道路と交差できない (橋の端での接続はできる)", () => {
    const city = new City(SEED);
    const w = water!;
    city.buildPath(pts(w));
    const before = city.graph.edges.size;
    // 橋を縦に横切る道路 (水の上なので、ここも橋になる)
    const midX = w.x + 1 + w.len / 2;
    const cross = [{ x: midX, y: w.y - 3.5 }, { x: midX, y: w.y + 4.5 }];
    const q = city.quotePath(cross);
    if (planPath(SEED, cross).ok) {
      expect(q.ok).toBe(false);
      expect(city.buildPath(cross)).toBe(false);
      expect(city.graph.edges.size).toBe(before);
    }
    // 橋の手前の陸で枝分かれするのは、ふつうにできる
    const branch = [{ x: w.x - 0.5, y: w.y + 0.5 }, { x: w.x - 0.5, y: w.y - 2.5 }];
    expect(planPath(SEED, branch).ok).toBe(true);
    expect(city.buildPath(branch)).toBe(true);
  });
  it("橋・トンネルは建物の出入口にならない", () => {
    const city = new City(SEED);
    city.buildPath(pts(water!));
    for (const e of city.graph.edges.values()) expect(isAccessEdge(e)).toBe(e.structure === Structure.None);
  });
  it("橋でつながった岸は、同じ道路網になる", () => {
    const city = new City(SEED);
    city.buildPath(pts(water!));
    expect(new Set(city.graph.components().values()).size).toBe(1);
  });
});

describe("保存", () => {
  it("橋の印も保存され、古いデータは普通の道路になり、不正な値は拒否する", () => {
    const city = new City(SEED);
    city.buildPath(pts(water!));
    const back = RoadGraph.fromData(JSON.parse(JSON.stringify(city.graph.toData())));
    expect([...back.edges.values()].filter((e) => e.structure === Structure.Bridge).length).toBe(1);
    const old = city.graph.toData();
    old.edges = old.edges.map(([id, a, b]) => [id, a, b]);
    expect([...RoadGraph.fromData(old).edges.values()].every((e) => e.structure === Structure.None)).toBe(true);
    const bad = city.graph.toData();
    bad.edges = bad.edges.map(([id, a, b, t, o, c]) => [id, a, b, t, o, c, 9]);
    expect(() => RoadGraph.fromData(bad)).toThrow();
  });
});
