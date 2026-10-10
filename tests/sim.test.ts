import { describe, expect, it } from "vitest";
import { createRng, hash2 } from "../src/sim/rng";
import { fbm, valueNoise } from "../src/sim/noise";
import { CHUNK_SIZE, Tile, generateChunk, tileAt } from "../src/sim/terrain";

describe("rng", () => {
  it("同じシードなら同じ列を返す", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
  it("0以上1未満", () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("hash2 は決定的で 0..1", () => {
    expect(hash2(1, 3, 4)).toBe(hash2(1, 3, 4));
    expect(hash2(1, 3, 4)).not.toBe(hash2(1, 4, 3));
    expect(hash2(1, -5, -9)).toBeGreaterThanOrEqual(0);
    expect(hash2(1, -5, -9)).toBeLessThan(1);
  });
});

describe("noise", () => {
  it("範囲が 0..1 に収まる", () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm(7, i * 0.37 - 80, i * 0.91 - 40);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("連続している (近い点は近い値)", () => {
    const a = valueNoise(3, 10.5, 10.5);
    const b = valueNoise(3, 10.501, 10.5);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe("terrain", () => {
  it("チャンクは CHUNK_SIZE^2 のタイルを持つ", () => {
    expect(generateChunk(1, 0, 0).tiles.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
  });
  it("同じシードなら同じ地形", () => {
    expect(generateChunk(5, 2, -3).tiles).toEqual(generateChunk(5, 2, -3).tiles);
  });
  it("シードが違えば地形も違う", () => {
    expect(generateChunk(5, 0, 0).tiles).not.toEqual(generateChunk(6, 0, 0).tiles);
  });
  it("チャンク境界でも tileAt と一致する (継ぎ目がない)", () => {
    const c = generateChunk(9, -1, 2);
    for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31], [15, 7]] as const) {
      expect(c.tiles[y * CHUNK_SIZE + x]).toBe(tileAt(9, -CHUNK_SIZE + x, 2 * CHUNK_SIZE + y));
    }
  });
  it("広い範囲で水・陸の両方が現れる", () => {
    const seen = new Set<number>();
    for (let cy = -3; cy <= 3; cy++)
      for (let cx = -3; cx <= 3; cx++) for (const t of generateChunk(11, cx, cy).tiles) seen.add(t);
    expect(seen.has(Tile.Water)).toBe(true);
    expect(seen.has(Tile.Grass)).toBe(true);
  });
});
