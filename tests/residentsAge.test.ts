import { describe, expect, it } from "vitest";
import { FacilityType } from "../src/sim/facilities";
import { PENSION_PER_SENIOR } from "../src/sim/people";
import { setup } from "./helpers";

describe("住民の年齢と年金", () => {
  it("住んでいる人は、子ども・大人・高齢者に分かれて数えられる", () => {
    const { city } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    expect(city.children + city.seniors).toBeGreaterThan(0);
    expect(city.children + city.seniors).toBeLessThan(city.zones.totals().population);
  });
  it("高齢者がいると、毎月の支出に年金が入る", () => {
    const { city } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    const seniors = city.seniors;
    expect(seniors).toBeGreaterThan(0);
    // 月末の支出は、年金の分だけ多い (年金のぶん以上)
    expect(city.lastMonth.expense).toBeGreaterThanOrEqual(Math.round(seniors * PENSION_PER_SENIOR));
  });
  it("学校が届くと、学校に通えない子どもはいなくなる", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    expect(city.unschooledChildren).toBeGreaterThan(0);
    city.placeFacility(FacilityType.School, x0 + 4, roadY - 4);
    city.refresh();
    expect(city.unschooledChildren).toBeLessThan(city.children);
  });
});
