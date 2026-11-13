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

  it("交差点では左折・右折の分岐を順に選ぶ", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildRoad(x0 + 0.5, y0 + 5.5, x0 + 10.5, y0 + 5.5);
    city.buildRoad(x0 + 10.5, y0 + 5.5, x0 + 10.5, y0 + 0.5);
    city.buildRoad(x0 + 10.5, y0 + 5.5, x0 + 20.5, y0 + 5.5);
    const junction = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 10.5)) < 0.01 && Math.abs(n.y - (y0 + 5.5)) < 0.01)!;
    const north = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 10.5)) < 0.01 && Math.abs(n.y - (y0 + 0.5)) < 0.01)!;
    const east = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 20.5)) < 0.01 && Math.abs(n.y - (y0 + 5.5)) < 0.01)!;
    const west = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 0.5)) < 0.01 && Math.abs(n.y - (y0 + 5.5)) < 0.01)!;
    const turn = routeTo(city.graph, west.id, 11, north.id);
    expect(turn).toHaveLength(2);
    expect(turn[0]!.edge).not.toBe(turn[1]!.edge);
    expect(turn[1]!.dir).toBe(1);
    const right = routeTo(city.graph, junction.id, 12, east.id);
    expect(right).toHaveLength(1);
    expect(right[0]!.dir).toBe(1);
  });

  it("現在の道路を逆戻りする経路でも、交差点の別分岐を優先できる", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 10.5, y0 + 0.5);
    city.buildRoad(x0 + 10.5, y0 + 0.5, x0 + 10.5, y0 + 10.5);
    city.buildRoad(x0 + 10.5, y0 + 0.5, x0 + 20.5, y0 + 0.5);
    const edges = [...city.graph.edges.values()];
    const junction = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 10.5)) < 0.01 && Math.abs(n.y - (y0 + 0.5)) < 0.01)!;
    const target = [...city.graph.nodes.values()].find((n) => Math.abs(n.x - (x0 + 10.5)) < 0.01 && Math.abs(n.y - (y0 + 10.5)) < 0.01)!;
    const current = edges.find((e) => (e.a === junction.id || e.b === junction.id) && Math.abs((city.graph.nodes.get(e.a)!.y - city.graph.nodes.get(e.b)!.y)) < 0.01)!;
    const route = routeTo(city.graph, junction.id, 7, target.id, current.id);
    expect(route.length).toBeGreaterThan(0);
    expect(route[0]!.edge).not.toBe(current.id);
  });
});
