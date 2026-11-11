import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { hash2 } from "../src/sim/rng";
import { forceFacility, setup } from "./helpers";

function growingCity() {
  const s = setup();
  for (let i = 0; i < 90; i++) s.city.tick();
  s.city.refresh();
  const building = [...s.city.zones.cells.values()].find((c) => c.building > 0 && c.part === undefined)!;
  expect(building).toBeDefined();
  s.city.disastersEnabled = true;
  s.city.fire = { x: building.x, y: building.y, started: s.city.day };
  return { ...s, building };
}

describe("火災", () => {
  it("消防が届かないと建物が失われ、住民のデータも更新される", () => {
    const { city, building } = growingCity();
    for (let i = 0; i < 4; i++) city.tick();
    expect(city.fire).toBeNull();
    expect(building.building).toBe(0);
    expect(city.people.filter((p) => p.home[0] === building.x && p.home[1] === building.y)).toHaveLength(0);
  });

  it("同じ道路網の近くの消防署が2日で消火する", () => {
    const { city, x0, roadY } = growingCity();
    forceFacility(city, FacilityType.Fire, x0 + 1, roadY - 2);
    city.refresh();
    // 消防署の届く建物を選び、道路網も同じことを確認する。
    const near = [...city.zones.cells.values()].find((c) => c.building > 0 && c.part === undefined && c.net > 0 && Math.hypot(c.x - (x0 + 2), c.y - (roadY - 1)) < 10)!;
    expect(near).toBeDefined();
    city.fire = { x: near.x, y: near.y, started: city.day };
    expect(city.notices().some((s) => s.includes("消防署が対応中"))).toBe(true);
    city.tick(); city.tick();
    expect(city.fire).toBeNull();
    expect(near.building).toBeGreaterThan(0);
  });

  it("同じ道路網でも一方通行で現場に行けなければ消防が到達できない", () => {
    const { city, x0, roadY } = growingCity();
    forceFacility(city, FacilityType.Fire, x0 + 1, roadY - 2);
    const near = [...city.zones.cells.values()].find((c) => c.building > 0 && c.part === undefined && c.x >= x0 + 5 && c.x <= x0 + 10)!;
    expect(near).toBeDefined();
    city.graph.addRoad(x0 + 39.5, roadY + 0.5, x0 + 0.5, roadY + 0.5, undefined, true);
    city.refresh(); city.fire = { x: near.x, y: near.y, started: city.day };
    expect(city.notices().some((s) => s.includes("消防署が対応中"))).toBe(false);
    city.graph.addRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, undefined, true);
    city.refresh();
    expect(city.notices().some((s) => s.includes("消防署が対応中"))).toBe(true);
  });

  it("災害が有効な街だけで火災が発生し、セーブ後も同じ結果になる", () => {
    const { city } = growingCity();
    city.fire = null;
    let day = city.day + 1;
    while (hash2(city.seed ^ 0x4a2f113, day, 0) >= 1 / 180) day++;
    city.day = day - 1;
    const enabled = City.fromData(city.toData());
    const disabled = City.fromData({ ...city.toData(), disastersEnabled: false });
    city.tick(); enabled.tick(); disabled.tick();
    expect(city.fire).not.toBeNull();
    expect(enabled.fire).toEqual(city.fire);
    expect(disabled.fire).toBeNull();
  });

  it("設定と火災を保存し、旧データや不正データを扱う", () => {
    const { city } = growingCity();
    const data = city.toData();
    expect(City.fromData(data).fire).toEqual(city.fire);
    const old = { ...data }; delete old.disastersEnabled; delete old.fire;
    expect(City.fromData(old).disastersEnabled).toBe(false);
    expect(() => City.fromData({ ...data, fire: { x: 0, y: 0, started: -1 } })).toThrow();
    expect(() => City.fromData({ ...data, disastersEnabled: false })).toThrow();
  });
});
