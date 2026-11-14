import { describe, expect, it } from "vitest";
import {
  crisisPolicyEffect,
  coordinationScore,
  evacuationStats,
  recoveryDaysFor,
  reliefRequired,
  reliefStats,
} from "../src/sim/crisis";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { setup } from "./helpers";

function cityWithFire() {
  const { city } = setup();
  for (let i = 0; i < 90; i++) city.tick();
  city.refresh();
  const building = [...city.zones.cells.values()].find((cell) => cell.building > 0 && cell.part === undefined)!;
  expect(building).toBeDefined();
  city.disastersEnabled = true;
  city.fire = { x: building.x, y: building.y, started: city.day };
  city.refresh();
  return { city, building };
}

describe("M23 危機管理の計算", () => {
  it("防災条例の効果を数値化する", () => {
    const off = crisisPolicyEffect(false);
    const on = crisisPolicyEffect(true);
    expect(off.monthlyCostPerResident).toBe(0);
    expect(on.monthlyCostPerResident).toBe(500);
    expect(on.damageChanceReduction).toBeGreaterThan(0);
    expect(on.recoveryDaysShortened).toBe(2);
  });

  it("避難は避難指示と避難所容量で人数を決める", () => {
    expect(evacuationStats(120, 50, false, crisisPolicyEffect(false)).evacuatedResidents).toBe(0);
    expect(evacuationStats(120, 50, true, crisisPolicyEffect(false))).toMatchObject({ evacuatedResidents: 50, unaccommodatedResidents: 70 });
    expect(evacuationStats(120, 50, false, crisisPolicyEffect(true)).evacuatedResidents).toBe(10);
  });

  it("救援物資の必要量と充足率を災害別に計算する", () => {
    const policy = crisisPolicyEffect(false);
    expect(reliefRequired("flood", 100, 4, policy)).toBe(8);
    expect(reliefStats("flood", 100, 4, 4, policy).coverage).toBeCloseTo(0.5);
    expect(reliefStats("flood", 100, 4, 20, policy).coverage).toBe(1);
  });

  it("連携スコアと復旧優先度の短縮日数を計算する", () => {
    expect(coordinationScore({ fire: true, police: true, hospital: false }).score).toBeCloseTo(2 / 3);
    expect(recoveryDaysFor("critical", 10)).toBe(6);
    expect(recoveryDaysFor("high", 10)).toBe(8);
  });
});

describe("M23 City 連携", () => {
  it("避難指示・物資投入の状態を保存して復元する", () => {
    const { city } = cityWithFire();
    const money = city.money;
    expect(city.orderEvacuation()).toBe(true);
    expect(city.deliverReliefSupplies(3)).toBe(true);
    const status = city.crisisStatus();
    expect(status.kind).toBe("fire");
    expect(status.evacuation.affectedResidents).toBeGreaterThan(0);
    expect(status.relief.delivered).toBe(3);
    expect(city.money).toBe(money - 300_000);
    const loaded = City.fromData(city.toData());
    loaded.refresh();
    expect(loaded.crisis).toEqual(city.crisis);
    expect(loaded.crisisStatus().relief.delivered).toBe(3);
  });

  it("損傷した施設の復旧優先度が自動復旧予定を短縮する", () => {
    const { city } = setup();
    city.refresh();
    city.disastersEnabled = true;
    const plant = [...city.facilities.values()].find((f) => f.type === FacilityType.Power)!;
    city.facilityDamage.set(plant.id, city.day + 10);
    expect(city.setRecoveryPriority({ kind: "facility", id: plant.id }, "critical")).toBe(true);
    expect(city.facilityDamage.get(plant.id)).toBe(city.day + 6);
    expect(city.recoveryQueue()).toEqual([{ kind: "facility", id: plant.id, priority: "critical" }]);
    const loaded = City.fromData(city.toData());
    expect(loaded.recoveryPriorityOf({ kind: "facility", id: plant.id })).toBe("critical");
  });

  it("M11 の古いセーブは危機管理状態を初期化して読み込める", () => {
    const { city } = cityWithFire();
    const data = city.toData();
    delete data.crisis;
    const loaded = City.fromData(data);
    expect(loaded.crisis.evacuation).toBeNull();
    expect(loaded.crisis.relief).toBeNull();
    expect(loaded.crisisStatus().kind).toBe("fire");
    expect(loaded.crisisStatus().relief.delivered).toBe(0);
  });

  it("存在しない復旧対象や重複した優先度を拒否する", () => {
    const { city } = setup();
    const data = city.toData();
    expect(() => City.fromData({ ...data, crisis: { priorities: [{ kind: "facility", id: 9999, priority: "critical" }] } })).toThrow();
    expect(() => City.fromData({ ...data, crisis: { priorities: [{ kind: "facility", id: 1, priority: "critical" }, { kind: "facility", id: 1, priority: "high" }] } })).toThrow();
  });
});
