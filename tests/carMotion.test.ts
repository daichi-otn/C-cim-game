import { describe, expect, it } from "vitest";
import { CAR, idmAccel, stepSpeed, stopSpeed, turnToward, wrapAngle } from "../src/render3d/carMotion";

describe("車の加速と減速", () => {
  it("空いている道では、目標の速さまで加速し、そこで止まる", () => {
    expect(idmAccel(0, 3, null, 0)).toBeGreaterThan(0);
    expect(Math.abs(idmAccel(3, 3, null, 0))).toBeLessThan(1e-9);
  });

  it("前の車が近いと、ブレーキをかける (負の加速度)", () => {
    expect(idmAccel(3, 3, 0.8, 0)).toBeLessThan(0);
  });

  it("前の車が遠いと、ほぼ加速できる", () => {
    expect(idmAccel(2, 3, 50, 2)).toBeGreaterThan(0);
  });

  it("速さは 0 より下にならない", () => {
    expect(stepSpeed(0.1, -CAR.decel, 1)).toBe(0);
  });

  it("止まるための速さは、残りの距離が短いほど遅い", () => {
    expect(stopSpeed(4)).toBeGreaterThan(stopSpeed(1));
    expect(stopSpeed(0)).toBe(0);
  });
});

describe("車の向き", () => {
  it("向きは、一度に変わらず、少しずつ回る (カーブ・U ターン)", () => {
    const h = turnToward(0, Math.PI, CAR.turnRate, 0.1);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(Math.PI);
  });

  it("目標の向きに、いずれ着く", () => {
    let h = 0;
    for (let i = 0; i < 200; i++) h = turnToward(h, Math.PI, CAR.turnRate, 0.05);
    expect(Math.abs(wrapAngle(h - Math.PI))).toBeLessThan(1e-6);
  });

  it("角度は −π〜π に収まる", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 9);
  });
});
