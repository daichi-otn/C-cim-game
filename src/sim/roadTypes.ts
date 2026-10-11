/** 道路の種類。番号は保存データにそのまま書くので、並びを変えない (追加は末尾)。 */
export const enum RoadType {
  Lane = 1,
  Street = 2,
  TreeStreet = 3,
  Avenue = 4,
  TreeAvenue = 5,
  Industrial = 6,
  Arterial = 7,
  Highway = 8,
  Footpath = 9,
  Alley = 10,
}

export interface RoadSpec {
  name: string;
  /** 1 タイル (約 10m) あたりの建設費と、毎月の維持費 (円)。 */
  cost: number;
  upkeep: number;
  /** 1 日にさばける車の数。0 は車が通れない (歩行者専用)。 */
  capacity: number;
  /** 車の走りやすさ。1 が標準で、大きいほど経路に選ばれやすい (混雑がなければ、距離を速さで割った長さで経路を選ぶ)。 */
  speed: number;
  /** 騒音の強さ (標準の道路を 1 とする)。交通量が多いほど大きく響く。 */
  noise: number;
  /** 建物の出入口になれるか。高速道路は出入口にならない (近くに建物を建てるための道路としては使えない)。 */
  access: boolean;
  /** 一言の説明 (ツールの案内に出す)。 */
  note: string;
}

export const ROAD_SPECS: Record<RoadType, RoadSpec> = {
  [RoadType.Lane]: { name: "細道", cost: 300_000, upkeep: 2_500, capacity: 40, speed: 0.7, noise: 0.5, access: true, note: "安いが容量が小さい。静か" },
  [RoadType.Street]: { name: "通り", cost: 600_000, upkeep: 5_000, capacity: 100, speed: 1, noise: 1, access: true, note: "標準の道路" },
  [RoadType.TreeStreet]: { name: "並木道", cost: 900_000, upkeep: 8_000, capacity: 100, speed: 1, noise: 0.7, access: true, note: "通りに並木。騒音が少ない" },
  [RoadType.Avenue]: { name: "大通り", cost: 1_200_000, upkeep: 10_000, capacity: 220, speed: 1.2, noise: 1.3, access: true, note: "車線が多く、たくさん流せる" },
  [RoadType.TreeAvenue]: { name: "並木の大通り", cost: 1_800_000, upkeep: 14_000, capacity: 220, speed: 1.2, noise: 0.9, access: true, note: "大通りに中央分離帯と並木" },
  [RoadType.Industrial]: { name: "産業道路", cost: 900_000, upkeep: 7_000, capacity: 180, speed: 1.1, noise: 1.5, access: true, note: "大型車向け。うるさい" },
  [RoadType.Arterial]: { name: "幹線道路", cost: 2_000_000, upkeep: 15_000, capacity: 760, speed: 1.5, noise: 1.6, access: true, note: "街の主軸。速くて大容量" },
  [RoadType.Highway]: { name: "高速道路", cost: 4_000_000, upkeep: 30_000, capacity: 1600, speed: 2.2, noise: 2, access: false, note: "最速・最大容量。沿道の建物は出入口に使えない" },
  [RoadType.Footpath]: { name: "歩行者道", cost: 120_000, upkeep: 1_000, capacity: 0, speed: 1, noise: 0, access: true, note: "車は通れない。建物の出入口にはなる" },
  [RoadType.Alley]: { name: "石畳の路地", cost: 450_000, upkeep: 3_500, capacity: 25, speed: 0.55, noise: 0.35, access: true, note: "とても静かだが、ほとんど流せない" },
};

export const ROAD_TYPES: readonly RoadType[] = [
  RoadType.Lane, RoadType.Street, RoadType.TreeStreet, RoadType.Avenue, RoadType.TreeAvenue,
  RoadType.Industrial, RoadType.Arterial, RoadType.Highway, RoadType.Footpath, RoadType.Alley,
];

/** 一方通行の道路の容量は、同じ種類の両方向の道路の何倍か。車線が片側だけになるぶん小さいが、対向車がなく流れが良いので、速さは少し上がる。 */
export const ONE_WAY_CAPACITY = 0.75;
export const ONE_WAY_SPEED = 1.1;

/** 道路の実際の容量 (一方通行なら減る)。 */
/** 道路の車線の種類 (ビットの組み合わせ)。 */
export const LANE = { Median: 1, Parking: 2, Bus: 4, Bike: 8 } as const;
export const LANE_NAMES: Record<number, string> = { [LANE.Median]: "中央分離帯", [LANE.Parking]: "路上駐車レーン", [LANE.Bus]: "バス専用レーン", [LANE.Bike]: "自転車レーン" };

/** 車線の種類ごとの、容量と速さの倍率。中央分離帯は、向かい合う車を分けて流れを良くする。駐車・バス・自転車は、車線を一部使うので、車の流れは少し落ちる。 */
const LANE_CAPACITY: Record<number, number> = { [LANE.Median]: 1.1, [LANE.Parking]: 0.85, [LANE.Bus]: 0.9, [LANE.Bike]: 0.95 };
const LANE_SPEED: Record<number, number> = { [LANE.Median]: 1.05, [LANE.Parking]: 0.85, [LANE.Bus]: 0.95, [LANE.Bike]: 0.97 };

const laneMult = (table: Record<number, number>, lanes: number) => Object.entries(table).reduce((m, [bit, v]) => (lanes & Number(bit) ? m * v : m), 1);

/** 車線の数の既定値 (道路の種類の表の容量・建設費は、この車線数のもの)。 */
export const DEFAULT_LANE_COUNT = 2;
export const MIN_LANE_COUNT = 2;
export const MAX_LANE_COUNT = 20;

/** 車線の数に応じた、容量と建設費の倍率 (既定の 2 車線が 1 倍)。 */
export const laneCountMult = (laneCount: number) => laneCount / DEFAULT_LANE_COUNT;

export const roadCapacity = (type: RoadType, oneWay: boolean, lanes = 0, laneCount = DEFAULT_LANE_COUNT) =>
  Math.round(ROAD_SPECS[type].capacity * (oneWay ? ONE_WAY_CAPACITY : 1) * laneMult(LANE_CAPACITY, lanes) * laneCountMult(laneCount));
export const roadSpeed = (type: RoadType, oneWay: boolean, lanes = 0) => ROAD_SPECS[type].speed * (oneWay ? ONE_WAY_SPEED : 1) * laneMult(LANE_SPEED, lanes);

export const DEFAULT_ROAD_TYPE = RoadType.Street;

export const isRoadType = (v: unknown): v is RoadType => typeof v === "number" && v in ROAD_SPECS;

/** 道路のうち、車が走れる種類か。 */
export const carsCanUse = (t: RoadType) => ROAD_SPECS[t].capacity > 0;
