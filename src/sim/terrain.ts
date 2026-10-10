import { fbm } from "./noise";

export const CHUNK_SIZE = 32;

export const enum Tile {
  Water = 0,
  Sand = 1,
  Grass = 2,
  Forest = 3,
  Mountain = 4,
}

export interface Chunk {
  cx: number;
  cy: number;
  tiles: Uint8Array;
}

const SCALE = 0.02;

/** 地形の種類を分ける標高のしきい値と、森になる森ノイズのしきい値。描画側も同じ値で地形をなめらかに塗る。 */
export const WATER_LEVEL = 0.4;
export const SAND_LEVEL = 0.44;
export const MOUNTAIN_LEVEL = 0.68;
export const FOREST_LEVEL = 0.58;

/** タイル (tx,ty) の標高 (0..1)。 */
export function heightAt(seed: number, tx: number, ty: number): number {
  return fbm(seed, tx * SCALE, ty * SCALE, 5);
}

/** タイル (tx,ty) の森ノイズ (0..1)。高いほど森になりやすい。 */
export function forestAt(seed: number, tx: number, ty: number): number {
  return fbm(seed + 7919, tx * SCALE * 3, ty * SCALE * 3, 3);
}

export function tileAt(seed: number, tx: number, ty: number): Tile {
  const h = heightAt(seed, tx, ty);
  if (h < WATER_LEVEL) return Tile.Water;
  if (h < SAND_LEVEL) return Tile.Sand;
  if (h > MOUNTAIN_LEVEL) return Tile.Mountain;
  // 森は別ノイズで斑に分布させる
  return forestAt(seed, tx, ty) > FOREST_LEVEL ? Tile.Forest : Tile.Grass;
}

/** チャンク座標 (cx, cy) の地形を生成する。同じ seed なら常に同じ結果。 */
export function generateChunk(seed: number, cx: number, cy: number): Chunk {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      tiles[y * CHUNK_SIZE + x] = tileAt(seed, cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y);
    }
  }
  return { cx, cy, tiles };
}
