import { describe, expect, it } from "vitest";
import { City, DAYS_PER_MONTH } from "../src/sim/city";

describe("融資", () => {
  it("借入上限と返済可能な資金を守る", () => {
    const city = new City(1);
    const initial = city.money;
    for (let i = 0; i < 10; i++) expect(city.borrowLoan()).toBe(true);
    expect(city.borrowLoan()).toBe(false);
    expect(city.money).toBe(initial + 1000000000);
    city.money = 99999999;
    expect(city.repayLoan()).toBe(false);
    city.money = 100000000;
    expect(city.repayLoan()).toBe(true);
    expect(city.loanBalance).toBe(900000000);
    expect(city.money).toBe(0);
  });

  it("利息を月の支出に計上し、残高を保存する", () => {
    const city = new City(1);
    city.borrowLoan();
    const before = city.money;
    for (let i = 0; i < DAYS_PER_MONTH; i++) city.tick();
    expect(city.lastBudget?.interest).toBe(1000000);
    expect(city.lastMonth.expense).toBe(1000000);
    expect(city.money).toBe(before - 1000000);
    expect(City.fromData(city.toData()).loanBalance).toBe(100000000);
  });

  it("旧データは借入なしで読み込み、不正な残高は拒否する", () => {
    const data = new City(1).toData();
    delete data.loanBalance;
    expect(City.fromData(data).loanBalance).toBe(0);
    data.loanBalance = -1;
    expect(() => City.fromData(data)).toThrow();
    data.loanBalance = 1000000001;
    expect(() => City.fromData(data)).toThrow();
  });
});
