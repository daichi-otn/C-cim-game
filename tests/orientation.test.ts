import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { frontRotation, ORIENT_STEP } from "../src/render3d/orientation";
import { RotatedSink, rotateXZ, type Sink } from "../src/render3d/rotatedGeo";
import { ZoneType, cleanEnv, type ZoneCell } from "../src/sim/zoning";
import { findLand, setup } from "./helpers";

function cell(x: number, y: number, w = 2, h = 2): ZoneCell {
  return { x, y, zone: ZoneType.Residential, building: 2, residents: 0, served: true, net: 1, roadCap: 200, density: 2, w, h, env: cleanEnv(), built: 0, aging: 1 };
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("建物の回転", () => {
  it("回すと、点は敷地の中心のまわりを回る", () => {
    const [x, z] = rotateXZ(Math.PI / 2, 3, 1, 1, 1);
    expect(close(x, 1)).toBe(true);
    expect(close(z, 3)).toBe(true);
    const [x2, z2] = rotateXZ(Math.PI, 3, 1, 1, 1);
    expect(close(x2, -1)).toBe(true);
    expect(close(z2, 1)).toBe(true);
  });

  it("任意の角度で回しても、回した箱の面は外を向く (裏返らない)", () => {
    const faces: { pts: { x: number; y: number; z: number }[] }[] = [];
    const sink: Sink = {
      poly: (pts) => faces.push({ pts }),
      rect: () => {},
      strip: () => {},
      disc: () => {},
      box: () => {},
      frustum: () => {},
      ball: () => {},
    };
    const cx = 10;
    const cz = 10;
    for (const theta of [0, ORIENT_STEP * 3, Math.PI / 2, Math.PI, -ORIENT_STEP * 5]) {
      faces.length = 0;
      new RotatedSink(sink, theta, cx, cz).box(8, 8, 4, 4, 0, 6, 0xffffff, 0xffffff);
      for (const f of faces.slice(0, 4)) {
        const [a, b, c] = f.pts as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }];
        const n = [(b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z), (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)];
        const mx = f.pts.reduce((s, p) => s + p.x, 0) / f.pts.length - cx;
        const mz = f.pts.reduce((s, p) => s + p.z, 0) / f.pts.length - cz;
        expect(n[0]! * mx + n[2]! * mz).toBeGreaterThan(0);
      }
    }
  });
});

describe("建物の向き (目の前の道路に向く)", () => {
  it("道路の北側の建物は、出入口 (南) が道路の方を向く。南側は北を向く", () => {
    const { city } = setup();
    const [x0] = findLand();
    const roadY = city.graph.nodes.values().next().value!.y;
    expect(close(frontRotation(city.graph, cell(x0 + 5, Math.floor(roadY) - 4)), 0)).toBe(true);
    expect(close(Math.abs(frontRotation(city.graph, cell(x0 + 5, Math.floor(roadY) + 2))), Math.PI)).toBe(true);
  });

  it("斜めの道路の横の建物は、90 度ごとに揃って、道路の方を向く (斜めに回して角がはみ出さない)", () => {
    const city = new City(12345);
    const [x0, y0] = findLand();
    city.buildRoad(x0 + 0.5, y0 + 0.5, x0 + 30.5, y0 + 30.5);
    // 道路 (斜め) のすぐ横 (北東側)
    const c = cell(x0 + 20, y0 + 17);
    const r = frontRotation(city.graph, c);
    expect(close(r % (Math.PI / 2), 0)).toBe(true); // 90 度の倍数
    expect(Math.abs(r / ORIENT_STEP - Math.round(r / ORIENT_STEP))).toBeLessThan(1e-6);
  });

  it("道路から遠い建物は、向きを変えない", () => {
    const { city } = setup();
    const [x0] = findLand();
    expect(frontRotation(city.graph, cell(x0 + 60, 3))).toBe(0);
  });

  it("四角でない敷地は、0 度か 180 度だけ", () => {
    const { city } = setup();
    const [x0] = findLand();
    const r = frontRotation(city.graph, cell(x0 + 5, 3, 3, 2));
    expect(close(r % Math.PI, 0)).toBe(true);
  });
});
