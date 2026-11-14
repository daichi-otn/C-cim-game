import { describe, expect, it } from "vitest";
import { advanceEducation, educationDaysOf, personLifeOf, type Person, type PersonLifeContext } from "../src/sim/people";
import { City } from "../src/sim/city";
import { setup } from "./helpers";
import { reconcilePeople } from "../src/sim/people";

const person = (extra: Partial<Person> = {}): Person => ({ id: 1, home: [0, 0], work: [10, 0], ageDays: 30 * 365, educationDays: 9 * 365, ...extra });
const context = (extra: Partial<PersonLifeContext> = {}): PersonLifeContext => ({ schooled: true, cared: false, risk: 0, landValue: 0.3, taxRate: 0.1, welfare: false, educationPolicy: 0, medicalPolicy: 0, trafficPolicy: 0, workConnected: true, workKind: "industrial", shopDistance: 5, congestion: 0, happiness: 0.7, ...extra });
const life = (c: Partial<PersonLifeContext> = {}, p: Partial<Person> = {}) => personLifeOf(42, person(p), context(c));

describe("M20 市民生活", () => {
  it("個人の収支と職業を再現可能な現在値として求める", () => {
    expect(life()).toEqual(life());
    expect(life().occupation).toBe("就業中");
    expect(life().balance).toBe(life().income - life().livingCost);
    expect(life({ taxRate: 0.2 }).income).toBeLessThan(life().income);
    expect(life({ welfare: true }).income - life().income).toBe(600);
    expect(life({ landValue: 0.9 }).livingCost).toBeGreaterThan(life().livingCost);
  });
  it("教育・職種・雇用が所得に反映される", () => {
    expect(life({}, { educationDays: 12 * 365 }).income).toBeGreaterThan(life({}, { educationDays: 0 }).income);
    expect(life({ workKind: "office" }).income).toBeGreaterThan(life({ workKind: "commercial" }).income);
    expect(life({}, { work: null }).occupation).toBe("失業中");
    expect(life({}, { work: null }).income).toBe(0);
    expect(life({}, { ageDays: 70 * 365 }).occupation).toBe("年金生活");
    expect(life({}, { ageDays: 10 * 365 }).commuteMinutes).toBe(0);
  });
  it("渋滞・交通政策・買い物への接続が生活に反映される", () => {
    expect(life({ congestion: 2 }).commuteMinutes).toBeGreaterThan(life().commuteMinutes!);
    expect(life({ congestion: 2, trafficPolicy: 2 }).commuteMinutes).toBeLessThan(life({ congestion: 2 }).commuteMinutes!);
    expect(life({ workConnected: false }).commuteMinutes).toBeNull();
    expect(life({ workConnected: false }).income).toBe(0);
    expect(life({ shopDistance: null }).shopping).toBe("店舗なし");
    expect(life({ shopDistance: 20 }).shopping).toBe("遠い");
    expect(life({ shopDistance: null }).satisfaction).toBeLessThan(life().satisfaction);
  });
  it("病院・医療政策は健康リスクを抑える", () => {
    const bad = life({ risk: 1 });
    expect(life({ risk: 1, cared: true }).healthRisk).toBeLessThan(bad.healthRisk);
    expect(life({ risk: 1, medicalPolicy: 2 }).healthRisk).toBeLessThan(bad.healthRisk);
    expect(bad.satisfaction).toBeLessThan(life().satisfaction);
    for (let id = 1; id <= 100; id++) {
      const s = life({ risk: 1, congestion: 10, shopDistance: null }, { id }).satisfaction;
      expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
    }
  });
  it("学校に通う子どもだけ教育を蓄積し、政策で学習を支援する", () => {
    const p = person({ ageDays: 10 * 365, educationDays: 100 });
    advanceEducation(42, p, false, 2); expect(p.educationDays).toBe(100);
    advanceEducation(42, p, true, 0); expect(p.educationDays).toBe(101);
    advanceEducation(42, p, true, 2); expect(p.educationDays).toBe(102.5);
    p.ageDays = 20 * 365;
    advanceEducation(42, p, true, 2); expect(p.educationDays).toBe(102.5);
    expect(life({ schooled: true }, { ageDays: 10 * 365 }).satisfaction).toBeGreaterThan(life({ schooled: false }, { ageDays: 10 * 365 }).satisfaction);
  });
  it("旧6項目の市民セーブに初期教育を補い、新しい就学日数を復元する", () => {
    const city = new City(42);
    const data = city.toData();
    data.people = [[1, 0, 0, 10 * 365, -1, -1]]; data.nextPersonId = 2;
    const restored = City.fromData(data);
    expect(restored.people[0]!.educationDays).toBe(educationDaysOf(42, person({ ageDays: 10 * 365, educationDays: undefined, work: null })));
    restored.people[0]!.educationDays = 102.5;
    const copy = City.fromData(JSON.parse(JSON.stringify(restored.toData())));
    expect(copy.people[0]!.educationDays).toBe(102.5);
    for (const invalid of [-1, NaN, Infinity, 16 * 365 + 1]) {
      data.people[0]![6] = invalid;
      expect(() => City.fromData(data)).toThrow();
    }
  });
  it("実際の街の施設・道路網・政策を生活に結び付け、表示では時間を進めない", () => {
    const { city } = setup();
    city.devMode = true;
    for (let i = 0; i < 30; i++) city.tick();
    city.refresh();
    const p = city.people.find((p) => p.ageDays >= 18 * 365 && p.ageDays < 65 * 365 && p.work)!;
    expect(p).toBeDefined();
    const before = city.personLife(p);
    expect(before.commuteMinutes).not.toBeNull();
    expect(before.shopping).not.toBe("店舗なし");
    const data = city.toData();
    city.personLife(p); city.personLife(p); city.refresh();
    expect(city.toData().people).toEqual(data.people);
    city.welfarePolicy = true;
    expect(city.personLife(p).income).toBe(before.income + 600);
    const copy = City.fromData(JSON.parse(JSON.stringify(city.toData())));
    copy.devMode = true; copy.refresh();
    expect(copy.personLife(copy.people.find((v) => v.id === p.id)!)).toEqual(city.personLife(p));
  });
  it("職場が新設されたとき失業中の市民の職場も更新する", () => {
    const p = person({ work: null, educationDays: 123 });
    const r = reconcilePeople(42, [p], [{ x: 0, y: 0, residents: 1 }], [[10, 0]], 2);
    expect(r.people[0]!.work).toEqual([10, 0]);
    expect(r.people[0]!.educationDays).toBe(123);
  });
});
