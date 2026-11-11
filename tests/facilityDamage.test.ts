import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { hash2 } from "../src/sim/rng";
import { setup } from "./helpers";

function prepared() {
  const { city } = setup(); city.refresh(); city.disastersEnabled = true;
  const plant = [...city.facilities.values()].find((f) => f.type === FacilityType.Power)!;
  return { city, plant };
}

describe("地震による施設の損傷", () => {
  it("地震で施設が損傷し、電力供給を停止する", () => {
    const { city, plant } = prepared();
    let start = city.day;
    while (hash2(city.seed ^ start ^ 0x7c21, plant.id, 0) >= 0.35) start++;
    city.day = start;
    city.quake = { x: plant.x, y: plant.y, started: start };
    city.tick();
    expect(city.facilityDamage.get(plant.id)).toBe(city.day + 10);
    expect(city.facilityActive(plant)).toBe(false);
    expect(city.utilities.power.supply).toBeLessThan(1200);
  });

  it("資金不足を拒否し、即時修理で供給を戻す", () => {
    const { city, plant } = prepared();
    city.facilityDamage.set(plant.id, city.day + 10); city.refresh();
    city.money = 1_999_999;
    expect(city.repairFacilityDamage(plant.id)).toBe(false);
    city.money = 2_000_000;
    expect(city.repairFacilityDamage(plant.id)).toBe(true);
    expect(city.money).toBe(0);
    expect(city.facilityDamage.has(plant.id)).toBe(false);
    expect(city.utilities.power.supply).toBe(1200);
    expect(city.repairFacilityDamage(plant.id)).toBe(false);
  });

  it("日数経過で復旧し、撤去した施設の損傷も消える", () => {
    const { city, plant } = prepared();
    city.facilityDamage.set(plant.id, city.day + 2); city.refresh();
    city.tick(); expect(city.facilityDamage.has(plant.id)).toBe(true);
    city.tick(); expect(city.facilityDamage.has(plant.id)).toBe(false);
    expect(city.utilities.power.supply).toBe(1200);
    city.facilityDamage.set(plant.id, city.day + 10);
    city.removeFacility(plant.id);
    expect(city.facilityDamage.has(plant.id)).toBe(false);
  });

  it("外部接続の損傷中は外部から接続できない", () => {
    const { city } = prepared();
    const outside = [...city.facilities.values()].find((f) => f.type === FacilityType.Outside)!;
    expect(city.outsideNets.size).toBeGreaterThan(0);
    city.facilityDamage.set(outside.id, city.day + 10); city.refresh();
    expect(city.outsideNets.size).toBe(0);
    expect(city.repairFacilityDamage(outside.id)).toBe(true);
    expect(city.outsideNets.size).toBeGreaterThan(0);
  });

  it("損傷を保存し、旧データと不正データを検証する", () => {
    const { city, plant } = prepared();
    city.facilityDamage.set(plant.id, city.day + 10);
    const data = city.toData();
    expect(City.fromData(data).facilityDamage.get(plant.id)).toBe(city.day + 10);
    const old = { ...data }; delete old.facilityDamage;
    expect(City.fromData(old).facilityDamage.size).toBe(0);
    expect(() => City.fromData({ ...data, facilityDamage: [[999999, 10]] })).toThrow();
    expect(() => City.fromData({ ...data, facilityDamage: [[plant.id, 10], [plant.id, 11]] })).toThrow();
    expect(() => City.fromData({ ...data, disastersEnabled: false })).toThrow();
  });
});
