import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { FacilityType } from "../src/sim/facilities";
import { LOT_SIZES, ZoneType, cellCapacity, lotArea, pickLotSize, shrinkSteps, type Density } from "../src/sim/zoning";
import { SEED, findLand, forceFacility } from "./helpers";

const R = ZoneType.Residential;

/** 道路 1 本の南側に density の住宅を広く塗った街 (電力などは十分、外部接続あり)。 */
function town(density: Density, cols = 16, rows = 3, opts: { roadType?: number } = {}) {
  const [x0, y0] = findLand();
  const roadY = y0 + 4;
  const city = new City(SEED);
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5, opts.roadType as never);
  city.zones.paintRect(city.graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + cols, y1: roadY + rows }, R, density);
  const kinds = [...Array(6).fill(FacilityType.Power), ...Array(5).fill(FacilityType.Water), ...Array(5).fill(FacilityType.Sewage), FacilityType.Outside];
  kinds.forEach((k, i) => forceFacility(city, k, x0 + 22 + (i % 8) * 2, i < 8 ? roadY + 1 : roadY - 2));
  return { city, x0, roadY };
}
const buildings = (city: City) => [...city.zones.cells.values()].filter((c) => c.building > 0);
const grow = (city: City, days: number) => {
  for (let i = 0; i < days; i++) city.tick();
};

describe("建物の大きさの候補", () => {
  it("密度が高いほど大きい (低 1〜2 マス・中 4〜6 マス・高 9〜12 マス)。昔の区画は 1×1", () => {
    const areas = (d: Density) => LOT_SIZES[d].map(([w, h]) => w * h);
    expect(areas(0)).toEqual([1]);
    expect(Math.min(...areas(1))).toBe(1);
    expect(Math.max(...areas(1))).toBe(2);
    expect(Math.min(...areas(2))).toBe(4);
    expect(Math.max(...areas(2))).toBe(6);
    expect(Math.min(...areas(3))).toBe(9);
    expect(Math.max(...areas(3))).toBe(12);
  });

  it("大きさは種子と場所から決まり (同じ場所なら同じ)、候補の中に収まる。場所によってばらける", () => {
    const seen = new Set<string>();
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 10; y++) {
        const a = pickLotSize(SEED, x, y, 2);
        expect(pickLotSize(SEED, x, y, 2)).toEqual(a);
        expect(LOT_SIZES[2].some(([w, h]) => w === a[0] && h === a[1])).toBe(true);
        seen.add(a.join("x"));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(pickLotSize(SEED, 3, 4, 0)).toEqual([1, 1]);
  });

  it("入りきらないときは、1×1 まで少しずつ小さくした候補を順に試す", () => {
    expect(shrinkSteps(3, 3)).toEqual([[3, 3], [2, 3], [2, 2], [1, 2], [1, 1]]);
    expect(shrinkSteps(1, 1)).toEqual([[1, 1]]);
    expect(shrinkSteps(4, 3)[0]).toEqual([4, 3]);
    expect(shrinkSteps(4, 3).at(-1)).toEqual([1, 1]);
  });
});

