export type MapSize = "small" | "medium" | "large";
export const MAP_SIZE_NAMES: Record<MapSize, string> = { small: "小", medium: "中", large: "大" };
/** 中心からの拡張可能範囲 (タイル)。既存の地形生成は無限のまま、街の所有・拡張範囲を制限する。 */
export const MAP_SIZE_LIMITS: Record<MapSize, number> = { small: 64, medium: 128, large: 256 };
export function isInMap(size: MapSize, x: number, y: number): boolean {
  const limit = MAP_SIZE_LIMITS[size];
  return Math.abs(x) <= limit && Math.abs(y) <= limit;
}
