import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FACILITY_SIZE, FACILITY_SPECS, FacilityType, facilityCenter, footprint } from "../src/sim/facilities";
import { ZoneType } from "../src/sim/zoning";
import { SEED, findLand, forceFacility, setup } from "./helpers";

function roadCity() {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  return { city, x0, roadY };
}

describe("施設の大きさ", () => {
  it("大きな施設ほど広い敷地を使う (病院・発電所・下水処理場・ごみ処理場は 3×3、大学は 4×4、警察・消防・給水は 2×2)", () => {
    const size = (t: FacilityType) => FACILITY_SPECS[t].size;
    for (const t of [FacilityType.Power, FacilityType.Sewage, FacilityType.Hospital, FacilityType.Garbage, FacilityType.HighSchool, FacilityType.MiddleSchool]) expect(size(t)).toBe(3);
    expect(size(FacilityType.University)).toBe(4);
    for (const t of [FacilityType.Police, FacilityType.Fire, FacilityType.Water, FacilityType.School, FacilityType.Outside]) expect(size(t)).toBe(FACILITY_SIZE);
    expect(size(FacilityType.University)).toBeGreaterThan(size(FacilityType.HighSchool));
    expect(size(FacilityType.HighSchool)).toBeGreaterThan(size(FacilityType.School));
  });

  it("施設の敷地 (footprint) と中心は、大きさに応じて決まる", () => {
    expect(footprint(10, 20, 3)).toHaveLength(9);
    expect(footprint(10, 20, 4)).toHaveLength(16);
    expect(footprint(10, 20)).toHaveLength(4); // 大きさを省略すると昔の 2×2
    expect(facilityCenter({ x: 10, y: 20, size: 3 })).toEqual({ x: 11.5, y: 21.5 });
    expect(facilityCenter({ x: 10, y: 20, size: 2 })).toEqual({ x: 11, y: 21 });
  });

  it("建てた施設に、種類の大きさが記録される", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.University, x0 + 5, roadY - 4)).toEqual({ ok: true });
    expect(city.placeFacility(FacilityType.Hospital, x0 + 12, roadY - 3)).toEqual({ ok: true });
    const sizes = [...city.facilities.values()].map((f) => f.size).sort();
    expect(sizes).toEqual([3, 4]);
  });

  it("大学は 4×4 の敷地を使い、重なる位置には建てられない", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.University, x0 + 5, roadY - 4).ok).toBe(true);
    expect(city.placeFacility(FacilityType.Police, x0 + 8, roadY - 4).ok).toBe(false); // 4×4 の右端のタイルに重なる
    expect(city.placeFacility(FacilityType.Police, x0 + 9, roadY - 4).ok).toBe(true); // 隣は可
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) expect(city.facilityAt(x0 + 5 + dx, roadY - 4 + dy)).toBeDefined();
    expect(city.facilityAt(x0 + 9, roadY - 5)).toBeUndefined();
  });

  it("大きな施設は、道路の上にはみ出して建てられない", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.Hospital, x0 + 5, roadY - 2)).toEqual({ ok: false, reason: "道路の上には建てられません" }); // 3×3 だと道路の行にかかる
    expect(city.placeFacility(FacilityType.Hospital, x0 + 5, roadY - 3).ok).toBe(true);
  });

  it("ゾーンの上に建てると、敷地すべてのゾーンが消える", () => {
    const { city, x0, roadY } = roadCity();
    city.zones.paintRect(city.graph, { x0: x0 + 10, y0: roadY - 3, x1: x0 + 15, y1: roadY - 1 }, ZoneType.Commercial); // 6×3 = 18
    expect(city.zones.cells.size).toBe(18);
    city.placeFacility(FacilityType.Hospital, x0 + 10, roadY - 3); // 3×3 = 9
    expect(city.zones.cells.size).toBe(9);
  });

  it("道路を大きな施設の上に敷くと、施設が壊れる", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1).ok).toBe(true); // 3×3: roadY+1〜+3
    expect(city.buildRoad(x0 + 11.5, roadY + 3.5, x0 + 11.5, roadY + 8.5)).toBe(true); // 3 行目 (敷地の下端) を南北に通す
    city.refresh();
    expect(city.facilities.size).toBe(0);
  });

  it("サービスは、施設の中心 (大きな施設は敷地の真ん中) から届く", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 100; i++) city.tick();
    expect(city.placeFacility(FacilityType.Hospital, x0 + 9, roadY - 3)).toEqual({ ok: true });
    city.refresh();
    const f = [...city.facilities.values()].find((x) => x.type === FacilityType.Hospital)!;
    const r = FACILITY_SPECS[FacilityType.Hospital].radius;
    const c = facilityCenter(f);
    const inside = [...city.zones.cells.values()].filter((z) => z.building > 0 && Math.hypot(c.x - (z.x + 0.5), c.y - (z.y + 0.5)) <= r).length;
    expect(inside).toBeGreaterThan(0);
    expect(city.coverage.health.covered).toBe(inside);
  });
});

describe("保存データの大きさ", () => {
  it("大きさを保存し、読み込むと同じ大きさになる", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.University, x0 + 5, roadY - 4);
    const data = JSON.parse(JSON.stringify(city.toData()));
    expect(data.facilities[0].size).toBe(4);
    expect([...City.fromData(data).facilities.values()][0]!.size).toBe(4);
  });

  it("大きさのない昔のデータの施設は、2×2 として読み込まれる (病院でも)", () => {
    const { city, x0, roadY } = roadCity();
    forceFacility(city, FacilityType.Hospital, x0 + 5, roadY - 2); // 昔は 2×2 で建っていた
    const data = JSON.parse(JSON.stringify(city.toData()));
    delete data.facilities[0].size;
    const loaded = City.fromData(data);
    const f = [...loaded.facilities.values()][0]!;
    expect(f.size).toBe(FACILITY_SIZE);
    loaded.refresh();
    expect(loaded.facilities.size).toBe(1); // 道路にかからないので壊れない
    expect(loaded.facilityAt(x0 + 5, roadY - 1)).toBeDefined();
    expect(loaded.facilityAt(x0 + 7, roadY - 1)).toBeUndefined();
  });

  it("不正な大きさは拒否する", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.Hospital, x0 + 5, roadY - 3);
    for (const bad of [0, -1, 1.5, 99, "3"]) {
      const data = JSON.parse(JSON.stringify(city.toData()));
      data.facilities[0].size = bad;
      expect(() => City.fromData(data)).toThrow();
    }
  });
});
