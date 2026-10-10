import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { MAPS, findStart, mapNameFor, randomSeed, seedFromText } from "../src/sim/maps";
import { createStatefulRng } from "../src/sim/rng";
import { RoadGraph } from "../src/sim/roadGraph";
import { isBuildableTile } from "../src/sim/roadPlacement";
import {
  AUTO_SLOT,
  SAVE_VERSION,
  SaveError,
  SaveStore,
  loadCity,
  makeSave,
  parseSave,
  summarize,
  type KeyValueStorage,
} from "../src/sim/save";
import { tileAt } from "../src/sim/terrain";
import { setup } from "./helpers";

const VIEW = { x: 10, y: 20, zoom: 1.5 };
const CTX = { mapId: "lakeside", mapName: "湖畔の平野", view: VIEW, speed: 2 };

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error("quota");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** 街を育てる (建物と住民が増える程度の日数)。 */
function grownCity(days = 200) {
  const { city } = setup();
  for (let i = 0; i < days; i++) city.tick();
  return city;
}
const roundTrip = (city: City) => loadCity(parseSave(JSON.stringify(makeSave(city, CTX))));

describe("StatefulRng", () => {
  it("状態を取り出して再開すると、同じ列が続く", () => {
    const a = createStatefulRng(7);
    for (let i = 0; i < 25; i++) a.next();
    const b = createStatefulRng(7, a.state());
    for (let i = 0; i < 50; i++) expect(b.next()).toBe(a.next());
  });
});

describe("RoadGraph の保存と復元", () => {
  it("復元した道路網は元と同じで、その後の敷設も同じ結果になる", () => {
    const g = new RoadGraph();
    g.addRoad(0.5, 0.5, 10.5, 0.5);
    g.addRoad(5.5, -3.5, 5.5, 4.5); // 交差点
    const copy = RoadGraph.fromData(JSON.parse(JSON.stringify(g.toData())));
    expect(copy.toData()).toEqual(g.toData());
    expect(copy.totalLength()).toBeCloseTo(g.totalLength());
    expect(copy.components().size).toBe(g.components().size);
    // 復元後も、交差の自動分割や撤去が元と同じに動く
    g.addRoad(2.5, -2.5, 2.5, 3.5);
    copy.addRoad(2.5, -2.5, 2.5, 3.5);
    expect(copy.toData()).toEqual(g.toData());
    const e = copy.nearestEdge(8.5, 0.5, 0.1)!;
    expect(copy.removeEdge(e.id)).toBe(true);
  });
  it("空の道路網も復元できる", () => {
    expect(RoadGraph.fromData(new RoadGraph().toData()).nodes.size).toBe(0);
  });
  it("壊れたデータは Error", () => {
    const base = () => {
      const g = new RoadGraph();
      g.addRoad(0.5, 0.5, 5.5, 0.5);
      return g.toData();
    };
    const missing = base();
    missing.edges[0]![2] = 999; // 存在しないノード
    expect(() => RoadGraph.fromData(missing)).toThrow();
    const dupNode = base();
    dupNode.nodes.push([dupNode.nodes[0]![0], 3, 3]);
    expect(() => RoadGraph.fromData(dupNode)).toThrow();
    const loop = base();
    loop.edges[0]![2] = loop.edges[0]![1];
    expect(() => RoadGraph.fromData(loop)).toThrow();
    const badNext = base();
    badNext.nextId = 1;
    expect(() => RoadGraph.fromData(badNext)).toThrow();
    const nan = base();
    nan.nodes[0]![1] = NaN;
    expect(() => RoadGraph.fromData(nan)).toThrow();
  });
});

