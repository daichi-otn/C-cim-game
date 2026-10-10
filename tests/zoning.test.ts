import { describe, expect, it } from "vitest";
import { RoadGraph } from "../src/sim/roadGraph";
import { isBuildableTile } from "../src/sim/roadPlacement";
import { Tile, tileAt } from "../src/sim/terrain";
import {
  BUILDING_VARIANTS,
  MAX_RECT_SIZE,
  ZONE_REACH,
  ZoneMap,
  ZoneType,
  canZone,
  normalizeRect,
} from "../src/sim/zoning";

const SEED = 12345;
const R = ZoneType.Residential;
const C = ZoneType.Commercial;

/** 全タイルが陸地の 14×9 の区画の左上 (x, y) を探す。 */
function findLand(): [number, number] {
  for (let y = -200; y < 200; y += 3) {
    for (let x = -200; x < 200; x += 3) {
      let ok = true;
      for (let dy = 0; dy < 9 && ok; dy++) for (let dx = 0; dx < 14 && ok; dx++) ok = isBuildableTile(tileAt(SEED, x + dx, y + dy));
      if (ok) return [x, y];
    }
  }
  throw new Error("land not found");
}

/** 横の道路 (y0+4 行目の中心を x0+1 〜 x0+12 に敷いた) を持つ世界を作る。 */
function setup() {
  const [x0, y0] = findLand();
  const graph = new RoadGraph();
  const roadY = y0 + 4;
  graph.addRoad(x0 + 1.5, roadY + 0.5, x0 + 12.5, roadY + 0.5);
  return { graph, x0, y0, roadY, zones: new ZoneMap(SEED) };
}

describe("canZone", () => {
  it("道路の隣は可、道路そのもの・遠すぎる場所は不可", () => {
    const { graph, x0, roadY } = setup();
    expect(canZone(SEED, graph, x0 + 5, roadY + 1)).toBe(true);
    expect(canZone(SEED, graph, x0 + 5, roadY - 1)).toBe(true);
    expect(canZone(SEED, graph, x0 + 5, roadY + ZONE_REACH)).toBe(true); // ちょうど届く距離
    expect(canZone(SEED, graph, x0 + 5, roadY + ZONE_REACH + 1)).toBe(false);
    expect(canZone(SEED, graph, x0 + 5, roadY)).toBe(false); // 道路のタイル
  });
  it("道路が1本もなければどこにも塗れない", () => {
    const { x0, y0 } = setup();
    expect(canZone(SEED, new RoadGraph(), x0 + 5, y0 + 5)).toBe(false);
  });
  it("水・山の上は道路の隣でも不可", () => {
    // 陸地の道路の近くに水/山があるタイルを探す
    const graph = new RoadGraph();
    for (let y = -150; y < 150; y++) {
      for (let x = -150; x < 150; x++) {
        const t = tileAt(SEED, x, y);
        if (t !== Tile.Water && t !== Tile.Mountain) continue;
        if (!isBuildableTile(tileAt(SEED, x - 1, y))) continue;
        graph.addRoad(x - 0.5, y + 0.5, x - 0.5, y + 0.5 + 0.01);
        expect(canZone(SEED, graph, x, y)).toBe(false);
        return;
      }
    }
    throw new Error("water/mountain not found");
  });
});

describe("normalizeRect", () => {
  it("どの向きに指定しても x0<=x1, y0<=y1 になる", () => {
    expect(normalizeRect(5, 8, 2, 3)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 8 });
    expect(normalizeRect(2, 3, 5, 8)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 8 });
  });
  it("1タイルの指定も有効", () => {
    expect(normalizeRect(4, 4, 4, 4)).toEqual({ x0: 4, y0: 4, x1: 4, y1: 4 });
  });
  it("一辺が上限を超えないよう、始点から切り詰める", () => {
    const r = normalizeRect(0, 0, 1000, -1000);
    expect(r.x1 - r.x0 + 1).toBe(MAX_RECT_SIZE);
    expect(r.y1 - r.y0 + 1).toBe(MAX_RECT_SIZE);
    expect(r.x0).toBe(0);
    expect(r.y1).toBe(0);
  });
});

