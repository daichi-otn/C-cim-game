import { describe, expect, it } from "vitest";
import { FLOOR_PX, GLASS_FLOOR_PX, residentialFloors, wallHeight } from "../src/render3d/buildingShape";
import { windows3D } from "../src/render3d/windows3d";
import { ZoneType, cleanEnv, type Density, type ZoneCell } from "../src/sim/zoning";

function cell(density: Density, w: number, h: number, building: number, x = 3, y = 4): ZoneCell {
  return { x, y, zone: ZoneType.Residential, building, residents: 0, served: true, net: 1, roadCap: 200, density, w, h, env: cleanEnv(), built: 0, aging: 1 };
}

/** 南の面の窓が、何段に並んでいるか (高さの違う段の数)。 */
function windowRows(c: ZoneCell): number {
  const ys = new Set<number>();
  for (const w of windows3D(c)) {
    if (w.face !== "s") continue;
    ys.add(Math.round(Math.min(...w.pts.map((p) => p.y)) * 10) / 10);
  }
  return ys.size;
}

const samples = (density: Density, w: number, h: number) => Array.from({ length: 40 }, (_, i) => cell(density, w, h, 1, 3 + i, 4 + i * 2));

describe("住宅の階数 (密度で決まる)", () => {
  it("低密度は一軒家で、1 階建て", () => {
    for (const c of samples(1, 1, 1)) expect(residentialFloors(c)).toBe(1);
  });

  it("中密度は 3 階建て以上", () => {
    for (const c of samples(2, 2, 2)) expect(residentialFloors(c)).toBeGreaterThanOrEqual(3);
  });

  it("高密度は 15 階建て以上", () => {
    for (const c of samples(3, 3, 3)) expect(residentialFloors(c)).toBeGreaterThanOrEqual(15);
    for (const c of samples(3, 4, 3)) expect(residentialFloors(c)).toBeGreaterThanOrEqual(15);
  });

  it("壁の高さは、階数の高さの合計になる (中密度は 3 階ぶん以上、高密度は 15 階ぶん以上)", () => {
    for (const c of samples(2, 2, 2)) expect(wallHeight(c)).toBeGreaterThanOrEqual(residentialFloors(c) * FLOOR_PX);
    for (const c of samples(3, 3, 3)) expect(wallHeight(c)).toBeGreaterThanOrEqual(residentialFloors(c) * GLASS_FLOOR_PX);
  });

  it("窓の段の数は、階数と同じになる (中密度・高密度)", () => {
    const mid = cell(2, 2, 2, 1);
    expect(windowRows(mid)).toBe(residentialFloors(mid));
    const tall = cell(3, 3, 3, 1);
    expect(windowRows(tall)).toBe(residentialFloors(tall));
  });

  it("昔の区画 (密度 0) でも、1 階建てか、中密度並みの階数になる", () => {
    for (const c of samples(0, 1, 1)) {
      const f = residentialFloors(c);
      expect(f === 1 || f >= 3).toBe(true);
    }
  });
});
