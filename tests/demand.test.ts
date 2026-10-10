import { describe, expect, it } from "vitest";
import { DEFAULT_TAX_RATE, calcDemand } from "../src/sim/demand";

const t = (population: number, jobsC: number, jobsI: number) => ({ population, jobsC, jobsI });

describe("calcDemand", () => {
  it("何もない街では、住宅と工業に少し需要がある (街の最初の一歩が踏み出せる)", () => {
    const d = calcDemand(t(0, 0, 0), DEFAULT_TAX_RATE);
    expect(d.r).toBeGreaterThan(0);
    expect(d.i).toBeGreaterThan(0);
    expect(d.c).toBeCloseTo(0);
  });
  it("住民だけで働き口がないと、住宅の需要は下がり、工業と商業の需要が上がる", () => {
    const empty = calcDemand(t(0, 0, 0), DEFAULT_TAX_RATE);
    const d = calcDemand(t(40, 0, 0), DEFAULT_TAX_RATE);
    expect(d.r).toBeLessThan(0);
    expect(d.r).toBeLessThan(empty.r);
    expect(d.i).toBeGreaterThan(empty.i);
    expect(d.c).toBeGreaterThan(0.5);
  });
  it("働き口が余っていると、住宅の需要が上がり工業の需要が下がる", () => {
    const d = calcDemand(t(10, 30, 30), DEFAULT_TAX_RATE);
    expect(d.r).toBeGreaterThan(0.5);
    expect(d.i).toBeLessThan(0);
  });
  it("商業の雇用が十分あれば商業の需要は負になる", () => {
    expect(calcDemand(t(40, 40, 0), DEFAULT_TAX_RATE).c).toBeLessThan(0);
  });
  it("税率が高いほど全部の需要が下がり、低いほど上がる", () => {
    const base = calcDemand(t(20, 10, 10), DEFAULT_TAX_RATE);
    const high = calcDemand(t(20, 10, 10), 0.2);
    const low = calcDemand(t(20, 10, 10), 0);
    for (const k of ["r", "c", "i"] as const) {
      expect(high[k]).toBeLessThan(base[k]);
      expect(low[k]).toBeGreaterThan(base[k]);
    }
  });
  it("どんな入力でも -1〜1 に収まる", () => {
    for (const pop of [0, 1, 100, 100000]) {
      for (const jobs of [0, 5, 1000, 1e6]) {
        for (const tax of [0, 0.1, 0.2]) {
          const d = calcDemand(t(pop, jobs, jobs / 2), tax);
          for (const v of [d.r, d.c, d.i]) {
            expect(v).toBeGreaterThanOrEqual(-1);
            expect(v).toBeLessThanOrEqual(1);
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    }
  });
});