describe("ZoneMap.paintRect", () => {
  it("塗れるタイルだけが塗られ、塗った数が返る", () => {
    const { graph, zones, x0, roadY } = setup();
    // 道路の上下 1〜2 行 × 横 4 タイル = 道路の行(4)を除き 4 行 × 4 = 16
    const n = zones.paintRect(graph, { x0: x0 + 3, y0: roadY - 2, x1: x0 + 6, y1: roadY + 2 }, R);
    expect(n).toBe(16);
    expect(zones.get(x0 + 3, roadY + 1)?.zone).toBe(R);
    expect(zones.get(x0 + 3, roadY)).toBeUndefined(); // 道路のタイルは塗られない
  });
  it("道路から遠いタイルは塗られない", () => {
    const { graph, zones, x0, roadY } = setup();
    const n = zones.paintRect(graph, { x0: x0 + 3, y0: roadY + 4, x1: x0 + 4, y1: roadY + 4 }, R);
    expect(n).toBe(0);
    expect(zones.cells.size).toBe(0);
  });
  it("同じ種類を塗り直しても変化なし (version も増えない)", () => {
    const { graph, zones, x0, roadY } = setup();
    const rect = { x0: x0 + 3, y0: roadY + 1, x1: x0 + 4, y1: roadY + 1 };
    zones.paintRect(graph, rect, R);
    const v = zones.version;
    expect(zones.paintRect(graph, rect, R)).toBe(0);
    expect(zones.version).toBe(v);
  });
  it("別の種類で塗り替えると建物は取り壊される", () => {
    const { graph, zones, x0, roadY } = setup();
    const rect = { x0: x0 + 3, y0: roadY + 1, x1: x0 + 3, y1: roadY + 1 };
    zones.paintRect(graph, rect, R);
    zones.grow(() => 0);
    expect(zones.get(x0 + 3, roadY + 1)!.building).toBeGreaterThan(0);
    expect(zones.paintRect(graph, rect, C)).toBe(1);
    expect(zones.get(x0 + 3, roadY + 1)).toMatchObject({ zone: C, building: 0 });
  });
  it("ZoneType.None で塗ると解除になる", () => {
    const { graph, zones, x0, roadY } = setup();
    const rect = { x0: x0 + 3, y0: roadY + 1, x1: x0 + 4, y1: roadY + 1 };
    zones.paintRect(graph, rect, R);
    expect(zones.paintRect(graph, rect, ZoneType.None)).toBe(2);
    expect(zones.cells.size).toBe(0);
  });
});

describe("ZoneMap.clearRect", () => {
  it("矩形内だけを解除し、解除した数を返す", () => {
    const { graph, zones, x0, roadY } = setup();
    zones.paintRect(graph, { x0: x0 + 3, y0: roadY + 1, x1: x0 + 8, y1: roadY + 1 }, R); // 6 タイル
    expect(zones.clearRect({ x0: x0 + 3, y0: roadY + 1, x1: x0 + 5, y1: roadY + 1 })).toBe(3);
    expect(zones.cells.size).toBe(3);
    expect(zones.clearRect({ x0: x0 + 3, y0: roadY + 1, x1: x0 + 5, y1: roadY + 1 })).toBe(0); // 2回目は何もない
  });
});

