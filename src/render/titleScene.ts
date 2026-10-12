/**
 * タイトル画面の背景 (夕暮れの街並みのアニメーション)。純粋な描画で、街の計算には関わらない。
 * ビルの高さと明かりは、番号から決まる (同じ番号なら、いつも同じ街並み)。
 */

/** 0〜1 の、番号から決まる値 (いつも同じ)。 */
export function hash01(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 一列のビルの高さ (0〜1)。 */
export function skylineHeights(layer: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(0.35 + 0.6 * hash01(layer * 97 + i, 7));
  return out;
}

/** 窓が明るいか。時間で、ゆっくり点いたり消えたりする。 */
export function windowLit(layer: number, col: number, row: number, t: number): boolean {
  return hash01(layer * 31 + col, row * 17 + Math.floor(t / 2.5)) > 0.62;
}

const SKY_TOP = "#0b1020";
const SKY_MID = "#2b2350";
const SKY_LOW = "#e4775a";

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.55, SKY_MID);
  g.addColorStop(0.85, SKY_LOW);
  g.addColorStop(1, "#f2a06b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 太陽の光
  const sx = w * 0.74;
  const sy = h * 0.68;
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.45);
  sun.addColorStop(0, "rgba(255, 221, 150, 0.55)");
  sun.addColorStop(1, "rgba(255, 221, 150, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  for (let i = 0; i < 90; i++) {
    const x = hash01(i, 1) * w;
    const y = hash01(i, 2) * h * 0.5;
    const a = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.fillStyle = "rgba(255, 215, 190, 0.11)";
  for (let i = 0; i < 5; i++) {
    const speed = 6 + 10 * hash01(i, 3);
    const x = ((hash01(i, 4) * (w + 400) + t * speed) % (w + 400)) - 200;
    const y = h * (0.12 + 0.3 * hash01(i, 5));
    ctx.beginPath();
    ctx.ellipse(x, y, 140 + 80 * hash01(i, 6), 28 + 14 * hash01(i, 8), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 遠くから近くへ、3 列のビル。窓が、ゆっくり点滅する。 */
function drawSkyline(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const layers = [
    { color: "#3b3361", base: 0.62, count: 26, win: "rgba(255, 210, 130, 0.5)" },
    { color: "#221d3a", base: 0.76, count: 18, win: "rgba(255, 200, 120, 0.8)" },
    { color: "#120f20", base: 0.9, count: 12, win: "rgba(255, 190, 100, 0.95)" },
  ];
  layers.forEach((layer, li) => {
    const hs = skylineHeights(li, layer.count);
    const bw = w / layer.count;
    ctx.fillStyle = layer.color;
    hs.forEach((hh, i) => {
      const top = h * (layer.base - 0.5 * hh * 0.35);
      ctx.fillRect(i * bw, top, bw + 1, h - top);
    });
    ctx.fillStyle = layer.win;
    hs.forEach((hh, i) => {
      const top = h * (layer.base - 0.5 * hh * 0.35);
      const cols = Math.max(1, Math.floor(bw / 9));
      for (let r = 0; r * 9 < h - top - 10; r++) {
        for (let c = 0; c < cols; c++) {
          if (windowLit(li * 50 + i, c, r, t)) ctx.fillRect(i * bw + 3 + c * 9, top + 6 + r * 9, 3, 4);
        }
      }
    });
  });
}

/** 道路と、流れる車のライト。 */
function drawRoad(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const y0 = h * 0.9;
  ctx.fillStyle = "#15131f";
  ctx.fillRect(0, y0, w, h - y0);
  ctx.fillStyle = "rgba(255, 220, 150, 0.5)";
  for (let x = (-t * 60) % 40; x < w; x += 40) ctx.fillRect(x, y0 + (h - y0) * 0.5, 18, 2);
  for (let lane = 0; lane < 2; lane++) {
    const yl = y0 + (h - y0) * (0.25 + lane * 0.5);
    for (let i = 0; i < 9; i++) {
      const dir = lane === 0 ? 1 : -1;
      const x = (((hash01(lane * 9 + i, 11) * (w + 300) + t * (90 + 40 * hash01(i, lane))) * dir) % (w + 300) + w + 300) % (w + 300) - 150;
      ctx.fillStyle = dir > 0 ? "rgba(255, 245, 210, 0.9)" : "rgba(255, 70, 60, 0.9)";
      ctx.fillRect(x, yl, 6, 3);
      ctx.fillStyle = dir > 0 ? "rgba(255, 245, 210, 0.2)" : "rgba(255, 70, 60, 0.2)";
      ctx.fillRect(x - 10, yl - 1, 14, 5);
    }
  }
}

/** 背景の 1 枚を描く。t は秒 (時間の経過)。 */
export function drawTitleScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  drawSky(ctx, w, h);
  drawStars(ctx, w, h, t);
  drawClouds(ctx, w, h, t);
  drawSkyline(ctx, w, h, t);
  drawRoad(ctx, w, h, t);
  // 四隅を暗くして、文字を読みやすくする
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
