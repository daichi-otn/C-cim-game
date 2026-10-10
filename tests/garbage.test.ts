import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { GARBAGE_GRACE, GARBAGE_RAMP, garbagePenaltyOf } from "../src/sim/environment";
import { FACILITY_SPECS, FacilityType, wasteOf } from "../src/sim/facilities";
import { ZoneType, type Density } from "../src/sim/zoning";
import { SEED, findLand, forceFacility, setup } from "./helpers";

/** 道路 1 本の南北に、中密度の住宅と商業を広く塗った街 (電力などは十分、外部接続あり)。ごみの量が GARBAGE_GRACE を超えるまで育てる。 */
function bigTown(opts: { garbage?: number } = {}) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  const d: Density = 2;
  city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 12, y1: roadY + 3 }, ZoneType.Residential, d);
  city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY - 3, x1: x0 + 12, y1: roadY - 1 }, ZoneType.Commercial, d);
  // 電力・水道・下水・外部接続は、道路の東側 (住宅や商業から離れた所) の両側に置く。道路から 3 タイル以内に収める
  const kinds = [...Array(4).fill(FacilityType.Power), ...Array(3).fill(FacilityType.Water), ...Array(3).fill(FacilityType.Sewage), FacilityType.Outside];
  kinds.forEach((k, i) => forceFacility(city, k, x0 + 22 + (i % 6) * 2, i < 6 ? roadY + 1 : roadY - 2));
  for (let i = 0; i < (opts.garbage ?? 0); i++) forceFacility(city, FacilityType.Garbage, x0 + 34 + i * 2, roadY - 2);
  for (let i = 0; i < 400; i++) city.tick();
  city.refresh();
  return { city, x0, roadY };
}
const homes = (city: City) => [...city.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.building > 0);
const odorSum = (city: City) => homes(city).reduce((s, c) => s + c.env.odor, 0);

describe("ごみの量", () => {
  it("建物のごみは人数に比例し、種類ごとに係数が違う (工業が多く、オフィスは少ない)", () => {
    expect(wasteOf(ZoneType.Residential, 1, 2)).toBe(16 * 0.5);
    expect(wasteOf(ZoneType.Commercial, 1, 2)).toBeCloseTo(12 * 0.6);
    expect(wasteOf(ZoneType.Industrial, 1, 2)).toBe(12);
    expect(wasteOf(ZoneType.Office, 1, 2)).toBeCloseTo(24 * 0.3);
  });

  it("処理が追いつかない度合いは、処理しきれない量が GARBAGE_GRACE までは 0、そこから直線的に上がって 1 で頭打ち", () => {
    expect(garbagePenaltyOf(0)).toBe(0);
    expect(garbagePenaltyOf(GARBAGE_GRACE)).toBe(0);
    expect(garbagePenaltyOf(GARBAGE_GRACE + GARBAGE_RAMP / 2)).toBeCloseTo(0.5);
    expect(garbagePenaltyOf(GARBAGE_GRACE + GARBAGE_RAMP)).toBe(1);
    expect(garbagePenaltyOf(1e9)).toBe(1);
  });

  it("ごみ処理場の仕様: 処理量があり、電力などは供給せず、公共サービスでもない", () => {
    const s = FACILITY_SPECS[FacilityType.Garbage];
    expect(s.waste).toBeGreaterThan(0);
    expect(s.service).toBeNull();
    expect(s.coverage).toBeNull();
    expect(s.cost).toBeGreaterThan(0);
  });
});

