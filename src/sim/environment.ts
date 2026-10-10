import { FACILITY_SPECS, FacilityType, facilityCenter, type Facility } from "./facilities";
import type { RoadGraph } from "./roadGraph";
import { ROAD_SPECS } from "./roadTypes";
import { EDGE_CAPACITY } from "./traffic";
import { ZoneType, lotArea, lotCenter, type ZoneMap } from "./zoning";

/** 工場 (建物の大きさ 1〜3) が出す大気汚染の強さ・届く距離 (タイル)。 */
const FACTORY_AIR = 0.35;
const FACTORY_AIR_REACH = 9;
/** 発電所の大気汚染。 */
const POWER_AIR = 1.2;
const POWER_AIR_REACH = 12;
/** 下水処理場の悪臭。 */
const SEWAGE_ODOR = 1;
const SEWAGE_ODOR_REACH = 9;
/** 交通量の多い道路の騒音 (容量いっぱいで 1.2)・工場の騒音。 */
const ROAD_NOISE = 1.2;
const ROAD_NOISE_REACH = 4;
const FACTORY_NOISE = 0.15;
const FACTORY_NOISE_REACH = 5;
/** ごみ処理場の悪臭と大気汚染。 */
const GARBAGE_ODOR = 0.7;
const GARBAGE_ODOR_REACH = 7;
const GARBAGE_AIR = 0.3;
const GARBAGE_AIR_REACH = 5;
/** 処理しきれず道路にあふれたごみの悪臭 (penalty が 1 のとき、住宅の悪臭がこれだけ増える)。 */
const UNCOLLECTED_ODOR = 0.6;

/**
 * ごみの処理が追いつかない度合い (0〜1)。小さな街は各戸で処理できるので、処理しきれないごみが GARBAGE_GRACE までは影響なし。
 * それを超えた分が増えるほど悪くなり、GARBAGE_GRACE + GARBAGE_RAMP で 1 (最悪) になる。
 */
export const GARBAGE_GRACE = 200;
export const GARBAGE_RAMP = 400;
export const garbagePenaltyOf = (uncollected: number) => Math.min(1, Math.max(0, (uncollected - GARBAGE_GRACE) / GARBAGE_RAMP));

/** 公園・防音壁の効き方: 施設に近いほど強く、radius に向けて直線的に弱まる (大気汚染や騒音の距離による弱まり方より、ゆるやか)。 */
const reliefFalloff = (d: number, reach: number) => (d >= reach ? 0 : 1 - d / reach);

/** 3 つの環境の悪さを、健康へのリスクにまとめる重み。 */
const AIR_WEIGHT = 0.7;
const NOISE_WEIGHT = 0.3;
const ODOR_WEIGHT = 0.4;
/** リスクが 1 のとき、住民の何割が寝込むか。病院の範囲内なら CARED_FACTOR 倍に減る。 */
export const MAX_SICK_RATE = 0.6;
export const CARED_FACTOR = 0.35;
/** 寝込む人の割合がこれを超えた住宅からは、住民が少しずつ出ていき、新しい住民も来ない。 */
export const MOVE_OUT_SICK_RATE = 0.25;

/** 距離 d に応じて 1 → 0 へ下がる影響の強さ (近いほど強く、遠いほど急に弱まる)。 */
const falloff = (d: number, reach: number) => (d >= reach ? 0 : (1 - d / reach) ** 2);

/** 病気で寝込む住民の割合 (0〜MAX_SICK_RATE)。 */
export const sickRateOf = (risk: number, cared: boolean) => risk * MAX_SICK_RATE * (cared ? CARED_FACTOR : 1);

export interface HealthStats {
  /** 寝込んでいる住民の合計。 */
  sick: number;
  /** 環境が悪く (リスク 0.2 超)、住民が住んでいる住宅の数。 */
  homesAtRisk: number;
  /** 住民のいる住宅のリスクの平均 (0〜1)。 */
  meanRisk: number;
  /** 汚染や騒音の主な原因 (リスクの内訳の合計)。 */
  causes: { air: number; noise: number; odor: number };
}

export const emptyHealth = (): HealthStats => ({ sick: 0, homesAtRisk: 0, meanRisk: 0, causes: { air: 0, noise: 0, odor: 0 } });

/**
 * 住宅のタイルごとに、工場・発電所の大気汚染、交通量の多い道路と工場の騒音、下水処理場の悪臭を求め、
 * 健康へのリスクと病人の数を cell.env に書き込む。病院 (cared) が近いと病人は減る。
 * cared は呼び出し側 (City の公共サービスの計算) が先に cell.env.cared に入れておく。
 */