describe("ZoneMap.revalidate", () => {
  it("道路を撤去すると、届かなくなったゾーンが建物ごと消える", () => {
    const { graph, zones, x0, roadY } = setup();
    zones.paintRect(graph, { x0: x0 + 3, y0: roadY + 1, x1: x0 + 6, y1: roadY + 1 }, R);
    zones.grow(() => 0);
    const edge = [...graph.edges.values()][0]!;
    graph.removeEdge(edge.id);
    expect(zones.revalidate(graph)).toBe(4);
    expect(zones.cells.size).toBe(0);
  });
  it("道路の一部だけ撤去しても、別の道路が届く範囲のゾーンは残る", () => {
    const { graph, zones, x0, roadY } = setup();
    // 道路を 2 区間に分割しておく
    graph.addRoad(x0 + 6.5, roadY + 0.5, x0 + 9.5, roadY + 0.5);
    zones.paintRect(graph, { x0: x0 + 3, y0: roadY + 1, x1: x0 + 3, y1: roadY + 1 }, R);
    zones.paintRect(graph, { x0: x0 + 12, y0: roadY + 1, x1: x0 + 12, y1: roadY + 1 }, R);
    const right = graph.nearestEdge(x0 + 12.5, roadY + 0.5, 0.1)!;
    graph.removeEdge(right.id);
    zones.revalidate(graph);
    expect(zones.get(x0 + 3, roadY + 1)).toBeDefined();
    expect(zones.get(x0 + 12, roadY + 1)).toBeUndefined();
  });
  it("ゾーンの上に新しく道路を敷くと、そのタイルのゾーンが消える", () => {
    const { graph, zones, x0, roadY } = setup();
    zones.paintRect(graph, { x0: x0 + 5, y0: roadY + 1, x1: x0 + 5, y1: roadY + 2 }, R);
    graph.addRoad(x0 + 5.5, roadY + 0.5, x0 + 5.5, roadY + 3.5); // 縦の道路がゾーンを貫く
    expect(zones.revalidate(graph)).toBe(2);
    expect(zones.cells.size).toBe(0);
  });
  it("何も変わらなければ何も消えず version も増えない", () => {
    const { graph, zones, x0, roadY } = setup();
    zones.paintRect(graph, { x0: x0 + 3, y0: roadY + 1, x1: x0 + 6, y1: roadY + 1 }, R);
    const v = zones.version;
    expect(zones.revalidate(graph)).toBe(0);
    expect(zones.version).toBe(v);
  });
});

describe("ZoneMap.grow", () => {
  function painted() {
    const s = setup();
    s.zones.paintRect(s.graph, { x0: s.x0 + 3, y0: s.roadY + 1, x1: s.x0 + 8, y1: s.roadY + 2 }, R); // 12 タイル
    return s;
  }
  it("確率 0 なら建たない", () => {
    const { zones } = painted();
    expect(zones.grow(() => 0.5, 0)).toBe(0);
    expect(zones.stats().R.buildings).toBe(0);
  });
  it("確率 1 なら全部のゾーンに建ち、二度目は何も建たない", () => {
    const { zones } = painted();
    expect(zones.grow(() => 0, 1)).toBe(12);
    expect(zones.stats().R).toEqual({ zones: 12, buildings: 12 });
    expect(zones.grow(() => 0, 1)).toBe(0);
  });
  it("maxSpawn で 1 回に建つ棟数を制限できる", () => {
    const { zones } = painted();
    expect(zones.grow(() => 0, 1, 5)).toBe(5);
    expect(zones.grow(() => 0, 1, 5)).toBe(5);
    expect(zones.grow(() => 0, 1, 5)).toBe(2);
  });
  it("建物の種類は 1..BUILDING_VARIANTS で、場所ごとに決まる", () => {
    const { zones } = painted();
    zones.grow(() => 0, 1);
    const kinds = [...zones.cells.values()].map((c) => c.building);
    for (const k of kinds) {
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(BUILDING_VARIANTS);
    }
    const again = painted();
    again.zones.grow(() => 0, 1);
    expect([...again.zones.cells.values()].map((c) => c.building)).toEqual(kinds);
  });
  it("建物がなければ version は増えない", () => {
    const { zones } = painted();
    const v = zones.version;
    zones.grow(() => 0.9, 0.3);
    expect(zones.version).toBe(v);
  });
});

describe("ZoneMap.stats", () => {
  it("種類ごとにゾーン数と建物数を数える", () => {
    const { graph, zones, x0, roadY } = setup();
    zones.paintRect(graph, { x0: x0 + 2, y0: roadY + 1, x1: x0 + 4, y1: roadY + 1 }, R); // 3
    zones.paintRect(graph, { x0: x0 + 5, y0: roadY + 1, x1: x0 + 6, y1: roadY + 1 }, C); // 2
    zones.paintRect(graph, { x0: x0 + 7, y0: roadY + 1, x1: x0 + 7, y1: roadY + 1 }, ZoneType.Industrial); // 1
    zones.grow(() => 0, 1);
    expect(zones.stats()).toEqual({
      R: { zones: 3, buildings: 3 },
      C: { zones: 2, buildings: 2 },
      I: { zones: 1, buildings: 1 },
      O: { zones: 0, buildings: 0 },
    });
  });
});
