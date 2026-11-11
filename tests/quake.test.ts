import { describe, expect, it } from "vitest";
import { City, QUAKE_DAYS } from "../src/sim/city";
import { hash2 } from "../src/sim/rng";
import { setup } from "./helpers";

function prepared() {
  const { city } = setup();
  for (let i = 0; i < 90; i++) city.tick();
  city.refresh();
  const c = [...city.zones.cells.values()].find((v) => v.building > 0 && v.part === undefined)!;
  expect(c).toBeDefined();
  city.disastersEnabled = true;
  city.quake = { x: c.x, y: c.y, started: city.day };
  return { city, c };
}

describe("地震", () => {
  it("震源の建物が被害を受け、住民データが整合する", () => {
    const { city, c } = prepared();
    expect(city.notices().some((s) => s.includes("地震が発生"))).toBe(true);
    city.tick();
    expect(c.building).toBe(0);
    expect(city.people.filter((p) => p.home[0] === c.x && p.home[1] === c.y)).toHaveLength(0);
    expect(city.isQuakeArea(c.x, c.y)).toBe(true);
    for (let i = 1; i < QUAKE_DAYS; i++) city.tick();
    expect(city.quake).toBeNull();
    expect(city.isQuakeArea(c.x, c.y)).toBe(false);
  });

  it("余震の終了後に空き区画から再建できる", () => {
    const { city, c } = prepared();
    city.tick();
    for (let i = 1; i < QUAKE_DAYS; i++) city.tick();
    city.disastersEnabled = false;
    for (let i = 0; i < 100 && c.building === 0; i++) city.tick();
    expect(c.building).toBeGreaterThan(0);
  });

  it("災害の設定と地震を保存し、古いデータと不正なデータを扱う", () => {
    const { city } = prepared();
    const data = city.toData();
    expect(City.fromData(data).quake).toEqual(city.quake);
    const old = { ...data }; delete old.quake; delete old.disastersEnabled;
    expect(City.fromData(old).quake).toBeNull();
    expect(() => City.fromData({ ...data, quake: { x: 0, y: 0, started: -1 } })).toThrow();
    expect(() => City.fromData({ ...data, disastersEnabled: false })).toThrow();
  });

  it("有効な街で発生し、セーブ後も同じ場所に発生する", () => {
    const { city } = prepared();
    city.quake = null;
    let day = city.day + 1;
    while (hash2(city.seed ^ 0x19b8a71, day, 0) >= 1 / 900) day++;
    city.day = day - 1;
    for (const c of city.zones.cells.values()) if (c.building > 0) c.built = city.day;
    const same = City.fromData(city.toData());
    const disabled = City.fromData({ ...city.toData(), disastersEnabled: false });
    city.tick(); same.tick(); disabled.tick();
    expect(city.quake).not.toBeNull();
    expect(same.quake).toEqual(city.quake);
    expect(disabled.quake).toBeNull();
  });
});
