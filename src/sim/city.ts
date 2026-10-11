import { DEFAULT_TAX_RATE, NEUTRAL_HAPPINESS, calcDemand, type Demand } from "./demand";
import { densityDemand } from "./densityDemand";
import {
  COVERAGES,
  FACILITY_SIZE,
  FACILITY_SPECS,
  FACILITY_TYPE_MAX,
  facilityCenter,
  FacilityType as FacilityKind,
  SERVICES,
  SERVICE_NAMES,
  buildingLoad,
  capacityNow,
  wasteOf,
  checkFacilityPlacement,
  footprint,
  type Facility,
  type Coverage,
  type FacilityType,
  type PlaceCheck,
  type Service,
} from "./facilities";
import { createStatefulRng, type StatefulRng } from "./rng";
import { RoadGraph, isAccessEdge, type RoadChange, type RoadGraphData } from "./roadGraph";
import { DEFAULT_LANE_COUNT, DEFAULT_ROAD_TYPE, laneCountMult, ROAD_SPECS, type RoadType } from "./roadTypes";
import { costMultOf, planPath } from "./structures";
import { GARBAGE_GRACE, MOVE_OUT_SICK_RATE, calcEnvironment, emptyHealth, garbagePenaltyOf, sickRateOf, type HealthStats } from "./environment";
import { calcTraffic, emptyTraffic, trafficDemandPenalty, type TrafficResult } from "./traffic";
import {
  AIR_POLLUTION_MULT,
  POWER_USE_MULT,
  ROAD_CAPACITY_MULT,
  SEASON_DEMAND,
  SEASON_TAX_MULT,
  seasonOf,
  weatherOn,
  type Season,
  type Weather,
} from "./weather";
import { AMENITY_REACH, LAND_TAX_BONUS, landValueOf } from "./landValue";
import { agingFactor, isOldEnough, REBUILD_CHANCE } from "./aging";
import { DISTRICT_COLORS, DISTRICT_MAX_COUNT, DISTRICT_MAX_SIZE, DISTRICT_MIN_SIZE, densityAllowed, districtAt, districtRect, type Allowed, type District, type Greenery } from "./district";
import { ROAD_CLEARANCE, ZONE_REACH, ZoneMap, ZoneType, DENSITY_MIN_ROAD_CAPACITY, capacityOf, cellCapacity, cleanEnv, lotArea, lotCenter, type CityTotals, type Density, type ZoneCell } from "./zoning";

/** 建物の一辺の最大タイル数 (保存データの検査用)。 */
const MAX_LOT_SIDE = 6;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const START_MONEY = 300_000_000;
/** 道路 1 タイル (約 10m の区間) あたりの建設費と、毎月の維持費 (円)。 */
export const ROAD_COST_PER_TILE = 600_000;
export const ROAD_UPKEEP_PER_TILE = 5_000;
/** 標準の税率のときの、毎月の税収 (円。住民 1 人・商業の雇用 1 つ・工業の雇用 1 つあたり)。 */
export const TAX_PER_RESIDENT = 8_000;
export const TAX_PER_COMMERCIAL_JOB = 15_000;
export const TAX_PER_INDUSTRIAL_JOB = 15_000;
export const MIN_TAX_RATE = 0;
export const MAX_TAX_RATE = 0.2;
/** 住宅の環境のリスクの平均が 1 のとき、幸福度が下がる量。 */
const HEALTH_HAPPINESS_PENALTY = 0.4;
/** 需要 1.0 のときに、空きゾーン 1 つに 1 日で建物が建つ確率。需要が低いほど比例して下がる。 */
export const GROW_BASE_CHANCE = 0.5;
/** 1 日に建つ建物の最大数。 */
export const GROW_MAX_SPAWN = 6;
/** 使用量が供給量のこの割合を超えたら「不足気味」と知らせる。 */
const LOW_SPARE_RATIO = 0.9;

/** 毎月の税収。税率が標準のときの額に、税率の比をかける。season を渡すと、季節による商業・工業の増減が入る。 */
export function monthlyTax(t: CityTotals, taxRate: number, season?: Season): number {
  const m = season === undefined ? { commercial: 1, industrial: 1 } : SEASON_TAX_MULT[season];
  const base = (t.population - (t.sick ?? 0)) * TAX_PER_RESIDENT + t.jobsC * TAX_PER_COMMERCIAL_JOB * m.commercial + t.jobsI * TAX_PER_INDUSTRIAL_JOB * m.industrial;
  return Math.round((base * taxRate) / DEFAULT_TAX_RATE);
}

/** 道路の見積もり。ok が false なら敷けない (reason が理由)。 */
export interface RoadQuote {
  ok: boolean;
  reason?: string;
  cost: number;
  /** 新しく敷く・種類や向きが変わる区間の数。 */
  sections: number;
  /** 橋とトンネルの長さ (タイル)。 */
  bridge: number;
  tunnel: number;
}

export interface MonthReport {
  income: number;
  expense: number;
}

/** 街の保存用データ。 */
export interface CityData {
  seed: number;
  day: number;
  money: number;
  taxRate: number;
  lastMonth: MonthReport;
  /** 建物が建つ判定に使う乱数の状態。 */
  rngState: number;
  nextFacilityId: number;
  graph: RoadGraphData;
  /** [x, y, ゾーンの種類, 建物の種類 (0 = 空き地), 住民数, 密度 (0 = 決めない), 建物の幅, 建物の高さ]。幅と高さは省略可能 (昔のデータは 1×1。複数マスの建物は左上のタイルだけが持ち、残りは空き地として保存する) */
  zones: [number, number, number, number, number, number?, number?, number?, number?][];
  /** size は省略可能 (昔のデータは 2×2)。 */
  facilities: { id: number; type: number; x: number; y: number; size?: number }[];
  /** 地区。省略可能 (昔のデータは地区なし)。 */
  districts?: { id: number; name: string; color: number; x0: number; y0: number; x1: number; y1: number; taxRate?: number; allowed: boolean[]; wallet: number; greenery?: number }[];
}

export interface GameDate {
  year: number;
  month: number;
  day: number;
}

/** サービスごとの、街全体の供給量と使用量。 */
export type Utilities = Record<Service, { supply: number; used: number }>;

/** ごみの状態 (街全体の合計)。供給は、道路でつながったごみ処理場だけの処理量。 */
export interface GarbageStats {
  /** 処理できる量。 */
  supply: number;
  /** 建物が出すごみの量。 */
  load: number;
  /** 処理しきれない量 (道路網ごとに、ごみの量が処理量を超えた分の合計)。 */
  uncollected: number;
  /** どれかの道路網で、処理しきれない量がいちばん多いもの。 */
  worst: number;
  /** 処理が追いつかない度合い (0〜1。いちばん悪い道路網のもの)。 */
  penalty: number;
}

/** 公共サービスごとの、届いている建物の数と、建物の総数。 */
export type CoverageStats = Record<Coverage, { covered: number; total: number }>;

