import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { RoadType } from "../src/sim/roadTypes";
import { ADVANCE_DELAY_MS, TUTORIAL_STEPS, Tutorial, type TutorialContext } from "../src/sim/tutorial";
import { ZoneType } from "../src/sim/zoning";
import { setup } from "./helpers";

const ctxOf = (city: City, over: Partial<TutorialContext> = {}): TutorialContext => ({ city, moved: false, zoomed: false, speed: 0, menuSeen: false, ...over });
const step = (id: string) => TUTORIAL_STEPS.find((s) => s.id === id)!;

describe("手順のデータ", () => {
  it("手順の id は重ならず、どの手順にも題と説明がある", () => {
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
    expect(TUTORIAL_STEPS[0]!.check).toBeUndefined();
    expect(TUTORIAL_STEPS.at(-1)!.check).toBeUndefined();
  });
});

describe("条件の判定", () => {
  it("何もしていない街では、操作が必要な手順の条件は満たされない", () => {
    const city = new City(1);
    for (const s of TUTORIAL_STEPS) if (s.check) expect(s.check(ctxOf(city))).toBe(false);
  });
  it("カメラ: 動かしてズームしたら満たされる", () => {
    const city = new City(1);
    expect(step("camera").check!(ctxOf(city, { moved: true }))).toBe(false);
    expect(step("camera").check!(ctxOf(city, { moved: true, zoomed: true }))).toBe(true);
  });
  it("道路・種類・ゾーン・施設は、街の状態で判定される", () => {
    const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, false);
    expect(step("road").check!(ctxOf(city))).toBe(true);
    expect(step("roadtype").check!(ctxOf(city))).toBe(false);
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 20.5, roadY + 0.5, RoadType.Avenue);
    expect(step("roadtype").check!(ctxOf(city))).toBe(true);

    expect(step("residential").check!(ctxOf(city))).toBe(false);
    city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 4, y1: roadY + 2 }, ZoneType.Residential);
    expect(step("residential").check!(ctxOf(city))).toBe(true);

    expect(step("jobs").check!(ctxOf(city))).toBe(false);
    city.zones.paintRect(city.graph, { x0: x0 + 6, y0: roadY + 1, x1: x0 + 9, y1: roadY + 2 }, ZoneType.Commercial);
    city.zones.paintRect(city.graph, { x0: x0 + 11, y0: roadY + 1, x1: x0 + 14, y1: roadY + 2 }, ZoneType.Industrial);
    expect(step("jobs").check!(ctxOf(city))).toBe(true);
  });
  it("電力・水道・下水がそろうと満たされ、外部接続と公共施設は別に判定される", () => {
    const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, false);
    const place = (type: FacilityType, i: number) => city.facilities.set(100 + i, { id: 100 + i, type, size: 2, x: x0 + 2 + i * 3, y: roadY - 2 });
    place(FacilityType.Power, 0);
    place(FacilityType.Water, 1);
    expect(step("utilities").check!(ctxOf(city))).toBe(false);
    place(FacilityType.Sewage, 2);
    expect(step("utilities").check!(ctxOf(city))).toBe(true);
    expect(step("outside").check!(ctxOf(city))).toBe(false);
    place(FacilityType.Outside, 3);
    expect(step("outside").check!(ctxOf(city))).toBe(true);
    expect(step("services").check!(ctxOf(city))).toBe(false);
    place(FacilityType.Hospital, 4);
    expect(step("services").check!(ctxOf(city))).toBe(true);
  });
  it("人口・税率・メニューも判定される", () => {
    const { city } = setup();
    for (let i = 0; i < 300; i++) city.tick();
    expect(step("grow").check!(ctxOf(city))).toBe(city.zones.totals().population >= 20);
    expect(step("grow").check!(ctxOf(city))).toBe(true);
    expect(step("demand").check!(ctxOf(city))).toBe(false);
    city.setTaxRate(0.12);
    expect(step("demand").check!(ctxOf(city))).toBe(true);
    expect(step("save").check!(ctxOf(city))).toBe(false);
    expect(step("save").check!(ctxOf(city, { menuSeen: true }))).toBe(true);
  });
});

describe("進行", () => {
  it("説明だけの手順は update では進まず、next で進む", () => {
    const t = new Tutorial();
    expect(t.step.id).toBe("welcome");
    expect(t.update(ctxOf(new City(1)), 0)).toBe(false);
    t.next();
    expect(t.step.id).toBe("camera");
  });
  it("条件を満たしてから少し待って、自動で次へ進む", () => {
    const t = new Tutorial();
    t.next(); // camera
    const city = new City(1);
    const done = ctxOf(city, { moved: true, zoomed: true });
    expect(t.update(done, 1000)).toBe(false);
    expect(t.satisfied).toBe(true);
    expect(t.update(done, 1000 + ADVANCE_DELAY_MS - 1)).toBe(false);
    expect(t.update(done, 1000 + ADVANCE_DELAY_MS)).toBe(true);
    expect(t.step.id).toBe("road");
    expect(t.satisfied).toBe(false);
  });
  it("待っている間に条件が崩れたら、待ち時間はやり直し", () => {
    const t = new Tutorial();
    t.next();
    const city = new City(1);
    t.update(ctxOf(city, { moved: true, zoomed: true }), 0);
    t.update(ctxOf(city, { moved: true }), 500);
    expect(t.satisfied).toBe(false);
    t.update(ctxOf(city, { moved: true, zoomed: true }), 600);
    expect(t.update(ctxOf(city, { moved: true, zoomed: true }), 600 + ADVANCE_DELAY_MS - 1)).toBe(false);
  });
  it("戻る・飛ばす・最後まで進むと閉じる", () => {
    const t = new Tutorial();
    t.prev();
    expect(t.index).toBe(0);
    for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) t.next();
    expect(t.isLast).toBe(true);
    expect(t.closed).toBe(false);
    t.prev();
    expect(t.index).toBe(TUTORIAL_STEPS.length - 2);
    t.next();
    t.next();
    expect(t.closed).toBe(true);
    expect(t.update(ctxOf(new City(1)), 0)).toBe(false);
  });
});
