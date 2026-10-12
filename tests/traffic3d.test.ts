import { describe, expect, it } from "vitest";
import { RoadType } from "../src/sim/roadTypes";
import { ZoneType } from "../src/sim/zoning";
import { Traffic3D } from "../src/render3d/traffic3d";
import { lanePoint, projectOnSegment } from "../src/render3d/carMotion";
import type { Roads3D } from "../src/render3d/roads3d";
import { setup } from "./helpers";

/** 車の描画だけを見る。道路の高さは 0 として扱う。 */
const flatRoads = { heightOnEdge: () => 0 } as unknown as Roads3D;
type Internal = { cars: { edge: number; ax: number; ay: number; heading: number }[] };
/** 車の中心の位置 (車線の上)。Traffic3D が描く位置と同じ。 */
const lanes = (t: Traffic3D) => (t as unknown as Internal).cars.map((c) => lanePoint(c.ax, c.ay, (t as any).laneHeading(c)));

/** 交差点 (十字) がある街と、車を走らせる Traffic3D を作る。 */
function crossingCity() {
  const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, true);
  city.refresh();
  const traffic = new Traffic3D(city, flatRoads);
  traffic.setCarScale(1);
  return { city, x0, roadY, traffic };
}

describe("交差点での車", () => {
  it("道路が交差点で分割されても、車は消えず、いまの道路の上に残る", () => {
    const { city, x0, roadY, traffic } = crossingCity();
    city.refresh();
    for (const e of city.graph.edges.values()) city.traffic.flow.set(e.id, 60);
    city.trafficVersion++;
    traffic.update(0.1, 0);
    const before = [...(traffic as unknown as Internal).cars];
    expect(before.length).toBeGreaterThan(0);

    // 車の道路の真ん中に、交差する道路を引く (道路が 2 つに分かれる)
    city.buildRoad(x0 + 10.5, roadY - 4.5, x0 + 10.5, roadY + 5.5, RoadType.Street);
    traffic.update(0, 0);

    const cars = (traffic as unknown as Internal).cars;
    // 同じ車 (同じ物) が残っている: 作り直されて消えたのではない
    for (const c of before) expect(cars).toContain(c);
    for (const c of cars) {
      const e = city.graph.edges.get(c.edge);
      expect(e).toBeDefined();
      const a = city.graph.nodes.get(e!.a)!;
      const b = city.graph.nodes.get(e!.b)!;
      // 車の位置は、いまの道路の線の上にある
      expect(projectOnSegment(c.ax, c.ay, a.x, a.y, b.x, b.y).dist).toBeLessThan(0.01);
    }
  });

  it("車が走り続けても、車同士が重ならない (車線の上の中心どうしが近づきすぎない)", () => {
    const { city, x0, roadY, traffic } = crossingCity();
    city.buildRoad(x0 + 10.5, roadY - 4.5, x0 + 10.5, roadY + 5.5, RoadType.Street);
    city.refresh();
    for (const e of city.graph.edges.values()) city.traffic.flow.set(e.id, 60);
    city.trafficVersion++;
    traffic.update(0, 0);
    // 走り出して、交差点で譲り合う様子を見る (最初の 20 秒は数えない)
    for (let i = 0; i < 400; i++) traffic.update(0.05, 0);
    let worst = Infinity;
    for (let i = 0; i < 1200; i++) {
      traffic.update(0.05, 0);
      const pts = lanes(traffic);
      for (let a = 0; a < pts.length; a++)
        for (let b = a + 1; b < pts.length; b++) worst = Math.min(worst, Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y));
    }
    // 車の長さは 0.3 タイル。0.2 タイルより近づかないこと
    expect(worst).toBeGreaterThan(0.2);
  });
});

describe("住民の車", () => {
  it("昼は働き先へ、夜は家へ向かう", () => {
    const { city } = setup();
    for (let i = 0; i < 200; i++) city.tick();
    const home = [...city.zones.cells.values()].find((c) => c.zone === ZoneType.Residential && c.residents > 0 && c.building > 0 && c.part === undefined);
    const job = [...city.zones.cells.values()].find((c) => c.zone === ZoneType.Commercial && c.building > 0 && c.part === undefined);
    expect(home && job).toBeTruthy();
    city.people = [{ id: 999, home: [home!.x, home!.y], ageDays: 30 * 365, work: [job!.x, job!.y] }];
    const traffic = new Traffic3D(city, flatRoads);
    traffic.setCarScale(1);
    city.refresh();
    for (const e of city.graph.edges.values()) city.traffic.flow.set(e.id, 60);
    city.trafficVersion++;
    traffic.update(0, 0);
    const t = traffic as any;
    const car = (t.cars as any[]).find((c) => c.owner === 999);
    expect(car).toBeTruthy();
    const nodes = t.personNodes.get(999);
    t.setHour(10);
    car.dest = -1;
    car.route = [];
    t.planFrom(car, t.endNode(car));
    if (nodes.work !== null && nodes.work !== t.endNode(car)) expect(car.dest).toBe(nodes.work);
    t.setHour(22);
    car.dest = -1;
    car.route = [];
    t.planFrom(car, t.endNode(car));
    if (nodes.home !== null && nodes.home !== t.endNode(car)) expect(car.dest).toBe(nodes.home);
  });
});

describe("車の数の上限", () => {
  it("街全体の車は、上限を超えない", () => {
    const { city, x0, roadY } = setup();
    city.buildRoad(x0 + 10.5, roadY - 4.5, x0 + 10.5, roadY + 5.5, RoadType.Avenue);
    for (let i = 0; i < 300; i++) city.tick();
    city.refresh();
    for (const e of city.graph.edges.values()) city.traffic.flow.set(e.id, 5000);
    city.trafficVersion++;
    const traffic = new Traffic3D(city, flatRoads);
    traffic.setCarScale(1);
    traffic.update(0, 0);
    expect((traffic as unknown as Internal).cars.length).toBeLessThanOrEqual(400);
  });
});

describe("外部接続からだけ車が来る", () => {
  it("外部接続につながっていない道路には、車が出ない", () => {
    const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, true);
    // 外部接続のない道路 (別の場所)
    city.buildRoad(x0 + 1.5, roadY + 12.5, x0 + 20.5, roadY + 12.5);
    city.refresh();
    for (const e of city.graph.edges.values()) city.traffic.flow.set(e.id, 300);
    city.trafficVersion++;
    const traffic = new Traffic3D(city, flatRoads);
    traffic.setCarScale(1);
    traffic.update(0, 0);
    const cars = (traffic as unknown as Internal).cars;
    expect(cars.length).toBeGreaterThan(0);
    expect(cars.every((c) => city.isOutsideNode(city.graph.edges.get(c.edge)!.a))).toBe(true);
  });
});