describe("City の保存と復元", () => {
  it("保存して読み込んだ街は、保存した時と同じ", () => {
    const city = grownCity();
    expect(city.zones.totals().population).toBeGreaterThan(0);
    const loaded = roundTrip(city);
    city.refresh(); // 供給などは tick の途中の値なので、読み込み後と同じ時点で求め直してから比べる
    expect(loaded.toData()).toEqual(city.toData());
    expect(loaded.zones.totals()).toEqual(city.zones.totals());
    expect(loaded.utilities).toEqual(city.utilities);
    expect(loaded.demand).toEqual(city.demand);
    expect(loaded.date).toEqual(city.date);
    expect(loaded.money).toBe(city.money);
    expect(loaded.facilities.size).toBe(city.facilities.size);
    expect(loaded.graph.nodes.size).toBe(city.graph.nodes.size);
  });
  it("読み込み直後から、供給のない建物は供給なしと判定される", () => {
    const city = grownCity();
    for (const f of [...city.facilities.values()]) if (f.type === 1) city.removeFacility(f.id); // 発電所を壊す
    city.tick();
    const loaded = roundTrip(city);
    expect(loaded.zones.totals().population).toBe(0);
    expect([...loaded.zones.cells.values()].some((c) => c.building > 0 && !c.served)).toBe(true);
  });
  it("読み込んだ街の続きは、保存せずに続けた場合と全く同じになる", () => {
    const original = grownCity(120);
    const loaded = roundTrip(original);
    for (let i = 0; i < 200; i++) {
      original.tick();
      loaded.tick();
    }
    expect(loaded.toData()).toEqual(original.toData());
  });
  it("税率・直近の収支・日付・外部接続の状態も引き継ぐ", () => {
    const city = grownCity(65); // 2 か月ぶん進めて、月末の収支を出しておく
    city.setTaxRate(0.15);
    const loaded = roundTrip(city);
    expect(loaded.taxRate).toBe(0.15);
    expect(loaded.lastMonth).toEqual(city.lastMonth);
    expect(loaded.day).toBe(65);
    expect(loaded.outsideNets.size).toBe(city.outsideNets.size);
  });
  it("読み込んだ街でも、道路・施設・ゾーンの操作が続けられる", () => {
    const loaded = roundTrip(grownCity(60));
    const money = loaded.money;
    const edge = [...loaded.graph.edges.values()][0]!;
    const na = loaded.graph.nodes.get(edge.a)!;
    expect(loaded.buildRoad(na.x, na.y - 8, na.x + 6, na.y - 8)).toBe(true);
    expect(loaded.money).toBeLessThan(money);
    const f = [...loaded.facilities.values()][0]!;
    expect(loaded.removeFacility(f.id)).toBe(true);
    // 新しい施設の id が既存と重ならない
    const ids = [...loaded.facilities.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("施設の番号の続きも引き継ぐ (復元後に建てた施設が既存と重ならない)", () => {
    const city = grownCity(10);
    const loaded = roundTrip(city);
    expect(loaded.toData().nextFacilityId).toBe(city.toData().nextFacilityId);
    const maxId = Math.max(...[...loaded.facilities.keys()]);
    expect(loaded.toData().nextFacilityId).toBeGreaterThan(maxId);
  });
  it("壊れた街のデータは SaveError", () => {
    const save = makeSave(grownCity(30), CTX);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = (mutate: (d: any) => void) => {
      const d = JSON.parse(JSON.stringify(save));
      mutate(d);
      return () => loadCity(d);
    };
    expect(bad((d) => (d.city.zones[0][2] = 9))).toThrow(SaveError); // 存在しないゾーン
    expect(bad((d) => (d.city.zones[0][4] = 999))).toThrow(SaveError); // 住民が多すぎる
    expect(bad((d) => (d.city.facilities[0].type = 99))).toThrow(SaveError);
    expect(bad((d) => (d.city.money = NaN))).toThrow(SaveError);
    expect(bad((d) => (d.city.rngState = -1))).toThrow(SaveError);
    expect(bad((d) => (d.city.graph.edges[0][1] = 12345678))).toThrow(SaveError);
    expect(bad((d) => (d.city.zones = "x" as never))).toThrow(SaveError);
    expect(bad(() => {})).not.toThrow();
  });
});

describe("parseSave", () => {
  const good = () => JSON.parse(JSON.stringify(makeSave(grownCity(20), CTX)));
  it("正しいデータは読める", () => {
    const d = parseSave(JSON.stringify(good()));
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.mapName).toBe("湖畔の平野");
    expect(d.view).toEqual(VIEW);
    expect(d.speed).toBe(2);
  });
  it("JSON でないものは SaveError", () => {
    expect(() => parseSave("{{{")).toThrow(SaveError);
    expect(() => parseSave("null")).toThrow(SaveError);
    expect(() => parseSave("123")).toThrow(SaveError);
  });
  it("版が違うときは理由を分けて知らせる", () => {
    const newer = good();
    newer.version = SAVE_VERSION + 1;
    expect(() => parseSave(JSON.stringify(newer))).toThrow("新しいバージョン");
    const older = good();
    older.version = 0;
    expect(() => parseSave(JSON.stringify(older))).toThrow("古い形式");
  });
  it("必要な項目が欠けていたら SaveError", () => {
    for (const key of ["mapId", "mapName", "savedAt", "city", "view", "speed"]) {
      const d = good();
      delete d[key];
      expect(() => parseSave(JSON.stringify(d)), key).toThrow(SaveError);
    }
    const d = good();
    d.view.zoom = null;
    expect(() => parseSave(JSON.stringify(d))).toThrow(SaveError);
  });

  it("3D の視点 (中心・向き・見下ろす角度) も保存でき、昔の 2D の視点 (向きと角度なし) も読める", () => {
    const d3 = good();
    d3.view = { x: 100, y: 200, zoom: 2, yaw: 0.5, pitch: 0.9, center: true };
    const loaded = parseSave(JSON.stringify(d3));
    expect(loaded.view).toEqual({ x: 100, y: 200, zoom: 2, yaw: 0.5, pitch: 0.9, center: true });
    const old = good();
    expect(old.view.center).toBeUndefined();
    expect(parseSave(JSON.stringify(old)).view.yaw).toBeUndefined();
    const bad = good();
    bad.view.yaw = "x";
    expect(() => parseSave(JSON.stringify(bad))).toThrow(SaveError);
    const bad2 = good();
    bad2.view.pitch = null;
    expect(() => parseSave(JSON.stringify(bad2))).toThrow(SaveError);
  });
});

describe("SaveStore", () => {
  it("書いて読むと同じものが返る。空きスロットは null", () => {
    const store = new SaveStore(new MemoryStorage());
    expect(store.read("1")).toBeNull();
    const save = makeSave(grownCity(30), CTX, 1700000000000);
    store.write("1", save);
    expect(store.read("1")).toEqual(save);
    expect(store.read("2")).toBeNull();
  });
  it("スロットは別々。上書きと削除ができる", () => {
    const store = new SaveStore(new MemoryStorage());
    const a = makeSave(grownCity(10), CTX, 1);
    const b = makeSave(grownCity(40), { ...CTX, mapName: "別の街" }, 2);
    store.write("1", a);
    store.write("2", b);
    expect(store.read("1")!.city.day).toBe(10);
    expect(store.read("2")!.mapName).toBe("別の街");
    store.write("1", b); // 上書き
    expect(store.read("1")!.city.day).toBe(40);
    store.remove("1");
    expect(store.read("1")).toBeNull();
    expect(store.read("2")).not.toBeNull();
    store.remove("3"); // 空きを消しても平気
  });
  it("一覧: 手動 3 つ + 自動。要約に日付・資金・人口が入る", () => {
    const store = new SaveStore(new MemoryStorage());
    const city = grownCity(100);
    store.write("2", makeSave(city, CTX, 5));
    store.write(AUTO_SLOT, makeSave(city, { ...CTX, mapName: "自動の街" }, 9));
    const list = store.list();
    expect(list.map((e) => e.slot)).toEqual(["1", "2", "3", AUTO_SLOT]);
    expect(list[0]!.summary).toBeNull();
    expect(list[1]!.summary).toMatchObject({ slot: "2", mapName: "湖畔の平野", savedAt: 5, day: 100, money: city.money });
    expect(list[1]!.summary!.population).toBe(city.zones.totals().population);
    expect(list[3]!.summary!.mapName).toBe("自動の街");
  });
  it("壊れたスロットは一覧で理由つきで返し、ほかのスロットは読める", () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    store.write("1", makeSave(grownCity(10), CTX));
    storage.setItem("ccim.save.2", "これはセーブデータではない");
    const list = store.list();
    expect(list[0]!.summary).not.toBeNull();
    expect(list[1]!.summary).toBeNull();
    expect(list[1]!.broken).toContain("読み込めません");
    expect(() => store.read("2")).toThrow(SaveError);
  });
  it("保存先に書けないときは SaveError", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(() => new SaveStore(storage).write("1", makeSave(grownCity(5), CTX))).toThrow("保存できませんでした");
  });
  it("保存先にアクセスできないときも SaveError (読み込み)", () => {
    const store = new SaveStore({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() => store.read("1")).toThrow(SaveError);
  });
  it("summarize は人口を住宅の住民から数える", () => {
    const city = grownCity(150);
    expect(summarize("1", makeSave(city, CTX)).population).toBe(city.zones.totals().population);
  });
});

describe("maps", () => {
  it("プリセットの id・シード・名前は重ならず、説明もある", () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map((m) => m.seed)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map((m) => m.name)).size).toBe(MAPS.length);
    for (const m of MAPS) expect(m.description.length).toBeGreaterThan(5);
  });
  it("seedFromText: 数字はそのまま、言葉は決まった値、空は null", () => {
    expect(seedFromText("12345")).toBe(12345);
    expect(seedFromText("  42  ")).toBe(42);
    expect(seedFromText("")).toBeNull();
    expect(seedFromText("   ")).toBeNull();
    expect(seedFromText("さくら")).toBe(seedFromText("さくら"));
    expect(seedFromText("さくら")).not.toBe(seedFromText("うみ"));
    const v = seedFromText("a very long phrase 🌸")!;
    expect(Number.isInteger(v) && v >= 0 && v < 4294967296).toBe(true);
    expect(seedFromText("99999999999")!).toBeLessThan(4294967296); // 大きすぎる数でも範囲内に収める
  });
  it("randomSeed は整数で範囲内", () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s) && s >= 0 && s < 4294967296).toBe(true);
    }
  });
  it("mapNameFor: プリセットは名前、それ以外は「シード 〇〇」", () => {
    expect(mapNameFor(12345)).toBe("湖畔の平野");
    expect(mapNameFor(777)).toBe("シード 777");
  });
  it("findStart: どのマップでも、開始地点のまわりが陸地で、毎回同じ場所", () => {
    for (const m of [...MAPS, { seed: 1 }, { seed: 99999 }]) {
      const p = findStart(m.seed);
      expect(findStart(m.seed)).toEqual(p);
      for (let dy = -14; dy <= 14; dy += 4) for (let dx = -24; dx <= 24; dx += 4) expect(isBuildableTile(tileAt(m.seed, p.x + dx, p.y + dy))).toBe(true);
    }
  });
  it("プリセットごとに地形が違う", () => {
    const sample = (seed: number) => Array.from({ length: 200 }, (_, i) => tileAt(seed, (i % 20) * 9 - 90, Math.floor(i / 20) * 9 - 45)).join("");
    const shapes = new Set(MAPS.map((m) => sample(m.seed)));
    expect(shapes.size).toBe(MAPS.length);
  });
});
