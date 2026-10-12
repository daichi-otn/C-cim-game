import { describe, expect, it } from "vitest";
import { craneMotion, trapezoid } from "../src/render/craneMotion";

describe("クレーンの動き", () => {
  it("台形の動きは、0 から 1 まで、途中で止まらずに進む", () => {
    expect(trapezoid(0)).toBe(0);
    expect(trapezoid(1)).toBeCloseTo(1, 9);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = trapezoid(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("旋回・フック・吊り具は 0〜1 に収まり、荷は振れても 1 を超えない", () => {
    for (let i = 0; i <= 200; i++) {
      const c = craneMotion(i / 200);
      for (const v of [c.slew, c.trolley, c.hook]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(c.sway)).toBeLessThanOrEqual(0.4);
    }
  });
  it("旋回の間に、吊り具も腕の先へ動く", () => {
    const mid = craneMotion(0.3);
    expect(mid.slew).toBeGreaterThan(0);
    expect(mid.trolley).toBeGreaterThan(0);
  });
  it("荷を下ろしたあと振れが残り、やがて収まる", () => {
    expect(Math.abs(craneMotion(0.5).sway)).toBeGreaterThan(0);
    expect(Math.abs(craneMotion(0.99).sway)).toBeLessThan(Math.abs(craneMotion(0.5).sway) + 0.01);
  });
});
