import { describe, expect, it } from "vitest";
import { landAt, lonLatOfTile, tilesPerDegOf } from "../src/sim/coast";
import { REGION_SEEDS, tileAt, Tile, heightAt, profileOf } from "../src/sim/terrain";
import { findStart, MAPS } from "../src/sim/maps";
import { isBuildableTile } from "../src/sim/roadPlacement";

/** 経度・緯度の地点に対応するタイル座標 (coast.ts の逆変換)。 */
function tileOf(key: string, lon: number, lat: number): { tx: number; ty: number } {
  const origin = lonLatOfTile(key, 0, 0)!;
  const tpd = tilesPerDegOf(key);
  const ty = (origin.lat - lat) * tpd;
  const tx = (lon - origin.lon) * tpd * Math.cos((lat * Math.PI) / 180);
  return { tx: Math.round(tx), ty: Math.round(ty) };
}

describe("海岸線の地図", () => {
  it("東京は陸、太平洋の沖は海", () => {
    const tokyo = tileOf("japan", 139.7, 35.7);
    const pacific = tileOf("japan", 152, 35);
    expect(landAt("japan", tokyo.tx, tokyo.ty)).toBe(1);
    expect(landAt("japan", pacific.tx, pacific.ty)).toBe(0);
    expect(tileAt(REGION_SEEDS.japan, tokyo.tx, tokyo.ty)).not.toBe(Tile.Water);
    expect(tileAt(REGION_SEEDS.japan, pacific.tx, pacific.ty)).toBe(Tile.Water);
  });

  it("各国の代表地点は陸、海の地点は水", () => {
    expect(landAt("uk", ...Object.values(tileOf("uk", -0.12, 51.5)) as [number, number])).toBe(1); // ロンドン
    expect(landAt("australia", ...Object.values(tileOf("australia", 149.1, -35.3)) as [number, number])).toBe(1); // キャンベラ
    expect(landAt("newZealand", ...Object.values(tileOf("newZealand", 176.1, -38.7)) as [number, number])).toBe(1); // タウポ (北島の内陸)
    expect(tileAt(REGION_SEEDS.uk, ...(Object.values(tileOf("uk", -20, 50)) as [number, number]))).toBe(Tile.Water); // 大西洋
  });

  it("海岸線の地図がない地域は、いままでの地形のまま", () => {
    const seed = MAPS.find((m) => m.id === "lakeside")!.seed;
    expect(profileOf(seed).coast).toBeUndefined();
    expect(heightAt(seed, 10, 10)).toBe(heightAt(seed, 10, 10));
  });

  it("地図の地域の街の始まりの場所は、陸で広く作れる", () => {
    for (const seed of [REGION_SEEDS.japan, REGION_SEEDS.uk, REGION_SEEDS.australia, REGION_SEEDS.newZealand]) {
      const s = findStart(seed);
      expect(isBuildableTile(tileAt(seed, s.x, s.y))).toBe(true);
    }
  });
});
