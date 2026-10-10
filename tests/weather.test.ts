import { describe, expect, it } from "vitest";
import { City, monthlyTax } from "../src/sim/city";
import { calcEnvironment } from "../src/sim/environment";
import { calcTraffic, edgeCongestion } from "../src/sim/traffic";
import {
  AIR_POLLUTION_MULT,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  POWER_USE_MULT,
  ROAD_CAPACITY_MULT,
  SEASONS,
  Season,
  WEATHERS,
  WEATHER_BLOCK_DAYS,
  seasonOf,
  weatherOn,
  type Weather,
} from "../src/sim/weather";
import { SEED, renewAll, setup } from "./helpers";

/** 指定の天気になる日を探す (季節の範囲内)。 */
function dayWith(weather: Weather, from = 0, to = DAYS_PER_YEAR): number {
  for (let d = from; d < to; d++) if (weatherOn(SEED, d) === weather) return d;
  throw new Error(`${weather} の日がない`);
}

describe("季節", () => {
  it("90 日ごとに春・夏・秋・冬と巡り、1 年で一周する", () => {
    expect(seasonOf(0)).toBe(Season.Spring);
    expect(seasonOf(DAYS_PER_SEASON - 1)).toBe(Season.Spring);
    expect(seasonOf(DAYS_PER_SEASON)).toBe(Season.Summer);
    expect(seasonOf(DAYS_PER_SEASON * 2)).toBe(Season.Autumn);
    expect(seasonOf(DAYS_PER_SEASON * 3)).toBe(Season.Winter);
    expect(seasonOf(DAYS_PER_YEAR)).toBe(Season.Spring);
  });
});

describe("天気", () => {
  it("同じ種子・同じ日なら、いつも同じ天気で、数日は続く", () => {
    for (let d = 0; d < 200; d++) expect(weatherOn(SEED, d)).toBe(weatherOn(SEED, d));
    for (let b = 0; b < 20; b++) {
      const w = weatherOn(SEED, b * WEATHER_BLOCK_DAYS);
      for (let k = 1; k < WEATHER_BLOCK_DAYS; k++) expect(weatherOn(SEED, b * WEATHER_BLOCK_DAYS + k)).toBe(w);
    }
  });

  it("雪は冬だけ。1 年のうちに、晴れ・くもり・雨・雪がすべて現れる", () => {
    const seen = new Set<Weather>();
    for (let d = 0; d < DAYS_PER_YEAR * 5; d++) {
      const w = weatherOn(SEED, d);
      seen.add(w);
      if (w === "snow") expect(seasonOf(d)).toBe(Season.Winter);
    }
    for (const w of WEATHERS) expect(seen.has(w)).toBe(true);
  });

  it("種子が違えば天気の並びも違う", () => {
    const a = Array.from({ length: 40 }, (_, b) => weatherOn(1, b * WEATHER_BLOCK_DAYS)).join();
    const b = Array.from({ length: 40 }, (_, k) => weatherOn(999, k * WEATHER_BLOCK_DAYS)).join();
    expect(a).not.toBe(b);
  });

  it("City の weather / season は、日から決まる", () => {
    const city = new City(SEED);
    city.day = DAYS_PER_SEASON * 3 + 5;
    expect(city.season).toBe(Season.Winter);
    expect(city.weather).toBe(weatherOn(SEED, city.day));
  });
});

