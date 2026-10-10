import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { RoadGraph } from "../src/sim/roadGraph";
import { CURVE_SEGMENT_LENGTH, curvePoints, isPathBuildable } from "../src/sim/roadPlacement";
import { ROAD_SPECS, RoadType } from "../src/sim/roadTypes";
import { SEED, findLand } from "./helpers";

const A = { x: 0.5, y: 0.5 };
const length = (pts: { x: number; y: number }[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

describe("曲線の形", () => {
  it("始点と終点はそのままで、細かい折れ線になる", () => {
    const pts = curvePoints(A, { x: 10.5, y: 0.5 }, { x: 10.5, y: 10.5 });
    expect(pts[0]).toEqual(A);
    expect(pts.at(-1)).toEqual({ x: 10.5, y: 10.5 });
    expect(pts.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(seg).toBeLessThanOrEqual(CURVE_SEGMENT_LENGTH * 1.3);
    }
  });
  it("制御点が直線上なら、まっすぐになる", () => {
    const pts = curvePoints(A, { x: 5.5, y: 0.5 }, { x: 10.5, y: 0.5 });
    for (const p of pts) expect(p.y).toBeCloseTo(0.5, 9);
    expect(length(pts)).toBeCloseTo(10, 6);
  });
  it("制御点を弦から離すほど、曲線は長くなり、制御点の側にふくらむ", () => {
    const flat = length(curvePoints(A, { x: 5.5, y: 0.5 }, { x: 10.5, y: 0.5 }));
    const bent = curvePoints(A, { x: 5.5, y: 8.5 }, { x: 10.5, y: 0.5 });
    expect(length(bent)).toBeGreaterThan(flat);
    expect(Math.max(...bent.map((p) => p.y))).toBeGreaterThan(3);
    expect(Math.min(...bent.map((p) => p.y))).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
  it("水の上を通る曲線は敷けない", () => {
    const [x0, y0] = findLand();
    expect(isPathBuildable(SEED, [{ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 5.5, y: y0 + 0.5 }])).toBe(true);
    expect(isPathBuildable(SEED, [{ x: -20.5, y: 0.5 }, { x: -12.5, y: 0.5 }])).toBe(false);
    expect(isPathBuildable(SEED, [])).toBe(false);
  });
});

describe("曲線の道路", () => {
  const curve = (x0: number, y0: number) => curvePoints({ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 12.5, y: y0 + 0.5 }, { x: x0 + 12.5, y: y0 + 12.5 });
  it("費用は折れ線の長さ × 種類ごとの建設費で、見積もりは街を変えない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const pts = curve(x0, y0);
    const q = city.quotePath(pts, RoadType.Avenue);
    // 区間ごとに切り上げるので、数円の差は出る
    expect(Math.abs(q.cost - length(pts) * ROAD_SPECS[RoadType.Avenue].cost)).toBeLessThan(pts.length);
    expect(q.sections).toBe(pts.length - 1);
    expect(city.graph.edges.size).toBe(0);
    const m = city.money;
    expect(city.buildPath(pts, RoadType.Avenue)).toBe(true);
    expect(m - city.money).toBe(q.cost);
    expect(city.graph.edges.size).toBe(pts.length - 1);
  });
  it("曲線の区間は同じ番号を持ち、直線には番号がない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildPath(curve(x0, y0));
    city.buildRoad(x0 + 20.5, y0 + 0.5, x0 + 30.5, y0 + 0.5);
    const chains = new Set([...city.graph.edges.values()].map((e) => e.chain));
    expect(chains.size).toBe(2);
    expect(chains.has(0)).toBe(true);
  });
  it("撤去すると曲線は一続きで消え、直線は 1 区間だけ消える", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const pts = curve(x0, y0);
    city.buildPath(pts);
    city.buildRoad(x0 + 20.5, y0 + 0.5, x0 + 22.5, y0 + 0.5);
    city.buildRoad(x0 + 22.5, y0 + 0.5, x0 + 24.5, y0 + 0.5);
    const first = [...city.graph.edges.values()][0]!;
    expect(city.graph.removeChain(first.id)).toBe(pts.length - 1);
    expect(city.graph.edges.size).toBe(2);
    const straight = [...city.graph.edges.values()][0]!;
    expect(city.graph.removeChain(straight.id)).toBe(1);
    expect(city.graph.edges.size).toBe(1);
  });
  it("曲線は交差する道路で分割されても、同じ番号のまま", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildPath(curve(x0, y0));
    const before = [...city.graph.edges.values()].length;
    city.buildRoad(x0 + 6.5, y0 - 3.5, x0 + 6.5, y0 + 4.5); // 曲線を横切る
    const chained = [...city.graph.edges.values()].filter((e) => e.chain !== 0);
    expect(chained.length).toBeGreaterThanOrEqual(before);
    expect(new Set(chained.map((e) => e.chain)).size).toBe(1);
  });
  it("保存して読み込むと番号も戻り、番号のない古いデータは曲線ではない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildPath(curve(x0, y0));
    const back = RoadGraph.fromData(JSON.parse(JSON.stringify(city.graph.toData())));
    expect([...back.edges.values()].every((e) => e.chain !== 0)).toBe(true);
    const old = city.graph.toData();
    old.edges = old.edges.map(([id, a, b]) => [id, a, b]);
    expect([...RoadGraph.fromData(old).edges.values()].every((e) => e.chain === 0)).toBe(true);
    const bad = city.graph.toData();
    bad.edges = bad.edges.map(([id, a, b, t, o]) => [id, a, b, t, o, -3]);
    expect(() => RoadGraph.fromData(bad)).toThrow();
  });
  it("お金が足りなければ敷けない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.money = 1000;
    expect(city.buildPath(curve(x0, y0))).toBe(false);
    expect(city.graph.edges.size).toBe(0);
  });
});
