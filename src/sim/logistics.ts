import {
  PRIMARY_MATERIAL,
  PRODUCT_RECIPE,
  type Commodity,
  type PrimaryIndustry,
  type Product,
  type RawMaterial,
} from "./primaryIndustry";

export const RAW_MATERIALS: readonly RawMaterial[] = ["farmOutput", "timber", "ore", "crudeOil"];
export const PRODUCTS: readonly Product[] = ["food", "lumber", "metal", "fuel"];
export const COMMODITIES: readonly Commodity[] = [...RAW_MATERIALS, ...PRODUCTS];

export interface LogisticsInput {
  /** 稼働中の一次産業。output は 1 日あたりの原料生産量。 */
  primary: readonly PrimaryIndustry[];
  /** 工業ゾーンの雇用枠。加工企業の生産能力に変換する。 */
  industrialJobs: number;
  /** 商業ゾーンの雇用枠。店舗の販売能力に変換する。 */
  commercialJobs: number;
  /** 住宅の人口。住民の生活消費に変換する。 */
  population: number;
  /** 外部接続された道路網があるか。なければ輸出入も外部配送もできない。 */
  outsideConnected: boolean;
  /** 倉庫の追加容量。未指定時は産業規模から自動算出する。 */
  warehouseCapacity?: number;
}

export interface CommodityFlow {
  produced: number;
  imported: number;
  exported: number;
  delivered: number;
  consumed: number;
  stored: number;
  shortage: number;
}

export type CommodityFlows = Record<Commodity, CommodityFlow>;

export interface LogisticsStats {
  /** 企業数（一次産業 + 加工企業 + 商業企業）。 */
  enterprises: { primary: number; manufacturing: number; commercial: number; total: number };
  /** 実際に物量を処理できた雇用数。元のゾーン雇用枠とは分けて表示する。 */
  employment: { primary: number; manufacturing: number; commercial: number; total: number };
  warehouse: { capacity: number; used: number; utilization: number };
  flows: CommodityFlows;
  /** 原料から製品を作った数量。 */
  manufactured: number;
  /** 倉庫から店舗・住民へ届けた数量。 */
  deliveries: number;
  /** 店舗と住民が消費できた数量。 */
  consumption: number;
  /** 物流会計（ゲーム内の円。市の予算とは別の産業収支）。 */
  revenue: number;
  costs: number;
  balance: number;
  /** 原料・製品の不足数量。 */
  shortage: number;
  /** 接続がないため搬出できず、倉庫に入らなかった原料。 */
  stranded: number;
}

const emptyFlow = (): CommodityFlow => ({ produced: 0, imported: 0, exported: 0, delivered: 0, consumed: 0, stored: 0, shortage: 0 });

function emptyFlows(): CommodityFlows {
  return Object.fromEntries(COMMODITIES.map((kind) => [kind, emptyFlow()])) as CommodityFlows;
}