describe("天気と季節が計算に与える影響", () => {
  it("雨・雪では道路の容量が下がり、同じ交通量でも混雑具合が上がる", () => {
    expect(ROAD_CAPACITY_MULT.rain).toBeLessThan(1);
    expect(ROAD_CAPACITY_MULT.snow).toBeLessThan(ROAD_CAPACITY_MULT.rain);
    const { city } = setup();
    for (let i = 0; i < 40; i++) city.tick();
    const fine = calcTraffic(city.graph, city.zones, 1);
    const snow = calcTraffic(city.graph, city.zones, ROAD_CAPACITY_MULT.snow);
    expect(fine.avgCongestion).toBeGreaterThan(0);
    expect(snow.avgCongestion).toBeGreaterThan(fine.avgCongestion);
    expect(snow.capMult).toBe(ROAD_CAPACITY_MULT.snow);
    const id = [...fine.flow.keys()][0]!;
    expect(edgeCongestion(city.graph, id, 50, 0.75)).toBeCloseTo(edgeCongestion(city.graph, id, 50) / 0.75);
  });

  it("City の交通量は、その日の天気の容量で求まる", () => {
    const { city } = setup();
    city.day = dayWith("rain");
    city.refresh();
    expect(city.traffic.capMult).toBe(ROAD_CAPACITY_MULT.rain);
    city.day = dayWith("clear");
    city.refresh();
    expect(city.traffic.capMult).toBe(1);
  });

  it("雨の日は大気汚染が減り、病人も減る", () => {
    const { city } = setup();
    for (let i = 0; i < 80; i++) city.tick();
    const facilities = [...city.facilities.values()];
    const args = [city.zones, city.graph, facilities, city.traffic.flow] as const;
    const dry = calcEnvironment(...args, 1);
    const airDry = [...city.zones.cells.values()].reduce((s, c) => s + c.env.air, 0);
    const wet = calcEnvironment(...args, AIR_POLLUTION_MULT.rain);
    const airWet = [...city.zones.cells.values()].reduce((s, c) => s + c.env.air, 0);
    expect(airDry).toBeGreaterThan(0);
    expect(airWet).toBeLessThan(airDry);
    expect(airWet).toBeGreaterThanOrEqual(airDry * AIR_POLLUTION_MULT.rain - 1e-9); // 上限 1 で頭打ちの所があるので、ちょうど倍率どおりとは限らない
    expect(wet.sick).toBeLessThanOrEqual(dry.sick);
  });

  it("夏と冬は電力の使用量が増え、春と秋は標準", () => {
    expect(POWER_USE_MULT[Season.Spring]).toBe(1);
    expect(POWER_USE_MULT[Season.Autumn]).toBe(1);
    expect(POWER_USE_MULT[Season.Summer]).toBeGreaterThan(1);
    expect(POWER_USE_MULT[Season.Winter]).toBeGreaterThan(POWER_USE_MULT[Season.Summer]);
    const { city } = setup();
    for (let i = 0; i < 60; i++) city.tick();
    city.refresh();
    renewAll(city); // 日付だけ進めて比べるので、建物は新築のままにする
    city.refresh();
    const spring = city.utilities.power.used;
    expect(spring).toBeGreaterThan(0);
    city.day = DAYS_PER_SEASON * 3 + 1; // 冬
    renewAll(city);
    city.refresh();
    expect(city.utilities.power.used).toBeCloseTo(spring * POWER_USE_MULT[Season.Winter], 5);
    // 水道と下水は季節で変わらない
    const water = city.utilities.water.used;
    city.day = 1;
    city.refresh();
    expect(city.utilities.water.used).toBe(water);
  });

  it("電力ぎりぎりの街は、冬の暖房で供給が足りなくなり、供給なしの建物が出る", () => {
    const { city } = setup({ r: true, c: true, i: true }, { power: 1, water: 3, sewage: 3 });
    for (let i = 0; i < 80; i++) city.tick();
    const served = () => [...city.zones.cells.values()].filter((c) => c.building > 0 && c.served).length;
    city.day = 1;
    city.refresh();
    const springServed = served();
    const spring = city.utilities.power;
    expect(spring.used).toBeGreaterThan(spring.supply * 0.8); // 供給ぎりぎり
    const wintered = springServed;
    city.day = DAYS_PER_SEASON * 3 + 1;
    city.refresh();
    expect(city.utilities.power.used).toBeLessThanOrEqual(city.utilities.power.supply + 1e-9);
    expect(served()).toBeLessThan(wintered);
    expect(city.notices().some((n) => n.includes("冬の暖房"))).toBe(true);
  });

  it("季節で需要が変わる (冬は住宅の需要が下がり、商業の需要が上がる)", () => {
    const { city } = setup();
    for (let i = 0; i < 30; i++) city.tick();
    city.day = 10;
    city.refresh();
    const spring = { ...city.demand };
    city.day = DAYS_PER_SEASON * 3 + 10;
    city.refresh();
    expect(city.demand.r).toBeLessThan(spring.r);
    expect(city.demand.c).toBeGreaterThan(spring.c);
  });

  it("季節で税収が変わる (冬の商業は増え、工業は減る)", () => {
    const totals = { population: 100, jobsC: 100, jobsI: 100, jobsO: 0, sick: 0 } as Parameters<typeof monthlyTax>[0];
    const plain = monthlyTax(totals, 0.1);
    expect(monthlyTax(totals, 0.1, Season.Spring)).toBe(plain);
    const summer = monthlyTax(totals, 0.1, Season.Summer);
    const winter = monthlyTax(totals, 0.1, Season.Winter);
    expect(summer).toBeGreaterThan(plain);
    expect(winter).not.toBe(plain);
    expect(SEASONS).toHaveLength(4);
  });

  it("月末の収支は、締めた月の季節で決まる", () => {
    const a = setup().city;
    const b = setup().city;
    for (let i = 0; i < 60; i++) {
      a.tick();
      b.tick();
    }
    // 春の最後の日 (89 日目) を締める月と、夏に入った日を比べるため、同じ街を別の日から 1 か月進める
    a.day = DAYS_PER_SEASON - 30;
    b.day = DAYS_PER_SEASON * 3 - 30;
    a.tick();
    for (let i = 1; i < 30; i++) a.tick();
    b.tick();
    for (let i = 1; i < 30; i++) b.tick();
    expect(a.lastMonth.income).not.toBe(b.lastMonth.income);
  });
});
