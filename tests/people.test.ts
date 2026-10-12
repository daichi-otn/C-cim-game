import { describe, expect, it } from "vitest";
import { ageMixAt, PENSION_PER_SENIOR, personGroupOf, placeHash, reconcilePeople, sampleAgeDays, UNSCHOOLED_HAPPINESS_PENALTY } from "../src/sim/people";

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

describe("住民を一人ずつ作る", () => {
  it("家ごとの人数に合わせて、人を作る・減らす", () => {
    const homes = [{ x: 1, y: 1, residents: 3 }, { x: 5, y: 5, residents: 2 }];
    const jobs: [number, number][] = [[9, 9]];
    const a = reconcilePeople(42, [], homes, jobs, 1);
    expect(a.people).toHaveLength(5);
    expect(a.people.filter((p) => p.home[0] === 1)).toHaveLength(3);
    const b = reconcilePeople(42, a.people, [{ x: 1, y: 1, residents: 1 }], jobs, a.nextId);
    expect(b.people).toHaveLength(1);
  });
  it("住んでいる人には、年齢と働き先が決まる", () => {
    const { people } = reconcilePeople(42, [], [{ x: 2, y: 2, residents: 20 }], [[7, 7]], 1);
    for (const p of people) {
      expect(p.work).toEqual([7, 7]);
      expect(p.ageDays).toBeGreaterThan(0);
    }
    expect(people.some((p) => personGroupOf(p.ageDays) === "child")).toBe(true);
    expect(people.some((p) => personGroupOf(p.ageDays) === "senior")).toBe(true);
  });
  it("年齢は id から決まるので、いつも同じ", () => {
    expect(sampleAgeDays(7, [1, 2], 5)).toBe(sampleAgeDays(7, [1, 2], 5));
  });
  it("働き先がなければ、働き先は null", () => {
    const { people } = reconcilePeople(42, [], [{ x: 2, y: 2, residents: 2 }], [], 1);
    expect(people.every((p) => p.work === null)).toBe(true);
  });
});
