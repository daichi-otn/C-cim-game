import { describe, expect, it } from "vitest";
import { baseRect, flatsStyle, wallHeight } from "../src/render3d/buildingShape";
import { windows3D } from "../src/render3d/windows3d";
import { ZoneType, cleanEnv, type Density, type ZoneCell } from "../src/sim/zoning";

function cell(zone: ZoneType, density: Density, building: number, w = 1, h = 1, x = 3, y = 4): ZoneCell {
  return { x, y, zone, building, residents: 0, served: true, net: 1, roadCap: 100, density, w, h, env: cleanEnv(), built: 0, aging: 1 };
}
const R = ZoneType.Residential;
const O = ZoneType.Office;
const I = ZoneType.Industrial;

describe("3D の窓", () => {
  it("東西南北の 4 面すべてに窓がある", () => {
    const ws = windows3D(cell(R, 2, 2, 2, 2));
    for (const f of ["s", "e", "n", "w"] as const) expect(ws.some((w) => w.face === f)).toBe(true);
  });

  it("窓は壁の外側に少しだけ出ていて、壁の高さの内側にある", () => {
    const c = cell(O, 3, 3, 3, 3);
    const b = baseRect(c);
    const d = wallHeight(c);
    for (const w of windows3D(c)) {
      expect(w.pts).toHaveLength(4);
      for (const p of w.pts) {
        expect(p.y).toBeGreaterThan(0.5);
        expect(p.y).toBeLessThan(d);
        expect(p.x).toBeGreaterThanOrEqual(b.x - 0.1);
        expect(p.x).toBeLessThanOrEqual(b.x + b.w + 0.1);
        expect(p.z).toBeGreaterThanOrEqual(b.y - 0.1);
        expect(p.z).toBeLessThanOrEqual(b.y + b.h + 0.1);
      }
      // 面ごとに、壁より外側にある
      if (w.face === "s") for (const p of w.pts) expect(p.z).toBeGreaterThan(b.y + b.h);
      if (w.face === "n") for (const p of w.pts) expect(p.z).toBeLessThan(b.y);
      if (w.face === "e") for (const p of w.pts) expect(p.x).toBeGreaterThan(b.x + b.w);
      if (w.face === "w") for (const p of w.pts) expect(p.x).toBeLessThan(b.x);
    }
  });

  it("高い建物ほど窓が多く、同じ建物なら毎回同じ並び・同じ灯り", () => {
    const low = windows3D(cell(R, 1, 1));
    const tall = windows3D(cell(O, 3, 3, 3, 3));
    expect(tall.length).toBeGreaterThan(low.length * 4);
    expect(windows3D(cell(O, 3, 3, 3, 3)).map((w) => w.lit)).toEqual(tall.map((w) => w.lit));
  });

  it("住宅の地上階の南の壁には、出入口の分の空きがある", () => {
    const c = cell(R, 2, 2, 2, 2);
    const flats = flatsStyle(c);
    expect(flats).toBeDefined();
    const groundSouth = windows3D(c).filter((w) => w.face === "s" && w.pts[0]!.y < 3);
    const firstFloorAll = windows3D(c).filter((w) => w.face === "n" && w.pts[0]!.y < 3);
    expect(groundSouth.length).toBeLessThan(firstFloorAll.length); // 北の壁には出入口がない
  });

  it("灯っている窓の割合は、工場 < 住宅 < オフィス", () => {
    const rate = (z: ZoneType, d: Density, b: number) => {
      let lit = 0;
      let n = 0;
      for (let x = 0; x < 30; x++) for (const w of windows3D(cell(z, d, b, 2, 2, x, 7))) (n++, w.lit && lit++);
      return lit / n;
    };
    expect(rate(I, 2, 2)).toBeLessThan(rate(R, 2, 2));
    expect(rate(R, 2, 2)).toBeLessThan(rate(O, 2, 2));
  });

  it("段のある集合住宅は、上の壁の窓が、下の壁より奥にある", () => {
    let c: ZoneCell | undefined;
    for (let x = 0; x < 80 && !c; x++) {
      const t = cell(R, 2, 2, 3, 2, x, 5);
      if (flatsStyle(t) === "stepped") c = t;
    }
    expect(c).toBeDefined();
    const b = baseRect(c!);
    const south = windows3D(c!).filter((w) => w.face === "s");
    const planes = new Set(south.map((w) => Math.round(w.pts[0]!.z * 10)));
    expect(planes.size).toBe(2); // 下の壁と上の壁の 2 つの面
    expect(Math.max(...south.map((w) => w.pts[0]!.z))).toBeCloseTo(b.y + b.h + 0.07, 3);
  });
});