const emptyCoverage = (): CoverageStats => ({
  police: { covered: 0, total: 0 },
  fire: { covered: 0, total: 0 },
  health: { covered: 0, total: 0 },
  education: { covered: 0, total: 0 },
});

const emptyUtilities = (): Utilities => ({
  power: { supply: 0, used: 0 },
  water: { supply: 0, used: 0 },
  sewage: { supply: 0, used: 0 },
});

/** 街全体の状態 (道路・ゾーン・施設・お金・時間) と、1 日ぶんの進行。描画や入力は持たない。 */
export class City {
  readonly graph: RoadGraph;
  readonly zones: ZoneMap;
  readonly facilities = new Map<number, Facility>();
  /** 施設が増減したら増える。描画側が再描画の要否を判断するのに使う。 */
  facilitiesVersion = 0;
  money = START_MONEY;
  /**
   * 開発者モード: 街の条件をすべて無視する (供給・ごみ・公共サービス・外部接続・環境と健康・渋滞・需要・道路の太さ・お金)。
   * 見た目や動きの確認用。街のデータには保存しない (画面の設定で、新しい街・読み込んだ街にも引き継ぐ)。
   */
  devMode = false;
  /** 経過日数。0 から始まる。 */
  day = 0;
  demand: Demand = { r: 0, c: 0, i: 0, o: 0 };
  /** 密度ごとの需要 (低・中・高・超高)。区画の種類の需要と、街の高さのバランスで決まる。 */
  private densityNeed = new Map<ZoneType, number[]>();
  /** 直近 1 か月の収支。まだ月が終わっていなければ 0。 */
  lastMonth: MonthReport = { income: 0, expense: 0 };
  /** 地価 (0〜1) の、区画ごとの値 (キーは "x,y")。道路・サービス・環境・施設から毎日求め直す。保存しない。 */
  landValues = new Map<string, number>();
  /** 建物が建っている場所の地価の平均から決まる、税の上乗せの割合 (0〜LAND_TAX_BONUS)。保存しない。 */
  landBonus = 0;
  /** 区画ごとの、届いている公共サービスの種類の数 (calcCoverage が求める)。保存しない。 */
  private coverCount = new Map<string, number>();
  /** 電力・水道・下水の供給量と使用量 (直近の tick の時点)。 */
  utilities: Utilities = emptyUtilities();
  /** 警察・消防・医療・教育が届いている建物の数 (直近の tick の時点)。 */
  coverage: CoverageStats = emptyCoverage();
  /** 幸福度 0〜1。公共サービスが何も届いていなければ中立の 0.5、すべて届いていれば 1。需要に影響する。 */
  happiness = NEUTRAL_HAPPINESS;
  /** ごみの処理量と、建物が出すごみの量 (直近の refresh の時点)。保存はせず、毎日求め直す。 */
  garbage: GarbageStats = { supply: 0, load: 0, uncollected: 0, worst: 0, penalty: 0 };
  /** 道路網の番号 → ごみの処理が追いつかない度合い。環境の計算 (悪臭) に使う。 */
  private garbagePenalty = new Map<number, number>();
  /** 高校・大学が届いていることによる、オフィスの需要の上乗せ (直近の refresh の時点)。保存はしない。 */
  higherEducation = 0;
  /** 大気汚染・騒音・悪臭による住民の健康の状態 (直近の refresh の時点)。保存はせず、毎日求め直す。 */
  health: HealthStats = emptyHealth();
  /** 施設 id → つながっている道路網の番号。0 = どの道路にもつながっていない (供給できない)。 */
  facilityNet = new Map<number, number>();
  /** facilityNet を求め直すたびに増える。描画側が再描画の要否を判断するのに使う。 */
  networkVersion = 0;
  /** 外部接続につながっている道路網の番号。ここにある住宅にだけ、外から住民が引っ越してくる。 */
  outsideNets = new Set<number>();
  /** 住民の通勤・買い物による道路の交通量 (直近の refresh の時点)。保存はせず、読み込み後に求め直す。 */
  traffic: TrafficResult = emptyTraffic();
  /** traffic を求め直すたびに増える。描画側が再描画の要否を判断するのに使う。 */
  trafficVersion = 0;

  private _taxRate = DEFAULT_TAX_RATE;
  /** 地区 (作った順)。地区が重なるときは後から作ったものが優先する。 */
  readonly districts: District[] = [];
  private nextDistrictId = 1;
  /** 地区が変わるたびに増える (描画が作り直すかの判断用)。 */
  districtsVersion = 0;
  private rng: StatefulRng;
  private nextFacilityId = 1;
  private checkedRoadVersion = -1;
  private netGraphVersion = -1;
  private netFacilitiesVersion = -1;
  private nodeNet = new Map<number, number>();
  private trafficKey = "";

  constructor(readonly seed: number, graph = new RoadGraph(), rngState?: number) {
    this.graph = graph;
    this.zones = new ZoneMap(seed);
    this.rng = createStatefulRng(seed, rngState);
    this.zones.blocked = (x, y) => this.facilityAt(x, y) !== undefined;
  }

  /** 保存用のデータにする。 */
  toData(): CityData {
    return {
      seed: this.seed,
      day: this.day,
      money: this.money,
      taxRate: this._taxRate,
      lastMonth: { ...this.lastMonth },
      rngState: this.rng.state(),
      nextFacilityId: this.nextFacilityId,
      graph: this.graph.toData(),
      zones: [...this.zones.cells.values()].map((c) => (c.building > 0 ? [c.x, c.y, c.zone, c.building, c.residents, c.density, c.w, c.h, c.built] : [c.x, c.y, c.zone, c.building, c.residents, c.density])),
      facilities: [...this.facilities.values()].map((f) => ({ id: f.id, type: f.type, x: f.x, y: f.y, size: f.size })),
      districts: this.districts.map((g) => ({ id: g.id, name: g.name, color: g.color, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, taxRate: g.taxRate, allowed: [...g.allowed] as Allowed, wallet: g.wallet, greenery: g.greenery })),
    };
  }

