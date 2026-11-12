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

export const JAPAN_CITIES = [
  ["札幌", 141.35, 43.06], ["仙台", 140.87, 38.27], ["東京", 139.70, 35.70],
  ["名古屋", 136.91, 35.18], ["大阪", 135.50, 34.69], ["広島", 132.46, 34.40],
  ["福岡", 130.40, 33.59], ["那覇", 127.68, 26.21],
] as const;

/** 日本列島全体を表示する範囲。南西諸島から北海道までを含む。 */
export function japanPreviewBounds(): { x: number; y: number; span: number } {
  const origin = lonLatOfTile("japan", 0, 0)!;
  const tpd = tilesPerDegOf("japan");
  return { x: (134.75 - origin.lon) * tpd * Math.cos(origin.lat * Math.PI / 180), y: (origin.lat - 35) * tpd, span: 24 * tpd };
}

/** 日本列島全体の低解像度地形を描く。ゲーム中の全体図にも使う。 */
export function drawJapanOverview(canvas: HTMLCanvasElement, size = 640): void {
  drawMapPreview(canvas, REGION_SEEDS.japan, size);
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
    if (size >= 300) {
      const origin = lonLatOfTile("japan", 0, 0)!;
      const tpd = tilesPerDegOf("japan");
      ctx.font = `${Math.max(9, Math.round(size / 55))}px sans-serif`;
      ctx.textBaseline = "middle";
      for (const [name, lon, lat] of JAPAN_CITIES) {
        const tx = (lon - origin.lon) * tpd * Math.cos((lat * Math.PI) / 180);
        const ty = (origin.lat - lat) * tpd;
        const x = size / 2 + (tx - bounds.x) / tilesPerPx;
        const y = size / 2 + (ty - bounds.y) / tilesPerPx;
        ctx.fillStyle = "rgba(20,30,40,.9)";
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.strokeText(name, x + 5, y);
        ctx.fillStyle = "#fff"; ctx.fillText(name, x + 5, y);
      }
    }
  } else ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
}
