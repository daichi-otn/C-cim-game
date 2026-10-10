import { RoadGraph, isAccessEdge } from "./roadGraph";
import { isBuildableTile } from "./roadPlacement";
import { Tile, tileAt } from "./terrain";
import { SOLAR_SEASON_MULT, SOLAR_WEATHER_MULT, WIND_OUTPUT_MULT, type Season, type Weather } from "./weather";
import {
  type Density,
  capacityOf,
  ROAD_CLEARANCE,
  ZONE_REACH,
  ZoneType,
} from "./zoning";

export const enum FacilityType {
  Power = 1,
  Water = 2,
  Sewage = 3,
  /** 外部接続 (高速道路の出入口)。外の世界から住民が引っ越してくる入口。供給はしない。 */
  Outside = 4,
  /** 公共サービス施設。まわりの建物 (radius タイル以内) にサービスを届ける。 */
  Police = 5,
  Fire = 6,
  Hospital = 7,
  /** 小学校 (昔の「学校」)。保存データの 8 はこれ。 */
  School = 8,
  MiddleSchool = 9,
  HighSchool = 10,
  University = 11,
  /** 公園・防音壁。まわりの住宅の大気汚染・騒音を減らす (環境対策)。 */
  Park = 12,
  NoiseBarrier = 13,
  /** ごみ処理場。道路網ごとにごみを処理する (供給型)。悪臭とわずかな大気汚染を出す。 */
  Garbage = 14,
  /** 風力・太陽光発電所。電力を供給するが、発電量が天気 (と季節) で変わる。大気汚染は出さない。 */
  Wind = 15,
  Solar = 16,
}

/** 保存データで認める施設の種類の番号の範囲。 */
export const FACILITY_TYPE_MAX = 16;

/** 電力・水道・下水の 3 種類のサービス。 */
export type Service = "power" | "water" | "sewage";
export const SERVICES: readonly Service[] = ["power", "water", "sewage"];

/** 公共サービス (警察・消防・医療・教育)。施設から一定の距離までの建物に届く。 */
export type Coverage = "police" | "fire" | "health" | "education";
export const COVERAGES: readonly Coverage[] = ["police", "fire", "health", "education"];
export const COVERAGE_NAMES: Record<Coverage, string> = { police: "治安", fire: "消防", health: "医療", education: "教育" };

/** 昔の施設の大きさ (一辺のタイル数)。保存データに大きさがない施設は、この大きさ。今は種類ごとに FacilitySpec.size で決まる。 */
export const FACILITY_SIZE = 2;

export interface FacilitySpec {
  name: string;
  /** 供給するサービス。外部接続は供給せず null。 */
  service: Service | null;
  /** 建設費。 */
  cost: number;
  /** 一辺のタイル数 (正方形)。病院・発電所・大学などの大きな施設ほど広い敷地を使う。 */
  size: number;
  /** 毎月の維持費。 */
  upkeep: number;
  /** 供給できる量。建物の使用量 (buildingLoad) の合計がこれを超えると足りなくなる。 */
  capacity: number;
  /** 届ける公共サービス。電力・水道・下水・外部接続は null。 */
  coverage: Coverage | null;
  /** 公共サービスが届く距離 (タイル)。施設の中心から建物の中心まで。環境対策の施設は、効果が届く距離。 */
  radius: number;
  /** 環境対策 (公園・防音壁): 施設のすぐそばで、まわりの住宅の大気汚染・騒音を減らす割合 (0〜1)。遠いほど弱まり、radius で 0 になる。 */
  relief?: { air: number; noise: number };
  /** ごみ処理場: 1 日に処理できるごみの量 (建物のごみの量 wasteOf と同じ単位)。省略は 0。 */
  waste?: number;
  /** 発電量が天気で変わる施設の種類 (風力・太陽光)。省略は一定 (capacity のまま)。 */
  output?: "wind" | "solar";
  /** 届いている建物の割合に応じて、オフィスの需要を上げる量 (高校・大学。高い教育を受けた働き手が集まる)。省略は 0。 */
  officeBoost?: number;
}

