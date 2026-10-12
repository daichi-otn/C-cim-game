import { describe, expect, it } from "vitest";
import { ageMixAt, PENSION_PER_SENIOR, placeHash, UNSCHOOLED_HAPPINESS_PENALTY } from "../src/sim/people";

describe("住民の年齢層", () => {
  it("年齢の割合は、合計が 1 で、子どもと高齢者は範囲内", () => {
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 20; y++) {
        const m = ageMixAt(12345, x, y);
        expect(m.child + m.adult + m.senior).toBeCloseTo(1, 9);
        expect(m.child).toBeGreaterThanOrEqual(0.2);
        expect(m.child).toBeLessThanOrEqual(0.4);
        expect(m.senior).toBeGreaterThanOrEqual(0.1);
        expect(m.senior).toBeLessThanOrEqual(0.3);
      }
  });
  it("同じ場所・同じ種なら、いつも同じ (場所が違えば、割合も違う)", () => {
    expect(ageMixAt(7, 3, 4)).toEqual(ageMixAt(7, 3, 4));
    expect(placeHash(7, 3, 4, 1)).toBe(placeHash(7, 3, 4, 1));
    expect(ageMixAt(7, 3, 4).child).not.toBe(ageMixAt(7, 9, 1).child);
  });
  it("年金と幸福度への影響は正の値", () => {
    expect(PENSION_PER_SENIOR).toBeGreaterThan(0);
    expect(UNSCHOOLED_HAPPINESS_PENALTY).toBeGreaterThan(0);
    expect(UNSCHOOLED_HAPPINESS_PENALTY).toBeLessThanOrEqual(1);
  });
});
