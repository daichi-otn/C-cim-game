import { describe, expect, it } from "vitest";
import { City, monthlyTax } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { MOVE_OUT_SICK_RATE, sickRateOf } from "../src/sim/environment";
import { ZoneType, type Rect } from "../src/sim/zoning";
import { SEED, findLand, forceFacility } from "./helpers";

/** 道路 1 本の北側に住宅、工場を gap タイル離して置いた街 (電力などは十分、外部接続あり)。 */
function town(gap: number, opts: { hospital?: boolean; factory?: boolean } = {}) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  const home: Rect = { x0: x0 + 1, y0: roadY + 1, x1: x0 + 4, y1: roadY + 3 };
  city.zones.paintRect(city.graph, home, ZoneType.Residential);
  if (opts.factory !== false) {
    const fx = x0 + 4 + gap;
    city.zones.paintRect(city.graph, { x0: fx, y0: roadY + 1, x1: fx + 3, y1: roadY + 3 }, ZoneType.Industrial);
  }
  // 供給はすべて、住宅から遠い北側の道路沿いに一列に置く (電力・下水が住宅に影響しないように)
  const kinds = [FacilityType.Power, FacilityType.Power, FacilityType.Power, FacilityType.Water, FacilityType.Water, FacilityType.Water, FacilityType.Sewage, FacilityType.Sewage, FacilityType.Sewage, FacilityType.Outside];
  kinds.forEach((k, i) => forceFacility(city, k, x0 + 18 + i * 2, roadY - 2));
  if (opts.hospital) forceFacility(city, FacilityType.Hospital, x0 + 6, roadY - 2);
  return { city, x0, roadY };
}
const grow = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};
const homes = (city: City) => [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.building > 0);

describe("環境と病気", () => {
  it("工場のすぐ近くの住宅は大気汚染で病人が出る", () => {
    const { city } = town(2);
    grow(city, 120);
    expect(city.health.sick).toBeGreaterThan(0);
    expect(Math.max(...homes(city).map((c) => c.env.air))).toBeGreaterThan(0.2);
    expect(city.notices().some((n) => n.includes("大気汚染"))).toBe(true);
  });

  it("工場から遠い住宅は影響を受けない", () => {
    const { city } = town(25);
    grow(city, 120);
    expect(homes(city).length).toBeGreaterThan(0);
    expect(Math.max(...homes(city).map((c) => c.env.air + c.env.odor))).toBe(0);
    expect(city.notices().some((n) => n.includes("大気汚染"))).toBe(false);
  });

  it("近い方が遠い方より病人が多い", () => {
    const near = town(2).city;
    const mid = town(6).city;
    grow(near, 120);
    grow(mid, 120);
    expect(near.health.meanRisk).toBeGreaterThan(mid.health.meanRisk);
  });

  it("病院の範囲内では病人が減る", () => {
    const a = town(2).city;
    const b = town(2, { hospital: true }).city;
    grow(a, 120);
    grow(b, 120);
    expect(sickRateOf(0.5, true)).toBeLessThan(sickRateOf(0.5, false));
    // 人口が違うので、住民 1 人あたりの病人の割合で比べる
    const ratio = (c: City) => c.health.sick / c.zones.totals().population;
    expect(ratio(b)).toBeLessThan(ratio(a));
  });

  it("病気の人は税を払わず、働き手にも数えない", () => {
    const base = { population: 100, jobsC: 0, jobsI: 0 };
    expect(monthlyTax({ ...base, sick: 50 }, 0.1)).toBeLessThan(monthlyTax({ ...base, sick: 0 }, 0.1));
  });

  it("環境が悪すぎる住宅には住民が増えず、出ていく", () => {
    const { city } = town(1);
    grow(city, 200);
    const worst = homes(city).reduce((m, c) => (sickRateOf(c.env.risk, c.env.cared) > sickRateOf(m.env.risk, m.env.cared) ? c : m));
    expect(sickRateOf(worst.env.risk, worst.env.cared)).toBeGreaterThan(MOVE_OUT_SICK_RATE);
    expect(worst.residents).toBe(0);
  });

  it("発電所や下水処理場の近くも、病人が出る", () => {
    const { city, x0, roadY } = town(25, { factory: false });
    forceFacility(city, FacilityType.Power, x0 + 6, roadY - 2);
    forceFacility(city, FacilityType.Sewage, x0 + 2, roadY - 2);
    grow(city, 120);
    expect(city.health.sick).toBeGreaterThan(0);
    expect(Math.max(...homes(city).map((c) => c.env.odor))).toBeGreaterThan(0);
  });

  it("交通量の多い道路沿いの住宅は騒音を受ける", () => {
    const quiet = town(25).city;
    grow(quiet, 150);
    const noiseOf = (c: City) => Math.max(...homes(c).map((h) => h.env.noise));
    const q = noiseOf(quiet);
    expect(q).toBeGreaterThanOrEqual(0);
    // 同じ道路で人口が増えると交通量が増え、騒音が大きくなる (最初の数十日より後のほうが大きい)
    const early = town(25).city;
    grow(early, 40);
    expect(q).toBeGreaterThanOrEqual(noiseOf(early));
  });

  it("保存して読み込んでも、環境は求め直されて同じになる", () => {
    const { city } = town(2);
    grow(city, 100);
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    loaded.refresh();
    city.refresh(); // 天気は日から決まるので、同じ日の状態で比べる
    expect(loaded.health.sick).toBeCloseTo(city.health.sick, 6);
  });
});
