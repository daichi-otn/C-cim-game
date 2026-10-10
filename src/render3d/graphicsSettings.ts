/**
 * グラフィック設定 (純粋な計算): 項目ごとに 5 段階 (無効・低・中・高・ウルトラ高) の値を決める。
 * 中が標準。「無効」は、その項目を一番軽くする (影は消す、木や車は出さない、描画の細かさは最も粗い)。
 */
export const GRAPHICS_LEVEL_NAMES = ["無効", "低", "中", "高", "ウルトラ高"] as const;

export type GraphicsKey = "shadows" | "resolution" | "trees" | "cars" | "weather";

export const GRAPHICS_LABELS: Record<GraphicsKey, string> = {
  shadows: "影",
  resolution: "描画の細かさ",
  trees: "木の量",
  cars: "車の量",
  weather: "雨・雪の粒",
};

/** 項目ごとの段階の値 (0 = 無効 … 4 = ウルトラ高)。 */
export const GRAPHICS_VALUES: Record<GraphicsKey, readonly number[]> = {
  shadows: [0, 1024, 2048, 3072, 4096], // 影の解像度 (0 は影なし)
  resolution: [0.5, 0.75, 1, 1.5, 2], // 画面の画素に対する倍率
  trees: [0, 0.3, 0.6, 1, 1.5], // 木の密度の倍率
  cars: [0, 0.25, 0.5, 1, 1.5], // 車の台数の倍率
  weather: [0, 0.3, 0.6, 1, 1.5], // 雨・雪の粒の倍率
};

export type GraphicsLevels = Record<GraphicsKey, number>;

/** 標準は「中」(3 番目 = 2)。 */
export const DEFAULT_GRAPHICS: GraphicsLevels = { shadows: 2, resolution: 2, trees: 2, cars: 2, weather: 2 };

export const GRAPHICS_STORAGE_KEY = "ccim.graphics.v1";

/** 保存された設定を読む。壊れている・範囲外の値は標準にする。 */
export function parseGraphics(raw: string | null): GraphicsLevels {
  const out: GraphicsLevels = { ...DEFAULT_GRAPHICS };
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof data !== "object" || data === null) return out;
  const rec = data as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_GRAPHICS) as GraphicsKey[]) {
    const v = rec[k];
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4) out[k] = v as number;
  }
  return out;
}
