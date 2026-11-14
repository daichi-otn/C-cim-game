import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { simulateLogistics, warehouseCapacityOf } from "../src/sim/logistics";

const primary = [
  { id: 1, type: "farm" as const, x: 0, y: 0, workers: 10, output: 20 },
  { id: 2, type: "forestry" as const, x: 2, y: 0, workers: 5, output: 10 },
];

describe("M21 産業物流", () => {
  it("原料を加工し、店舗と住民へ配送して収支を計算する", () => {
    const stats = simulateLogistics({ primary, industrialJobs: 20, commercialJobs: 20, population: 20, outsideConnected: false });
    expect(stats.manufactured).toBe(15); // (20 + 10) / 2。工業雇用枠は余る
    expect(stats.deliveries).toBe(14);
    expect(stats.consumption).toBe(14);
    expect(stats.employment.primary).toBe(15);
    expect(stats.employment.manufacturing).toBe(15);
    expect(stats.flows.farmOutput.consumed).toBe(0);
    expect(stats.flows.food.produced).toBe(10);
    expect(stats.flows.lumber.produced).toBe(5);
    expect(stats.shortage).toBe(0);
  });

  it("外部接続があると製品不足を輸入で補い、余剰原料を輸出する", () => {
    const stats = simulateLogistics({ primary: [{ id: 1, type: "oil", x: 0, y: 0, workers: 1, output: 1 }], industrialJobs: 0, commercialJobs: 0, population: 20, outsideConnected: true });
    expect(stats.consumption).toBe(4);
    expect(stats.flows.food.imported).toBe(4);
    expect(stats.shortage).toBe(0);
    expect(stats.flows.crudeOil.exported).toBe(1);
  });

  it("外部接続がないと不足と倉庫あふれを正確に残す", () => {
    const stats = simulateLogistics({ primary: [{ id: 1, type: "farm", x: 0, y: 0, workers: 1, output: 100 }], industrialJobs: 0, commercialJobs: 0, population: 0, outsideConnected: false, warehouseCapacity: 20 });
    expect(stats.warehouse.used).toBe(20);
    expect(stats.stranded).toBe(80);
    expect(stats.flows.farmOutput.stored).toBe(20);
    expect(stats.flows.farmOutput.exported).toBe(0);
  });

  it("同じ入力から同じ物流収支を再現できる", () => {
    const input = { primary, industrialJobs: 24, commercialJobs: 13, population: 41, outsideConnected: true };
    expect(simulateLogistics(input)).toEqual(simulateLogistics(input));
    expect(warehouseCapacityOf(2, 24)).toBe(92);
  });

  it("City の産業統計にも物流と雇用を反映する", () => {
    const city = new City(12345);
    city.industries.push(...primary);
    const stats = city.industryStats();
    expect(stats.logistics.enterprises.primary).toBe(2);
    expect(stats.logistics.employment.primary).toBe(15);
    expect(stats.logistics.manufactured).toBe(0);
  });
});
