import { isBuildableTile } from "./roadPlacement";
import { REGION_SEEDS, tileAt } from "./terrain";

export interface MapPreset {
  id: string;
  name: string;
  description: string;
  seed: number;
}

/** 選べるマップ。同じシードからは、いつも同じ地形が作られる。 */
export const MAPS: readonly MapPreset[] = [
  { id: "lakeside", name: "湖畔の平野", description: "西に大きな湖、東に山。バランスのよい標準マップ。", seed: 12345 },
  { id: "plains", name: "大平原", description: "草地が広がる。水が少なく、街を広げやすい。", seed: 31337 },
  { id: "islands", name: "島と入り江", description: "水が多く、陸地が入り組む。給水は楽だが土地が限られる。", seed: 42 },
  { id: "valley", name: "山あいの谷", description: "山が多く、平地が限られる。計画的な街づくりが必要。", seed: 17 },
  { id: "forest", name: "深い森", description: "森が広がる。道路は通せるが、見通しは悪い。", seed: 2025 },
  { id: "japan", name: "日本", description: "山と森が多く、海に囲まれた起伏の大きい地形。平地は少ないが、街の密度を上げやすい。", seed: REGION_SEEDS.japan },
  { id: "uk", name: "イギリス", description: "なだらかな丘と草地。森が点在し、山は少ない。水は少なめで、広く街を作れる。", seed: REGION_SEEDS.uk },
  { id: "australia", name: "オーストラリア", description: "広く乾いた内陸。水と森が少なく、砂と草地が広がる。水辺に街を作る工夫が必要。", seed: REGION_SEEDS.australia },
  { id: "newzealand", name: "ニュージーランド", description: "海に囲まれた島々と、険しい山。陸地は細長く、水辺と山の間に街が広がる。", seed: REGION_SEEDS.newZealand },
];

/**
 * 好きな文字列からシード値を作る。数字だけならその数 (0〜4294967295)、それ以外の言葉は文字列から決まる値。
 * 空文字なら null。
 */
export function seedFromText(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  if (/^\d{1,10}$/.test(t)) return Number(t) % 4294967296;
  // 数字以外の言葉は FNV-1a でシード値にする (同じ言葉からは、いつも同じ地形になる)
  let h = 0x811c9dc5;
  for (const ch of t) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ランダムなシード値。 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

/** プリセットのマップなら、その名前を返す。そうでなければ「シード 〇〇」。 */
export function mapNameFor(seed: number): string {
  return MAPS.find((m) => m.seed === seed)?.name ?? `シード ${seed}`;
}

const START_W = 48;
const START_H = 28;

/**
 * 街づくりを始める場所 (タイル座標の中心)。原点から近い順に、全面が陸地 (水・山でない) の
 * 広い区画 (48×28 タイル) を探す。見つからなければ原点。
 */
export function findStart(seed: number): { x: number; y: number } {
  const fits = (cx: number, cy: number) => {
    for (let dy = -START_H / 2; dy <= START_H / 2; dy += 2) {
      for (let dx = -START_W / 2; dx <= START_W / 2; dx += 2) {
        if (!isBuildableTile(tileAt(seed, cx + dx, cy + dy))) return false;
      }
    }
    return true;
  };
  const step = 8;
  for (let ring = 0; ring <= 60; ring++) {
    const r = ring * step;
    for (let i = -ring; i <= ring; i++) {
      // 正方形の外周をたどる
      const candidates: [number, number][] =
        ring === 0
          ? [[0, 0]]
          : [[i * step, -r], [i * step, r], [-r, i * step], [r, i * step]];
      for (const [x, y] of candidates) if (fits(x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
