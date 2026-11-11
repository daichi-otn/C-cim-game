import { describe, expect, it } from "vitest";
import { emptyTransitData, transitRidership, validateTransitData } from "../src/sim/transit";

describe("M12 公共交通", () => {
  it("旧データ用の空状態を作れる", () => expect(emptyTransitData()).toEqual({ nextStopId: 1, nextLineId: 1, stops: [], lines: [] }));
  it("人口と停留所から利用者を求める", () => expect(transitRidership(1000, 4, 1)).toBe(160));
  it("路線の停留所参照を検証する", () => {
    const d = emptyTransitData(); d.stops.push({ id: 1, x: 0, y: 0, name: "駅前" }, { id: 2, x: 5, y: 0, name: "市役所前" });
    d.lines.push({ id: 1, name: "1系統", mode: "bus", stopIds: [1, 2], vehicles: 2, ridership: 0 });
    expect(() => validateTransitData(d)).not.toThrow();
  });
  it("同じ停留所を路線間で共有できる", () => {
    const d = emptyTransitData(); d.stops.push({ id: 1, x: 0, y: 0, name: "駅前" }, { id: 2, x: 5, y: 0, name: "市役所前" });
    d.lines.push({ id: 1, name: "バス", mode: "bus", stopIds: [1, 2], vehicles: 1, ridership: 0 }, { id: 2, name: "鉄道", mode: "rail", stopIds: [1, 2], vehicles: 1, ridership: 0 });
    validateTransitData(d); expect(new Set(d.lines.flatMap((line) => line.stopIds)).size).toBe(2);
  });
});
