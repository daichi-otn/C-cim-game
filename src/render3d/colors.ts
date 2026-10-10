import { ZoneType } from "../sim/zoning";

/** ゾーンの種類ごとの色 (ツールバー・塗り範囲のプレビュー・未開発の区画の地面)。 */
export const ZONE_COLORS: Record<number, number> = {
  [ZoneType.Residential]: 0x5ec27a,
  [ZoneType.Commercial]: 0x4a90e2,
  [ZoneType.Industrial]: 0xe0b43a,
  [ZoneType.Office]: 0xb98be0,
};
