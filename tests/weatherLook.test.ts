import { describe, expect, it } from "vitest";
import { DAYS_PER_YEAR } from "../src/sim/weather";
import { WEATHER_LOOK, WeatherBlend, leafLook, seasonTint, snowCover } from "../src/render/weatherLook";

describe("季節の見た目", () => {
  it("季節の中心の日では、その季節の色になる (冬がいちばん濃い)", () => {
    expect(seasonTint(45).color).toBe(0xffd6e8);
    expect(seasonTint(135).color).toBe(0xffe08a);
    expect(seasonTint(225).color).toBe(0xff8a2a);
    expect(seasonTint(315).color).toBe(0xd8e6ff);
    expect(seasonTint(315).alpha).toBeGreaterThan(seasonTint(45).alpha);
  });

  it("季節の変わり目はなめらかにつながり、1 年で一周する", () => {
    expect(seasonTint(DAYS_PER_YEAR + 45)).toEqual(seasonTint(45));
    const a = seasonTint(89).alpha;
    const b = seasonTint(90).alpha;
    expect(Math.abs(a - b)).toBeLessThan(0.005);
    // 冬 → 春 (年をまたぐ) も途切れない
    expect(Math.abs(seasonTint(359).alpha - seasonTint(360).alpha)).toBeLessThan(0.005);
  });

  it("木の葉は、春は花・秋は紅葉・冬は雪の色で、冬がいちばん濃い", () => {
    expect(leafLook(45).c1).toBe(0xf6b8d0);
    expect(leafLook(225).c1).toBe(0xe8892b);
    expect(leafLook(315).c1).toBe(0xffffff);
    expect(leafLook(315).alpha).toBeGreaterThan(leafLook(135).alpha);
  });

  it("屋根の雪は冬だけ積もり、冬の初めと終わりは薄い", () => {
    expect(snowCover(0)).toBe(0);
    expect(snowCover(135)).toBe(0);
    expect(snowCover(269)).toBe(0);
    expect(snowCover(270)).toBe(0);
    expect(snowCover(315)).toBe(1);
    expect(snowCover(280)).toBeGreaterThan(0);
    expect(snowCover(280)).toBeLessThan(1);
    expect(snowCover(DAYS_PER_YEAR - 1)).toBe(0);
    expect(snowCover(DAYS_PER_YEAR + 315)).toBe(1);
  });
});

describe("天気の見た目", () => {
  it("雨は雨粒、雪は雪の粒、晴れとくもりは粒なし。雨は風が強い", () => {
    expect(WEATHER_LOOK.rain.rain).toBe(1);
    expect(WEATHER_LOOK.snow.snow).toBe(1);
    expect(WEATHER_LOOK.clear.rain + WEATHER_LOOK.clear.snow + WEATHER_LOOK.cloudy.rain + WEATHER_LOOK.cloudy.snow).toBe(0);
    expect(WEATHER_LOOK.rain.wind).toBeGreaterThan(WEATHER_LOOK.clear.wind);
    expect(WEATHER_LOOK.rain.overcast.alpha).toBeGreaterThan(WEATHER_LOOK.cloudy.overcast.alpha);
  });

  it("天気が変わると、少しずつ切り替わる", () => {
    const b = new WeatherBlend();
    b.snap("clear");
    b.update("rain", 0.2);
    expect(b.rain).toBeGreaterThan(0);
    expect(b.rain).toBeLessThan(1);
    for (let i = 0; i < 100; i++) b.update("rain", 0.1);
    expect(b.rain).toBeCloseTo(1, 3);
    for (let i = 0; i < 100; i++) b.update("clear", 0.1);
    expect(b.rain).toBeCloseTo(0, 3);
    expect(b.overcastAlpha).toBeCloseTo(0, 3);
  });

  it("snap はすぐ切り替える", () => {
    const b = new WeatherBlend();
    b.snap("snow");
    expect(b.snow).toBe(1);
    expect(b.rain).toBe(0);
  });
});
