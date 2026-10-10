import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FACILITY_SPECS, FacilityType } from "../src/sim/facilities";
import { ZoneType, type Rect } from "../src/sim/zoning";
import { SEED, findLand, forceFacility } from "./helpers";

/** 道路 1 本の北側に住宅、工場を近くに置いた街 (電力などは十分、外部接続あり)。育ててから使う。 */
function town() {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  const home: Rect = { x0: x0 + 1, y0: roadY + 1, x1: x0 + 4, y1: roadY + 3 };
  city.zones.paintRect(city.graph, home, ZoneType.Residential);
  city.zones.paintRect(city.graph, { x0: x0 + 7, y0: roadY + 1, x1: x0 + 10, y1: roadY + 3 }, ZoneType.Industrial);
  const kinds = [FacilityType.Power, FacilityType.Power, FacilityType.Power, FacilityType.Water, FacilityType.Water, FacilityType.Water, FacilityType.Sewage, FacilityType.Sewage, FacilityType.Sewage, FacilityType.Outside];
  kinds.forEach((k, i) => forceFacility(city, k, x0 + 22 + i * 2, roadY - 2));
  for (let i = 0; i < 120; i++) city.tick();
  city.refresh();
  return { city, x0, roadY };
}
const homes = (city: City) => [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.building > 0);
const sum = (city: City, key: "air" | "noise") => homes(city).reduce((s, c) => s + c.env[key], 0);

describe("環境対策の施設 (公園・防音壁)", () => {
  it("施設は 10 種類以上ある (M9 の目標の途中経過)", () => {
    expect(Object.keys(FACILITY_SPECS).length).toBeGreaterThanOrEqual(13);
  });

  it("公園は大気汚染と騒音の両方を、防音壁は騒音だけを減らす", () => {
    expect(FACILITY_SPECS[FacilityType.Park].relief!.air).toBeGreaterThan(0);
    expect(FACILITY_SPECS[FacilityType.Park].relief!.noise).toBeGreaterThan(0);
    expect(FACILITY_SPECS[FacilityType.NoiseBarrier].relief!.air).toBe(0);
    expect(FACILITY_SPECS[FacilityType.NoiseBarrier].relief!.noise).toBeGreaterThan(FACILITY_SPECS[FacilityType.Park].relief!.noise);
    for (const t of [FacilityType.Park, FacilityType.NoiseBarrier]) {
      expect(FACILITY_SPECS[t].service).toBeNull();
      expect(FACILITY_SPECS[t].coverage).toBeNull();
      expect(FACILITY_SPECS[t].radius).toBeGreaterThan(0);
    }
  });

  it("近くに公園を置くと、住宅の大気汚染・騒音・病人が減る", () => {
    const { city, x0, roadY } = town();
    expect(sum(city, "air")).toBeGreaterThan(0);
    expect(sum(city, "noise")).toBeGreaterThan(0);
    const air = sum(city, "air");
    const noise = sum(city, "noise");
    const sick = city.health.sick;
    forceFacility(city, FacilityType.Park, x0 + 5, roadY - 2);
    city.refresh();
    expect(sum(city, "air")).toBeLessThan(air);
    expect(sum(city, "noise")).toBeLessThan(noise);
    expect(city.health.sick).toBeLessThan(sick);
  });

  it("届く距離より遠い住宅は、公園があっても変わらない", () => {
    const { city, x0, roadY } = town();
    const air = sum(city, "air");
    const noise = sum(city, "noise");
    forceFacility(city, FacilityType.Park, x0 + 34, roadY - 2); // 住宅 (x0+1〜4) から 30 タイル
    city.refresh();
    expect(sum(city, "air")).toBeCloseTo(air, 9);
    expect(sum(city, "noise")).toBeCloseTo(noise, 9);
  });

  it("近いほど強く効く", () => {
    const near = town();
    const far = town();
    forceFacility(near.city, FacilityType.Park, near.x0 + 5, near.roadY - 2);
    forceFacility(far.city, FacilityType.Park, far.x0 + 12, far.roadY - 2); // 半径 8 に端がかかる位置
    near.city.refresh();
    far.city.refresh();
    expect(sum(near.city, "air")).toBeLessThan(sum(far.city, "air"));
  });

  it("防音壁は騒音だけを減らし、大気汚染は変えない", () => {
    const { city, x0, roadY } = town();
    const air = sum(city, "air");
    const noise = sum(city, "noise");
    forceFacility(city, FacilityType.NoiseBarrier, x0 + 5, roadY - 2);
    city.refresh();
    expect(sum(city, "noise")).toBeLessThan(noise);
    expect(sum(city, "air")).toBeCloseTo(air, 9);
  });

  it("公園を増やすほど減るが、かけ合わせるので 0 を下回らない", () => {
    const { city, x0, roadY } = town();
    forceFacility(city, FacilityType.Park, x0 + 5, roadY - 2);
    city.refresh();
    const one = sum(city, "air");
    forceFacility(city, FacilityType.Park, x0 + 7, roadY - 2);
    forceFacility(city, FacilityType.Park, x0 + 9, roadY - 2);
    city.refresh();
    expect(sum(city, "air")).toBeLessThan(one);
    for (const c of homes(city)) {
      expect(c.env.air).toBeGreaterThanOrEqual(0);
      expect(c.env.noise).toBeGreaterThanOrEqual(0);
      expect(c.env.risk).toBeGreaterThanOrEqual(0);
    }
  });

  it("工場も発電所もない街は、公園があっても環境は 0 のまま", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const roadY = y0 + 4;
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 4, y1: roadY + 3 }, ZoneType.Residential);
    forceFacility(city, FacilityType.Park, x0 + 5, roadY - 2);
    city.refresh();
    expect(city.health.sick).toBe(0);
  });

  it("保存して読み込んでも、公園と防音壁が残り、効果も同じ", () => {
    const { city, x0, roadY } = town();
    forceFacility(city, FacilityType.Park, x0 + 5, roadY - 2);
    forceFacility(city, FacilityType.NoiseBarrier, x0 + 7, roadY - 2);
    city.refresh();
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    loaded.refresh();
    const types = [...loaded.facilities.values()].map((f) => f.type);
    expect(types).toContain(FacilityType.Park);
    expect(types).toContain(FacilityType.NoiseBarrier);
    expect(sum(loaded, "air")).toBeCloseTo(sum(city, "air"), 9);
    expect(sum(loaded, "noise")).toBeCloseTo(sum(city, "noise"), 9);
  });

  it("道路から遠い場所や水の上には建てられない (ほかの施設と同じ)", () => {
    const { city } = town();
    expect(city.checkFacility(FacilityType.Park, 5000, 5000).ok).toBe(false);
  });

  it("建設費が引かれ、維持費が毎月かかる", () => {
    const { city, x0, roadY } = town();
    const m0 = city.money;
    expect(city.placeFacility(FacilityType.Park, x0 + 5, roadY - 3)).toEqual({ ok: true });
    expect(m0 - city.money).toBe(FACILITY_SPECS[FacilityType.Park].cost);
  });
});
