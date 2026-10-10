import { describe, expect, it } from "vitest";
import { RoadGraph } from "../src/sim/roadGraph";
import { isBuildableTile, isSegmentBuildable, snapPoint, snapToTileCenter } from "../src/sim/roadPlacement";
import { Tile, tileAt } from "../src/sim/terrain";

const SEED = 12345;

function find(pred: (x: number, y: number) => boolean): [number, number] {
  for (let y = -200; y < 200; y++) for (let x = -200; x < 200; x++) if (pred(x, y)) return [x, y];
  throw new Error("not found");
}

describe("roadPlacement", () => {
  it("水と山は不可、それ以外は可", () => {
    expect(isBuildableTile(Tile.Water)).toBe(false);
    expect(isBuildableTile(Tile.Mountain)).toBe(false);
    expect(isBuildableTile(Tile.Grass)).toBe(true);
    expect(isBuildableTile(Tile.Forest)).toBe(true);
    expect(isBuildableTile(Tile.Sand)).toBe(true);
  });
  it("タイル中心にスナップ (負の座標も)", () => {
    expect(snapToTileCenter(3.2, 7.9)).toEqual({ x: 3.5, y: 7.5 });
    expect(snapToTileCenter(-0.1, -1.9)).toEqual({ x: -0.5, y: -1.5 });
  });
  it("既存ノードが近ければそこにスナップ、遠ければタイル中心", () => {
    const g = new RoadGraph();
    g.addRoad(0.5, 0.5, 5.5, 0.5);
    expect(snapPoint(g, 5.3, 0.7)).toEqual({ x: 5.5, y: 0.5 });
    expect(snapPoint(g, 9.2, 9.9)).toEqual({ x: 9.5, y: 9.5 });
  });
  it("草地が続く線分は敷設可", () => {
    const [x, y] = find((x, y) => [0, 1, 2, 3].every((i) => tileAt(SEED, x + i, y) === Tile.Grass));
    expect(isSegmentBuildable(SEED, x + 0.5, y + 0.5, x + 3.5, y + 0.5)).toBe(true);
  });
  it("水タイルは敷設不可", () => {
    const [x, y] = find((x, y) => tileAt(SEED, x, y) === Tile.Water);
    expect(isSegmentBuildable(SEED, x + 0.5, y + 0.5, x + 0.5, y + 0.5)).toBe(false);
  });
  it("水を横切る線分は両端が陸でも不可", () => {
    // 陸 → 水が k タイル続く → 陸 の並びを探す (k は 1〜6)
    let found: { x: number; y: number; k: number } | null = null;
    for (let y = -100; y < 100 && !found; y++) {
      for (let x = -100; x < 100 && !found; x++) {
        if (!isBuildableTile(tileAt(SEED, x, y))) continue;
        let k = 0;
        while (k < 6 && tileAt(SEED, x + 1 + k, y) === Tile.Water) k++;
        if (k >= 1 && k < 6 && isBuildableTile(tileAt(SEED, x + 1 + k, y))) found = { x, y, k };
      }
    }
    expect(found).not.toBeNull();
    const { x, y, k } = found!;
    expect(isSegmentBuildable(SEED, x + 0.5, y + 0.5, x + k + 1.5, y + 0.5)).toBe(false);
  });
});
