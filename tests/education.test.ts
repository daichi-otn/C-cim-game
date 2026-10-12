import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FACILITY_SPECS, FACILITY_TYPE_MAX, FacilityType } from "../src/sim/facilities";
import { forceFacility, setup } from "./helpers";

const SCHOOLS = [FacilityType.School, FacilityType.MiddleSchool, FacilityType.HighSchool, FacilityType.University];
const grow = (city: City, days = 120) => {
  for (let i = 0; i < days; i++) city.tick();
};
const buildings = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0);

describe("学校 4 種類", () => {
  it("小学校・中学校・高校・大学は、どれも教育を届け、段階が上がるほど遠くまで届いて高い", () => {
    for (const t of SCHOOLS) {
      expect(FACILITY_SPECS[t].coverage).toBe("education");
      expect(FACILITY_SPECS[t].service).toBeNull();
    }
    for (let i = 1; i < SCHOOLS.length; i++) {
      const a = FACILITY_SPECS[SCHOOLS[i - 1]!];
      const b = FACILITY_SPECS[SCHOOLS[i]!];
      expect(b.radius).toBeGreaterThan(a.radius);
      expect(b.cost).toBeGreaterThan(a.cost);
      expect(b.upkeep).toBeGreaterThan(a.upkeep);
    }
    expect(SCHOOLS.map((t) => FACILITY_SPECS[t].name)).toEqual(["小学校", "中学校", "高校", "大学"]);
  });

  it("昔の「学校」(番号 8) は小学校のまま、同じ距離・同じ費用で使える", () => {
    expect(FacilityType.School).toBe(8);
    expect(FACILITY_SPECS[FacilityType.School].radius).toBe(14);
    expect(FACILITY_SPECS[FacilityType.School].cost).toBe(25_000_000);
  });

  it.each(SCHOOLS)("%i: 半径の内側の建物にだけ教育が届く", (type) => {
    const { city, x0, roadY } = setup();
    grow(city);
    expect(city.placeFacility(type, x0 + 9, roadY - FACILITY_SPECS[type].size)).toEqual({ ok: true });
    city.refresh();
    const f = [...city.facilities.values()].find((x) => x.type === type)!;
    const r = FACILITY_SPECS[type].radius;
    const inside = buildings(city).filter((c) => Math.hypot(f.x + f.size / 2 - (c.x + 0.5), f.y + f.size / 2 - (c.y + 0.5)) <= r).length;
    expect(inside).toBeGreaterThan(0);
    expect(city.coverage.education.covered).toBe(inside);
  });

  it("大学は小学校より多くの建物に教育を届ける", () => {
    const base = setup();
    grow(base.city);
    const withElementary = setup();
    grow(withElementary.city);
    // 道路の端 (建物から遠い所) に置いて、半径の差が出るようにする
    forceFacility(base.city, FacilityType.School, base.x0 + 1, base.roadY - 2);
    forceFacility(withElementary.city, FacilityType.University, withElementary.x0 + 1, withElementary.roadY - 2);
    base.city.refresh();
    withElementary.city.refresh();
    expect(withElementary.city.coverage.education.covered).toBeGreaterThan(base.city.coverage.education.covered);
  });
});

describe("高校・大学とオフィスの需要", () => {
  const officeDemand = (type?: FacilityType) => {
    const { city, x0, roadY } = setup();
    grow(city);
    if (type !== undefined) forceFacility(city, type, x0 + 9, roadY - 2);
    city.refresh();
    return { o: city.demand.o, boost: city.higherEducation, city };
  };

  it("小学校・中学校ではオフィスの需要は変わらない", () => {
    const none = officeDemand();
    expect(none.boost).toBe(0);
    // 学校がないと、子どもが学校へ行けず幸福度が下がるので、学校があるほうが需要は下がらない
    expect(officeDemand(FacilityType.School).o).toBeGreaterThanOrEqual(none.o - 1e-9);
    expect(officeDemand(FacilityType.School).boost).toBe(0);
    expect(officeDemand(FacilityType.MiddleSchool).boost).toBe(0);
  });

  it("高校・大学が届くと、届いた建物の割合に応じてオフィスの需要が上がる (大学のほうが大きい)", () => {
    const high = officeDemand(FacilityType.HighSchool);
    const uni = officeDemand(FacilityType.University);
    expect(high.boost).toBeGreaterThan(0);
    expect(high.boost).toBeLessThanOrEqual(0.1);
    expect(uni.boost).toBeGreaterThan(high.boost);
    expect(uni.boost).toBeLessThanOrEqual(0.2 + 1e-9);
    const none = officeDemand();
    expect(uni.o).toBeGreaterThan(none.o);
  });

  it("高校と大学の両方が届く建物は、高いほう (大学) だけを使う (足し算しない)", () => {
    const { city, x0, roadY } = setup();
    grow(city);
    forceFacility(city, FacilityType.University, x0 + 9, roadY - 2);
    city.refresh();
    const alone = city.higherEducation;
    forceFacility(city, FacilityType.HighSchool, x0 + 11, roadY - 2);
    city.refresh();
    expect(city.higherEducation).toBeCloseTo(alone, 9);
  });

  it("道路につながっていない大学は、何も届けない", () => {
    const { city } = setup();
    grow(city);
    forceFacility(city, FacilityType.University, 5000, 5000);
    city.refresh();
    expect(city.higherEducation).toBe(0);
  });
});

describe("保存データ", () => {
  it("新しい学校も保存して読み込める", () => {
    const { city, x0, roadY } = setup();
    forceFacility(city, FacilityType.MiddleSchool, x0 + 9, roadY - 2);
    forceFacility(city, FacilityType.University, x0 + 11, roadY - 2);
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    const types = [...loaded.facilities.values()].map((f) => f.type);
    expect(types).toContain(FacilityType.MiddleSchool);
    expect(types).toContain(FacilityType.University);
  });

  it("昔のデータの学校 (8) は小学校として読み込まれ、範囲外の番号は拒否される", () => {
    const { city, x0, roadY } = setup();
    forceFacility(city, FacilityType.School, x0 + 9, roadY - 2);
    const d = JSON.parse(JSON.stringify(city.toData()));
    const school = d.facilities.find((f: { type: number }) => f.type === 8);
    expect(school).toBeDefined();
    const loaded = City.fromData(d);
    expect(FACILITY_SPECS[[...loaded.facilities.values()].find((f) => f.type === 8)!.type].name).toBe("小学校");
    school.type = FACILITY_TYPE_MAX + 1;
    expect(() => City.fromData(d)).toThrow();
  });
});
