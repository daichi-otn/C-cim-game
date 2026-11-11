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
