import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { hash2 } from "../src/sim/rng";
import { setup } from "./helpers";

function prepared() {
  const { city } = setup();
  city.refresh();
  const plant = [...city.facilities.values()].find((f) => f.type === FacilityType.Power)!;
  city.disastersEnabled = true;
  return { city, plant };
}

describe("発電施設の故障", () => {
  it("故障施設だけ供給が止まり、支払って修理すると戻る", () => {
    const { city, plant } = prepared();
    const original = city.utilities.power.supply;
    city.outage = { facilityId: plant.id, started: city.day };
    city.refresh();
    expect(city.utilities.power.supply).toBe(original - 300);
    expect(city.notices().some((s) => s.includes("故障して停電"))).toBe(true);
    const funds = city.money;
    expect(city.repairOutage()).toBe(true);
    expect(city.money).toBe(funds - 2_000_000);
    expect(city.utilities.power.supply).toBe(original);
    expect(city.outage).toBeNull();
  });

  it("資金不足で即時修理できず、7日で自動復旧する", () => {
    const { city, plant } = prepared();
    city.outage = { facilityId: plant.id, started: city.day };
    city.money = 0;
    expect(city.repairOutage()).toBe(false);
    for (let i = 0; i < 6; i++) city.tick();
    expect(city.outage?.facilityId).toBe(plant.id);
    city.tick();
    expect(city.outage).toBeNull();
    expect(city.utilities.power.supply).toBeGreaterThanOrEqual(1200);
  });

  it("撤去した施設の故障を解除する", () => {
    const { city, plant } = prepared();
    city.outage = { facilityId: plant.id, started: city.day };
    city.removeFacility(plant.id);
    expect(city.outage).toBeNull();
  });

  it("保存と再開、旧データ、不正データを扱う", () => {
    const { city, plant } = prepared();
    city.outage = { facilityId: plant.id, started: city.day };
    const data = city.toData();
    const loaded = City.fromData(data);
    loaded.refresh();
    expect(loaded.outage).toEqual(city.outage);
    expect(loaded.utilities.power.supply).toBe(900);
    const old = { ...data }; delete old.outage; delete old.disastersEnabled;
    expect(City.fromData(old).outage).toBeNull();
    expect(() => City.fromData({ ...data, outage: { facilityId: 0, started: 0 } })).toThrow();
    expect(() => City.fromData({ ...data, disastersEnabled: false })).toThrow();
    const water = data.facilities.find((f) => f.type === FacilityType.Water)!;
    expect(() => City.fromData({ ...data, outage: { facilityId: water.id, started: 0 } })).toThrow();
  });

  it("災害の有無で発生を切り替え、保存後も同じ施設が故障する", () => {
    const { city } = prepared();
    let day = city.day + 1;
    while (hash2(city.seed ^ 0x7b47a19, day, 0) >= 1 / 360) day++;
    city.day = day - 1;
    const same = City.fromData(city.toData());
    const disabled = City.fromData({ ...city.toData(), disastersEnabled: false });
    city.tick(); same.tick(); disabled.tick();
    expect(city.outage).not.toBeNull();
    expect(same.outage).toEqual(city.outage);
    expect(disabled.outage).toBeNull();
  });
});
