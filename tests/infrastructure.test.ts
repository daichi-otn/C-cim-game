import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH, ROAD_UPKEEP_PER_TILE } from "../src/sim/city";
import { FACILITY_SPECS, FacilityType, buildingLoad, checkFacilityPlacement } from "../src/sim/facilities";
import { isBuildableTile } from "../src/sim/roadPlacement";
import { Tile, tileAt } from "../src/sim/terrain";
import { ZoneType } from "../src/sim/zoning";
import { ALL_SERVICES, SEED, facilitySlots, findLand, forceFacility, setup } from "./helpers";

const grow = (city: City, days = 300) => {
  for (let i = 0; i < days; i++) city.tick();
};
const totalBuildings = (city: City) => Object.values(city.zones.stats()).reduce((n, v) => n + v.buildings, 0);

describe("buildingLoad", () => {
  it("人数に比例し、工業の電力は 2 倍", () => {
    expect(buildingLoad(ZoneType.Residential, 1)).toEqual({ power: 4, water: 4, sewage: 4 });
    expect(buildingLoad(ZoneType.Residential, 3)).toEqual({ power: 12, water: 12, sewage: 12 });
    expect(buildingLoad(ZoneType.Commercial, 2)).toEqual({ power: 6, water: 6, sewage: 6 });
    expect(buildingLoad(ZoneType.Industrial, 1)).toEqual({ power: 8, water: 4, sewage: 4 });
  });
});

describe("施設の建設", () => {
  function roadCity() {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    const roadY = y0 + 4;
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
    return { city, x0, roadY };
  }
  it("道路の近くに建てると費用がかかり、施設が増える", () => {
    const { city, x0, roadY } = roadCity();
    const money = city.money;
    expect(city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1)).toEqual({ ok: true });
    expect(city.money).toBe(money - FACILITY_SPECS[FacilityType.Power].cost);
    expect(city.facilities.size).toBe(1);
  });
  it("道路の上には建てられない", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.Power, x0 + 10, roadY).ok).toBe(false);
    expect(city.facilities.size).toBe(0);
  });
  it("道路から遠すぎると建てられない", () => {
    const { city, x0, roadY } = roadCity();
    expect(city.placeFacility(FacilityType.Power, x0 + 10, roadY + 5)).toMatchObject({ ok: false });
  });
  it("道路がまったくなければ建てられない", () => {
    const [x0, y0] = findLand();
    expect(new City(SEED).placeFacility(FacilityType.Power, x0, y0).ok).toBe(false);
  });
  it("ほかの施設と重ならない (隣は可)", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1); // 3×3
    expect(city.placeFacility(FacilityType.Power, x0 + 11, roadY + 1).ok).toBe(false);
    expect(city.placeFacility(FacilityType.Power, x0 + 12, roadY + 1).ok).toBe(false);
    expect(city.placeFacility(FacilityType.Power, x0 + 13, roadY + 1).ok).toBe(true);
    // 小さな施設 (2×2) は、隣なら置ける。重なる位置は置けない
    expect(city.placeFacility(FacilityType.Police, x0 + 7, roadY + 1).ok).toBe(true);
    expect(city.placeFacility(FacilityType.Police, x0 + 8, roadY + 1).ok).toBe(false);
  });
  it("お金が足りないと建てられず、お金も施設も変わらない", () => {
    const { city, x0, roadY } = roadCity();
    city.money = 100;
    expect(city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1)).toEqual({ ok: false, reason: "お金が足りません" });
    expect(city.money).toBe(100);
    expect(city.facilities.size).toBe(0);
  });
  it("水や山の上には建てられない", () => {
    // 水か山の 2×2 を探し、その脇に道路を引く
    for (let y = -150; y < 150; y++) {
      for (let x = -150; x < 150; x++) {
        const t = tileAt(SEED, x, y);
        if (t !== Tile.Water && t !== Tile.Mountain) continue;
        const city = new City(SEED);
        city.buildRoad(x - 3.5, y + 0.5, x + 4.5, y + 0.5);
        const r = checkFacilityPlacement(SEED, city.graph, city.facilities.values(), FacilityType.Power, x, y + 1);
        const covered = [0, 1].some((dy) => [0, 1].some((dx) => !isBuildableTile(tileAt(SEED, x + dx, y + 1 + dy))));
        if (covered) {
          expect(r.ok).toBe(false);
          return;
        }
      }
    }
    throw new Error("water/mountain not found");
  });
  it("ゾーンの上に建てると、そのタイルのゾーンは消え、そこには塗れなくなる", () => {
    const { city, x0, roadY } = roadCity();
    city.zones.paintRect(city.graph, { x0: x0 + 10, y0: roadY + 1, x1: x0 + 13, y1: roadY + 3 }, ZoneType.Residential); // 12 タイル
    city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1); // 3×3 = 9 タイル分
    expect(city.zones.cells.size).toBe(3);
    expect(city.zones.get(x0 + 10, roadY + 1)).toBeUndefined();
    expect(city.zones.paintRect(city.graph, { x0: x0 + 10, y0: roadY + 1, x1: x0 + 11, y1: roadY + 2 }, ZoneType.Commercial)).toBe(0);
  });
  it("給水ポンプ場は水辺でないと建てられず、水辺なら建てられる", () => {
    // 2×2 が全部陸で、まわり 1 タイルに水がある場所と、水が全くない場所を探す
    let shore: [number, number] | null = null;
    let inland: [number, number] | null = null;
    for (let y = -150; y < 150 && !(shore && inland); y++) {
      for (let x = -150; x < 150 && !(shore && inland); x++) {
        const land = [0, 1].every((dy) => [0, 1].every((dx) => isBuildableTile(tileAt(SEED, x + dx, y + dy))));
        if (!land) continue;
        let water = false;
        for (let ty = y - 1; ty <= y + 2; ty++) for (let tx = x - 1; tx <= x + 2; tx++) if (tileAt(SEED, tx, ty) === Tile.Water) water = true;
        if (water && !shore) shore = [x, y];
        if (!water && !inland) inland = [x, y];
      }
    }
    expect(shore && inland).toBeTruthy();
    for (const [site, expected] of [[shore!, true], [inland!, false]] as const) {
      const city = new City(SEED);
      city.graph.addRoad(site[0] - 4.5, site[1] + 3.5, site[0] + 6.5, site[1] + 3.5); // 2×2 の 3 タイル南に道路 (地形は問わない)
      expect(city.placeFacility(FacilityType.Water, site[0], site[1]).ok).toBe(expected);
    }
  });
  it("道路を施設の上に敷くと、施設は取り壊される", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1);
    city.buildRoad(x0 + 10.5, roadY + 0.5, x0 + 10.5, roadY + 4.5); // 縦の道路が施設を貫く
    city.syncRoads();
    expect(city.facilities.size).toBe(0);
  });
  it("取り壊しにお金は戻らない", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1);
    const money = city.money;
    const f = [...city.facilities.values()][0]!;
    expect(city.removeFacility(f.id)).toBe(true);
    expect(city.money).toBe(money);
    expect(city.removeFacility(f.id)).toBe(false);
  });
  it("facilityAt は施設のどのタイルでも施設を返す (発電所は 3×3、警察署は 2×2)", () => {
    const { city, x0, roadY } = roadCity();
    city.placeFacility(FacilityType.Power, x0 + 10, roadY + 1);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) expect(city.facilityAt(x0 + 10 + dx, roadY + 1 + dy)).toBeDefined();
    expect(city.facilityAt(x0 + 13, roadY + 1)).toBeUndefined();
    city.placeFacility(FacilityType.Police, x0 + 20, roadY + 1);
    expect(city.facilityAt(x0 + 21, roadY + 2)).toBeDefined();
    expect(city.facilityAt(x0 + 22, roadY + 1)).toBeUndefined();
  });
});

