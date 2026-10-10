import { hash2 } from "./rng";

/** 季節。1 年 (360 日) を 90 日ずつに分ける。1 月から春。 */
export const enum Season {
  Spring = 0,
  Summer = 1,
  Autumn = 2,
  Winter = 3,
}
export const SEASONS: readonly Season[] = [Season.Spring, Season.Summer, Season.Autumn, Season.Winter];
export const SEASON_NAMES: Record<Season, string> = { [Season.Spring]: "春", [Season.Summer]: "夏", [Season.Autumn]: "秋", [Season.Winter]: "冬" };
export const DAYS_PER_SEASON = 90;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;

/** 天気。同じ天気が続く日数 (WEATHER_BLOCK_DAYS) ごとに、種子と日から決まる。保存しなくても、日から求め直せる。 */
export type Weather = "clear" | "cloudy" | "rain" | "snow";
export const WEATHERS: readonly Weather[] = ["clear", "cloudy", "rain", "snow"];
export const WEATHER_NAMES: Record<Weather, string> = { clear: "晴れ", cloudy: "くもり", rain: "雨", snow: "雪" };
export const WEATHER_BLOCK_DAYS = 12;

export function seasonOf(day: number): Season {
  return (Math.floor((((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR) / DAYS_PER_SEASON) % 4) as Season;
}

/** 季節ごとの、天気の出やすさ [晴れ, くもり, 雨, 雪] (合計 1)。雪は冬だけ。 */
const WEATHER_ODDS: Record<Season, readonly [number, number, number, number]> = {
  [Season.Spring]: [0.45, 0.25, 0.3, 0],
  [Season.Summer]: [0.55, 0.2, 0.25, 0],
  [Season.Autumn]: [0.4, 0.3, 0.3, 0],
  [Season.Winter]: [0.35, 0.25, 0.1, 0.3],
};

export function weatherOn(seed: number, day: number): Weather {
  const block = Math.floor(day / WEATHER_BLOCK_DAYS);
  const r = hash2(seed ^ 0x3a17, block, 7);
  const odds = WEATHER_ODDS[seasonOf(block * WEATHER_BLOCK_DAYS)];
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    acc += odds[i]!;
    if (r < acc) return WEATHERS[i]!;
  }
  return "clear";
}

/** 天気による、道路の容量の倍率 (雨・雪で車がゆっくり走るので、1 日にさばける台数が減る)。 */
export const ROAD_CAPACITY_MULT: Record<Weather, number> = { clear: 1, cloudy: 1, rain: 0.9, snow: 0.75 };
/** 天気による、大気汚染の倍率 (雨が汚れを洗い流す)。 */
export const AIR_POLLUTION_MULT: Record<Weather, number> = { clear: 1, cloudy: 1, rain: 0.6, snow: 1 };
/** 季節による、電力の使用量の倍率 (夏の冷房・冬の暖房)。 */
export const POWER_USE_MULT: Record<Season, number> = { [Season.Spring]: 1, [Season.Summer]: 1.1, [Season.Autumn]: 1, [Season.Winter]: 1.2 };
/** 風力発電所の発電量の倍率 (風の強い日ほど多い。雨の日は風が強い)。 */
export const WIND_OUTPUT_MULT: Record<Weather, number> = { clear: 0.8, cloudy: 1, rain: 1.3, snow: 1 };
/** 太陽光発電所の発電量の倍率 (天気と季節。夜は考えず、1 日の平均)。 */
export const SOLAR_WEATHER_MULT: Record<Weather, number> = { clear: 1, cloudy: 0.5, rain: 0.25, snow: 0.2 };
export const SOLAR_SEASON_MULT: Record<Season, number> = { [Season.Spring]: 1, [Season.Summer]: 1.2, [Season.Autumn]: 0.9, [Season.Winter]: 0.6 };

/** 季節による、需要の補正 (住宅・商業・工業・オフィス)。 */
export const SEASON_DEMAND: Record<Season, { r: number; c: number; i: number; o: number }> = {
  [Season.Spring]: { r: 0.03, c: 0, i: 0, o: 0 },
  [Season.Summer]: { r: 0, c: 0.05, i: 0, o: -0.03 },
  [Season.Autumn]: { r: 0, c: 0, i: 0.03, o: 0.03 },
  [Season.Winter]: { r: -0.05, c: 0.05, i: -0.03, o: 0 },
};
/** 季節による、税収の倍率 (商業は夏と年末の買い物、工業は冬に鈍る)。 */
export const SEASON_TAX_MULT: Record<Season, { commercial: number; industrial: number }> = {
  [Season.Spring]: { commercial: 1, industrial: 1 },
  [Season.Summer]: { commercial: 1.1, industrial: 1 },
  [Season.Autumn]: { commercial: 1, industrial: 1 },
  [Season.Winter]: { commercial: 1.15, industrial: 0.9 },
};