describe("複数マスの建物", () => {
  it("中密度の住宅は、2×2 以上の建物になり、敷地のタイルは建物の一部として印が付く", () => {
    const { city } = town(2, 16, 3, { roadType: 2 });
    grow(city, 60);
    const big = buildings(city).filter((c) => lotArea(c) > 1);
    expect(big.length).toBeGreaterThan(0);
    for (const c of big) {
      expect(c.w).toBeGreaterThanOrEqual(1);
      expect(c.w * c.h).toBeGreaterThanOrEqual(2);
      const tiles = city.zones.lotCells(c);
      expect(tiles).toHaveLength(lotArea(c));
      for (const t of tiles) {
        if (t === c) continue;
        expect(t.part).toBe(`${c.x},${c.y}`);
        expect(t.building).toBe(0);
        expect(t.zone).toBe(c.zone);
      }
    }
  });

  it("敷地は重ならず、1 つのタイルが 2 つの建物に属することはない", () => {
    const { city } = town(2);
    grow(city, 120);
    const owner = new Map<string, string>();
    for (const c of buildings(city)) {
      for (const t of city.zones.lotCells(c)) {
        const k = `${t.x},${t.y}`;
        expect(owner.has(k)).toBe(false);
        owner.set(k, `${c.x},${c.y}`);
      }
    }
    for (const c of city.zones.cells.values()) if (c.part !== undefined) expect(owner.get(`${c.x},${c.y}`)).toBe(c.part);
  });

  it("定員は「1 マスあたりの数 × マス数」で、同じ広さを塗れば街の規模は昔の 1×1 と変わらない", () => {
    const { city } = town(2);
    grow(city, 400);
    for (const c of buildings(city)) {
      expect(cellCapacity(c)).toBe(Math.floor(16 * lotArea(c) * c.aging)); // 中密度住宅は 1 マス 16 人 (老朽化で少し減る)
      expect(c.residents).toBeLessThanOrEqual(cellCapacity(c));
    }
    const filled = buildings(city).reduce((s, c) => s + lotArea(c), 0);
    expect(filled).toBeGreaterThanOrEqual(8); // 48 タイルのうち、需要と供給の許すぶんだけ建つ (密度ごとの需要で、中密度ばかりになると建ちにくい)
    const pop = city.zones.totals().population;
    expect(pop).toBeGreaterThan(0);
    expect(pop).toBeLessThanOrEqual(16 * filled);
  });

  it("電力・水道・下水・ごみの使用量は、マス数ぶん", () => {
    const { city } = town(2);
    grow(city, 100);
    city.refresh();
    const served = buildings(city).filter((c) => c.served);
    const tiles = served.reduce((s, c) => s + lotArea(c), 0);
    expect(tiles).toBeGreaterThan(0);
    const agedTiles = served.reduce((s, c) => s + lotArea(c) * c.aging, 0);
    expect(city.utilities.water.used).toBeCloseTo(16 * agedTiles, 6);
    expect(city.utilities.sewage.used).toBeCloseTo(16 * agedTiles, 6);
    expect(city.garbage.load).toBeCloseTo(buildings(city).reduce((s, c) => s + 8 * lotArea(c), 0), 6);
  });

  it("入りきらない小さな空き地には、小さい建物が建つ (幅 1 の細長いゾーンでも、高密度が建つ余地はある)", () => {
    const { city } = town(3, 2, 1, { roadType: 7 }); // 2×1 だけの狭いゾーン (幹線道路)
    grow(city, 80);
    const b = buildings(city);
    expect(b.length).toBeGreaterThan(0);
    for (const c of b) expect(lotArea(c)).toBeLessThanOrEqual(2);
  });

  it("昔の区画 (密度を決めない) は、いつも 1×1", () => {
    const { city } = town(0);
    grow(city, 100);
    expect(buildings(city).length).toBeGreaterThan(0);
    for (const c of city.zones.cells.values()) {
      expect(c.w).toBe(1);
      expect(c.h).toBe(1);
      expect(c.part).toBeUndefined();
    }
  });

  it("高密度は広い道路に面した敷地にだけ建つ (敷地のどこかが面していればよい)", () => {
    const thin = town(3).city; // 通り (容量 100) では高密度は建たない
    grow(thin, 100);
    expect(buildings(thin)).toHaveLength(0);
  });
});

