import { describe, expect, it } from "vitest";
import { resourceAt, resourceSummary } from "../src/sim/resources";

describe("M13 資源", () => {
  it("同じシードと座標で同じ資源になる", () => expect(resourceAt(12345, 10, 20)).toBe(resourceAt(12345, 10, 20)));
  it("所有区画の資源を集計できる", () => {
    const s = resourceSummary(12345, ["0,0", "16,0"]);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(128);
  });
});
