import { describe, expect, it } from "vitest";
import { DAY_CYCLE_SEC, DayClock, START_HOUR, formatHour, lightingAt, mixColor } from "../src/render/lighting";

describe("時刻ごとの色合い", () => {
  it("昼は変化なし (白) で夜の度合いは 0、真夜中は暗く夜の度合いは 1", () => {
    expect(lightingAt(12)).toEqual({ color: 0xffffff, alpha: 0, night: 0 });
    expect(lightingAt(0).night).toBe(1);
    expect(lightingAt(0).alpha).toBeGreaterThan(0.4);
  });
  it("0 時と 24 時は同じ。範囲外は折り返す", () => {
    expect(lightingAt(24)).toEqual(lightingAt(0));
    expect(lightingAt(-1)).toEqual(lightingAt(23));
    expect(lightingAt(36)).toEqual(lightingAt(12));
  });
  it("朝と夕方は昼と夜のあいだで、なめらかにつながる", () => {
    let prev = lightingAt(0);
    for (let h = 0.1; h <= 24; h += 0.1) {
      const cur = lightingAt(h);
      expect(Math.abs(cur.night - prev.night)).toBeLessThan(0.15);
      prev = cur;
    }
    const dusk = lightingAt(19).night;
    expect(dusk).toBeGreaterThan(0.1);
    expect(dusk).toBeLessThan(0.9);
  });
  it("夜の度合いは 0〜1 に収まる", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const n = lightingAt(h).night;
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
  it("色の混ぜ方", () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});

describe("昼夜の時計", () => {
  it("auto では時間が進み、1 周で元に戻る", () => {
    const c = new DayClock();
    expect(c.hour).toBe(START_HOUR);
    c.advance(DAY_CYCLE_SEC / 4);
    expect(c.hour).toBeCloseTo(START_HOUR + 6, 6);
    c.advance(DAY_CYCLE_SEC * 3 / 4);
    expect(c.hour).toBeCloseTo(START_HOUR, 6);
  });
  it("昼・夜に固定すると時刻が動かない。モードは順に切り替わる", () => {
    const c = new DayClock();
    expect(c.cycleMode()).toBe("day");
    c.advance(100);
    expect(c.hour).toBe(12);
    expect(c.lighting.night).toBe(0);
    expect(c.cycleMode()).toBe("night");
    c.advance(100);
    expect(c.lighting.night).toBe(1);
    expect(c.cycleMode()).toBe("auto");
  });
  it("時刻の表示", () => {
    expect(formatHour(15.5)).toBe("15:30");
    expect(formatHour(0)).toBe("0:00");
    expect(formatHour(25.25)).toBe("1:15");
  });
});
