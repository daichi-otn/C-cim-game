import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH } from "../src/sim/city";
import { industryFlow } from "../src/sim/primaryIndustry";
import { trafficIterationsFor } from "../src/sim/traffic";

describe("M11〜M15 バランスの基本条件", () => {
  it("条例・交通・産業の費用と量が極端にならない", () => {
    const city = new City(123);
    city.welfarePolicy = true;
    city.disasterPreparedness = true;
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    expect(city.lastBudget?.welfare).toBeGreaterThanOrEqual(0);
    expect(city.lastBudget?.disasterPreparedness).toBeGreaterThanOrEqual(0);
    expect(industryFlow(100, true).processed).toBe(65);
    expect(trafficIterationsFor(10_000, 10_000)).toBe(2);
  });
});
