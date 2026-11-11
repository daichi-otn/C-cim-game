import { describe, expect, it } from "vitest";
import { primaryOutput, PRIMARY_RESOURCE } from "../src/sim/primaryIndustry";
describe("M13 一次産業", () => {
  it("資源種別と生産量を持つ", () => { expect(PRIMARY_RESOURCE.mine).toBe("ore"); expect(primaryOutput(12)).toBe(120); });
});
