import { findStart } from "../sim/maps";
import { Tile, tileAt } from "../sim/terrain";

const COLORS: Record<number, [number, number, number]> = {
  [Tile.Water]: [47, 111, 179],
  [Tile.Sand]: [224, 207, 143],
  [Tile.Grass]: [106, 176, 76],
  [Tile.Forest]: [47, 125, 58],
  [Tile.Mountain]: [138, 141, 145],
};

/** プレビューが写す範囲 (一辺のタイル数)。 */
const SPAN = 256;

/**
 * マップの縮小図を canvas に描く。開始地点を中心に SPAN タイル四方を写し、開始地点の区画を白い枠で示す。
 */
export function drawMapPreview(canvas: HTMLCanvasElement, seed: number, size = 160): void {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const start = findStart(seed);
  const tilesPerPx = SPAN / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const t = tileAt(seed, Math.floor(start.x + (px - size / 2) * tilesPerPx), Math.floor(start.y + (py - size / 2) * tilesPerPx));
      const c = COLORS[t] ?? [255, 0, 255];
      const i = (py * size + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 開始地点 (48×28 タイル) の枠
  const w = 48 / tilesPerPx;
  const h = 28 / tilesPerPx;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(size / 2 - w / 2, size / 2 - h / 2, w, h);
}
