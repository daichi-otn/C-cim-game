import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { ZoneType, type Density } from "../src/sim/zoning";
import { SEED, findLand, forceFacility, setup } from "./helpers";

/** 道路 1 本の南側に区画を塗っただけの街 (施設はなし)。 */
function bare(density: Density = 0, zone: ZoneType = ZoneType.Residential, roadType?: number) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, roadType as never);
  city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 12, y1: roadY + 3 }, zone, density);
  return { city, x0, roadY };
}
const grow = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};
const buildings = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0);

describe("開発者モード", () => {
  it("初めはオフで、街のデータには入らない (読み込むとオフ)", () => {
    const { city } = bare();
    expect(city.devMode).toBe(false);
    city.devMode = true;
    const data = JSON.parse(JSON.stringify(city.toData()));
    expect(JSON.stringify(data)).not.toContain("devMode");
    expect(City.fromData(data).devMode).toBe(false);
  });

  it("電力・水道・下水・外部接続がなくても、建物が建って住民が入る (通常モードでは建たない)", () => {
    const normal = bare().city;
    grow(normal, 60);
    expect(buildings(normal)).toHaveLength(0);
    const { city } = bare();
    city.devMode = true;
    grow(city, 60);
    expect(buildings(city).length).toBeGreaterThan(0);
    expect(buildings(city).every((c) => c.served)).toBe(true);
    expect(city.zones.totals().population).toBeGreaterThan(0);
  });

  it("細い道路でも、高密度の建物が建つ", () => {
    const normal = bare(3).city;
    grow(normal, 40);
    expect(buildings(normal)).toHaveLength(0);
    const { city } = bare(3);
    city.devMode = true;
    grow(city, 40);
    expect(buildings(city).length).toBeGreaterThan(0);
  });

  it("需要は最大で、税率の影響も受けない", () => {
    const { city } = bare();
    city.devMode = true;
    city.setTaxRate(0.2);
    city.refresh();
    expect(city.demand).toEqual({ r: 1, c: 1, i: 1, o: 1 });
  });

  it("工場の汚染・騒音・ごみの悪臭があっても、病人は出ず、幸福度は最大", () => {
    const { city, x0, roadY } = setup({ r: true, c: true, i: true }, { power: 4, water: 3, sewage: 3 });
    forceFacility(city, FacilityType.Sewage, x0 + 13, roadY + 1); // 住宅のすぐそばに悪臭
    grow(city, 120);
    expect(city.health.sick).toBeGreaterThan(0);
    city.devMode = true;
    city.refresh();
    expect(city.health.sick).toBe(0);
    expect(city.health.meanRisk).toBe(0);
    expect(city.happiness).toBe(1);
    expect(city.garbage.penalty).toBe(0);
    for (const c of city.zones.cells.values()) {
      expect(c.env.risk).toBe(0);
      expect(c.env.sick).toBe(0);
    }
  });

  it("公共サービスは、すべての建物に届いているものとして数える", () => {
    const { city } = setup();
    grow(city, 60);
    city.devMode = true;
    city.refresh();
    for (const k of ["police", "fire", "health", "education"] as const) {
      expect(city.coverage[k].total).toBeGreaterThan(0);
      expect(city.coverage[k].covered).toBe(city.coverage[k].total);
    }
  });

  it("お金がなくても、道路・施設・道路変更ができ、お金は減らない", () => {
    const { city, x0, roadY } = bare();
    city.money = 0;
    expect(city.buildRoad(x0 + 0.5, roadY + 8.5, x0 + 10.5, roadY + 8.5)).toBe(false);
    expect(city.placeFacility(FacilityType.Power, x0 + 20, roadY + 1).ok).toBe(false);
    city.devMode = true;
    expect(city.canAfford(1e12)).toBe(true);
    expect(city.buildRoad(x0 + 0.5, roadY + 8.5, x0 + 10.5, roadY + 8.5)).toBe(true);
    expect(city.placeFacility(FacilityType.Power, x0 + 20, roadY + 1)).toEqual({ ok: true });
    const e = city.graph.nearestEdge(x0 + 5, roadY + 0.5, 0.7)!;
    expect(city.upgradeRoad(e.id, 7)).toBe(true);
    expect(city.money).toBe(0);
  });

  it("月末の収支はお金に影響しない", () => {
    const { city } = setup();
    city.devMode = true;
    const m = city.money;
    grow(city, 60);
    expect(city.money).toBe(m);
  });

  it("注意書きは、開発者モードであることだけを知らせる", () => {
    const { city } = bare();
    city.devMode = true;
    city.refresh();
    const n = city.notices();
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("開発者モード");
  });

  it("オフに戻すと、通常の条件が戻る (供給のない建物は供給なしになる)", () => {
    const { city } = bare();
    city.devMode = true;
    grow(city, 40);
    expect(buildings(city).length).toBeGreaterThan(0);
    city.devMode = false;
    city.refresh();
    expect(buildings(city).every((c) => !c.served)).toBe(true);
    expect(city.notices().length).toBeGreaterThan(1);
  });
});