function nonNegative(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

/** 産業規模から、倉庫の標準容量を求める。原料 1 企業 40、工業雇用 2 人につき 1。 */
export function warehouseCapacityOf(primaryCount: number, industrialJobs: number): number {
  return nonNegative(primaryCount) * 40 + Math.floor(nonNegative(industrialJobs) / 2);
}

/**
 * 一次産業 → 倉庫 → 加工企業 → 店舗・住民という 1 日分の物流を計算する。
 * 乱数・現在時刻・オブジェクトの挿入順に依存しないため、同じ入力は必ず同じ収支になる。
 */
export function simulateLogistics(input: LogisticsInput): LogisticsStats {
  const primary = input.primary;
  const industrialJobs = nonNegative(input.industrialJobs);
  const commercialJobs = nonNegative(input.commercialJobs);
  const population = nonNegative(input.population);
  const flows = emptyFlows();

  for (const industry of primary) {
    const amount = nonNegative(industry.output);
    const material = PRIMARY_MATERIAL[industry.type];
    flows[material].produced += amount;
  }

  const capacity = input.warehouseCapacity === undefined
    ? warehouseCapacityOf(primary.length, industrialJobs)
    : nonNegative(input.warehouseCapacity);
  let stored = 0;
  let stranded = 0;
  const availableRaw = new Map<RawMaterial, number>();
  for (const material of RAW_MATERIALS) {
    const amount = flows[material].produced;
    const accepted = Math.min(amount, Math.max(0, capacity - stored));
    flows[material].stored = accepted;
    availableRaw.set(material, accepted);
    stored += accepted;
    stranded += amount - accepted;
    if (input.outsideConnected && amount - accepted > 0) {
      flows[material].exported += amount - accepted;
      stranded -= amount - accepted;
    }
  }

  // 工場は雇用 1 人につき 1 製品/日まで。原料不足時は、在庫のある品目から順に稼働する。
  let manufacturingCapacity = industrialJobs;
  let manufactured = 0;
  for (const product of PRODUCTS) {
    const recipe = PRODUCT_RECIPE[product];
    const raw = availableRaw.get(recipe.input) ?? 0;
    const possible = Math.min(Math.floor(raw / recipe.inputPerProduct), manufacturingCapacity);
    const produced = nonNegative(possible);
    const used = produced * recipe.inputPerProduct;
    availableRaw.set(recipe.input, raw - used);
    flows[recipe.input].stored = raw - used;
    flows[product].produced = produced;
    flows[product].stored = produced;
    manufacturingCapacity -= produced;
    manufactured += produced;
  }

  // 加工用原料の残りは倉庫在庫。余剰は外部接続があるときだけ輸出する。
  for (const material of RAW_MATERIALS) {
    const remaining = availableRaw.get(material) ?? 0;
    flows[material].stored = remaining;
    if (input.outsideConnected && remaining > 0) {
      flows[material].exported += remaining;
      flows[material].stored = 0;
    }
  }

  const shopDemand = Math.floor(commercialJobs * 0.5);
  const residentDemand = Math.floor(population * 0.2);
  const consumptionDemand = shopDemand + residentDemand;
  let consumption = 0;
  let deliveries = 0;
  for (const product of PRODUCTS) {
    const stock = flows[product].stored;
    const delivered = Math.min(stock, Math.max(0, consumptionDemand - deliveries));
    flows[product].delivered = delivered;
    flows[product].consumed = delivered;
    flows[product].stored = stock - delivered;
    deliveries += delivered;
    consumption += delivered;
  }

  // 製品不足は輸入で補う。外部接続がなければ住民・店舗に届かない。
  const shortage = Math.max(0, consumptionDemand - consumption);
  if (input.outsideConnected && shortage > 0) {
    let remaining = shortage;
    for (const product of PRODUCTS) {
      const need = Math.min(remaining, Math.max(0, consumptionDemand - (flows[product].consumed ?? 0)));
      flows[product].imported = need;
      flows[product].delivered += need;
      flows[product].consumed += need;
      remaining -= need;
      if (remaining === 0) break;
    }
    consumption += shortage;
  } else {
    for (const product of PRODUCTS) flows[product].shortage = Math.max(0, Math.floor(consumptionDemand / PRODUCTS.length) - flows[product].consumed);
  }

  const totalUsed = [...RAW_MATERIALS, ...PRODUCTS].reduce((sum, kind) => sum + flows[kind].stored, 0);
  const imported = PRODUCTS.reduce((sum, kind) => sum + flows[kind].imported, 0);
  const exported = COMMODITIES.reduce((sum, kind) => sum + flows[kind].exported, 0);
  const activeManufacturing = manufactured;
  const activeCommercial = Math.min(commercialJobs, consumption * 2);
  const revenue = consumption * 2_000 + exported * 300;
  const costs = manufactured * 700 + deliveries * 120 + imported * 1_000;
  const primaryWorkers = primary.reduce((sum, industry) => sum + nonNegative(industry.workers), 0);
  const primaryEnterprises = primary.length;
  const manufacturingEnterprises = industrialJobs > 0 ? Math.max(1, Math.ceil(industrialJobs / 20)) : 0;
  const commercialEnterprises = commercialJobs > 0 ? Math.max(1, Math.ceil(commercialJobs / 12)) : 0;
  const shortageTotal = input.outsideConnected ? 0 : shortage;

  return {
    enterprises: { primary: primaryEnterprises, manufacturing: manufacturingEnterprises, commercial: commercialEnterprises, total: primaryEnterprises + manufacturingEnterprises + commercialEnterprises },
    employment: { primary: primaryWorkers, manufacturing: activeManufacturing, commercial: activeCommercial, total: primaryWorkers + activeManufacturing + activeCommercial },
    warehouse: { capacity, used: totalUsed, utilization: capacity > 0 ? totalUsed / capacity : 0 },
    flows,
    manufactured,
    deliveries,
    consumption,
    revenue,
    costs,
    balance: revenue - costs,
    shortage: shortageTotal,
    stranded,
  };
}
