import { describe, expect, it } from "vitest";
import { DAYS_PER_YEAR } from "../src/sim/weather";
import { ERA_COUNT, ERA_YEARS, eraOf, styleIndex } from "../src/render3d/era";

describe("建てた年代 (時代)", () => {
  it("建った年ごとに時代が変わり、最後の時代で止まる", () => {
    expect(eraOf(0)).toBe(0);
    expect(eraOf((ERA_YEARS - 1) * DAYS_PER_YEAR)).toBe(0);
    expect(eraOf(ERA_YEARS * DAYS_PER_YEAR)).toBe(1);
    expect(eraOf(100 * DAYS_PER_YEAR)).toBe(ERA_COUNT - 1);
  });

  it("マイナスの日や不正な日でも落ちない", () => {
    expect(eraOf(-10)).toBe(0);
  });

  it("時代ごとに色の候補がずれ、候補の数の範囲に収まる", () => {
    const len = 5;
    for (const h of [0, 0.3, 0.99]) {
      const picks = [0, 1, 2].map((era) => styleIndex(len, h, era));
      expect(new Set(picks).size).toBe(3);
      for (const i of picks) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of picks) expect(i).toBeLessThan(len);
    }
  });
});
