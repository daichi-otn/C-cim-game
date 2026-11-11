import { describe, expect, it } from "vitest";
import { industryFlow, primaryOutput, PRIMARY_RESOURCE } from "../src/sim/primaryIndustry";
describe("M13 一次産業", () => {
  it("資源種別と生産量を持つ", () => { expect(PRIMARY_RESOURCE.mine).toBe("ore"); expect(primaryOutput(12)).toBe(120); });
  it("外部接続へ搬出し、加工できる量を計算する", () => {
    expect(industryFlow(100, true)).toEqual({ shipped: 100, processed: 65 });
    expect(industryFlow(100, false)).toEqual({ shipped: 0, processed: 0 });
  });
});
