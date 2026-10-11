import { describe, expect, it } from "vitest";
import { CAR, aheadGap, driverOf, idmAccel, LANE_OFFSET, nearestSegment, overlapsInLane, projectOnSegment, stepSpeed, stopSpeed, turnToward, wrapAngle, yieldsTo } from "../src/render3d/carMotion";

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

describe("道路が作り替わったときに、車の位置を合わせる", () => {
  it("線分の上の、一番近い位置を返す (端を越えたら端に収める)", () => {
    expect(projectOnSegment(5, 2, 0, 0, 10, 0)).toEqual({ t: 0.5, dist: 2 });
    expect(projectOnSegment(-3, 0, 0, 0, 10, 0).t).toBe(0);
  });
  it("交差点で分割されたら、車は位置が近い方の半分へ移る", () => {
    const segs = [
      { id: 1, ax: 0, ay: 0, bx: 5, by: 0 },
      { id: 2, ax: 5, ay: 0, bx: 10, by: 0 },
    ];
    expect(nearestSegment(7, 0.3, segs)).toEqual({ id: 2, t: 0.4 });
    expect(nearestSegment(1, -0.2, segs)?.id).toBe(1);
    expect(nearestSegment(0, 0, [])).toBeNull();
  });
});

describe("交差点で譲る", () => {
  it("相手の方が交差点に近い (先に着く) なら譲る", () => {
    expect(yieldsTo(2, 5, 1, 9)).toBe(true);
    expect(yieldsTo(1, 5, 2, 9)).toBe(false);
  });
  it("距離が同じときは番号の小さい方が先で、互いに譲り合わない", () => {
    expect(yieldsTo(1, 7, 1, 3)).toBe(true);
    expect(yieldsTo(1, 3, 1, 7)).toBe(false);
  });
});

describe("同じ車線で前の車との車間", () => {
  it("まっすぐ前にいる車との車間を、車の長さを引いて返す", () => {
    expect(aheadGap(0, 0, 0, 2, 0, 5)).toBeCloseTo(2 - 0.3, 9);
  });
  it("後ろの車や、見えない先の車は数えない", () => {
    expect(aheadGap(0, 0, 0, -2, 0, 5)).toBeNull();
    expect(aheadGap(0, 0, 0, 9, 0, 5)).toBeNull();
  });
  it("反対の車線の車は、横にずれているので数えない", () => {
    expect(aheadGap(0, 0, 0, 2, 2 * LANE_OFFSET, 5)).toBeNull();
  });
});

describe("重なった車", () => {
  it("同じ車線で、車の長さの中にあれば重なっている。隣の車線なら重なっていない", () => {
    expect(overlapsInLane(0, 0, 0, 0.1, 0)).toBe(true);
    expect(overlapsInLane(0, 0, 0, 0.5, 0)).toBe(false);
    expect(overlapsInLane(0, 0, 0, 0.1, 2 * LANE_OFFSET)).toBe(false);
  });
});

describe("運転の個性", () => {
  it("速さの好みは 0.85〜1.15、車間は車ごとに違う (詰めて走る車と、あけて走る車)", () => {
    const slow = driverOf(0);
    const fast = driverOf(1);
    expect(slow.pace).toBeCloseTo(0.85, 9);
    expect(fast.pace).toBeCloseTo(1.15, 9);
    expect(fast.headway).toBeLessThan(slow.headway);
    expect(driverOf(0.5).headway).toBeCloseTo(CAR.headway, 9);
  });
  it("車間を広く取る車は、同じ距離でより強く減速する", () => {
    expect(idmAccel(2, 3, 1, 2, 1.5)).toBeLessThan(idmAccel(2, 3, 1, 2, 0.5));
  });
});