describe("複数マスの建物の取り壊し", () => {
  function withLots() {
    const t = town(2, 16, 3, { roadType: 2 });
    grow(t.city, 80);
    const lot = buildings(t.city).find((c) => lotArea(c) >= 4)!;
    expect(lot).toBeDefined();
    return { ...t, lot };
  }

  it("敷地の一部を解除すると、建物ごと取り壊され、残りのタイルは空き地に戻る", () => {
    const { city, lot } = withLots();
    const tiles = city.zones.lotCells(lot).map((t) => ({ x: t.x, y: t.y }));
    const target = tiles[tiles.length - 1]!; // アンカーではないタイル
    city.zones.clearRect({ x0: target.x, y0: target.y, x1: target.x, y1: target.y });
    expect(city.zones.get(target.x, target.y)).toBeUndefined();
    for (const t of tiles.slice(0, -1)) {
      const c = city.zones.get(t.x, t.y)!;
      expect(c.building).toBe(0);
      expect(c.part).toBeUndefined();
      expect(c.w * c.h).toBe(1);
      expect(c.residents).toBe(0);
    }
  });

  it("別の種類に塗り替えると、建物ごと取り壊される", () => {
    const { city, lot } = withLots();
    const tiles = city.zones.lotCells(lot).map((t) => ({ x: t.x, y: t.y }));
    const last = tiles[tiles.length - 1]!;
    city.zones.paintRect(city.graph, { x0: last.x, y0: last.y, x1: last.x, y1: last.y }, ZoneType.Commercial, 2);
    expect(city.zones.get(last.x, last.y)!.zone).toBe(ZoneType.Commercial);
    const anchor = city.zones.get(lot.x, lot.y)!;
    expect(anchor.zone).toBe(R);
    expect(anchor.building).toBe(0);
    expect(anchor.w * anchor.h).toBe(1);
  });

  it("施設を建てて敷地の一部が消えても、建物ごと取り壊される", () => {
    const { city, lot } = withLots();
    const t = city.zones.lotCells(lot).at(-1)!;
    city.placeFacility(FacilityType.Police, t.x, t.y);
    expect(city.zones.get(lot.x, lot.y)?.building ?? 0).toBe(0);
    expect(city.zones.get(lot.x, lot.y)?.part).toBeUndefined();
  });

  it("道路を敷いて敷地の一部が塗れなくなっても、建物ごと取り壊される", () => {
    const { city, lot, x0, roadY } = withLots();
    const t = city.zones.lotCells(lot).at(-1)!;
    expect(city.buildRoad(t.x + 0.5, roadY + 0.5, t.x + 0.5, roadY + 8.5)).toBe(true);
    city.refresh();
    expect(city.zones.get(t.x, t.y)).toBeUndefined();
    expect(city.zones.get(lot.x, lot.y)?.building ?? 0).toBe(0);
    expect(x0).toBeDefined();
  });
});

describe("保存データ", () => {
  it("建物の幅と高さを保存し、読み込むと同じ敷地・同じ住民になる", () => {
    const { city } = town(2, 16, 3, { roadType: 2 });
    grow(city, 120);
    const data = JSON.parse(JSON.stringify(city.toData()));
    expect(data.zones.some((z: number[]) => z.length >= 8 && (z[3] ?? 0) > 0)).toBe(true);
    const loaded = City.fromData(data);
    loaded.refresh();
    city.refresh();
    const key = (c: City) => buildings(c).map((b) => `${b.x},${b.y},${b.w},${b.h},${b.residents}`).sort();
    expect(key(loaded)).toEqual(key(city));
    for (const c of buildings(loaded)) for (const t of loaded.zones.lotCells(c)) if (t !== c) expect(t.part).toBe(`${c.x},${c.y}`);
    expect(loaded.zones.totals()).toEqual(city.zones.totals());
  });

  it("大きさのない昔のデータは、すべて 1×1 で読み込まれる", () => {
    const { city } = town(2, 16, 3, { roadType: 2 });
    grow(city, 60);
    const data = JSON.parse(JSON.stringify(city.toData()));
    // 昔のデータには、複数マスの建物がなかった (6 要素のタプル)。アンカーの大きさを外し、建物だけ残す
    data.zones = data.zones.map((z: number[]) => [...z.slice(0, 4), Math.min(z[4]!, 16), z[5]!]);
    const loaded = City.fromData(data);
    for (const c of loaded.zones.cells.values()) {
      expect(c.w).toBe(1);
      expect(c.h).toBe(1);
      expect(c.part).toBeUndefined();
    }
  });

  it("不正な大きさ・敷地は拒否する", () => {
    const { city } = town(2, 16, 3, { roadType: 2 });
    grow(city, 80);
    const good = JSON.parse(JSON.stringify(city.toData()));
    const idx = good.zones.findIndex((z: number[]) => z.length >= 8 && (z[3] ?? 0) > 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const bad = (mutate: (zones: number[][]) => void) => {
      const d = JSON.parse(JSON.stringify(good));
      mutate(d.zones);
      return () => City.fromData(d);
    };
    expect(bad((z) => (z[idx]![6] = 0))).toThrow(); // 幅 0
    expect(bad((z) => (z[idx]![6] = 99))).toThrow(); // 大きすぎる
    expect(bad((z) => (z[idx]![7] = 1.5))).toThrow(); // 整数でない
    expect(bad((z) => (z[idx]![3] = 0))).toThrow(); // 建物のない空き地が大きさを持つ
    expect(bad((z) => (z[idx]![4] = 1e6))).toThrow(); // 住民が定員 (マス数ぶん) を超える
    expect(bad((z) => z.splice(idx + 1, 1))).toThrow(); // 敷地のタイルが欠けている
  });
});
