import { describe, expect, it } from "vitest";
import { BLOCK_TILES, LOOP_STEP, METERS_PER_TILE, planLoop } from "../src/sim/loopPlan";
import { City } from "../src/sim/city";
import { findLand } from "./helpers";

describe("四角い道路の枠", () => {
  it("辺は区画と道路の幅 (7 マス) の倍数になり、角は道路の中心に揃う", () => {
    const p = planLoop({ x: 2.2, y: 2.9 }, { x: 19.1, y: 16.4 }, false);
    expect(p.sideMeters[0]! / METERS_PER_TILE).toBe(LOOP_STEP * 2);
    for (const c of p.corners) {
      expect(c.x % 1).toBe(0.5);
      expect(c.y % 1).toBe(0.5);
    }
  });

  it("区画ごとに区切りが入り、区切りの間の区画はちょうど 6 マス", () => {
    const p = planLoop({ x: 0, y: 0 }, { x: 28, y: 7 }, true);
    expect(p.dividers.length).toBe(3); // 4 区画 → 区切り 3 本
    const xs = p.dividers.map((d) => d[0]!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBe(BLOCK_TILES + 1);
    // 区画の幅 = 道路の中心どうしの間隔 - 道路 1 マス
    expect(xs[0]! - p.corners[0]!.x - 1).toBe(BLOCK_TILES);
  });

  it("区切りなしなら、区切りは 0 本", () => {
    expect(planLoop({ x: 0, y: 0 }, { x: 28, y: 14 }, false).dividers).toHaveLength(0);
  });

  it("小さい枠は、1 区画 (6 マス) ぶんになる", () => {
    const p = planLoop({ x: 0, y: 0 }, { x: 1, y: 2 }, true);
    expect(p.ok).toBe(true);
    expect(p.sideMeters[0]! / METERS_PER_TILE).toBe(LOOP_STEP);
    expect(p.dividers).toHaveLength(0);
  });
});

describe("四角い道路の敷設", () => {
  it("閉じた枠と区切りを敷くと、区切りの分だけ道路が増える", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    const plan = planLoop({ x: x0 + 2, y: y0 + 2 }, { x: x0 + 2 + 2 * LOOP_STEP, y: y0 + 2 + LOOP_STEP }, true);
    expect(city.buildPath([...plan.corners, plan.corners[0]!])).toBe(true);
    const ring = city.graph.edges.size;
    for (const d of plan.dividers) expect(city.buildPath(d)).toBe(true);
    expect(city.graph.edges.size).toBeGreaterThan(ring);
  });
});
