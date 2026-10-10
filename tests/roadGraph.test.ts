import { describe, expect, it } from "vitest";
import { RoadGraph } from "../src/sim/roadGraph";

/** グラフの内部整合性: 自己ループなし、全エッジの端点が存在、孤立ノードなし、degree が一致。 */
function checkInvariants(g: RoadGraph) {
  const deg = new Map<number, number>();
  for (const e of g.edges.values()) {
    expect(e.a).not.toBe(e.b);
    expect(g.nodes.has(e.a)).toBe(true);
    expect(g.nodes.has(e.b)).toBe(true);
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  for (const n of g.nodes.values()) {
    expect(g.degree(n.id)).toBe(deg.get(n.id) ?? 0);
    expect(g.degree(n.id)).toBeGreaterThan(0);
  }
}

describe("RoadGraph.addRoad", () => {
  it("1本の道路は 2ノード・1エッジ", () => {
    const g = new RoadGraph();
    expect(g.addRoad(0, 0, 10, 0)).toBe(1);
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
    checkInvariants(g);
  });
  it("長さ0は何もしない", () => {
    const g = new RoadGraph();
    expect(g.addRoad(3, 3, 3, 3)).toBe(0);
    expect(g.nodes.size).toBe(0);
  });
  it("同じ道路をもう一度敷いても増えない", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    const v = g.version;
    expect(g.addRoad(0, 0, 10, 0)).toBe(0);
    expect(g.addRoad(10, 0, 0, 0)).toBe(0);
    expect(g.edges.size).toBe(1);
    expect(g.version).toBe(v);
  });
  it("十字交差: 5ノード・4エッジ、中心は次数4", () => {
    const g = new RoadGraph();
    g.addRoad(0, 5, 10, 5);
    g.addRoad(5, 0, 5, 10);
    expect(g.nodes.size).toBe(5);
    expect(g.edges.size).toBe(4);
    const center = g.nearestNode(5, 5, 0.01)!;
    expect(g.degree(center.id)).toBe(4);
    checkInvariants(g);
  });
  it("T字: 既存道路の途中に端点を置くと既存側が分割される", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    g.addRoad(5, -5, 5, 0);
    expect(g.nodes.size).toBe(4);
    expect(g.edges.size).toBe(3);
    expect(g.degree(g.nearestNode(5, 0, 0.01)!.id)).toBe(3);
    checkInvariants(g);
  });
  it("T字 (新しい道路が既存の縦道路の途中で終わる)", () => {
    const g = new RoadGraph();
    g.addRoad(5, -5, 5, 5);
    g.addRoad(0, 0, 5, 0);
    expect(g.edges.size).toBe(3);
    checkInvariants(g);
  });
  it("一直線上に延長すると継ぎ足される", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    g.addRoad(5, 0, 15, 0);
    expect(g.edges.size).toBe(3);
    expect(g.nodes.size).toBe(4);
    checkInvariants(g);
  });
  it("既存道路の一部に重ねて敷いても重複しない", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    expect(g.addRoad(2, 0, 6, 0)).toBe(0);
    expect(g.edges.size).toBe(3);
    checkInvariants(g);
  });
  it("斜めの交差 (交点が非整数)", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 1, 1);
    g.addRoad(0, 1, 1, 0);
    expect(g.edges.size).toBe(4);
    const c = g.nearestNode(0.5, 0.5, 0.001)!;
    expect(g.degree(c.id)).toBe(4);
    checkInvariants(g);
  });
  it("既存ノードを通過する道路はそこで区切られる", () => {
    const g = new RoadGraph();
    g.addRoad(5, -5, 5, 0); // (5,0) にノード
    g.addRoad(0, 0, 5, 0);
    g.addRoad(5, 0, 10, 0);
    g.addRoad(0, 0, 10, 0); // 全部すでにある
    expect(g.edges.size).toBe(3);
    checkInvariants(g);
  });
  it("端点どうしが接する道路は共有ノードでつながる", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 5, 0);
    g.addRoad(5, 0, 5, 5);
    expect(g.nodes.size).toBe(3);
    expect(g.degree(g.nearestNode(5, 0, 0.01)!.id)).toBe(2);
  });
});

describe("RoadGraph.removeEdge / nearest", () => {
  it("唯一の道路を消すとノードも消える", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    const e = [...g.edges.values()][0]!;
    expect(g.removeEdge(e.id)).toBe(true);
    expect(g.nodes.size).toBe(0);
    expect(g.edges.size).toBe(0);
  });
  it("十字の1本を消しても中心ノードは残る (次数3)", () => {
    const g = new RoadGraph();
    g.addRoad(0, 5, 10, 5);
    g.addRoad(5, 0, 5, 10);
    const e = g.nearestEdge(5, 1, 0.1)!; // 上の腕
    g.removeEdge(e.id);
    expect(g.edges.size).toBe(3);
    expect(g.nodes.size).toBe(4);
    expect(g.degree(g.nearestNode(5, 5, 0.01)!.id)).toBe(3);
    checkInvariants(g);
  });
  it("存在しない id は false", () => {
    expect(new RoadGraph().removeEdge(999)).toBe(false);
  });
  it("nearestEdge は距離内の最寄りを返し、遠ければ null", () => {
    const g = new RoadGraph();
    g.addRoad(0, 0, 10, 0);
    expect(g.nearestEdge(5, 0.3, 0.5)).not.toBeNull();
    expect(g.nearestEdge(5, 2, 0.5)).toBeNull();
  });
  it("変更するたびに version が増える", () => {
    const g = new RoadGraph();
    const v0 = g.version;
    g.addRoad(0, 0, 3, 0);
    const v1 = g.version;
    g.removeEdge([...g.edges.values()][0]!.id);
    expect(v1).toBeGreaterThan(v0);
    expect(g.version).toBeGreaterThan(v1);
  });
});
