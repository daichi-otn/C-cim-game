import { describe, expect, it } from "vitest";
import { japanPreviewBounds } from "../src/render/mapPreview";
import { lonLatOfTile, tilesPerDegOf } from "../src/sim/coast";
import { REGION_SEEDS, Tile, tileAt } from "../src/sim/terrain";

describe("日本マップの全体図", () => {
  it("北海道・本州・四国・九州・沖縄と開始地点が表示範囲に入る", () => {
    const origin = lonLatOfTile("japan", 0, 0)!;
    const tpd = tilesPerDegOf("japan");
    const b = japanPreviewBounds();
    for (const [lon, lat] of [[142.0, 43.0], [138.0, 36.0], [133.5, 33.8], [131.0, 32.8], [127.7, 26.2], [139.7, 35.7]]) {
      const x = (lon! - origin.lon) * tpd * Math.cos(origin.lat * Math.PI / 180);
      const y = (origin.lat - lat!) * tpd;
      expect(Math.abs(x - b.x)).toBeLessThan(b.span / 2);
      expect(Math.abs(y - b.y)).toBeLessThan(b.span / 2);
      expect(tileAt(REGION_SEEDS.japan, x, y)).not.toBe(Tile.Water);
    }
  });
});