export function calcEnvironment(
  zones: ZoneMap,
  graph: RoadGraph,
  facilities: Iterable<Facility>,
  flow: ReadonlyMap<number, number>,
  airMult = 1,
  garbagePenalty: ReadonlyMap<number, number> = new Map(),
): HealthStats {
  const factories: { x: number; y: number; k: number }[] = [];
  for (const c of zones.cells.values()) {
    if (c.zone === ZoneType.Industrial && c.building > 0) {
      const ctr = lotCenter(c);
      factories.push({ x: ctr.x, y: ctr.y, k: c.building * lotArea(c) }); // 広い工場ほど、汚染も騒音も大きい (マス数ぶん)
    }
  }
  const power: { x: number; y: number }[] = [];
  const sewage: { x: number; y: number }[] = [];
  const garbage: { x: number; y: number }[] = [];
  const relief: { x: number; y: number; air: number; noise: number; reach: number }[] = [];
  for (const f of facilities) {
    const ctr = facilityCenter(f);
    if (f.type === FacilityType.Power) power.push(ctr);
    else if (f.type === FacilityType.Sewage) sewage.push(ctr);
    else if (f.type === FacilityType.Garbage) garbage.push(ctr);
    const spec = FACILITY_SPECS[f.type];
    if (spec.relief) relief.push({ x: ctr.x, y: ctr.y, air: spec.relief.air, noise: spec.relief.noise, reach: spec.radius });
  }

  const stats = emptyHealth();
  let homes = 0;
  let riskSum = 0;
  for (const c of zones.cells.values()) {
    const env = c.env;
    if (c.zone !== ZoneType.Residential || c.building === 0) {
      env.air = env.noise = env.odor = env.risk = env.sick = 0;
      continue;
    }
    const ctr = lotCenter(c); // 複数マスの住宅は、敷地の真ん中で測る
    const x = ctr.x;
    const y = ctr.y;
    let air = 0;
    let noise = 0;
    let odor = 0;
    for (const f of factories) {
      const d = Math.hypot(f.x - x, f.y - y);
      air += FACTORY_AIR * f.k * falloff(d, FACTORY_AIR_REACH);
      noise += FACTORY_NOISE * f.k * falloff(d, FACTORY_NOISE_REACH);
    }
    for (const p of power) air += POWER_AIR * falloff(Math.hypot(p.x - x, p.y - y), POWER_AIR_REACH);
    for (const gb of garbage) {
      const d = Math.hypot(gb.x - x, gb.y - y);
      odor += GARBAGE_ODOR * falloff(d, GARBAGE_ODOR_REACH);
      air += GARBAGE_AIR * falloff(d, GARBAGE_AIR_REACH);
    }
    odor += UNCOLLECTED_ODOR * (garbagePenalty.get(c.net) ?? 0); // 処理しきれず、道路にあふれたごみ
    for (const s of sewage) odor += SEWAGE_ODOR * falloff(Math.hypot(s.x - x, s.y - y), SEWAGE_ODOR_REACH);
    const e = graph.nearestEdge(x, y, ROAD_NOISE_REACH);
    if (e) {
      // 車の数が多い道路ほどうるさい (標準の道路の容量で 1)。種類ごとの騒音の強さ (並木道は静か、幹線・高速道路はうるさい) をかける
      const ratio = Math.min(1, (flow.get(e.id) ?? 0) / EDGE_CAPACITY);
      noise += ROAD_NOISE * ROAD_SPECS[e.type].noise * ratio * falloff(graph.distanceToRoad(x, y, ROAD_NOISE_REACH), ROAD_NOISE_REACH);
    }
    // 公園・防音壁がそばにあると、大気汚染と騒音が減る (複数あれば、それぞれの残りをかけ合わせる)
    let airLeft = 1;
    let noiseLeft = 1;
    for (const r of relief) {
      const k = reliefFalloff(Math.hypot(r.x - x, r.y - y), r.reach);
      airLeft *= 1 - r.air * k;
      noiseLeft *= 1 - r.noise * k;
    }
    env.air = Math.min(1, air * airMult * airLeft); // 雨の日は汚れが洗い流されて減る
    env.noise = Math.min(1, noise * noiseLeft);
    env.odor = Math.min(1, odor);
    env.risk = Math.min(1, AIR_WEIGHT * env.air + NOISE_WEIGHT * env.noise + ODOR_WEIGHT * env.odor);
    env.sick = c.residents * sickRateOf(env.risk, env.cared);
    if (c.residents > 0) {
      homes++;
      riskSum += env.risk;
      stats.sick += env.sick;
      if (env.risk > 0.2) stats.homesAtRisk++;
      stats.causes.air += AIR_WEIGHT * env.air;
      stats.causes.noise += NOISE_WEIGHT * env.noise;
      stats.causes.odor += ODOR_WEIGHT * env.odor;
    }
  }
  stats.meanRisk = homes > 0 ? riskSum / homes : 0;
  return stats;
}
