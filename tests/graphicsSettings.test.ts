import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPHICS, GRAPHICS_LEVEL_NAMES, GRAPHICS_VALUES, parseGraphics, type GraphicsKey } from "../src/render3d/graphicsSettings";

describe("グラフィック設定", () => {
  it("段階は 5 つ (無効・低・中・高・ウルトラ高)", () => {
    expect([...GRAPHICS_LEVEL_NAMES]).toEqual(["無効", "低", "中", "高", "ウルトラ高"]);
  });

  it("どの項目も 5 段階の値を持ち、段階が上がるほど重くなる (無効は一番軽い)", () => {
    for (const k of Object.keys(GRAPHICS_VALUES) as GraphicsKey[]) {
      const v = GRAPHICS_VALUES[k];
      expect(v).toHaveLength(5);
      for (let i = 1; i < 5; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]!);
    }
  });

  it("標準は「中」", () => {
    for (const k of Object.keys(DEFAULT_GRAPHICS) as GraphicsKey[]) expect(DEFAULT_GRAPHICS[k]).toBe(2);
  });

  it("保存された設定を読み、壊れた値や範囲外は標準に戻す", () => {
    expect(parseGraphics(null)).toEqual(DEFAULT_GRAPHICS);
    expect(parseGraphics("{not json")).toEqual(DEFAULT_GRAPHICS);
    const p = parseGraphics(JSON.stringify({ shadows: 0, trees: 9, cars: "x", weather: 4 }));
    expect(p.shadows).toBe(0);
    expect(p.trees).toBe(2);
    expect(p.cars).toBe(2);
    expect(p.weather).toBe(4);
  });
});
