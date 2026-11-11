import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { Tile, tileAt } from "../src/sim/terrain";

describe("M13 地形編集", () => {
  it("整地・水路・植林を地形判定へ反映する", () => {
    const city = new City(12345);
    expect(city.editTerrain(0, 0, "water")).toBe(true);
    expect(tileAt(city.seed, 0, 0)).toBe(Tile.Water);
    expect(city.editTerrain(0, 0, "forest")).toBe(true);
    expect(tileAt(city.seed, 0, 0)).toBe(Tile.Forest);
    const loaded = City.fromData(city.toData());
    expect(tileAt(loaded.seed, 0, 0)).toBe(Tile.Forest);
  });
});