describe("電力・水道・下水", () => {
  it("施設がまったくないと、ゾーンを塗っても建物は建たない", () => {
    const { city } = setup(undefined, {});
    grow(city, 100);
    expect(totalBuildings(city)).toBe(0);
  });
  it.each(["power", "water", "sewage"] as const)("%s の施設だけ欠けていると、建物は建たない", (missing) => {
    const { city } = setup(undefined, { ...ALL_SERVICES, [missing]: 0 });
    grow(city, 100);
    expect(totalBuildings(city)).toBe(0);
  });
  it("3 つそろえば建つ", () => {
    const { city } = setup();
    grow(city, 100);
    expect(city.zones.stats().R.buildings).toBeGreaterThan(0);
  });
  it("供給量を超えては建たない (使用量 ≤ 供給量)", () => {
    const { city } = setup(undefined, { power: 1, water: 1, sewage: 1 });
    grow(city, 400);
    for (const k of ["power", "water", "sewage"] as const) {
      expect(city.utilities[k].supply).toBe(300);
      expect(city.utilities[k].used).toBeLessThanOrEqual(300);
    }
    expect(city.utilities.power.used).toBeGreaterThan(150); // 供給の半分以上は使われる
    expect(city.zones.stats().R.buildings).toBeGreaterThan(0);
  });
  it("施設を増やすと、より多くの建物が建つ", () => {
    const a = setup(undefined, { power: 1, water: 1, sewage: 1 }).city;
    const b = setup(undefined, ALL_SERVICES).city;
    grow(a, 400);
    grow(b, 400);
    expect(totalBuildings(b)).toBeGreaterThan(totalBuildings(a));
  });
  it("発電所を取り壊すと建物は供給を失い、人口と雇用が数えられなくなる", () => {
    const { city } = setup();
    grow(city, 200);
    expect(city.zones.totals().population).toBeGreaterThan(0);
    for (const f of [...city.facilities.values()]) if (f.type === FacilityType.Power) city.removeFacility(f.id);
    city.tick();
    expect(city.zones.totals()).toEqual({ population: 0, jobsC: 0, jobsI: 0, jobsO: 0, sick: 0 });
    expect(city.utilities.power.supply).toBe(0);
    expect([...city.zones.cells.values()].some((c) => c.building > 0 && !c.served)).toBe(true);
  });
  it("供給を失った間は税収が入らない", () => {
    const { city } = setup();
    grow(city, 200);
    for (const f of [...city.facilities.values()]) if (f.type === FacilityType.Power) city.removeFacility(f.id);
    while (city.day % DAYS_PER_MONTH !== 0) city.tick();
    city.tick();
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    expect(city.lastMonth.income).toBe(0);
  });
  it("供給が戻れば、また人口に数えられる", () => {
    const { city, x0, roadY } = setup();
    grow(city, 200);
    const pop = city.zones.totals().population;
    const powers = [...city.facilities.values()].filter((f) => f.type === FacilityType.Power);
    for (const f of powers) city.removeFacility(f.id);
    city.tick();
    expect(city.zones.totals().population).toBe(0);
    const slots = facilitySlots(x0, roadY).slice(10);
    for (const [fx, fy] of slots.slice(0, powers.length)) forceFacility(city, FacilityType.Power, fx, fy);
    city.tick();
    expect(city.zones.totals().population).toBeGreaterThan(0);
    expect(city.zones.totals().population).toBeLessThanOrEqual(pop + 50);
  });
  it("道路でつながっていない施設は供給できない", () => {
    const { city, x0, roadY } = setup(undefined, {});
    // 道路の西端よりずっと離れた場所に施設を置く (どの道路にも届かない)
    forceFacility(city, FacilityType.Power, x0 - 20, roadY + 1);
    forceFacility(city, FacilityType.Water, x0 - 24, roadY + 1);
    forceFacility(city, FacilityType.Sewage, x0 - 28, roadY + 1);
    grow(city, 100);
    expect(city.utilities.power.supply).toBe(0);
    expect(totalBuildings(city)).toBe(0);
  });
  it("別々の道路網は供給を分け合わない", () => {
    const { city, x0, y0 } = setup(undefined, {});
    const y2 = y0 - 12;
    city.buildRoad(x0 + 0.5, y2 + 0.5, x0 + 20.5, y2 + 0.5);
    forceFacility(city, FacilityType.Power, x0 + 2, y2 + 1);
    forceFacility(city, FacilityType.Water, x0 + 5, y2 + 1);
    forceFacility(city, FacilityType.Sewage, x0 + 8, y2 + 1);
    grow(city, 100);
    expect(totalBuildings(city)).toBe(0); // 主道路の側のゾーンには届かない
    expect(city.utilities.power.supply).toBe(300); // 施設自体は別の道路網の中で生きている
  });
  it("道路をつなぐと供給が届く", () => {
    const { city, x0, y0, roadY } = setup(undefined, {});
    const y2 = y0 - 12;
    city.buildRoad(x0 + 0.5, y2 + 0.5, x0 + 20.5, y2 + 0.5);
    forceFacility(city, FacilityType.Power, x0 + 2, y2 + 1);
    forceFacility(city, FacilityType.Power, x0 + 4, y2 + 1);
    forceFacility(city, FacilityType.Water, x0 + 7, y2 + 1);
    forceFacility(city, FacilityType.Water, x0 + 10, y2 + 1);
    forceFacility(city, FacilityType.Sewage, x0 + 13, y2 + 1);
    forceFacility(city, FacilityType.Sewage, x0 + 16, y2 + 1);
    grow(city, 20);
    expect(city.zones.stats().R.buildings).toBe(0);
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 0.5, y2 + 0.5); // 2 本の道路を縦につなぐ
    grow(city, 100);
    expect(city.zones.stats().R.buildings).toBeGreaterThan(0);
  });
  it("月末に施設の維持費が引かれる", () => {
    const { city } = setup(undefined, { power: 2, water: 1, sewage: 1 }, false);
    const length = city.graph.totalLength();
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    const upkeep =
      2 * FACILITY_SPECS[FacilityType.Power].upkeep + FACILITY_SPECS[FacilityType.Water].upkeep + FACILITY_SPECS[FacilityType.Sewage].upkeep;
    expect(city.lastMonth.expense).toBe(Math.round(length * ROAD_UPKEEP_PER_TILE) + upkeep);
  });
  it("注意書き: 施設がない・不足気味を知らせる", () => {
    const { city } = setup(undefined, {});
    city.tick();
    expect(city.notices()).toEqual(expect.arrayContaining(["電力の施設がありません", "水道の施設がありません", "下水の施設がありません"]));
    const tight = setup(undefined, { power: 1, water: 1, sewage: 1 }).city;
    grow(tight, 400);
    expect(tight.notices().some((n) => n.includes("不足気味"))).toBe(true);
    const roomy = setup(undefined, { power: 4, water: 4, sewage: 4 }).city;
    grow(roomy, 5);
    expect(roomy.notices().filter((n) => !n.includes("体調"))).toEqual([]);
  });
});
