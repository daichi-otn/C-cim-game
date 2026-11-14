import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH } from "../src/sim/city";
import { setup } from "./helpers";

describe("暮らしの支援条例", () => {
  it("住民の幸福度を上げ、月末に費用を計上する", () => {
    const { city } = setup();
    for (let i = 0; i < 90; i++) city.tick();
    city.refresh();
    expect(city.zones.totals().population).toBeGreaterThan(0);
    const before = city.happiness;
    city.welfarePolicy = true;
    city.refresh();
    expect(city.happiness).toBeCloseTo(Math.min(1, before + 0.1));
    while ((city.day + 1) % DAYS_PER_MONTH !== 0) city.tick();
    city.tick();
    expect(city.lastBudget?.welfare).toBe(Math.round(city.zones.totals().population * 1000));
    expect(city.lastMonth.expense).toBeGreaterThanOrEqual(city.lastBudget!.welfare);
    expect(City.fromData(city.toData()).welfarePolicy).toBe(true);
  });

  it("旧データでは無効で、不正な設定を拒否する", () => {
    const data = new City(1).toData();
    delete data.welfarePolicy;
    expect(City.fromData(data).welfarePolicy).toBe(false);
    expect(() => City.fromData({ ...data, welfarePolicy: 1 as unknown as boolean })).toThrow();
  });

  it("災害対策条例を保存し、月額費用を計上する", () => {
    const { city } = setup();
    for (let i = 0; i < 90; i++) city.tick();
    city.disasterPreparedness = true;
    while ((city.day + 1) % DAYS_PER_MONTH !== 0) city.tick();
    city.tick();
    expect(city.lastBudget?.disasterPreparedness).toBe(Math.round(city.zones.totals().population * 500));
    expect(city.lastMonth.expense).toBeGreaterThanOrEqual(city.lastBudget!.disasterPreparedness);
    expect(City.fromData(city.toData()).disasterPreparedness).toBe(true);
    const data = city.toData();
    expect(() => City.fromData({ ...data, disasterPreparedness: 1 as unknown as boolean })).toThrow();
  });

  it("教育・医療・交通安全の政策レベルを保存し、費用を計上する", () => {
    const { city } = setup();
    for (let i = 0; i < 90; i++) city.tick();
    city.educationPolicy = 2;
    city.medicalPolicy = 1;
    city.trafficPolicy = 2;
    while ((city.day + 1) % DAYS_PER_MONTH !== 0) city.tick();
    city.tick();
    expect(city.lastBudget?.education).toBe(Math.round(city.children * 1600));
    expect(city.lastBudget?.medical).toBe(Math.round(city.zones.totals().population * 400));
    expect(city.lastBudget?.traffic).toBe(Math.round(city.zones.totals().population * 550));
    const loaded = City.fromData(city.toData());
    expect(loaded.educationPolicy).toBe(2);
    expect(loaded.medicalPolicy).toBe(1);
    expect(loaded.trafficPolicy).toBe(2);
    expect(() => City.fromData({ ...city.toData(), educationPolicy: 3 })).toThrow();
  });
});
