import { describe, expect, it } from "vitest";
import {
  City,
  DAYS_PER_MONTH,
  MAX_TAX_RATE,
  ROAD_COST_PER_TILE,
  ROAD_UPKEEP_PER_TILE,
  START_MONEY,
  TAX_PER_COMMERCIAL_JOB,
  TAX_PER_INDUSTRIAL_JOB,
  TAX_PER_RESIDENT,
  monthlyTax,
} from "../src/sim/city";
import { ZoneType } from "../src/sim/zoning";
import { SEED, findLand, setup } from "./helpers";

describe("City: お金と道路", () => {
  it("道路を敷くと長さに応じて費用がかかる", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    expect(city.money).toBe(START_MONEY);
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5)).toBe(true);
    expect(city.money).toBe(START_MONEY - 10 * ROAD_COST_PER_TILE);
  });
  it("お金が足りないと敷けず、お金も道路も変わらない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.money = 50;
    expect(city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5)).toBe(false);
    expect(city.money).toBe(50);
    expect(city.graph.edges.size).toBe(0);
  });
  it("敷設済みの道路をなぞっても、お金は減らず false", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5);
    const money = city.money;
    expect(city.buildRoad(x0 + 2.5, y0 + 0.5, x0 + 8.5, y0 + 0.5)).toBe(false);
    expect(city.money).toBe(money);
  });
  it("既存の道路と重なる部分には費用がかからない", () => {
    const [x0, y0] = findLand();
    const city = new City(SEED);
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5);
    const money = city.money;
    city.buildRoad(x0 + 5.5, y0 + 0.5, x0 + 15.5, y0 + 0.5); // 5 タイルが重なり、新しいのは 5 タイル
    expect(money - city.money).toBe(5 * ROAD_COST_PER_TILE);
  });
});

describe("City: 税率", () => {
  it("範囲内の 1% 刻みに丸められる", () => {
    const city = new City(SEED);
    city.setTaxRate(0.123);
    expect(city.taxRate).toBe(0.12);
    city.setTaxRate(5);
    expect(city.taxRate).toBe(MAX_TAX_RATE);
    city.setTaxRate(-1);
    expect(city.taxRate).toBe(0);
  });
  it("税収は税率に比例する", () => {
    const totals = { population: 10, jobsC: 5, jobsI: 5 };
    const base = 10 * TAX_PER_RESIDENT + 5 * TAX_PER_COMMERCIAL_JOB + 5 * TAX_PER_INDUSTRIAL_JOB;
    expect(monthlyTax(totals, 0.1)).toBe(base);
    expect(monthlyTax(totals, 0.2)).toBe(base * 2);
    expect(monthlyTax(totals, 0)).toBe(0);
  });
});

describe("City: 日付", () => {
  it("経過日数から年月日を求める", () => {
    const city = new City(SEED);
    expect(city.date).toEqual({ year: 1, month: 1, day: 1 });
    city.day = 29;
    expect(city.date).toEqual({ year: 1, month: 1, day: 30 });
    city.day = 30;
    expect(city.date).toEqual({ year: 1, month: 2, day: 1 });
    city.day = 360;
    expect(city.date).toEqual({ year: 2, month: 1, day: 1 });
  });
  it("tick で 1 日進む", () => {
    const city = new City(SEED);
    city.tick();
    city.tick();
    expect(city.day).toBe(2);
  });
});

describe("City: 月末の収支", () => {
  it("道路だけの街は、月末に維持費の分だけお金が減る", () => {
    const { city } = setup({ r: false, c: false, i: false }, {}, false);
    const money = city.money;
    const length = city.graph.totalLength();
    for (let i = 0; i < DAYS_PER_MONTH - 1; i++) city.tick();
    expect(city.money).toBe(money); // 月末前は変わらない
    city.tick();
    expect(city.lastMonth).toEqual({ income: 0, expense: Math.round(length * ROAD_UPKEEP_PER_TILE) });
    expect(city.money).toBe(money - city.lastMonth.expense);
  });
  it("住民と雇用があれば月末に税収が入る", () => {
    const { city } = setup();
    for (let i = 0; i < 200; i++) city.tick();
    const before = city.money;
    const expected = monthlyTax(city.zones.totals(), city.taxRate);
    expect(expected).toBeGreaterThan(0);
    while (city.day % DAYS_PER_MONTH !== 0) city.tick();
    // 月末までの間に街が育つので税収は expected 以上
    expect(city.lastMonth.income).toBeGreaterThanOrEqual(expected);
    expect(city.money).toBe(before + city.lastMonth.income - city.lastMonth.expense);
  });
});

describe("City: 需要による成長", () => {
  it("住宅・商業・工業を塗ると、時間とともに人口と雇用が増える", () => {
    const { city } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    const t = city.zones.totals();
    expect(t.population).toBeGreaterThan(0);
    expect(t.jobsC).toBeGreaterThan(0);
    expect(t.jobsI).toBeGreaterThan(0);
    const s = city.zones.stats();
    expect(s.R.buildings).toBeGreaterThan(0);
    // 数値が壊れていない
    for (const v of [city.demand.r, city.demand.c, city.demand.i, city.money]) expect(Number.isFinite(v)).toBe(true);
  });
  it("住宅だけだと、働き口がないので少しの建物で頭打ちになる", () => {
    const { city } = setup({ r: true, c: false, i: false });
    for (let i = 0; i < 300; i++) city.tick();
    const s = city.zones.stats();
    expect(s.R.zones).toBeGreaterThan(30);
    expect(s.R.buildings).toBeGreaterThan(0);
    expect(s.R.buildings).toBeLessThan(s.R.zones / 2);
    expect(city.demand.r).toBeLessThan(0.1);
  });
  it("工業だけだと、住民がいないので街は育つが住宅の需要が高いまま", () => {
    const { city } = setup({ r: false, c: false, i: true });
    for (let i = 0; i < 200; i++) city.tick();
    expect(city.zones.stats().I.buildings).toBeGreaterThan(0);
    expect(city.demand.r).toBeGreaterThan(0.5);
  });
  it("税率を上げると、同じ期間の成長が遅くなる", () => {
    const grow = (rate: number) => {
      const { city } = setup();
      city.setTaxRate(rate);
      for (let i = 0; i < 150; i++) city.tick();
      return city.zones.totals().population;
    };
    expect(grow(0.2)).toBeLessThan(grow(0.05));
  });
  it("同じシードなら成長は毎回同じ", () => {
    const run = () => {
      const { city } = setup();
      for (let i = 0; i < 100; i++) city.tick();
      return city.zones.totals();
    };
    expect(run()).toEqual(run());
  });
  it("道路を撤去すると、次の tick で届かなくなったゾーンが消える", () => {
    const { city } = setup();
    for (let i = 0; i < 50; i++) city.tick();
    expect(city.zones.cells.size).toBeGreaterThan(0);
    for (const e of [...city.graph.edges.values()]) city.graph.removeEdge(e.id);
    city.tick();
    expect(city.zones.cells.size).toBe(0);
  });
  it("住民は定員を超えない", () => {
    const { city } = setup();
    for (let i = 0; i < 400; i++) city.tick();
    for (const c of city.zones.cells.values()) {
      if (c.zone === ZoneType.Residential) expect(c.residents).toBeLessThanOrEqual(12);
      else expect(c.residents).toBe(0);
    }
  });
});
