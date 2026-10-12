import { valueNoise } from "../sim/noise";
import { hash2 } from "../sim/rng";
import {
  CHUNK_SIZE,
  forestAt,
  heightAt,
  profileOf,
} from "../sim/terrain";


/** 標高・森ノイズを取る格子の範囲 (タイル座標 -2..CHUNK_SIZE+2)。 */
const GRID_MIN = -2;
const GRID_W = CHUNK_SIZE + 5;

type RGB = readonly [number, number, number];
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const PAL = {
  deep: rgb(0x14457c),
  shallow: rgb(0x4aa3c4),
  foam: rgb(0xe6f3f4),
  wetSand: rgb(0xb5a475),
  sand: rgb(0xe3d4a2),
  grass: rgb(0x6aaa44),
  grassDry: rgb(0x9aa84f),
  grassDark: rgb(0x4b8f3a),
  forestGround: rgb(0x2d6431),
  earth: rgb(0x7e7152),
  rock: rgb(0x8e887f),
  snow: rgb(0xf0f5f7),
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** ズーム倍率に応じた、1 タイルあたりのテクスチャ解像度。拡大するほど細かく、縮小するほど粗くして生成を軽くする。 */
export function resolutionFor(zoom: number): number {
  if (zoom >= 2) return 32;
  if (zoom >= 0.7) return 16;
  if (zoom >= 0.35) return 8;
  return 4;
}

// 画素を計算した結果の受け渡し用 (関数呼び出しのたびに配列を作らないため)
let pr = 0;
let pg = 0;
let pb = 0;
function setMix(a: RGB, b: RGB, t: number) {
  pr = lerp(a[0], b[0], t);
  pg = lerp(a[1], b[1], t);
  pb = lerp(a[2], b[2], t);
}
function mixIn(b: RGB, t: number) {
  pr = lerp(pr, b[0], t);
  pg = lerp(pg, b[1], t);
  pb = lerp(pb, b[2], t);
}

/**
 * チャンク 1 枚ぶんの地形の色を、標高をなめらかに補間して 1 枚の絵 (テクスチャ) に描く。木は 3D で別に立てるので、ここには描かない。
 * 1 タイルあたり res 画素。
 */
export function renderTerrainTexture(seed: number, cx: number, cy: number, res: number): HTMLCanvasElement {
  const P = profileOf(seed);
  const size = CHUNK_SIZE * res;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const px32 = new Uint32Array(img.data.buffer);

  // 標高 H・森ノイズ F・標高の勾配 GX/GY を、タイル中心を格子点として用意する
  const H = new Float32Array(GRID_W * GRID_W);
  const F = new Float32Array(GRID_W * GRID_W);
  const at = (i: number, j: number) => (j - GRID_MIN) * GRID_W + (i - GRID_MIN);
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  for (let j = GRID_MIN; j < GRID_MIN + GRID_W; j++) {
    for (let i = GRID_MIN; i < GRID_MIN + GRID_W; i++) {
      H[at(i, j)] = heightAt(seed, x0 + i, y0 + j);
      F[at(i, j)] = forestAt(seed, x0 + i, y0 + j);
    }
  }

  const noiseSeed = seed ^ 0x5bd1e995;
  const bil = (g: Float32Array, i0: number, j0: number, fx: number, fy: number) => {
    const a = g[at(i0, j0)]!;
    const b = g[at(i0 + 1, j0)]!;
    const c = g[at(i0, j0 + 1)]!;
    const d = g[at(i0 + 1, j0 + 1)]!;
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };

  for (let py = 0; py < size; py++) {
    const gv = py / res - 0.5;
    const j0 = Math.floor(gv);
    const fy = gv - j0;
    for (let ppx = 0; ppx < size; ppx++) {
      const gu = ppx / res - 0.5;
      const i0 = Math.floor(gu);
      const fx = gu - i0;
      const h = bil(H, i0, j0, fx, fy);
      const f = bil(F, i0, j0, fx, fy);
      const n = hash2(noiseSeed, cx * size + ppx, cy * size + py) - 0.5; // 画素ごとのざらつき
      const wx = x0 + ppx / res;
      const wy = y0 + py / res;
      // 中くらいの大きさのまだら (草むら・岩肌の濃淡)
      const mottle = valueNoise(noiseSeed, wx * 2.6, wy * 2.6) - 0.5;
      let grain = 0.05;

      if (h < P.water) {
        // 水: 深いほど濃く、岸の近くは浅く明るい。細かい波と、岸の白い波打ち際
        const depth = clamp01((P.water - h) / 0.2);
        setMix(PAL.shallow, PAL.deep, Math.pow(depth, 0.65));
        const ripple = Math.sin(wx * 7.1 + Math.sin(wy * 2.3) * 2) * Math.sin(wy * 6.3 - wx * 1.7);
        const k = 1 + ripple * 0.05;
        pr *= k; pg *= k; pb *= k;
        const foamBand = smoothstep(P.water - 0.012, P.water - 0.002, h);
        mixIn(PAL.foam, foamBand * (0.4 + 0.35 * (valueNoise(noiseSeed, wx * 3.1, wy * 3.1) - 0.2)));
        grain = 0.025;
      } else if (h < P.sand) {
        // 砂浜: 水際は湿って濃い色、内陸側は乾いて明るい。草地へはなめらかにつなぐ
        const t = (h - P.water) / (P.sand - P.water);
        setMix(PAL.wetSand, PAL.sand, smoothstep(0, 0.35, t));
        mixIn(PAL.grassDry, smoothstep(0.7, 1, t) * 0.8);
        grain = 0.07;
      } else {
        // 草地: 標高が高いほど乾いた色、森ノイズで濃淡
        const dry = smoothstep(0.5, 0.66, h);
        setMix(PAL.grass, PAL.grassDry, dry * 0.75);
        mixIn(PAL.grassDark, clamp01((f - 0.4) * 1.6) * 0.5);
        pr *= 1 + mottle * 0.16; pg *= 1 + mottle * 0.16; pb *= 1 + mottle * 0.16;
        // 森の地面
        const forest = smoothstep(P.forest - 0.04, P.forest + 0.04, f) * (1 - smoothstep(P.mountain - 0.03, P.mountain, h));
        mixIn(PAL.forestGround, forest);
        // 山: 土色 → 岩肌 → 雪
        const mt = smoothstep(P.mountain - 0.035, P.mountain + 0.01, h);
        if (mt > 0) {
          const rockT = smoothstep(P.mountain - 0.02, P.mountain + 0.06, h);
          const rockR = lerp(PAL.earth[0], PAL.rock[0], rockT);
          const rockG = lerp(PAL.earth[1], PAL.rock[1], rockT);
          const rockB = lerp(PAL.earth[2], PAL.rock[2], rockT);
          const strata = 1 + Math.sin(h * 260 + (wx + wy) * 0.35) * 0.04 + mottle * 0.22;
          pr = lerp(pr, rockR * strata, mt);
          pg = lerp(pg, rockG * strata, mt);
          pb = lerp(pb, rockB * strata, mt);
          mixIn(PAL.snow, smoothstep(0.77, 0.82, h));
          grain = 0.05 + 0.05 * mt;
        }
      }

      // 陰影は 3D の照明が付けるので、ここでは付けない (地面の起伏そのものが光を受ける)
      const k = 1 + n * grain;
      px32[py * size + ppx] =
        (255 << 24) |
        (Math.min(255, Math.max(0, pb * k)) << 16) |
        (Math.min(255, Math.max(0, pg * k)) << 8) |
        Math.min(255, Math.max(0, pr * k));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
