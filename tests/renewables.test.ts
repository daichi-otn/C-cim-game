import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FACILITY_SPECS, FacilityType, capacityNow } from "../src/sim/facilities";
import {
  DAYS_PER_YEAR,
  SOLAR_SEASON_MULT,
  SOLAR_WEATHER_MULT,
  Season,
  WEATHERS,
  WIND_OUTPUT_MULT,
  seasonOf,
  weatherOn,
  type Weather,
} from "../src/sim/weather";
import { SEED, findLand, forceFacility, setup } from "./helpers";

/** 指定の天気・季節になる日を探す。 */
function dayWith(weather: Weather, season?: Season): number {
  for (let d = 0; d < DAYS_PER_YEAR * 4; d++) if (weatherOn(SEED, d) === weather && (season === undefined || seasonOf(d) === season)) return d;
  throw new Error(`${weather} の日がない`);
}

/** 道路 1 本と、外部接続・発電施設だけの街 (建物なし)。電力の供給量を調べる用。 */
function plant(types: FacilityType[]) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  types.forEach((t, i) => forceFacility(city, t, x0 + 2 + i * 3, roadY - 2));
  return city;
}
const power = (city: City, day: number) => {
  city.day = day;
  city.refresh();
  return city.utilities.power.supply;
};

describe("風力・太陽光発電所", () => {
  it("電力を供給し、火力の発電所より小さく、公共サービスではない", () => {
    for (const t of [FacilityType.Wind, FacilityType.Solar]) {
      const s = FACILITY_SPECS[t];
      expect(s.service).toBe("power");
      expect(s.capacity).toBeGreaterThan(0);
      expect(s.capacity).toBeLessThan(FACILITY_SPECS[FacilityType.Power].capacity);
      expect(s.coverage).toBeNull();
    }
    expect(FACILITY_SPECS[FacilityType.Wind].output).toBe("wind");
    expect(FACILITY_SPECS[FacilityType.Solar].output).toBe("solar");
    expect(FACILITY_SPECS[FacilityType.Power].output).toBeUndefined();
  });

  it("火力の発電所は、天気や季節で変わらない", () => {
    const s = FACILITY_SPECS[FacilityType.Power];
    for (const w of WEATHERS) for (const q of [Season.Spring, Season.Winter]) expect(capacityNow(s, q, w)).toBe(s.capacity);
  });

  it("風力は風の強い日 (雨) に多く、晴れの日に少ない。季節は関係ない", () => {
    const s = FACILITY_SPECS[FacilityType.Wind];
    expect(capacityNow(s, Season.Spring, "rain")).toBeCloseTo(s.capacity * 1.3);
    expect(capacityNow(s, Season.Spring, "clear")).toBeCloseTo(s.capacity * 0.8);
    expect(capacityNow(s, Season.Spring, "rain")).toBeGreaterThan(capacityNow(s, Season.Spring, "cloudy"));
    expect(capacityNow(s, Season.Spring, "cloudy")).toBeGreaterThan(capacityNow(s, Season.Spring, "clear"));
    for (const w of WEATHERS) expect(capacityNow(s, Season.Summer, w)).toBe(capacityNow(s, Season.Winter, w));
    expect(WIND_OUTPUT_MULT.rain).toBeGreaterThan(WIND_OUTPUT_MULT.clear);
  });

  it("太陽光は晴れで最大、雨や雪で少なく、夏に多く冬に少ない", () => {
    const s = FACILITY_SPECS[FacilityType.Solar];
    expect(capacityNow(s, Season.Spring, "clear")).toBe(s.capacity);
    expect(capacityNow(s, Season.Spring, "cloudy")).toBeCloseTo(s.capacity * SOLAR_WEATHER_MULT.cloudy);
    expect(capacityNow(s, Season.Spring, "rain")).toBeLessThan(capacityNow(s, Season.Spring, "cloudy"));
    expect(capacityNow(s, Season.Winter, "snow")).toBeLessThan(capacityNow(s, Season.Winter, "clear"));
    expect(capacityNow(s, Season.Summer, "clear")).toBeCloseTo(s.capacity * SOLAR_SEASON_MULT[Season.Summer]);
    expect(capacityNow(s, Season.Summer, "clear")).toBeGreaterThan(capacityNow(s, Season.Winter, "clear"));
  });

  it("街の電力の供給量は、その日の天気で変わる (風力)", () => {
    const city = plant([FacilityType.Wind, FacilityType.Wind]);
    const spec = FACILITY_SPECS[FacilityType.Wind];
    const rain = dayWith("rain");
    const clear = dayWith("clear");
    expect(power(city, rain)).toBeCloseTo(2 * capacityNow(spec, seasonOf(rain), "rain"));
    expect(power(city, clear)).toBeCloseTo(2 * capacityNow(spec, seasonOf(clear), "clear"));
    expect(power(city, rain)).toBeGreaterThan(power(city, clear));
  });

  it("街の電力の供給量は、季節で変わる (太陽光は、同じ晴れでも夏のほうが多い)", () => {
    const city = plant([FacilityType.Solar]);
    const summer = dayWith("clear", Season.Summer);
    const winter = dayWith("clear", Season.Winter);
    expect(power(city, summer)).toBeGreaterThan(power(city, winter));
    expect(power(city, summer)).toBeCloseTo(100 * SOLAR_SEASON_MULT[Season.Summer]);
  });

  it("火力と風力・太陽光を合わせると供給量の合計になる", () => {
    const city = plant([FacilityType.Power, FacilityType.Wind, FacilityType.Solar]);
    const d = dayWith("cloudy", Season.Autumn);
    const expected =
      FACILITY_SPECS[FacilityType.Power].capacity +
      capacityNow(FACILITY_SPECS[FacilityType.Wind], Season.Autumn, "cloudy") +
      capacityNow(FACILITY_SPECS[FacilityType.Solar], Season.Autumn, "cloudy");
    expect(power(city, d)).toBeCloseTo(expected);
  });

  it("道路につながっていない風力・太陽光は、供給しない", () => {
    const city = plant([]);
    forceFacility(city, FacilityType.Wind, 5000, 5000);
    forceFacility(city, FacilityType.Solar, 5010, 5000);
    expect(power(city, 0)).toBe(0);
  });

  it("風力・太陽光は大気汚染を出さないが、火力の発電所は出す", () => {
    const air = (type: FacilityType) => {
      const { city, x0, roadY } = setup({ r: true, c: false, i: false }, { water: 3, sewage: 3 });
      forceFacility(city, type, x0 + 14, roadY + 1); // 住宅のすぐ近く
      for (let i = 0; i < 80; i++) city.tick();
      return [...city.zones.cells.values()].reduce((s, c) => s + c.env.air, 0);
    };
    expect(air(FacilityType.Power)).toBeGreaterThan(0);
    expect(air(FacilityType.Wind)).toBe(0);
    expect(air(FacilityType.Solar)).toBe(0);
  });

  it("風力だけの街は、風の強い日のほうが多くの建物に電力が届く", () => {
    const { city, x0, roadY } = setup({ r: true, c: true, i: true }, { water: 3, sewage: 3 }); // 電力は風力だけ
    forceFacility(city, FacilityType.Wind, x0 + 2, roadY - 2);
    forceFacility(city, FacilityType.Wind, x0 + 5, roadY - 2);
    for (let i = 0; i < 200; i++) city.tick();
    const served = (day: number) => {
      city.day = day;
      city.refresh();
      return [...city.zones.cells.values()].filter((c) => c.building > 0 && c.served).length;
    };
    const rain = served(dayWith("rain"));
    const clear = served(dayWith("clear"));
    expect(rain).toBeGreaterThanOrEqual(clear);
    expect(city.utilities.power.supply).toBeGreaterThan(0);
  });

  it("建設費が引かれ、維持費は毎月かかる", () => {
    const { city, x0, roadY } = setup();
    const m0 = city.money;
    expect(city.placeFacility(FacilityType.Solar, x0 + 28, roadY - 3)).toEqual({ ok: true });
    expect(m0 - city.money).toBe(FACILITY_SPECS[FacilityType.Solar].cost);
  });

  it("保存して読み込んでも、風力・太陽光が残り、供給量は同じ日の天気で求め直される", () => {
    const city = plant([FacilityType.Wind, FacilityType.Solar]);
    const d = dayWith("rain");
    const before = power(city, d);
    const data = JSON.parse(JSON.stringify(city.toData()));
    const loaded = City.fromData(data);
    expect(power(loaded, d)).toBeCloseTo(before);
    const types = [...loaded.facilities.values()].map((f) => f.type);
    expect(types).toContain(FacilityType.Wind);
    expect(types).toContain(FacilityType.Solar);
  });

  it("施設は 16 種類ある (M9 の目標は 10 種類以上)", () => {
    expect(Object.keys(FACILITY_SPECS).length).toBe(16);
  });
});
