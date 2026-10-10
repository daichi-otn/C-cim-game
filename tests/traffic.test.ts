import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { EDGE_CAPACITY, SHOP_TRIPS_PER_RESIDENT, calcTraffic, congestionOf, trafficDemandPenalty } from "../src/sim/traffic";
import { WORKER_RATIO } from "../src/sim/demand";
import { ZoneType } from "../src/sim/zoning";
import { setup } from "./helpers";

const run = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};

describe("交通量", () => {
  it("住民がいなければ交通は発生しない", () => {
    const { city } = setup();
    city.refresh();
    expect(city.traffic.trips).toBe(0);
    expect(city.traffic.flow.size).toBe(0);
  });

  it("街が育つと、通勤と買い物の交通が道路に流れる", () => {
    const { city } = setup();
    run(city, 200);
    const pop = city.zones.totals().population;
    expect(pop).toBeGreaterThan(0);
    expect(city.traffic.trips).toBe(Math.round(pop * (WORKER_RATIO + SHOP_TRIPS_PER_RESIDENT)));
    expect(city.traffic.flow.size).toBeGreaterThan(0);
    expect(city.traffic.stranded).toBe(0);
  });

  it("同じ街なら結果は毎回同じ", () => {
    const a = setup().city;
    const b = setup().city;
    run(a, 150);
    run(b, 150);
    expect([...a.traffic.flow]).toEqual([...b.traffic.flow]);
    expect(a.traffic.avgCongestion).toBe(b.traffic.avgCongestion);
  });

  it("働き口 (商業・工業) がなければ、出かけられない移動として数える", () => {
    const { city } = setup({ r: true, c: false, i: false });
    run(city, 200);
    // 住宅だけの街には、外部接続があっても住民は入居できるが、行き先がない
    const pop = city.zones.totals().population;
    expect(pop).toBeGreaterThan(0);
    expect(city.traffic.stranded).toBe(city.traffic.trips);
    expect(city.traffic.flow.size).toBe(0);
  });

  it("道路でつながっていない行き先へは行けない", () => {
    const { city, x0, roadY } = setup({ r: true, c: false, i: false });
    // 離れた別の道路網に商業を置く
    city.buildRoad(x0 + 0.5, roadY + 12.5, x0 + 39.5, roadY + 12.5);
    city.zones.paintRect(city.graph, { x0: x0 + 14, y0: roadY + 9, x1: x0 + 25, y1: roadY + 11 }, ZoneType.Commercial);
    run(city, 200);
    expect(city.traffic.stranded).toBe(city.traffic.trips);
  });

  it("容量を超えた区間は渋滞とみなされ、需要が下がる", () => {
    expect(congestionOf(EDGE_CAPACITY)).toBe(1);
    expect(trafficDemandPenalty({ flow: new Map(), trips: 0, stranded: 0, jammed: 0, avgCongestion: 0.5, capMult: 1 })).toBe(0);
    const heavy = trafficDemandPenalty({ flow: new Map(), trips: 0, stranded: 0, jammed: 3, avgCongestion: 1.5, capMult: 1 });
    expect(heavy).toBeGreaterThan(0);
    expect(heavy).toBeLessThanOrEqual(0.3);
  });

  it("混んだ道路に並行する道路を足すと、いちばん混んだ区間の交通量が減る", () => {
    const { city, x0, roadY } = setup();
    run(city, 400);
    const peak = (flow: Map<number, number>) => Math.max(0, ...flow.values());
    const before = peak(city.traffic.flow);
    expect(before).toBeGreaterThan(0);
    // 道路の北 6 タイルに、並行する道路を足してつなぐ
    city.buildRoad(x0 + 0.5, roadY - 5.5, x0 + 39.5, roadY - 5.5);
    city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 0.5, roadY - 5.5);
    city.buildRoad(x0 + 39.5, roadY + 0.5, x0 + 39.5, roadY - 5.5);
    expect(peak(calcTraffic(city.graph, city.zones).flow)).toBeLessThanOrEqual(before);
  });
});