export const FACILITY_SPECS: Record<FacilityType, FacilitySpec> = {
  [FacilityType.Power]: { name: "発電所", service: "power", cost: 30_000_000, upkeep: 250_000, capacity: 300, size: 3, coverage: null, radius: 0 },
  [FacilityType.Water]: { name: "給水ポンプ場", service: "water", cost: 18_000_000, upkeep: 150_000, capacity: 300, size: 2, coverage: null, radius: 0 },
  [FacilityType.Sewage]: { name: "下水処理場", service: "sewage", cost: 24_000_000, upkeep: 200_000, capacity: 300, size: 3, coverage: null, radius: 0 },
  [FacilityType.Outside]: { name: "外部接続", service: null, cost: 15_000_000, upkeep: 100_000, capacity: 0, size: 2, coverage: null, radius: 0 },
  [FacilityType.Police]: { name: "警察署", service: null, cost: 20_000_000, upkeep: 180_000, capacity: 0, size: 2, coverage: "police", radius: 12 },
  [FacilityType.Fire]: { name: "消防署", service: null, cost: 22_000_000, upkeep: 200_000, capacity: 0, size: 2, coverage: "fire", radius: 14 },
  [FacilityType.Hospital]: { name: "病院", service: null, cost: 40_000_000, upkeep: 400_000, capacity: 0, size: 3, coverage: "health", radius: 18 },
  [FacilityType.School]: { name: "小学校", service: null, cost: 25_000_000, upkeep: 220_000, capacity: 0, size: 2, coverage: "education", radius: 14 },
  [FacilityType.MiddleSchool]: { name: "中学校", service: null, cost: 30_000_000, upkeep: 270_000, capacity: 0, size: 3, coverage: "education", radius: 16 },
  [FacilityType.HighSchool]: { name: "高校", service: null, cost: 36_000_000, upkeep: 330_000, capacity: 0, size: 3, coverage: "education", radius: 18, officeBoost: 0.1 },
  [FacilityType.Park]: { name: "公園", service: null, cost: 8_000_000, upkeep: 60_000, capacity: 0, size: 3, coverage: null, radius: 8, relief: { air: 0.4, noise: 0.3 } },
  [FacilityType.NoiseBarrier]: { name: "防音壁", service: null, cost: 6_000_000, upkeep: 40_000, capacity: 0, size: 2, coverage: null, radius: 6, relief: { air: 0, noise: 0.65 } },
  [FacilityType.Garbage]: { name: "ごみ処理場", service: null, cost: 28_000_000, upkeep: 220_000, capacity: 0, size: 3, coverage: null, radius: 0, waste: 300 },
  [FacilityType.Wind]: { name: "風力発電所", service: "power", cost: 14_000_000, upkeep: 70_000, capacity: 120, size: 3, coverage: null, radius: 0, output: "wind" },
  [FacilityType.Solar]: { name: "太陽光発電所", service: "power", cost: 18_000_000, upkeep: 40_000, capacity: 100, size: 3, coverage: null, radius: 0, output: "solar" },
  [FacilityType.University]: { name: "大学", service: null, cost: 60_000_000, upkeep: 600_000, capacity: 0, size: 4, coverage: "education", radius: 26, officeBoost: 0.2 },
};

/** 施設 spec の、いまの季節・天気での供給量。風力・太陽光は天気などで変わり、ほかは capacity のまま。 */
export function capacityNow(spec: FacilitySpec, season: Season, weather: Weather): number {
  if (spec.output === "wind") return spec.capacity * WIND_OUTPUT_MULT[weather];
  if (spec.output === "solar") return spec.capacity * SOLAR_WEATHER_MULT[weather] * SOLAR_SEASON_MULT[season];
  return spec.capacity;
}

