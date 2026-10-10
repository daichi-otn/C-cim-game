import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { routeTo } from "../src/render3d/traffic3d";
import { findLand } from "./helpers";

describe("車の道順", () => {
  it("道順は、つながった区間を順にたどる (次の区間は、前の区間の終わりから出る)", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 30.5, y0 + 0.5);
    city.buildRoad(x0 + 30.5, y0 + 0.5, x0 + 30.5, y0 + 20.5);
    const from = [...city.graph.nodes.keys()][0]!;
    for (let seed = 1; seed < 20; seed++) {
      const steps = routeTo(city.graph, from, seed);
      let at = from;
      for (const st of steps) {
        const e = city.graph.edges.get(st.edge)!;
        const start = st.dir > 0 ? e.a : e.b;
        expect(start).toBe(at);
        at = st.dir > 0 ? e.b : e.a;
      }
    }
  });

  it("一方通行は逆向きに通らない", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 30.5, y0 + 0.5);
    for (const e of city.graph.edges.values()) e.oneWay = 1;
    const from = [...city.graph.nodes.keys()][0]!;
    for (const st of routeTo(city.graph, from, 3)) {
      const e = city.graph.edges.get(st.edge)!;
      if (e.oneWay === 1) expect(st.dir).toBe(1);
    }
  });
});
