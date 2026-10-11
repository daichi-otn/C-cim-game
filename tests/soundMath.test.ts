import { describe, expect, it } from "vitest";
import { chatterLevel, falloff, HEAR_RANGE, panOf, TRAFFIC_VOLUME, trafficLevel } from "../src/audio/soundMath";

describe("音の大きさ (距離)", () => {
  it("近いほど大きく、範囲の外は 0", () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(HEAR_RANGE / 2)).toBeCloseTo(0.25, 9);
    expect(falloff(HEAR_RANGE)).toBe(0);
    expect(falloff(HEAR_RANGE + 5)).toBe(0);
    expect(falloff(3)).toBeGreaterThan(falloff(6));
  });
});

describe("音の左右", () => {
  const right = { x: 1, y: 0 };
  it("右にある音は右、左にある音は左から聞こえる", () => {
    expect(panOf(5, 0, right)).toBeGreaterThan(0);
    expect(panOf(-5, 0, right)).toBeLessThan(0);
    expect(panOf(0, 5, right)).toBe(0);
  });
  it("左右の位置は −1〜1 に収まる", () => {
    expect(panOf(100, 0, right)).toBe(1);
    expect(panOf(-100, 0, right)).toBe(-1);
  });
});

describe("にぎやかさ", () => {
  it("人が多いほど、話し声は大きく、0〜1 に収まる", () => {
    expect(chatterLevel(0)).toBe(0);
    expect(chatterLevel(60)).toBeGreaterThan(chatterLevel(10));
    expect(chatterLevel(10000)).toBe(1);
    expect(trafficLevel(0)).toBe(0);
    expect(trafficLevel(1000)).toBe(1);
    expect(TRAFFIC_VOLUME).toBeLessThanOrEqual(0.05);
  });
});

import { residentsNear } from "../src/audio/soundscape";
describe("近くの住民", () => {
  it("聞こえる範囲の中の住民だけを数える", () => {
    const cells = [
      { x: 0, y: 0, residents: 5 },
      { x: 3, y: 0, residents: 4 },
      { x: 100, y: 0, residents: 50 },
      { x: 1, y: 1, residents: 0 },
    ];
    expect(residentsNear(cells, 0, 0)).toBe(9);
  });
});
