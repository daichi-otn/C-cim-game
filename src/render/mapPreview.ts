import { findStart } from "../sim/maps";
import { Tile, tileAt, REGION_SEEDS } from "../sim/terrain";
import { lonLatOfTile, tilesPerDegOf } from "../sim/coast";

const COLORS: Record<number, [number, number, number]> = {
  [Tile.Water]: [47, 111, 179],
  [Tile.Sand]: [224, 207, 143],
  [Tile.Grass]: [106, 176, 76],
  [Tile.Forest]: [47, 125, 58],
  [Tile.Mountain]: [138, 141, 145],
};

/** プレビューが写す範囲 (一辺のタイル数)。 */
const SPAN = 256;

/** 日本列島全体を表示する範囲。南西諸島から北海道までを含む。 */
export function japanPreviewBounds(): { x: number; y: number; span: number } {
  const origin = lonLatOfTile("japan", 0, 0)!;
  const tpd = tilesPerDegOf("japan");
  return { x: (134.75 - origin.lon) * tpd * Math.cos(origin.lat * Math.PI / 180), y: (origin.lat - 35) * tpd, span: 24 * tpd };
}

/**
 * マップの縮小図を canvas に描く。開始地点を中心に SPAN タイル四方を写し、開始地点の区画を白い枠で示す。
 */
export function drawMapPreview(canvas: HTMLCanvasElement, seed: number, size = 160): void {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const start = findStart(seed);
  const bounds = seed === REGION_SEEDS.japan ? japanPreviewBounds() : { ...start, span: SPAN };
  const tilesPerPx = bounds.span / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const t = tileAt(seed, Math.floor(bounds.x + (px - size / 2) * tilesPerPx), Math.floor(bounds.y + (py - size / 2) * tilesPerPx));
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
  const sx = size / 2 + (start.x - bounds.x) / tilesPerPx;
  const sy = size / 2 + (start.y - bounds.y) / tilesPerPx;
  if (seed === REGION_SEEDS.japan) {
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffdc70";
    ctx.fill();
    ctx.strokeStyle = "#20242a";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
}
