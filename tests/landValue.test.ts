import { describe, expect, it } from "vitest";
import { City, monthlyTax } from "../src/sim/city";
import { DAYS_PER_MONTH } from "../src/sim/city";
import { seasonOf } from "../src/sim/weather";
import { LAND_TAX_BONUS, landColor, landValueOf } from "../src/sim/landValue";
import { SEED, setup } from "./helpers";

const base = { roadCap: 0, services: 0, risk: 1, amenities: 0 };

describe("地価の計算", () => {
  it("道路が太く、サービスが届き、環境が良く、施設が近いほど高い", () => {
    expect(landValueOf({ ...base, roadCap: 400 })).toBeGreaterThan(landValueOf({ ...base, roadCap: 40 }));
    expect(landValueOf({ ...base, services: 4 })).toBeGreaterThan(landValueOf({ ...base, services: 0 }));
    expect(landValueOf({ ...base, risk: 0 })).toBeGreaterThan(landValueOf({ ...base, risk: 1 }));
    expect(landValueOf({ ...base, amenities: 3 })).toBeGreaterThan(landValueOf({ ...base, amenities: 0 }));
  });

  it("0〜1 に収まる。材料が全部そろった最良の場所は 1、何もない最悪の場所は 0", () => {
    expect(landValueOf({ roadCap: 10000, services: 9, risk: 0, amenities: 99 })).toBe(1);
    expect(landValueOf({ roadCap: 0, services: 0, risk: 1, amenities: 0 })).toBe(0);
    expect(landValueOf({ roadCap: 0, services: 0, risk: null, amenities: 0 })).toBeCloseTo(0.1);
  });

  it("地価の色は、低いほど青、高いほど赤に近い", () => {
    const blue = landColor(0);
    const red = landColor(1);
    expect(((blue >> 16) & 255)).toBeLessThan((red >> 16) & 255);
    expect(blue & 255).toBeGreaterThan(red & 255);
    expect(landColor(-1)).toBe(blue);
    expect(landColor(2)).toBe(red);
  });
});

describe("地価と税", () => {
  it("区画ごとの地価は、道路に近く、サービスが届く場所ほど高い", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 30; i++) city.tick();
    const v = (x: number, y: number) => city.landValues.get(`${x},${y}`);
    // 道路の隣の区画 (道路の南側) と、道路から離れた区画 (同じ街の北側の遠い所)
    const near = v(x0 + 2, roadY + 1);
    const far = v(x0 + 2, roadY - 60);
    expect(near).toBeDefined();
    expect(near!).toBeGreaterThan(0);
    expect(far).toBeUndefined();
  });

  it("建物がない街では、税の上乗せはない", () => {
    const city = new City(SEED);
    city.refresh();
    expect(city.landBonus).toBe(0);
  });

  it("建物がある街では、上乗せは 0 より大きく、LAND_TAX_BONUS を超えない", () => {
    const { city } = setup();
    for (let i = 0; i < 60; i++) city.tick();
    city.refresh();
    expect(city.landBonus).toBeGreaterThan(0);
    expect(city.landBonus).toBeLessThanOrEqual(LAND_TAX_BONUS);
  });

  it("月末の税収は、いまの税に、地価の上乗せを足したもの", () => {
    const { city } = setup();
    for (let i = 0; i < 60; i++) city.tick();
    while ((city.day + 1) % DAYS_PER_MONTH !== 0) city.tick();
    city.refresh();
    const bonus = city.landBonus;
    city.tick(); // 月末を締める (締めの時点の街と、上乗せの割合で税が決まる)
    const expected = Math.round(monthlyTax(city.zones.totals(), city.taxRate, seasonOf(city.day - 1)) * (1 + bonus));
    expect(city.lastMonth.income).toBe(expected);
    expect(bonus).toBeGreaterThan(0);
  });

  it("地価は保存しない (保存データの形は変わらない)", () => {
    const { city } = setup();
    for (let i = 0; i < 30; i++) city.tick();
    const data = JSON.stringify(city.toData());
    expect(data).not.toContain("landValues");
    expect(data).not.toContain("landBonus");
  });
});