describe("ごみの収集と処理", () => {
  it("小さな街は、ごみ処理場がなくても影響がない", () => {
    const { city } = setup({ r: true, c: false, i: false });
    for (let i = 0; i < 100; i++) city.tick();
    expect(city.garbage.load).toBeGreaterThan(0);
    expect(city.garbage.load).toBeLessThan(GARBAGE_GRACE);
    expect(city.garbage.penalty).toBe(0);
    expect(homes(city).every((c) => c.env.odor <= 1)).toBe(true);
    expect(city.notices().some((n) => n.includes("ごみ"))).toBe(false);
  });

  it("大きな街でごみ処理場がないと、処理しきれないごみが悪臭になり、病人が増え、案内が出る", () => {
    const { city } = bigTown();
    expect(city.garbage.load).toBeGreaterThan(GARBAGE_GRACE + 50);
    expect(city.garbage.supply).toBe(0);
    expect(city.garbage.uncollected).toBeCloseTo(city.garbage.load, 6);
    expect(city.garbage.penalty).toBeGreaterThan(0.1);
    expect(odorSum(city)).toBeGreaterThan(0);
    expect(city.health.causes.odor).toBeGreaterThan(0);
    expect(city.health.sick).toBeGreaterThan(0);
    expect(city.notices().some((n) => n.includes("ごみの処理が追いつかず"))).toBe(true);
  });

  it("ごみ処理場を足すと、ごみが処理され、悪臭・病人・案内が消える", () => {
    const { city, x0, roadY } = bigTown();
    const sickBefore = city.health.sick;
    const happyBefore = city.happiness;
    const need = Math.ceil(city.garbage.load / FACILITY_SPECS[FacilityType.Garbage].waste!);
    // 住宅から離れた、道路の東の端に置く
    for (let i = 0; i < need; i++) forceFacility(city, FacilityType.Garbage, x0 + 34 + i * 2, roadY - 2);
    city.refresh();
    expect(city.garbage.supply).toBeGreaterThanOrEqual(city.garbage.load);
    expect(city.garbage.uncollected).toBe(0);
    expect(city.garbage.penalty).toBe(0);
    expect(city.health.sick).toBeLessThan(sickBefore);
    expect(city.happiness).toBeGreaterThan(happyBefore);
    expect(city.notices().some((n) => n.includes("ごみ"))).toBe(false);
  });

  it("処理量が足りないぶんだけ、処理しきれないごみが残る", () => {
    const { city, x0, roadY } = bigTown();
    const load = city.garbage.load;
    forceFacility(city, FacilityType.Garbage, x0 + 34, roadY - 2);
    city.refresh();
    const w = FACILITY_SPECS[FacilityType.Garbage].waste!;
    expect(city.garbage.supply).toBe(w);
    expect(city.garbage.uncollected).toBeCloseTo(load - w, 6);
  });

  it("道路につながっていないごみ処理場は、何も処理しない", () => {
    const { city } = bigTown();
    forceFacility(city, FacilityType.Garbage, 5000, 5000);
    city.refresh();
    expect(city.garbage.supply).toBe(0);
    expect(city.garbage.penalty).toBeGreaterThan(0);
  });

  it("別の道路網のごみ処理場は、助けにならない", () => {
    const { city, x0, roadY } = bigTown();
    // 離れた別の道路を敷き、その沿いにごみ処理場を置く (最初の道路網とはつながらない)
    expect(city.buildRoad(x0 + 0.5, roadY + 20.5, x0 + 20.5, roadY + 20.5)).toBe(true);
    forceFacility(city, FacilityType.Garbage, x0 + 5, roadY + 22);
    forceFacility(city, FacilityType.Garbage, x0 + 8, roadY + 22);
    forceFacility(city, FacilityType.Garbage, x0 + 11, roadY + 22);
    city.refresh();
    expect(city.garbage.supply).toBeGreaterThan(0);
    expect(city.garbage.uncollected).toBeCloseTo(city.garbage.load, 6); // 処理量があっても、街のごみは別の道路網
    expect(city.garbage.penalty).toBeGreaterThan(0);
  });

  it("ごみ処理場そのものが、近くの住宅に悪臭を出す (遠くには出さない)", () => {
    const { city, x0, roadY } = setup({ r: true, c: false, i: false });
    for (let i = 0; i < 80; i++) city.tick();
    expect(homes(city).length).toBeGreaterThan(0);
    const base = odorSum(city); // 下水処理場の悪臭だけ
    forceFacility(city, FacilityType.Garbage, x0 + 9, roadY - 2); // 住宅のすぐ近く
    city.refresh();
    expect(odorSum(city)).toBeGreaterThan(base);
    for (const f of [...city.facilities.values()]) if (f.type === FacilityType.Garbage) city.removeFacility(f.id);
    forceFacility(city, FacilityType.Garbage, x0 + 36, roadY - 2); // 遠い
    city.refresh();
    expect(odorSum(city)).toBeCloseTo(base, 9);
  });

  it("保存して読み込んでも、ごみ処理場が残り、ごみの状態は求め直されて同じになる", () => {
    const { city } = bigTown({ garbage: 1 });
    const loaded = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    loaded.refresh();
    city.refresh();
    expect([...loaded.facilities.values()].some((f) => f.type === FacilityType.Garbage)).toBe(true);
    expect(loaded.garbage.supply).toBe(city.garbage.supply);
    expect(loaded.garbage.load).toBeCloseTo(city.garbage.load, 6);
    expect(loaded.garbage.uncollected).toBeCloseTo(city.garbage.uncollected, 6);
  });

  it("建設費が引かれる", () => {
    const { city, x0, roadY } = bigTown();
    const m0 = city.money;
    expect(city.placeFacility(FacilityType.Garbage, x0 + 36, roadY - 3)).toEqual({ ok: true });
    expect(m0 - city.money).toBe(FACILITY_SPECS[FacilityType.Garbage].cost);
  });
});
