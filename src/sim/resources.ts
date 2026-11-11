import { hash2 } from "./rng";
import { Tile, tileAt } from "./terrain";

export type ResourceType = "farmland" | "forest" | "ore" | "oil" | "none";
export const RESOURCE_NAMES: Record<ResourceType, string> = { farmland: "農地", forest: "森林", ore: "鉱石", oil: "石油", none: "なし" };
export const PARCEL_SIZE = 16;
export const PARCEL_COST = 10_000_000;

/** 地形とシードから資源を決める。保存せず、同じマップならいつでも同じになる。 */
export function resourceAt(seed: number, x: number, y: number): ResourceType {
  const tile = tileAt(seed, x, y);
  if (tile === Tile.Water || tile === Tile.Sand || tile === Tile.Mountain) return tile === Tile.Mountain && hash2(seed ^ 0x31a7, x, y) > 0.55 ? "ore" : "none";
  const n = hash2(seed ^ 0x7f4a, Math.floor(x / 4), Math.floor(y / 4));
  if (tile === Tile.Forest) return n > 0.18 ? "forest" : "ore";
  if (n > 0.96) return "oil";
  if (n > 0.72) return "farmland";
  return "none";
}

export function resourceSummary(seed: number, parcels: Iterable<string>): Record<ResourceType, number> {
  const result: Record<ResourceType, number> = { farmland: 0, forest: 0, ore: 0, oil: 0, none: 0 };
  for (const key of parcels) {
    const parts = key.split(",").map(Number);
    const x = parts[0] ?? 0;
    const y = parts[1] ?? 0;
    for (let dy = 0; dy < PARCEL_SIZE; dy += 2) for (let dx = 0; dx < PARCEL_SIZE; dx += 2) result[resourceAt(seed, x + dx, y + dy)]++;
  }
  return result;
}
