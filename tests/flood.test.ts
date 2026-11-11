import { describe, expect, it } from "vitest";
import { City, FLOOD_DAYS } from "../src/sim/city";
import { lotCenter } from "../src/sim/zoning";
import { hash2 } from "../src/sim/rng";
import { Tile, tileAt } from "../src/sim/terrain";
import { weatherOn } from "../src/sim/weather";
import { setup } from "./helpers";

function prepared() {
  const { city } = setup();
  for (let i = 0; i < 90; i++) city.tick();
  city.refresh();
  const c = [...city.zones.cells.values()].find((v) => v.building > 0 && v.part === undefined && v.served)!;
  expect(c).toBeDefined();
  city.disastersEnabled = true;
  city.flood = { x: c.x, y: c.y, started: city.day };
  return { city, c };
}

describe("洪水", () => {
  it("範囲内の建物が停止し、被害の後に水が引く", () => {
    const { city, c } = prepared();
    city.refresh();
    expect(city.isFlooded(lotCenter(c).x, lotCenter(c).y)).toBe(true);
    expect(c.served).toBe(false);
    expect(city.notices().some((s) => s.includes("洪水が発生"))).toBe(true);
    city.tick(); city.tick();
    expect(c.building).toBe(0);
    expect(city.people.filter((p) => p.home[0] === c.x && p.home[1] === c.y)).toHaveLength(0);
    for (let i = 2; i < FLOOD_DAYS; i++) city.tick();
    expect(city.flood).toBeNull();
    expect(city.isFlooded(c.x, c.y)).toBe(false);
  });

  it("浸水した施設は供給を止め、水が引けば復旧する", () => {
    const { city } = prepared();
    const plant = [...city.facilities.values()].find((f) => f.type === 1)!;
    city.flood = { x: plant.x, y: plant.y, started: city.day };
    city.refresh();
    expect(city.utilities.power.supply).toBeLessThan(1200);
    city.day += FLOOD_DAYS - 1;
    city.tick();
    expect(city.flood).toBeNull();
    expect(city.utilities.power.supply).toBe(1200);
  });

  it("進行中の浸水を保存し、旧データと不正データを扱う", () => {
    const { city } = prepared();
    const data = city.toData();
    const loaded = City.fromData(data);
    loaded.refresh();
    expect(loaded.flood).toEqual(city.flood);
    expect(loaded.isFlooded(city.flood!.x, city.flood!.y)).toBe(true);
    const old = { ...data }; delete old.flood; delete old.disastersEnabled;
    expect(City.fromData(old).flood).toBeNull();
    expect(() => City.fromData({ ...data, flood: { x: 0, y: 0, started: -1 } })).toThrow();
    expect(() => City.fromData({ ...data, disastersEnabled: false })).toThrow();
  });

  it("雨の日に水辺の建物から発生し、無効の街では発生しない", () => {
    const { city, c } = prepared();
    let water: { x: number; y: number } | undefined;
    for (let y = -100; y <= 100 && !water; y += 3) for (let x = -100; x <= 100; x += 3) {
      if (tileAt(city.seed, x, y) === Tile.Water && tileAt(city.seed, x + 6, y) === Tile.Grass) { water = { x, y }; break; }
    }
    expect(water).toBeDefined();
    const x = water!.x + 6, y = water!.y;
    city.zones.cells.clear();
    city.zones.cells.set(`${x},${y}`, { ...c, x, y, building: 1, part: undefined, w: 1, h: 1 });
    city.flood = null;
    let day = city.day + 1;
    while (weatherOn(city.seed, day) !== "rain" || hash2(city.seed ^ 0x6d98a32, day, 0) >= 1 / 180) day++;
    city.day = day - 1;
    city.zones.get(x, y)!.built = city.day;
    const disabled = City.fromData({ ...city.toData(), disastersEnabled: false });
    city.tick(); disabled.tick();
    expect(city.flood).toMatchObject({ x, y, started: day });
    expect(disabled.flood).toBeNull();
  });
});
