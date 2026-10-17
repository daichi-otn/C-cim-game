import { describe, expect, it } from "vitest";
import { elevationAt } from "../src/sim/elevation";
import { lonLatOfTile, tilesPerDegOf } from "../src/sim/coast";
import { REGION_SEEDS, Tile, tileAt } from "../src/sim/terrain";

/** 経緯度の地点に対応するタイル座標 (日本の地図の上で)。 */
function tileOf(lon: number, lat: number): { tx: number; ty: number } {
  const o = lonLatOfTile("japan", 0, 0)!;
  const tpd = tilesPerDegOf("japan");
  return {
    tx: Math.round((lon - o.lon) * tpd * Math.cos((lat * Math.PI) / 180)),
    ty: Math.round((o.lat - lat) * tpd),
  };
}

describe("実際の標高 (日本)", () => {
  it("富士山の付近は高く (ETOPO1 は山頂をなめらかにするので 2,000 m を超える程度)、東京は低地", () => {
    expect(elevationAt(138.73, 35.36)).toBeGreaterThan(2000);
    expect(elevationAt(139.7, 35.7)).toBeLessThan(200);
  });

  it("富士山のタイルは山、東京のタイルは山でない", () => {
    const fuji = tileOf(138.73, 35.36);
    const tokyo = tileOf(139.7, 35.7);
    expect(tileAt(REGION_SEEDS.japan, fuji.tx, fuji.ty)).toBe(Tile.Mountain);
    expect(tileAt(REGION_SEEDS.japan, tokyo.tx, tokyo.ty)).not.toBe(Tile.Mountain);
  });

  it("地図の範囲の外は海", () => {
    expect(elevationAt(160, 35)).toBeLessThan(0);
  });
});
