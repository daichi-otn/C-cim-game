/** 1 日の時刻 (0〜24 時) と、そのときの空の色合い・夜の度合い。描画ライブラリには依存しない。 */

export interface Lighting {
  /** 画面全体に重ねる色と濃さ (通常の重ね塗り)。昼は濃さ 0 (変化なし)。 */
  color: number;
  alpha: number;
  /** 夜の度合い (0 = 昼、1 = 真夜中)。窓やヘッドライトの明るさに使う。 */
  night: number;
}

interface Keyframe {
  hour: number;
  color: number;
  alpha: number;
  night: number;
}

/** 時刻ごとの空の色合い。間はなめらかにつなぐ。24 時は 0 時と同じ。 */
const KEYS: readonly Keyframe[] = [
  { hour: 0, color: 0x0a1538, alpha: 0.6, night: 1 },
  { hour: 5, color: 0x0e1a40, alpha: 0.56, night: 0.95 },
  { hour: 6.5, color: 0xff9a6a, alpha: 0.26, night: 0.5 },
  { hour: 8, color: 0xffd9b0, alpha: 0.08, night: 0.12 },
  { hour: 10, color: 0xffffff, alpha: 0, night: 0 },
  { hour: 15.5, color: 0xffffff, alpha: 0, night: 0 },
  { hour: 17.5, color: 0xffc78a, alpha: 0.1, night: 0.05 },
  { hour: 19, color: 0xff7a40, alpha: 0.28, night: 0.4 },
  { hour: 20.5, color: 0x2a2a6a, alpha: 0.48, night: 0.85 },
  { hour: 22, color: 0x0a1538, alpha: 0.6, night: 1 },
  { hour: 24, color: 0x0a1538, alpha: 0.6, night: 1 },
];

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
export function mixColor(a: number, b: number, t: number): number {
  return (
    (mixChannel((a >> 16) & 255, (b >> 16) & 255, t) << 16) |
    (mixChannel((a >> 8) & 255, (b >> 8) & 255, t) << 8) |
    mixChannel(a & 255, b & 255, t)
  );
}

/** 時刻 hour (0〜24。範囲外は 24 で折り返す) の色合いと夜の度合い。 */
export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (h >= a.hour && h <= b.hour) {
      const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
      const s = t * t * (3 - 2 * t);
      return { color: mixColor(a.color, b.color, s), alpha: a.alpha + (b.alpha - a.alpha) * s, night: a.night + (b.night - a.night) * s };
    }
  }
  return { color: 0xffffff, alpha: 0, night: 0 };
}

/** 昼夜の進め方。auto = 時間が流れる、day = 昼に固定、night = 夜に固定。 */
export type DayMode = "auto" | "day" | "night";
export const DAY_MODES: readonly DayMode[] = ["auto", "day", "night"];
export const DAY_MODE_NAMES: Record<DayMode, string> = { auto: "昼夜が移り変わる", day: "昼に固定", night: "夜に固定" };

/** 1 周 (24 時間分) にかける実時間 (秒)。 */
export const DAY_CYCLE_SEC = 150;
/** 新しい街を始めるときの時刻 (昼)。 */
export const START_HOUR = 10;

/** 昼夜の時計。時間を進め、いまの時刻と色合いを返す。 */
export class DayClock {
  hour = START_HOUR;
  mode: DayMode = "auto";

  /** dtSec 秒ぶん進める (auto のときだけ時刻が動く)。 */
  advance(dtSec: number): void {
    if (this.mode === "auto") this.hour = (this.hour + (dtSec / DAY_CYCLE_SEC) * 24) % 24;
  }
  setMode(mode: DayMode): void {
    this.mode = mode;
    if (mode === "day") this.hour = 12;
    else if (mode === "night") this.hour = 23;
  }
  /** 次のモードへ (auto → day → night → auto)。新しいモードを返す。 */
  cycleMode(): DayMode {
    const next = DAY_MODES[(DAY_MODES.indexOf(this.mode) + 1) % DAY_MODES.length]!;
    this.setMode(next);
    return next;
  }
  get lighting(): Lighting {
    return lightingAt(this.hour);
  }
}

/** 時刻を「午後 3:30」のような表示にする。 */
export function formatHour(hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
