export type PrimaryIndustryType = "farm" | "forestry" | "mine" | "oil";
export interface PrimaryIndustry { id: number; type: PrimaryIndustryType; x: number; y: number; workers: number; output: number; }
export const PRIMARY_NAMES: Record<PrimaryIndustryType, string> = { farm: "農場", forestry: "林業所", mine: "鉱山", oil: "油田" };
export const PRIMARY_RESOURCE: Record<PrimaryIndustryType, "farmland" | "forest" | "ore" | "oil"> = { farm: "farmland", forestry: "forest", mine: "ore", oil: "oil" };
export function primaryOutput(workers: number): number { return Math.max(0, Math.round(workers * 10)); }
/** 生産物の搬出・加工量。外部接続へ出られない産業は搬出できない。加工は搬出量の65%が製品になる。 */
export function industryFlow(output: number, connected: boolean): { shipped: number; processed: number } {
  const shipped = connected ? Math.max(0, Math.round(output)) : 0;
  return { shipped, processed: Math.round(shipped * 0.65) };
}

/**
 * M21 の物流で扱う品目。raw は一次産業の原料、product は工場で加工した製品。
 * 農林水産業の「水産」は、現在の一次産業の種類を増やさず、農産物の一部として扱う。
 */
export type RawMaterial = "farmOutput" | "timber" | "ore" | "crudeOil";
export type Product = "food" | "lumber" | "metal" | "fuel";
export type Commodity = RawMaterial | Product;

export const PRIMARY_MATERIAL: Record<PrimaryIndustryType, RawMaterial> = {
  farm: "farmOutput",
  forestry: "timber",
  mine: "ore",
  oil: "crudeOil",
};

export const PRODUCT_NAMES: Record<Product, string> = {
  food: "食品",
  lumber: "木材製品",
  metal: "金属製品",
  fuel: "燃料",
};

export const RAW_MATERIAL_NAMES: Record<RawMaterial, string> = {
  farmOutput: "農林水産原料",
  timber: "木材原料",
  ore: "鉱石原料",
  crudeOil: "原油",
};

export const PRODUCT_RECIPE: Record<Product, { input: RawMaterial; inputPerProduct: number }> = {
  food: { input: "farmOutput", inputPerProduct: 2 },
  lumber: { input: "timber", inputPerProduct: 2 },
  metal: { input: "ore", inputPerProduct: 2 },
  fuel: { input: "crudeOil", inputPerProduct: 2 },
};
