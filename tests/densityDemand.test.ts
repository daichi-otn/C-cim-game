import { describe, expect, it } from "vitest";
import { densityDemand, DENSITY_TARGET_SHARE } from "../src/sim/densityDemand";

describe("密度ごとの需要", () => {
  it("建物がまだない街では、目標の割合の大きさで需要が決まる (低密度が一番高い)", () => {
    const d = densityDemand(0, [0, 0, 0, 0]);
    expect(d[0]!).toBeGreaterThan(d[1]!);
    expect(d[1]!).toBeGreaterThan(d[2]!);
    expect(d[2]!).toBeGreaterThan(d[3]!);
  });

  it("その密度が目標より多いと、需要は下がり、少ないと上がる", () => {
    const counts = [9, 0, 0, 0]; // 低密度ばかり
    const d = densityDemand(0, counts);
    expect(d[0]!).toBeLessThan(0); // 低密度は余っている
    expect(d[3]!).toBeGreaterThan(d[0]!);
  });

  it("区画の種類の需要は、すべての密度に効く", () => {
    const low = densityDemand(-0.5, [1, 1, 1, 1]);
    const high = densityDemand(0.5, [1, 1, 1, 1]);
    for (let i = 0; i < 4; i++) expect(high[i]!).toBeGreaterThan(low[i]!);
  });

  it("需要は -1〜1 に収まる", () => {
    for (const d of densityDemand(3, [0, 0, 0, 0])) expect(d).toBeLessThanOrEqual(1);
    for (const d of densityDemand(-3, [9, 0, 0, 0])) expect(d).toBeGreaterThanOrEqual(-1);
    expect(DENSITY_TARGET_SHARE.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
  });
});
