import { describe, expect, it } from "vitest";
import { RoadType } from "../src/sim/roadTypes";
import { Traffic3D } from "../src/render3d/traffic3d";
import { projectOnSegment } from "../src/render3d/carMotion";
import type { Roads3D } from "../src/render3d/roads3d";
import { setup } from "./helpers";

/** 車の描画だけを見る。道路の高さは 0 として扱う。 */
const flatRoads = { heightOnEdge: () => 0 } as unknown as Roads3D;
type Internal = { cars: { edge: number; ax: number; ay: number }[] };

describe("交差点での車", () => {
  it("道路が交差点で分割されても、車は消えず、いまの道路の上に残る", () => {
    const { city, x0, roadY } = setup({ r: false, c: false, i: false }, {}, false);
    const traffic = new Traffic3D(city, flatRoads);
    traffic.setCarScale(1);
    city.traffic.flow.clear();
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
});
