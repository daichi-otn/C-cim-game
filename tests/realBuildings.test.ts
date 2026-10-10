import { describe, expect, it } from "vitest";
import { FLOOR_PX, isMixedShop, kindOf, wallHeight } from "../src/render3d/buildingShape";
import { addLot, type Parts } from "../src/render3d/buildingGeo";
import { GeoBuilder } from "../src/render3d/geo";
import { ZoneType, cleanEnv, type Density, type ZoneCell } from "../src/sim/zoning";

function cell(zone: ZoneType, density: Density, building: number, x: number, y: number, w = 1, h = 1): ZoneCell {
  return { x, y, zone, building, residents: 0, served: true, net: 1, roadCap: 400, density, w, h, env: cleanEnv(), built: 0, aging: 1 };
}

describe("現実的な建物", () => {
  it("雑居ビルは 3 階建て (1 階が店、上に住まいや事務所)", () => {
    const found = Array.from({ length: 200 }, (_, i) => cell(ZoneType.Commercial, 1, 1, 10 + i, 20)).find((c) => isMixedShop(c));
    expect(found).toBeDefined();
    expect(wallHeight(found!)).toBeGreaterThanOrEqual(3 * FLOOR_PX);
    expect(kindOf(found!)).toBe("shop");
  });

  it("どの種類の区画でも、建物の形が作れる (例外なし・形がある)", () => {
    const kinds: [ZoneType, Density, number][] = [
      [ZoneType.Residential, 1, 1],
      [ZoneType.Residential, 2, 2],
      [ZoneType.Residential, 3, 3],
      [ZoneType.Residential, 4, 3],
      [ZoneType.Commercial, 1, 1],
      [ZoneType.Commercial, 2, 2],
      [ZoneType.Commercial, 3, 3],
      [ZoneType.Office, 1, 1],
      [ZoneType.Office, 2, 2],
      [ZoneType.Office, 2, 3],
      [ZoneType.Industrial, 1, 1],
      [ZoneType.Industrial, 2, 2],
      [ZoneType.Industrial, 2, 3],
    ];
    for (const [zone, density, tier] of kinds) {
      for (let i = 0; i < 300; i++) {
        const c = cell(zone, density, tier, 30 + i, 40 + i * 3, density >= 2 ? 2 : 1, density >= 2 ? 2 : 1);
        const parts: Parts = { solid: new GeoBuilder(), glass: new GeoBuilder(), lit: new GeoBuilder() };
        expect(() => addLot(parts, c)).not.toThrow();
        expect(parts.solid.build()).not.toBeNull();
      }
    }
  }, 60000);
});
