/** 季節と天気の見た目 (色・濃さ・粒の量)。描画ライブラリには依存しない。 */
import { DAYS_PER_YEAR, type Weather } from "../sim/weather";
import { mixColor } from "./lighting";

/** 季節の中心の日 (春 45・夏 135・秋 225・冬 315) の間を、なめらかにつなぐ。 */
function seasonBlend(day: number): { i: number; j: number; t: number } {
  const doy = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const pos = ((doy - 45 + DAYS_PER_YEAR) % DAYS_PER_YEAR) / 90;
  const i = Math.floor(pos) % 4;
  const f = pos - Math.floor(pos);
  return { i, j: (i + 1) % 4, t: f * f * (3 - 2 * f) };
}

/** 画面全体にうっすら重ねる季節の色 (春 = 桜色、夏 = 日ざし、秋 = 夕焼けのような橙、冬 = 青白い)。 */
const SEASON_TINT = [
  { color: 0xffd6e8, alpha: 0.035 },
  { color: 0xffe08a, alpha: 0.07 },
  { color: 0xff8a2a, alpha: 0.1 },
  { color: 0xd8e6ff, alpha: 0.15 },
] as const;

export function seasonTint(day: number): { color: number; alpha: number } {
  const { i, j, t } = seasonBlend(day);
  const a = SEASON_TINT[i]!;
  const b = SEASON_TINT[j]!;
  return { color: mixColor(a.color, b.color, t), alpha: a.alpha + (b.alpha - a.alpha) * t };
}

/** 木々の葉の色 (2 色を半々に使う) と濃さ。春は花と新緑、夏は明るい緑、秋は紅葉、冬は雪。 */
const LEAF = [
  { c1: 0xf6b8d0, c2: 0x9be06a, alpha: 0.5 },
  { c1: 0x86d85e, c2: 0x5fb046, alpha: 0.28 },
  { c1: 0xe8892b, c2: 0xd9b33a, alpha: 0.62 },
  { c1: 0xffffff, c2: 0xe6eefc, alpha: 0.8 },
] as const;

export function leafLook(day: number): { c1: number; c2: number; alpha: number } {
  const { i, j, t } = seasonBlend(day);
  const a = LEAF[i]!;
  const b = LEAF[j]!;
  return { c1: mixColor(a.c1, b.c1, t), c2: mixColor(a.c2, b.c2, t), alpha: a.alpha + (b.alpha - a.alpha) * t };
}

/** 屋根の雪の積もり具合 (0〜1)。冬の初めに積もりはじめ、終わりに向かって溶ける。冬以外は 0。 */
export function snowCover(day: number): number {
  const doy = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (doy < 270) return 0;
  const up = Math.min(1, (doy - 270) / 14);
  const down = Math.min(1, (DAYS_PER_YEAR - 1 - doy) / 14);
  const t = Math.min(up, down);
  return t * t * (3 - 2 * t);
}

/** 天気ごとの、空の暗さ (重ねる色と濃さ)・雨粒の量・雪の量・風の強さ (木々の揺れと煙の流れに効く)。 */
export interface WeatherLook {
  overcast: { color: number; alpha: number };
  rain: number;
  snow: number;
  wind: number;
}

export const WEATHER_LOOK: Record<Weather, WeatherLook> = {
  clear: { overcast: { color: 0xffffff, alpha: 0 }, rain: 0, snow: 0, wind: 0.3 },
  cloudy: { overcast: { color: 0x7c8794, alpha: 0.1 }, rain: 0, snow: 0, wind: 0.5 },
  rain: { overcast: { color: 0x4c5a6e, alpha: 0.22 }, rain: 1, snow: 0, wind: 0.9 },
  snow: { overcast: { color: 0xc8d4e4, alpha: 0.14 }, rain: 0, snow: 1, wind: 0.5 },
};

/** 天気の見た目をなめらかに切り替えるための状態。target に向けて少しずつ近づく。 */
export class WeatherBlend {
  rain = 0;
  snow = 0;
  wind = WEATHER_LOOK.clear.wind;
  overcastColor = 0xffffff;
  overcastAlpha = 0;

  /** dtSec: 経過秒。1〜2 秒かけて切り替わる。 */
  update(weather: Weather, dtSec: number): void {
    const t = WEATHER_LOOK[weather];
    const k = Math.min(1, dtSec * 0.9);
    this.rain += (t.rain - this.rain) * k;
    this.snow += (t.snow - this.snow) * k;
    this.wind += (t.wind - this.wind) * k;
    this.overcastColor = this.overcastAlpha < 0.003 ? t.overcast.color : mixColor(this.overcastColor, t.overcast.color, k);
    this.overcastAlpha += (t.overcast.alpha - this.overcastAlpha) * k;
  }

  /** すぐ target の状態にする (読み込み直後など)。 */
  snap(weather: Weather): void {
    const t = WEATHER_LOOK[weather];
    this.rain = t.rain;
    this.snow = t.snow;
    this.wind = t.wind;
    this.overcastColor = t.overcast.color;
    this.overcastAlpha = t.overcast.alpha;
  }
}
