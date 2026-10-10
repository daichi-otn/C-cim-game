import { City } from "../src/sim/city";
import { FacilityType, type Service } from "../src/sim/facilities";
import { isBuildableTile } from "../src/sim/roadPlacement";
import { tileAt } from "../src/sim/terrain";
import { ZoneType } from "../src/sim/zoning";

export const SEED = 12345;

/** 全タイルが陸地の 40×9 の区画の左上 (x, y) を探す。 */
export function findLand(): [number, number] {
  for (let y = -300; y < 300; y += 3) {
    for (let x = -300; x < 300; x += 3) {
      let ok = true;
      for (let dy = 0; dy < 9 && ok; dy++) for (let dx = 0; dx < 40 && ok; dx++) ok = isBuildableTile(tileAt(SEED, x + dx, y + dy));
      if (ok) return [x, y];
    }
  }
  throw new Error("land not found");
}

/** 検証を飛ばして施設を置く (水辺でなくても給水ポンプ場を置ける)。街の成長だけを調べるテスト用。番号は City の採番を使う。
 * 大きさ (size) は、テストの置き場 (facilitySlots は 2×2 ずつ) に合わせて、既定は 2。 */
export function forceFacility(city: City, type: FacilityType, x: number, y: number, size = 2): void {
  const counter = city as unknown as { nextFacilityId: number };
  const id = counter.nextFacilityId++;
  city.facilities.set(id, { id, type, size, x, y });
  city.facilitiesVersion++;
}

/** 施設を置ける場所の候補 (道路の両側で、ゾーンを塗らない場所)。 */
export function facilitySlots(x0: number, roadY: number): [number, number][] {
  const slots: [number, number][] = [];
  for (let c = 14; c <= 24; c += 2) slots.push([x0 + c, roadY + 1]); // 道路の南、住宅と工業の間
  for (let c = 1; c <= 11; c += 2) slots.push([x0 + c, roadY - 2]); // 道路の北、商業の西
  for (let c = 27; c <= 37; c += 2) slots.push([x0 + c, roadY - 2]); // 道路の北、商業の東
  return slots;
}

/** 施設の数 (種類ごと)。標準は、住宅・商業・工業を満たしても余裕がある数。 */
export const ALL_SERVICES: Partial<Record<Service, number>> = { power: 4, water: 3, sewage: 3 };
export const SERVICE_TYPE: Record<Service, FacilityType> = {
  power: FacilityType.Power,
  water: FacilityType.Water,
  sewage: FacilityType.Sewage,
};

/** 道路を 1 本敷き、その両側に住宅・商業・工業を塗り、指定した数の電力・水道・下水の施設と、外部接続 (outside) を置いた街。 */
export function setup(
  zoneRows = { r: true, c: true, i: true },
  facilities: Partial<Record<Service, number>> = ALL_SERVICES,
  outside = true,
) {
  const [x0, y0] = findLand();
  const city = new City(SEED);
  const roadY = y0 + 4;
  city.buildRoad(x0 + 0.5, roadY + 0.5, x0 + 39.5, roadY + 0.5);
  const { graph, zones } = city;
  if (zoneRows.r) zones.paintRect(graph, { x0: x0 + 1, y0: roadY + 1, x1: x0 + 12, y1: roadY + 3 }, ZoneType.Residential);
  if (zoneRows.c) zones.paintRect(graph, { x0: x0 + 14, y0: roadY - 3, x1: x0 + 25, y1: roadY - 1 }, ZoneType.Commercial);
  if (zoneRows.i) zones.paintRect(graph, { x0: x0 + 27, y0: roadY + 1, x1: x0 + 38, y1: roadY + 3 }, ZoneType.Industrial);
  const slots = facilitySlots(x0, roadY);
  for (const k of ["power", "water", "sewage"] as const) {
    for (let n = 0; n < (facilities[k] ?? 0); n++) {
      const [fx, fy] = slots.shift()!;
      forceFacility(city, SERVICE_TYPE[k], fx, fy);
    }
  }
  if (outside) forceFacility(city, FacilityType.Outside, x0 + 26, roadY - 2); // 道路の北、商業と工業の間
  return { city, x0, y0, roadY };
}

/** 建物をすべて新築にする (老朽化の影響を受けない)。日付を進めて、建物の数や使用量を見るテストで使う。 */
export function renewAll(city: City): void {
  for (const c of city.zones.cells.values()) {
    if (c.building === 0) continue;
    c.built = city.day;
    c.aging = 1;
  }
}
