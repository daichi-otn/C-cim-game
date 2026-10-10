/**
 * 建物が建つときの動き (純粋な計算。描画ライブラリには依存しない)。
 * 2 つの建て方がある:
 * - 手で作る (低い建物。一軒家など): 壁を、段ごとに積み上げる。作業員が、壁のまわりを歩いて、トンカチを打つ。
 * - クレーン (中・高い建物): 塔のクレーンが、資材を置き場から運んで、建物の上に下ろす。腕は往復する。
 * どちらも、基礎を掘ってから建物が地面から上へ現れ、完成すると本物の建物に切り替わる。
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 建て方。低い建物は手で作り、それより高い建物はクレーンで作る。 */
export type BuildStyle = "hand" | "crane";
/** 手で作るのは、この階数までの建物。 */
export const HAND_MAX_FLOORS = 2;

export function buildStyleOf(floors: number): BuildStyle {
  return floors <= HAND_MAX_FLOORS ? "hand" : "crane";
}

/** 基礎を掘る割合の終わり (進み具合の割合)。 */
const FOUNDATION_END = 0.15;
/** クレーンの塔が立つ割合の終わり。 */
const CRANE_END = 0.2;
/** クレーンの 1 回の往復の数 (建設の間に、資材を何回運ぶか)。 */
const LOADS = 6;

/** 進み具合 p での、建っている途中の姿。 */
export interface ConstructionPose {
  /** 基礎を掘って固める (0 → 1)。 */
  foundation: number;
  /** 建物が見えている高さの割合 (0 → 1)。手で作るときは段の高さで止まりながら上がる。 */
  reveal: number;
}

/** 基礎と、建物の見える高さ。 */
export function basePose(p: number, style: BuildStyle, H: number): ConstructionPose {
  const x = clamp01(p);
  const raw = clamp01((x - FOUNDATION_END) / (1 - FOUNDATION_END));
  const courses = Math.max(3, Math.round(H / 2.4));
  return {
    foundation: clamp01(x / FOUNDATION_END),
    // 手で作るときは、段ごとに止まりながら上がる (積んでいく感じ)
    reveal: style === "hand" ? Math.floor(raw * courses + 1e-9) / courses : raw,
  };
}

/** クレーンの動き (塔・腕・荷)。 */
export interface CranePose {
  /** 塔が立つ割合。 */
  tower: number;
  /** 腕の向き: 0 = 置き場、1 = 建物の上。 */
  slew: number;
  /** 荷を上げている割合: 0 = 地面、1 = 建物の上の空中。 */
  hook: number;
  /** 荷を持っているか。 */
  loaded: boolean;
}

export function cranePose(p: number): CranePose {
  const x = clamp01(p);
  // 1 回の往復を、位相 (0〜1) で表す: 0〜0.2 は荷を地面から上げる、0.2〜0.5 は建物の上へ回す、0.5〜0.7 は下ろす、0.7〜1 は空で戻る
  const phase = (x * LOADS) % 1;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const seg = (a: number, b: number) => ease(clamp01((phase - a) / (b - a)));
  const up = seg(0, 0.2);
  const turn = seg(0.2, 0.5);
  const down = seg(0.5, 0.7);
  const back = seg(0.7, 1);
  const hook = up - down;
  const slew = turn - back;
  return {
    tower: clamp01(x / CRANE_END),
    slew: Math.min(1, Math.max(0, slew)),
    hook: Math.min(1, Math.max(0, hook)),
    loaded: phase >= 0.05 && phase < 0.7,
  };
}

/** 作業員 1 人の動き (足元の位置は、建物の敷地の中の割合 0〜1)。age は建ち始めてからの秒。 */
export interface WorkerPose {
  u: number;
  v: number;
  /** トンカチを打つときの上下 (0〜1)。 */
  hammer: number;
  /** 歩いているか (脚を振る)。 */
  walk: number;
}

export function workerPose(age: number, index: number): WorkerPose {
  const phase = index * 0.5;
  // 壁の前を行ったり来たりしながら、ときどき止まって打つ
  const cycle = (age * 0.5 + phase) % 2;
  const walking = cycle < 1.2;
  const t = walking ? cycle / 1.2 : 1;
  const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
  const u = 0.15 + 0.7 * (index === 0 ? tri : 1 - tri);
  const v = index === 0 ? 1.12 : 1.12 + 0.12 * Math.sin(age * 0.4);
  return {
    u,
    v,
    hammer: walking ? 0 : Math.abs(Math.sin(age * 14)),
    walk: walking ? Math.abs(Math.sin(age * 9)) : 0,
  };
}

/** 建てるのにかかる時間 (秒。大きい建物ほど長い。3〜9 秒)。 */
export function constructionSeconds(floors: number): number {
  return Math.min(9, Math.max(3, 3 + 0.3 * floors));
}

/**
 * 前回の建物 (アンカー → 建った日) と、いまの建物を比べて、建て始める場所と、やめる場所を決める。
 * 建った日が変わった場所 (建て替え) は、いったん止めてから建て直す。
 */
export function planSites(seen: ReadonlyMap<string, number>, now: ReadonlyMap<string, number>): { start: string[]; stop: string[] } {
  const start: string[] = [];
  const stop: string[] = [];
  for (const [k, built] of now) if (seen.get(k) !== built) start.push(k);
  for (const [k, built] of seen) if (now.get(k) !== built) stop.push(k);
  return { start, stop };
}