export const SERVICE_NAMES: Record<Service, string> = { power: "電力", water: "水道", sewage: "下水" };

export interface Facility {
  id: number;
  type: FacilityType;
  /** 一辺のタイル数。建てたときの種類の大きさ。昔のセーブデータの施設は FACILITY_SIZE (2)。 */
  size: number;
  /** 左上のタイル座標。 */
  x: number;
  y: number;
}

/** 施設が占めるタイル (左上 (x,y)、一辺 size)。 */
export function footprint(x: number, y: number, size = FACILITY_SIZE): { x: number; y: number }[] {
  const tiles = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push({ x: x + dx, y: y + dy });
  return tiles;
}

/** 施設の中心 (タイルの座標。タイルの角が整数)。 */
export function facilityCenter(f: { x: number; y: number; size: number }): { x: number; y: number } {
  return { x: f.x + f.size / 2, y: f.y + f.size / 2 };
}

/**
 * 建物 1 棟が使うサービスの量。人数 (住宅は定員、それ以外は雇用数) に比例する。
 * 電力は、工業が 2 倍、オフィスが 1.5 倍 (空調や機器)。
 */
export function buildingLoad(zone: ZoneType, variant: number, density: Density = 0): Record<Service, number> {
  const people = capacityOf(zone, variant, density);
  const power = zone === ZoneType.Industrial ? 2 : zone === ZoneType.Office ? 1.5 : 1;
  return { power: people * power, water: people, sewage: people };
}

/** 建物 1 棟が 1 日に出すごみの量。人数 (住宅は定員、それ以外は雇用数) に、種類ごとの係数をかける。 */
const WASTE_PER_PERSON: Record<ZoneType, number> = {
  [ZoneType.None]: 0,
  [ZoneType.Residential]: 0.5,
  [ZoneType.Commercial]: 0.6,
  [ZoneType.Industrial]: 1,
  [ZoneType.Office]: 0.3,
};
export function wasteOf(zone: ZoneType, variant: number, density: Density = 0): number {
  return capacityOf(zone, variant, density) * WASTE_PER_PERSON[zone];
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

/** 施設を (x,y) を左上にして建てられるか。建てられないなら理由を返す。ゾーンの上は建てられる (ゾーンは消える)。 */
export function checkFacilityPlacement(
  seed: number,
  graph: RoadGraph,
  others: Iterable<Facility>,
  type: FacilityType,
  x: number,
  y: number,
): PlaceCheck {
  const size = FACILITY_SPECS[type].size;
  const tiles = footprint(x, y, size);
  if (!tiles.every((t) => isBuildableTile(tileAt(seed, t.x, t.y)))) return { ok: false, reason: "水や山の上には建てられません" };
  for (const o of others) {
    if (o.x < x + size && x < o.x + o.size && o.y < y + size && y < o.y + o.size) return { ok: false, reason: "ほかの施設と重なっています" };
  }
  const dists = tiles.map((t) => graph.distanceToRoad(t.x + 0.5, t.y + 0.5, ZONE_REACH));
  const reach = tiles.map((t) => graph.distanceToRoad(t.x + 0.5, t.y + 0.5, ZONE_REACH, isAccessEdge));
  if (dists.some((d) => d < ROAD_CLEARANCE)) return { ok: false, reason: "道路の上には建てられません" };
  if (reach.every((d) => d === Infinity)) return { ok: false, reason: "道路から遠すぎます (3 タイル以内)" };
  if (type === FacilityType.Water) {
    let nearWater = false;
    for (let ty = y - 1; ty <= y + size && !nearWater; ty++)
      for (let tx = x - 1; tx <= x + size && !nearWater; tx++) nearWater = tileAt(seed, tx, ty) === Tile.Water;
    if (!nearWater) return { ok: false, reason: "水辺に面していません" };
  }
  return { ok: true };
}