  /** 保存用のデータから街を復元する。壊れたデータなら Error を投げる。復元後は refresh() で供給などを求め直す。 */
  static fromData(d: CityData): City {
    const isInt = (v: unknown, min: number, max = Infinity) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
    if (!isInt(d.seed, 0) || !isInt(d.day, 0) || !Number.isFinite(d.money) || !Number.isFinite(d.taxRate)) throw new Error("街の基本情報が不正です");
    if (!isInt(d.rngState, 0, 0xffffffff) || !isInt(d.nextFacilityId, 1)) throw new Error("街の内部状態が不正です");
    if (!Array.isArray(d.zones) || !Array.isArray(d.facilities)) throw new Error("ゾーンや施設のデータが不正です");
    const city = new City(d.seed, RoadGraph.fromData(d.graph), d.rngState);
    for (const g of d.districts ?? []) {
      if (!isInt(g.id, 1) || city.districts.some((o) => o.id === g.id) || typeof g.name !== "string" || g.name.length > 20) throw new Error("地区のデータが不正です");
      if (!isInt(g.color, 0, 0xffffff) || !isInt(g.x0, -1e9, 1e9) || !isInt(g.y0, -1e9, 1e9) || !isInt(g.x1, -1e9, 1e9) || !isInt(g.y1, -1e9, 1e9)) throw new Error("地区のデータが不正です");
      if (g.x1 - g.x0 < DISTRICT_MIN_SIZE || g.y1 - g.y0 < DISTRICT_MIN_SIZE || g.x1 - g.x0 > DISTRICT_MAX_SIZE || g.y1 - g.y0 > DISTRICT_MAX_SIZE) throw new Error("地区の大きさが不正です");
      if (g.taxRate !== undefined && (!Number.isFinite(g.taxRate) || g.taxRate < MIN_TAX_RATE || g.taxRate > MAX_TAX_RATE)) throw new Error("地区の税率が不正です");
      if (!Array.isArray(g.allowed) || (g.allowed.length !== 3 && g.allowed.length !== 4) || g.allowed.some((v) => typeof v !== "boolean")) throw new Error("地区の建物の規制が不正です");
      const allowed = [...g.allowed, true].slice(0, 4) as Allowed; // 4 段階より前のデータは、超高密度を建ててよい
      if (!Number.isFinite(g.wallet)) throw new Error("地区の財布が不正です");
      if (g.greenery !== undefined && !isInt(g.greenery, 0, 2)) throw new Error("地区の木の多さが不正です");
      city.districts.push({ id: g.id, name: g.name, color: g.color, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, taxRate: g.taxRate, allowed, wallet: g.wallet, greenery: (g.greenery ?? 1) as Greenery });
    }
    if (city.districts.length > DISTRICT_MAX_COUNT) throw new Error("地区の数が多すぎます");
    city.nextDistrictId = Math.max(1, ...city.districts.map((g) => g.id + 1));
    // 建った日を持たない昔のデータの建物は、読み込んだ日に建ったものとする (いきなり建て替えの候補にしない)
    const builtDay = d.day;
    city.day = d.day;
    city.money = d.money;
    city.setTaxRate(d.taxRate);
    city.lastMonth = { income: Number(d.lastMonth?.income) || 0, expense: Number(d.lastMonth?.expense) || 0 };
    for (const f of d.facilities) {
      if (!isInt(f.id, 1) || !isInt(f.type, 1, FACILITY_TYPE_MAX) || !isInt(f.x, -1e9, 1e9) || !isInt(f.y, -1e9, 1e9) || city.facilities.has(f.id)) throw new Error("施設のデータが不正です");
      const size = f.size === undefined ? FACILITY_SIZE : f.size; // 大きさのない昔のデータは 2×2
      if (!isInt(size, 1, 8)) throw new Error("施設の大きさが不正です");
      city.facilities.set(f.id, { id: f.id, type: f.type as FacilityKind, size, x: f.x, y: f.y });
    }
    // 次の施設番号は、既存のどの施設番号よりも大きくする (壊れたデータで、新しい施設が既存の施設を上書きしないように)
    city.nextFacilityId = Math.max(d.nextFacilityId, ...[...city.facilities.keys()].map((id) => id + 1));
    for (const z of d.zones) {
      const [x, y, zone, building, residents, rawDensity, rawW, rawH, rawBuilt] = z;
      const density = rawDensity === undefined ? 0 : rawDensity; // 密度のない古いデータは、昔の区画
      const w = rawW === undefined ? 1 : rawW; // 大きさのない古いデータは 1×1
      const h = rawH === undefined ? 1 : rawH;
      if (!isInt(x, -1e9, 1e9) || !isInt(y, -1e9, 1e9) || !isInt(zone, 1, 4) || !isInt(building, 0, 4) || !isInt(density, 0, 4)) throw new Error("ゾーンのデータが不正です");
      if (!isInt(w, 1, MAX_LOT_SIDE) || !isInt(h, 1, MAX_LOT_SIDE) || (w * h > 1 && building === 0)) throw new Error("建物の大きさが不正です");
      if (rawBuilt !== undefined && !isInt(rawBuilt, 0, 1e9)) throw new Error("建物の日付が不正です");
      if (!isInt(residents, 0, capacityOf(zone, Math.max(1, building), density as Density) * w * h)) throw new Error("ゾーンのデータが不正です");
      city.zones.cells.set(`${x},${y}`, { x, y, zone, building, residents, served: true, net: -1, roadCap: 0, density: density as Density, w, h, env: cleanEnv(), built: building > 0 ? (rawBuilt ?? builtDay) : 0, aging: 1 });
    }
    // 複数マスの建物の、アンカー以外のタイルに印を付ける (敷地のタイルがそろっていて、ほかの建物と重ならないこと)
    for (const c of city.zones.cells.values()) {
      if (c.w * c.h <= 1) continue;
      for (const t of city.zones.lotCells(c)) {
        if (t === c) continue;
        if (t.zone !== c.zone || t.density !== c.density || t.building !== 0 || t.part !== undefined) throw new Error("建物の敷地が不正です");
        t.part = `${c.x},${c.y}`;
      }
      if (city.zones.lotCells(c).length !== c.w * c.h) throw new Error("建物の敷地が不正です");
    }
    city.zones.version++;
    city.facilitiesVersion++;
    return city;
  }

  /** 地区を作る。囲んだ 2 点 (タイル) で範囲を決める。 */
  addDistrict(ax: number, ay: number, bx: number, by: number): { ok: boolean; reason?: string; id?: number } {
    if (this.districts.length >= DISTRICT_MAX_COUNT) return { ok: false, reason: `地区は ${DISTRICT_MAX_COUNT} 個までです` };
    const r = districtRect(ax, ay, bx, by);
    if (!r) return { ok: false, reason: `地区は ${DISTRICT_MIN_SIZE}〜${DISTRICT_MAX_SIZE} マス四方で囲みます` };
    const id = this.nextDistrictId++;
    this.districts.push({ id, name: `地区${id}`, color: DISTRICT_COLORS[(id - 1) % DISTRICT_COLORS.length]!, ...r, allowed: [true, true, true, true], wallet: 0, greenery: 1 });
    this.districtsVersion++;
    return { ok: true, id };
  }

  /** 地区を消す。財布のお金は消える。 */
  removeDistrict(id: number): boolean {
    const i = this.districts.findIndex((g) => g.id === id);
    if (i < 0) return false;
    this.districts.splice(i, 1);
    this.districtsVersion++;
    return true;
  }

