import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { AGING_FLOOR, REBUILD_YEARS, agingFactor, isOldEnough } from "../src/sim/aging";
import { DAYS_PER_YEAR } from "../src/sim/weather";
import { cellCapacity } from "../src/sim/zoning";
import { setup } from "./helpers";

const buildings = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0 && c.part === undefined);

/** 全部の建物を、建ってから years 年たったことにする */
function ageAll(city: City, years: number): void {
  for (const c of buildings(city)) c.built = city.day - Math.round(years * DAYS_PER_YEAR);
  city.refresh();
}

describe("老朽化の割合", () => {
  it("建ったばかりは 1、年々下がり、下限で止まる", () => {
    expect(agingFactor(0)).toBe(1);
    expect(agingFactor(DAYS_PER_YEAR)).toBeCloseTo(0.95, 10);
    expect(agingFactor(4 * DAYS_PER_YEAR)).toBeCloseTo(0.8, 10);
    expect(agingFactor(100 * DAYS_PER_YEAR)).toBe(AGING_FLOOR);
  });

  it("建ってから日がマイナスでも 1 のまま (壊れたデータでも落ちない)", () => {
    expect(agingFactor(-50)).toBe(1);
    expect(isOldEnough(-50)).toBe(false);
  });

  it("建て替えの候補は REBUILD_YEARS 年から", () => {
    expect(isOldEnough(REBUILD_YEARS * DAYS_PER_YEAR - 1)).toBe(false);
    expect(isOldEnough(REBUILD_YEARS * DAYS_PER_YEAR)).toBe(true);
  });
});

describe("老朽化と街", () => {
  it("古い建物は定員が下がり、新しい建物は元のまま", () => {
    const { city } = setup();
    for (let i = 0; i < 120; i++) city.tick();
    const before = new Map(buildings(city).map((c) => [`${c.x},${c.y}`, cellCapacity(c)]));
    ageAll(city, 20);
    expect(before.size).toBeGreaterThan(0);
    for (const c of buildings(city)) {
      expect(c.aging).toBe(AGING_FLOOR);
      expect(cellCapacity(c)).toBeLessThan(before.get(`${c.x},${c.y}`)!);
    }
    ageAll(city, 0);
    expect(buildings(city).every((c) => c.aging === 1)).toBe(true);
  });

  it("定員が下がって入りきらなくなった住民は出ていく", () => {
    const { city } = setup();
    for (let i = 0; i < 150; i++) city.tick();
    for (const c of buildings(city)) c.residents = cellCapacity(c); // 全部満員にしてから古くする
    const full = buildings(city).map((c) => [c, c.residents] as const);
    ageAll(city, 40);
    for (const [c, was] of full) {
      expect(c.residents).toBe(Math.min(was, cellCapacity(c)));
      expect(c.residents).toBeLessThanOrEqual(cellCapacity(c));
    }
    expect(full.some(([c, was]) => c.residents < was)).toBe(true);
  });

  it("古い建物は、需要があると建て替わり、建った日が今日になる", () => {
    const { city } = setup();
    for (let i = 0; i < 150; i++) city.tick();
    const oldDay = city.day - REBUILD_YEARS * DAYS_PER_YEAR - 5;
    for (const c of buildings(city)) c.built = oldDay;
    city.refresh();
    let rebuilt = 0;
    for (let i = 0; i < 400; i++) {
      city.tick();
      rebuilt = buildings(city).filter((c) => c.built > oldDay).length;
      if (rebuilt > 0) break;
    }
    expect(rebuilt).toBeGreaterThan(0);
    for (const c of buildings(city)) {
      if (c.built > oldDay) expect(c.built).toBeLessThanOrEqual(city.day);
    }
  });
});

describe("老朽化の保存", () => {
  it("建った日は保存と読み込みで残り、古いデータは読み込んだ日を建った日とみなす", () => {
    const { city } = setup();
    for (let i = 0; i < 100; i++) city.tick();
    const data = JSON.parse(JSON.stringify(city.toData()));
    const withDay = City.fromData(data);
    expect(buildings(withDay).map((c) => c.built)).toEqual(buildings(city).map((c) => c.built));

    const old = JSON.parse(JSON.stringify(data));
    old.zones = old.zones.map((z: number[]) => z.slice(0, 6));
    const loaded = City.fromData(old);
    for (const c of buildings(loaded)) expect(c.built).toBe(data.day);
  });

  it("建った日が不正なら拒否する", () => {
    const { city } = setup();
    for (let i = 0; i < 100; i++) city.tick();
    const data = JSON.parse(JSON.stringify(city.toData()));
    const idx = data.zones.findIndex((z: number[]) => z.length >= 9);
    expect(idx).toBeGreaterThanOrEqual(0);
    data.zones[idx][8] = -1;
    expect(() => City.fromData(data)).toThrow();
  });
});