  /** 地区の名前・色・税率・建物の規制を変える。税率が undefined なら市の税率に従う。 */
  updateDistrict(id: number, patch: { name?: string; color?: number; taxRate?: number | undefined; allowed?: Allowed; greenery?: Greenery }): boolean {
    const g = this.districts.find((o) => o.id === id);
    if (!g) return false;
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (name.length === 0 || name.length > 20) return false;
      g.name = name;
    }
    if (patch.color !== undefined) g.color = patch.color;
    if (patch.taxRate !== undefined) g.taxRate = Math.round(Math.min(MAX_TAX_RATE, Math.max(MIN_TAX_RATE, patch.taxRate)) * 100) / 100;
    if (patch.taxRate === undefined && "taxRate" in patch) g.taxRate = undefined;
    if (patch.allowed) g.allowed = [...patch.allowed] as Allowed;
    if (patch.greenery !== undefined) g.greenery = patch.greenery;
    this.districtsVersion++;
    return true;
  }

  /** 建物 (アンカー) が属する地区。 */
  districtOf(c: ZoneCell): District | undefined {
    return districtAt(this.districts, c.x, c.y);
  }

  /** この金額を払えるか (開発者モードではいつも払える)。 */
  canAfford(cost: number): boolean {
    return this.devMode || this.money >= cost;
  }

  /** 払う (開発者モードでは、お金は減らない)。 */
  private spend(cost: number): void {
    if (!this.devMode) this.money -= cost;
  }

  get taxRate(): number {
    return this._taxRate;
  }

  /** 税率を MIN〜MAX の範囲で、1% 刻みに丸めて設定する。 */
  setTaxRate(rate: number): void {
    const clamped = Math.min(MAX_TAX_RATE, Math.max(MIN_TAX_RATE, rate));
    this._taxRate = Math.round(clamped * 100) / 100;
  }

  /** いまの季節 (日から決まる)。 */
  get season(): Season {
    return seasonOf(this.day);
  }

  /** いまの天気 (種子と日から決まる。保存はしない)。 */
  get weather(): Weather {
    return weatherOn(this.seed, this.day);
  }

  get date(): GameDate {
    const perYear = DAYS_PER_MONTH * MONTHS_PER_YEAR;
    return {
      year: Math.floor(this.day / perYear) + 1,
      month: Math.floor((this.day % perYear) / DAYS_PER_MONTH) + 1,
      day: (this.day % DAYS_PER_MONTH) + 1,
    };
  }

  /** 道路の変更にかかる費用 (切り上げ)。新しく敷いた分は種類ごとの建設費 (橋・トンネルは倍率つき)、アップグレードは建設費の差額 (安い種類への変更は無料で、返金もない)。 */
  static changeCost(change: RoadChange): number {
    let sum = 0;
    for (const b of change.built) sum += b.length * ROAD_SPECS[b.type].cost * laneCountMult(b.laneCount) * costMultOf(b.structure);
    for (const c of change.changed) sum += c.length * Math.max(0, ROAD_SPECS[c.to].cost * laneCountMult(c.toLanes) - ROAD_SPECS[c.from].cost * laneCountMult(c.fromLanes)) * costMultOf(c.structure);
    return Math.ceil(sum);
  }

  /**
   * 折れ線 (2 点なら 1 本の直線、3 点以上なら曲線を細かく分けたもの) の道路を敷いたときの費用などを見積もる。何も変えない。
   * 水の上は橋、山の下はトンネルになる (長さの上限あり)。敷けない場合は ok: false と理由を返す。お金が足りるかは見ない。
   */
  quotePath(pts: readonly { x: number; y: number }[], type: RoadType = DEFAULT_ROAD_TYPE, oneWay = false, lanes = 0, laneCount = DEFAULT_LANE_COUNT): RoadQuote {
    const plan = planPath(this.seed, pts);
    if (!plan.ok) return { ok: false, reason: plan.reason, cost: 0, sections: 0, bridge: 0, tunnel: 0 };
    const trial = RoadGraph.fromData(this.graph.toData());
    let cost = 0;
    let sections = 0;
    const chainOfRun = new Map<number, number>();
    const curve = pts.length > 2 ? trial.newChain() : 0;
    for (const piece of plan.pieces) {
      let chain = curve;
      if (piece.run !== 0) {
        if (!chainOfRun.has(piece.run)) chainOfRun.set(piece.run, trial.newChain());
        chain = chainOfRun.get(piece.run)!;
      }
      sections += trial.addRoad(piece.a.x, piece.a.y, piece.b.x, piece.b.y, type, oneWay, chain, piece.structure, lanes, laneCount);
      cost += City.changeCost(trial.lastChange);
    }
    if (trial.structureJunction()) return { ok: false, reason: "橋やトンネルの途中では、ほかの道路と交差できません", cost: 0, sections: 0, bridge: 0, tunnel: 0 };
    return { ok: true, cost, sections, bridge: plan.bridge, tunnel: plan.tunnel };
  }

  /** 直線 1 本の見積もり。quotePath の 2 点版。 */
  quoteRoad(ax: number, ay: number, bx: number, by: number, type: RoadType = DEFAULT_ROAD_TYPE, oneWay = false): RoadQuote {
    return this.quotePath([{ x: ax, y: ay }, { x: bx, y: by }], type, oneWay);
  }

  /**
   * 折れ線の道路を敷いて費用を払う。敷けない・お金が足りない・新しく敷く/変える区間がない場合は何もせず false。
   * 3 点以上 (曲線) は一続きの曲線として扱い、撤去のときに一緒に消える。橋・トンネルは、その区間だけがまとまりで消える。
   * 費用は実際に変わった区間だけで決まる (同じ種類の既存の道路と重なる部分は払わない。重なった部分の種類や一方通行の向きが違えば、その通りに変わる。向きだけの変更は無料)。
   */
  buildPath(pts: readonly { x: number; y: number }[], type: RoadType = DEFAULT_ROAD_TYPE, oneWay = false, lanes = 0, laneCount = DEFAULT_LANE_COUNT): boolean {
    const quote = this.quotePath(pts, type, oneWay, lanes, laneCount);
    if (!quote.ok || quote.sections === 0 || !this.canAfford(quote.cost)) return false;
    const plan = planPath(this.seed, pts);
    if (!plan.ok) return false;
    const chainOfRun = new Map<number, number>();
    const curve = pts.length > 2 ? this.graph.newChain() : 0;
    for (const piece of plan.pieces) {
      let chain = curve;
      if (piece.run !== 0) {
        if (!chainOfRun.has(piece.run)) chainOfRun.set(piece.run, this.graph.newChain());
        chain = chainOfRun.get(piece.run)!;
      }
      this.graph.addRoad(piece.a.x, piece.a.y, piece.b.x, piece.b.y, type, oneWay, chain, piece.structure, lanes, laneCount);
    }
    this.spend(quote.cost);
    return true;
  }

  /**
   * 道路 (edgeId を含む、ひとつながりの区間) を type にアップグレード (または変更) するときの費用と、変わる区間の数。何も変えない。
   * 費用は、建設費の差額 (橋・トンネルは倍率つき)。安い種類への変更は無料で、返金もない。
   */
  quoteUpgrade(edgeId: number, type: RoadType): { cost: number; sections: number; edges: number[] } {
    const edges = this.graph.roadRun(edgeId).filter((id) => this.graph.edges.get(id)!.type !== type);
    const trial: RoadChange = { built: [], changed: [] };
    for (const id of edges) {
      const e = this.graph.edges.get(id)!;
      const a = this.graph.nodes.get(e.a)!;
      const b = this.graph.nodes.get(e.b)!;
      trial.changed.push({ length: Math.hypot(b.x - a.x, b.y - a.y), from: e.type, to: type, structure: e.structure, fromLanes: e.laneCount, toLanes: e.laneCount });
    }
    return { cost: City.changeCost(trial), sections: edges.length, edges };
  }

  /** 道路 (ひとつながりの区間) の種類を変えて、差額を払う。お金が足りない、または変わる区間がなければ false。 */
  upgradeRoad(edgeId: number, type: RoadType): boolean {
    const q = this.quoteUpgrade(edgeId, type);
    if (q.sections === 0 || !this.canAfford(q.cost)) return false;
    for (const id of q.edges) this.graph.retype(id, type);
    this.spend(q.cost);
    return true;
  }

  /** 直線 1 本を敷く。buildPath の 2 点版。 */
  buildRoad(ax: number, ay: number, bx: number, by: number, type: RoadType = DEFAULT_ROAD_TYPE, oneWay = false): boolean {
    return this.buildPath([{ x: ax, y: ay }, { x: bx, y: by }], type, oneWay);
  }

  // ---- 施設 ----

  /** タイル (tx,ty) にある施設。なければ undefined。 */
  facilityAt(tx: number, ty: number): Facility | undefined {
    for (const f of this.facilities.values()) {
      if (tx >= f.x && tx < f.x + f.size && ty >= f.y && ty < f.y + f.size) return f;
    }
    return undefined;
  }

  /** 施設を建てられるか (お金は見ない)。 */
  checkFacility(type: FacilityType, x: number, y: number): PlaceCheck {
    return checkFacilityPlacement(this.seed, this.graph, this.facilities.values(), type, x, y);
  }

  /** 施設を建てて費用を払う。下のゾーンは消える。建てられない場合は理由を返し、何も変えない。 */
  placeFacility(type: FacilityType, x: number, y: number): PlaceCheck {
    const spec = FACILITY_SPECS[type];
    const check = this.checkFacility(type, x, y);
    if (!check.ok) return check;
    if (!this.canAfford(spec.cost)) return { ok: false, reason: "お金が足りません" };
    this.spend(spec.cost);
    this.facilities.set(this.nextFacilityId, { id: this.nextFacilityId, type, size: spec.size, x, y });
    this.nextFacilityId++;
    this.facilitiesVersion++;
    for (const t of footprint(x, y, spec.size)) this.zones.clearRect({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
    return { ok: true };
  }

  /** 施設を取り壊す (お金は戻らない)。 */
  removeFacility(id: number): boolean {
    if (!this.facilities.delete(id)) return false;
    this.facilitiesVersion++;
    return true;
  }

  /** 道路が変わっていたら、塗れなくなったゾーンと、道路の下になった施設を消す。毎フレーム呼んでよい (変化がなければ何もしない)。 */
  syncRoads(): void {
    if (this.graph.version === this.checkedRoadVersion) return;
    this.checkedRoadVersion = this.graph.version;
    for (const f of [...this.facilities.values()]) {
      const underRoad = footprint(f.x, f.y, f.size).some((t) => this.graph.distanceToRoad(t.x + 0.5, t.y + 0.5, ROAD_CLEARANCE) < ROAD_CLEARANCE);
      if (underRoad) this.removeFacility(f.id);
    }
    this.zones.revalidate(this.graph);
  }

  /**
   * 道路がつながった範囲 (道路網) の番号を、ゾーンのタイルと施設それぞれについて求め直す。道路か施設が変わったときだけ全部やり直す。
   * 毎フレーム呼んでよい (一時停止中でも、施設が道路につながったかが画面に反映される)。
   */
  syncNetworks(): void {
    if (this.graph.version !== this.netGraphVersion || this.facilitiesVersion !== this.netFacilitiesVersion) {
      this.netGraphVersion = this.graph.version;
      this.netFacilitiesVersion = this.facilitiesVersion;
      this.nodeNet = this.graph.components();
      this.networkVersion++;
      this.facilityNet.clear();
      this.outsideNets.clear();
      for (const f of this.facilities.values()) {
        let best = 0;
        let bestDist = Infinity;
        for (const t of footprint(f.x, f.y, f.size)) {
          const e = this.graph.nearestEdge(t.x + 0.5, t.y + 0.5, ZONE_REACH, isAccessEdge);
          if (!e) continue;
          const n = this.graph.nodes.get(e.a)!;
          const d = Math.hypot(n.x - (t.x + 0.5), n.y - (t.y + 0.5));
          if (d < bestDist) {
            bestDist = d;
            best = this.nodeNet.get(e.a) ?? 0;
          }
        }
        this.facilityNet.set(f.id, best);
        if (f.type === FacilityKind.Outside && best !== 0) this.outsideNets.add(best);
      }
      for (const c of this.zones.cells.values()) c.net = -1;
    }
    for (const c of this.zones.cells.values()) {
      if (c.net !== -1) continue;
      if (c.part !== undefined) {
        c.net = 0; // 複数マスの建物の、アンカー以外のタイル。出入口はアンカーが持つ
        c.roadCap = 0;
        continue;
      }
      // 建物の出入口は、敷地のうち、いちばん道路に近いタイル (1×1 なら、そのタイル)。道路の太さは、敷地のどこかが面している最大のもの
      let bestDist = Infinity;
      let net = 0;
      let cap = 0;
      for (const t of this.zones.lotCells(c)) {
        const e = this.graph.nearestEdge(t.x + 0.5, t.y + 0.5, ZONE_REACH, isAccessEdge);
        cap = Math.max(cap, this.graph.maxAccessCapacity(t.x + 0.5, t.y + 0.5, ZONE_REACH));
        if (!e) continue;
        const d = this.graph.distanceToRoad(t.x + 0.5, t.y + 0.5, ZONE_REACH, isAccessEdge);
        if (d < bestDist || (d === bestDist && net === 0)) {
          bestDist = d;
          net = this.nodeNet.get(e.a) ?? 0;
        }
      }
      c.net = net;
      c.roadCap = cap;
    }
  }

  /** 季節による電力の増減 (夏の冷房・冬の暖房) を、使用量にかける。 */
  private scaled(load: Record<Service, number>, area = 1): Record<Service, number> {
    return { power: load.power * area * POWER_USE_MULT[this.season], water: load.water * area, sewage: load.sewage * area };
  }

  /**
   * 建物の老朽化 (建ってからの年数に応じて、定員・雇用の割合を下げる)。毎日の refresh で求め直す。
   * 定員が下がって入りきらなくなった住民は、そこを出ていく。
   */
  private calcAging(): void {
    for (const c of this.zones.cells.values()) {
      c.aging = c.building > 0 ? agingFactor(this.day - c.built) : 1;
      const cap = cellCapacity(c);
      if (c.residents > cap) c.residents = cap;
    }
  }

  /**
   * 古い建物 (REBUILD_YEARS 年以上) のうち、その用途の需要があるものは、一定の確率で取り壊される。
   * 取り壊した場所は空き地に戻り、需要があれば同じゾーンの新しい建物が建つ (建った日は今日になる)。
   */
  private replaceOldBuildings(): void {
    const d = this.demand;
    for (const c of [...this.zones.cells.values()]) {
      if (c.building === 0 || c.part !== undefined) continue;
      if (!isOldEnough(this.day - c.built)) continue;
      const want = c.zone === ZoneType.Residential ? d.r : c.zone === ZoneType.Commercial ? d.c : c.zone === ZoneType.Office ? d.o : d.i;
      if (want <= 0 || this.rng.next() >= REBUILD_CHANCE) continue;
      this.zones.demolishLot(c);
      c.building = 0;
      c.residents = 0;
      c.built = 0;
      c.aging = 1;
      c.w = 1;
      c.h = 1;
      this.zones.version++;
    }
  }

  private loadOf(c: ZoneCell): Record<Service, number> {
    return this.scaled(buildingLoad(c.zone, c.building, c.density), lotArea(c) * c.aging); // 複数マスの建物は、マス数ぶん使う。古い建物は使う量が減る
  }

  /**
   * 道路網ごとに電力・水道・下水の供給量を集め、建物に順に割り当てる。
   * 3 つとも足りた建物だけが「供給あり」になる。戻り値は道路網ごと・サービスごとの残り (新しい建物を建てられるかの判断用)。
   */
  private allocateServices(): Map<number, Record<Service, number>> {
    const spare = new Map<number, Record<Service, number>>();
    const util = emptyUtilities();
    const season = this.season;
    const weather = this.weather;
    for (const f of this.facilities.values()) {
      const net = this.facilityNet.get(f.id) ?? 0;
      if (net === 0) continue; // 道路につながっていない施設は供給できない
      const spec = FACILITY_SPECS[f.type];
      if (spec.service === null) continue; // 外部接続は供給しない
      let s = spare.get(net);
      if (!s) spare.set(net, (s = { power: 0, water: 0, sewage: 0 }));
      const cap = capacityNow(spec, season, weather); // 風力・太陽光は、いまの天気と季節で変わる
      s[spec.service] += cap;
      util[spec.service].supply += cap;
    }
    for (const c of this.zones.cells.values()) {
      if (c.building === 0) continue;
      const s = spare.get(c.net);
      const load = this.loadOf(c);
      c.served = this.devMode || (!!s && SERVICES.every((k) => s[k] >= load[k]));
      if (c.served) {
        for (const k of SERVICES) {
          if (s) s[k] -= load[k]; // 開発者モードでは、供給のない道路網の建物も「供給あり」になる
          util[k].used += load[k];
        }
      }
    }
    this.utilities = util;
    return spare;
  }

  /**
   * 公共サービスの届き具合と幸福度を求める。道路につながっている施設だけが届ける。
   * 幸福度は、4 つのサービスの届いている建物の割合の平均で 0.5〜1 になる (建物がなければ中立)。
   */
  private calcCoverage(): void {
    const stats = emptyCoverage();
    const providers = [...this.facilities.values()].filter((f) => FACILITY_SPECS[f.type].coverage !== null && (this.facilityNet.get(f.id) ?? 0) !== 0);
    let buildings = 0;
    let boostSum = 0;
    for (const c of this.zones.cells.values()) {
      if (c.building === 0) continue;
      const area = lotArea(c); // 広い建物ほど重く数える (割合は、土地の広さあたり)
      const ctr = lotCenter(c);
      buildings += area;
      for (const k of COVERAGES) stats[k].total += area;
      const reached = new Set<Coverage>();
      let boost = 0;
      for (const f of providers) {
        const spec = FACILITY_SPECS[f.type];
        const fc = facilityCenter(f);
        if (Math.hypot(fc.x - ctr.x, fc.y - ctr.y) > spec.radius) continue;
        reached.add(spec.coverage!);
        boost = Math.max(boost, spec.officeBoost ?? 0); // 届いている高校・大学のうち、いちばん高いものを使う
      }
      boostSum += boost * area;
      for (const k of reached) stats[k].covered += area;
      c.env.cared = reached.has("health");
    }
    for (const c of this.zones.cells.values()) {
      const ctr = lotCenter(c);
      let n = 0;
      for (const f of providers) {
        const spec = FACILITY_SPECS[f.type];
        const fc = facilityCenter(f);
        if (Math.hypot(fc.x - ctr.x, fc.y - ctr.y) <= spec.radius) n++;
      }
      this.coverCount.set(`${c.x},${c.y}`, n);
    }
    this.coverage = stats;
    if (this.devMode) {
      // 公共サービスは、すべての建物に届いているものとする
      for (const k of COVERAGES) stats[k].covered = stats[k].total;
      for (const c of this.zones.cells.values()) if (c.building > 0) c.env.cared = true;
      this.happiness = 1;
      this.higherEducation = 0;
      return;
    }
    this.higherEducation = buildings === 0 ? 0 : boostSum / buildings;
    if (buildings === 0) {
      this.happiness = NEUTRAL_HAPPINESS;
      return;
    }
    const mean = COVERAGES.reduce((sum, k) => sum + stats[k].covered / stats[k].total, 0) / COVERAGES.length;
    this.happiness = NEUTRAL_HAPPINESS + (1 - NEUTRAL_HAPPINESS) * mean;
  }

  /**
   * ごみを道路網ごとに数える。建物が出すごみの合計が、その道路網のごみ処理場の処理量を超えた分が「処理しきれないごみ」で、
   * 小さな街 (処理しきれない分が GARBAGE_GRACE まで) は影響なし。それを超えると悪臭が出る。道路につながっていない建物のごみは、処理されない。
   */
  private calcGarbage(): void {
    const supply = new Map<number, number>();
    let supplyTotal = 0;
    for (const f of this.facilities.values()) {
      const w = FACILITY_SPECS[f.type].waste;
      const net = this.facilityNet.get(f.id) ?? 0;
      if (!w || net === 0) continue; // 道路につながっていない処理場は働かない
      supply.set(net, (supply.get(net) ?? 0) + w);
      supplyTotal += w;
    }
    const load = new Map<number, number>();
    let loadTotal = 0;
    for (const c of this.zones.cells.values()) {
      if (c.building === 0) continue;
      const w = wasteOf(c.zone, c.building, c.density) * lotArea(c);
      load.set(c.net, (load.get(c.net) ?? 0) + w);
      loadTotal += w;
    }
    this.garbagePenalty.clear();
    let uncollected = 0;
    let worst = 0;
    for (const [net, l] of load) {
      const u = Math.max(0, l - (net === 0 ? 0 : (supply.get(net) ?? 0)));
      uncollected += u;
      worst = Math.max(worst, u);
      this.garbagePenalty.set(net, garbagePenaltyOf(u));
    }
    this.garbage = { supply: supplyTotal, load: loadTotal, uncollected, worst, penalty: garbagePenaltyOf(worst) };
  }

  /** 画面に出す注意書き: 足りないサービスや、まだ施設がないサービス。 */
  notices(): string[] {
    const out: string[] = [];
    if (this.devMode) return ["開発者モード: 供給・ごみ・公共サービス・外部接続・環境・渋滞・需要・お金の条件を無視しています"];
    const hasZones = this.zones.cells.size > 0;
    for (const k of SERVICES) {
      const u = this.utilities[k];
      if (u.supply === 0) {
        if (hasZones) out.push(`${SERVICE_NAMES[k]}の施設がありません`);
      } else if (u.used >= u.supply * LOW_SPARE_RATIO) {
        out.push(`${SERVICE_NAMES[k]}が不足気味です`);
      }
    }
    for (const c of this.zones.cells.values()) {
      if (c.building > 0 && !c.served) {
        out.push("供給のない建物があります (施設と道路でつなぐ)");
        break;
      }
    }
    const weather = this.weather;
    if (weather === "rain" || weather === "snow") out.push(`${weather === "rain" ? "雨" : "雪"}で道路の容量が ${Math.round((1 - ROAD_CAPACITY_MULT[weather]) * 100)}% 減っています`);
    if (POWER_USE_MULT[this.season] > 1) out.push(`${this.season === 1 ? "夏の冷房" : "冬の暖房"}で電力の使用が ${Math.round((POWER_USE_MULT[this.season] - 1) * 100)}% 増えています`);
    if (this.garbage.penalty > 0) out.push("ごみの処理が追いつかず、悪臭が出ています (ごみ処理場を建てる・増やす)");
    else if (this.garbage.worst >= GARBAGE_GRACE * 0.8) out.push("ごみが増えています (そろそろごみ処理場が必要です)");
    if (this.traffic.jammed > 0) out.push(`渋滞している道路があります (${this.traffic.jammed} 区間。道路を増やして分散する)`);
    // 密度の高い区画は、広い道路に面していないと建たない
    if ([...this.zones.cells.values()].some((z) => z.building === 0 && z.part === undefined && z.density > 0 && z.net !== 0 && z.roadCap < DENSITY_MIN_ROAD_CAPACITY[z.density])) {
      out.push("道路が細くて建たない区画があります (中密度は通り以上、高密度は大通り以上の道路に面す)");
    }
    if (this.health.sick >= 1) {
      const c = this.health.causes;
      const main = c.air >= c.noise && c.air >= c.odor ? "大気汚染" : c.noise >= c.odor ? "騒音" : "悪臭";
      out.push(`${main}で住民 ${Math.round(this.health.sick)} 人が体調をくずしています (工場や発電所から住宅を離す・病院を建てる)`);
    }
    // 外部接続がないと、住民は引っ越してこない
    const homes = [...this.zones.cells.values()].filter((c) => c.zone === ZoneType.Residential && c.building > 0);
    if (this.outsideNets.size === 0) {
      if (hasZones) out.push("外部接続がありません (住民が引っ越してきません)");
    } else if (homes.some((c) => !this.outsideNets.has(c.net))) {
      out.push("外部接続につながっていない住宅があります");
    }
    return out;
  }

  /** 道路・建物・人口が変わっていたら、交通量を求め直す。変化がなければ何もしない。 */
  private syncTraffic(population: number): void {
    const capMult = ROAD_CAPACITY_MULT[this.weather];
    const key = `${this.graph.version}:${this.zones.version}:${population}:${this.facilitiesVersion}:${capMult}`;
    if (key === this.trafficKey) return;
    this.trafficKey = key;
    this.traffic = calcTraffic(this.graph, this.zones, capMult);
    this.trafficVersion++;
  }

  /** 道路網・供給・需要を、いまの状態から求め直す (日は進めない)。ロード直後や、一時停止中の表示更新に使う。残りの供給量を返す。 */
  /** 地価を区画ごとに求め、建物の平均から税の上乗せを決める。公共サービス・環境の計算の後に呼ぶ。 */
  private calcLand(): void {
    const amenityTypes = new Set<FacilityKind>([FacilityKind.Park, FacilityKind.School, FacilityKind.MiddleSchool, FacilityKind.HighSchool, FacilityKind.University, FacilityKind.Hospital, FacilityKind.Police, FacilityKind.Fire]);
    const amenities = [...this.facilities.values()].filter((f) => amenityTypes.has(f.type)).map((f) => ({ c: facilityCenter(f) }));
    this.landValues.clear();
    let sum = 0;
    let weight = 0;
    for (const c of this.zones.cells.values()) {
      const ctr = lotCenter(c);
      let amenityCount = 0;
      for (const a of amenities) if (Math.hypot(a.c.x - ctr.x, a.c.y - ctr.y) <= AMENITY_REACH) amenityCount++;
      const v = landValueOf({
        roadCap: c.roadCap,
        services: this.coverCount.get(`${c.x},${c.y}`) ?? 0,
        risk: c.zone === ZoneType.Residential ? c.env.risk : null,
        amenities: amenityCount,
      });
      this.landValues.set(`${c.x},${c.y}`, v);
      if (c.building > 0 && c.served) {
        sum += v * lotArea(c);
        weight += lotArea(c);
      }
    }
    this.landBonus = weight > 0 ? (sum / weight) * LAND_TAX_BONUS : 0;
  }

  refresh(): Map<number, Record<Service, number>> {
    this.calcAging();
    this.syncRoads();
    this.syncNetworks();
    const spare = this.allocateServices();
    this.calcCoverage();
    this.syncTraffic(this.zones.totals().population);
    // 工場の煙・騒音・悪臭で、住民が病気になる。病気の人は働けず、税も払わない
    this.calcGarbage();
    if (this.devMode) {
      // 汚染・騒音・悪臭・ごみの悪臭は、なかったことにする (病気の人も出ない)
      this.garbagePenalty.clear();
      this.garbage.penalty = 0;
      for (const c of this.zones.cells.values()) c.env = { ...cleanEnv(), cared: c.env.cared };
      this.health = emptyHealth();
    } else {
      this.health = calcEnvironment(this.zones, this.graph, this.facilities.values(), this.traffic.flow, AIR_POLLUTION_MULT[this.weather], this.garbagePenalty);
      this.happiness = Math.max(0, this.happiness - HEALTH_HAPPINESS_PENALTY * this.health.meanRisk);
    }
    this.calcLand();
    const totals = this.zones.totals();
    // 渋滞がひどいと、住みたい人も店や工場を出したい人も減る
    const jam = trafficDemandPenalty(this.traffic);
    const d = calcDemand(totals, this._taxRate, this.happiness);
    const sd = { ...SEASON_DEMAND[this.season] };
    sd.o += this.higherEducation; // 高校・大学が届いている街には、オフィスが集まる
    const fit = (v: number) => Math.min(1, Math.max(-1, v));
    this.demand = this.devMode ? { r: 1, c: 1, i: 1, o: 1 } : { r: fit(d.r - jam + sd.r), c: fit(d.c - jam + sd.c), i: fit(d.i - jam + sd.i), o: fit(d.o - jam + sd.o) };
    // 密度ごとの需要: 建物の数 (密度ごと) を数え、区画の種類の需要に、高さのバランスを足す
    const counts = new Map<ZoneType, number[]>([
      [ZoneType.Residential, [0, 0, 0, 0]],
      [ZoneType.Commercial, [0, 0, 0, 0]],
      [ZoneType.Industrial, [0, 0, 0, 0]],
      [ZoneType.Office, [0, 0, 0, 0]],
    ]);
    for (const c of this.zones.cells.values()) {
      if (c.building === 0 || c.part !== undefined || c.density < 1) continue;
      const row = counts.get(c.zone);
      if (row) row[c.density - 1]! += 1;
    }
    this.densityNeed = new Map();
    const zoneOf = (z: ZoneType) => (z === ZoneType.Residential ? this.demand.r : z === ZoneType.Commercial ? this.demand.c : z === ZoneType.Office ? this.demand.o : this.demand.i);
    for (const [z, n] of counts) this.densityNeed.set(z, densityDemand(zoneOf(z), n));
    return spare;
  }

  /** 区画の種類と密度の需要 (-1〜1)。画面の表示にも使う。 */
  densityOf(zone: ZoneType, density: number): number {
    return this.densityNeed.get(zone)?.[density - 1] ?? 0;
  }

  /** 1 日進める: 供給を割り当て、需要を計算し、需要と供給に応じて建物が建ち、住民が増え、月末なら収支を締める。 */
  tick(): void {
    this.zones.day = this.day;
    const spare = this.refresh();
    this.replaceOldBuildings();
    const d = this.demand;
    const zoneNeed = (z: ZoneType) => (z === ZoneType.Residential ? d.r : z === ZoneType.Commercial ? d.c : z === ZoneType.Office ? d.o : d.i);
    // 密度を選んだ区画は、その密度の需要で建つ。昔の区画 (密度 0) は、区画の種類の需要だけ
    const chance = (z: ZoneType, density: number) => GROW_BASE_CHANCE * Math.max(0, density >= 1 ? this.densityOf(z, density) : zoneNeed(z));
    // 電力・水道・下水が足りる場所にしか建物は建たない。建てると決めた分はその場で供給を確保する
    this.zones.grow(() => this.rng.next(), chance, GROW_MAX_SPAWN, (cell, variant, tiles) => {
      if (!densityAllowed(this.districtOf(cell), cell.density)) return false; // 地区の規制で、この密度は禁止されている
      if (this.devMode) return true; // 供給・道路の太さ・道路網は問わず、空いていれば建つ
      // 出入口は、敷地のうち道路につながっているタイルのうち、面している道路がいちばん太いもの
      let front = tiles[0]!;
      let cap = -1;
      for (const t of tiles) {
        if (t.net > 0 && t.roadCap > cap) {
          front = t;
          cap = t.roadCap;
        }
      }
      const s = spare.get(front.net);
      if (!s) return false;
      // 密度が高い建物は、広い道路に面していないと建たない
      if (front.net <= 0 || front.roadCap < DENSITY_MIN_ROAD_CAPACITY[cell.density]) return false;
      const load = this.scaled(buildingLoad(cell.zone, variant, cell.density), tiles.length);
      if (!SERVICES.every((k) => s[k] >= load[k])) return false;
      for (const k of SERVICES) s[k] -= load[k];
      // 建物の道路網は、敷地のうち道路につながっているタイルのもの (次の syncNetworks でも同じ結果になる)
      cell.net = front.net;
      cell.roadCap = Math.max(...tiles.map((t) => t.roadCap));
      return true;
    });
    // 住民は、外部接続につながっている道路網の住宅にだけ引っ越してくる
    // ただし、環境が悪すぎる住宅には来ず、すでに住んでいる人は 1 日 1 人ずつ出ていく
    const unhealthy = (c: ZoneCell) => !this.devMode && sickRateOf(c.env.risk, c.env.cared) > MOVE_OUT_SICK_RATE;
    for (const c of this.zones.cells.values()) {
      if (c.zone === ZoneType.Residential && c.residents > 0 && unhealthy(c)) c.residents = Math.max(0, c.residents - lotArea(c)); // 1 マスあたり 1 日 1 人
    }
    this.zones.fillResidents((c) => this.devMode || (this.outsideNets.has(c.net) && !unhealthy(c))); // 開発者モードでは、外部接続がなくても住民が入る
    this.day++;
    this.calcAging(); // 日付が進んだので、建物の老朽化も今日の値にそろえる (保存と読み込みで同じになるように)
    if (this.day % DAYS_PER_MONTH === 0) this.closeMonth();
  }

  private closeMonth(): void {
    // 締めた月 (day は進めたあと)。地価の高い場所の建物は、税が上乗せされる
    const season = seasonOf(this.day - 1);
    const boost = 1 + this.landBonus;
    // 地区の中の税は、その地区の財布へ (地区の税率があればそれを使う)。地区の外の税は市の収入になる
    const income = Math.round(monthlyTax(this.zones.totalsWhere((c) => !this.districtOf(c)), this._taxRate, season) * boost);
    for (const g of this.districts) {
      g.wallet += Math.round(monthlyTax(this.zones.totalsWhere((c) => this.districtOf(c) === g), g.taxRate ?? this._taxRate, season) * boost);
    }
    let expense = Math.round(this.graph.totalUpkeep());
    for (const f of this.facilities.values()) {
      // 地区の中の施設の維持費は、その地区の財布から先に払い、足りない分だけ市の出費になる
      let cost = FACILITY_SPECS[f.type].upkeep;
      const g = districtAt(this.districts, f.x, f.y);
      if (g) {
        const paid = Math.min(g.wallet, cost);
        g.wallet -= paid;
        cost -= paid;
      }
      expense += cost;
    }
    if (!this.devMode) this.money += income - expense; // 開発者モードでは、収支はお金に影響しない (収支の表示だけ更新する)
    this.lastMonth = { income, expense };
  }
}
