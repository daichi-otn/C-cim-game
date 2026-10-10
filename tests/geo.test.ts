import { describe, expect, it } from "vitest";
import { GeoBuilder, ribbon, shade, wall } from "../src/render3d/geo";

describe("メッシュの部品 (GeoBuilder)", () => {
  it("何も足していなければ空で、build は null", () => {
    const g = new GeoBuilder();
    expect(g.isEmpty).toBe(true);
    expect(g.build()).toBeNull();
  });

  it("水平な長方形は、頂点 4・三角形 2 で、法線は上向き", () => {
    const g = new GeoBuilder();
    g.rect(0, 0, 10, 20, 1, 0x808080);
    expect(g.vertexCount).toBe(4);
    const geo = g.build()!;
    expect(geo.getIndex()!.count).toBe(6);
    const n = geo.getAttribute("normal");
    for (let i = 0; i < 4; i++) {
      expect(n.getY(i)).toBeCloseTo(1);
      expect(Math.abs(n.getX(i)) + Math.abs(n.getZ(i))).toBeCloseTo(0);
    }
  });

  it("向きの逆の並びで渡した水平面も、法線は上向きになる (upward)", () => {
    const g = new GeoBuilder();
    g.poly([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }, { x: 5, y: 0, z: 0 }], 0xffffff, true);
    const n = g.build()!.getAttribute("normal");
    expect(n.getY(0)).toBeCloseTo(1);
  });

  it("箱は、壁 4 枚 + 屋根 1 枚 (頂点 20) で、壁の法線は外向き (南 +z、東 +x、北 −z、西 −x)", () => {
    const g = new GeoBuilder();
    g.box(0, 0, 10, 10, 0, 5, 0xcccccc, 0xffffff);
    expect(g.vertexCount).toBe(20);
    const n = g.build()!.getAttribute("normal");
    const faces = [0, 4, 8, 12].map((i) => [n.getX(i), n.getY(i), n.getZ(i)]);
    expect(faces[0]![2]).toBeCloseTo(1); // 南
    expect(faces[1]![0]).toBeCloseTo(1); // 東
    expect(faces[2]![2]).toBeCloseTo(-1); // 北
    expect(faces[3]![0]).toBeCloseTo(-1); // 西
    expect(n.getY(16)).toBeCloseTo(1); // 屋根は上
  });

  it("色は 0xRRGGBB で渡すと、頂点の色になる", () => {
    const g = new GeoBuilder();
    g.rect(0, 0, 1, 1, 0, 0xffffff);
    const c = g.build()!.getAttribute("color");
    expect(c.getX(0)).toBeCloseTo(1);
    expect(c.getY(0)).toBeCloseTo(1);
    const h = new GeoBuilder();
    h.rect(0, 0, 1, 1, 0, 0x000000);
    expect(h.build()!.getAttribute("color").getX(0)).toBe(0);
  });

  it("円板・円柱・球は、頂点が作られ、頂点が 65535 を超えなければ 16 ビットの索引になる", () => {
    const g = new GeoBuilder();
    g.disc(0, 0, 5, 0, 0xff0000, 10);
    expect(g.vertexCount).toBe(10);
    const h = new GeoBuilder();
    h.frustum(0, 0, 3, 2, 0, 8, 0x888888);
    h.ball(0, 10, 0, 2, 0x00ff00);
    expect(h.vertexCount).toBeGreaterThan(40);
    expect(h.build()!.getIndex()!.array).toBeInstanceOf(Uint16Array);
  });

  it("帯 (strip) は、長さ 0 なら何も足さない。ribbon は両端の高さを変えられる", () => {
    const g = new GeoBuilder();
    g.strip(1, 1, 1, 1, 4, 0, 0xffffff);
    expect(g.isEmpty).toBe(true);
    ribbon(g, 0, 0, 0, 10, 0, 5, 2, 0xffffff);
    const pos = g.build()!.getAttribute("position");
    const ys = [0, 1, 2, 3].map((i) => pos.getY(i));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(5);
  });

  it("壁 (wall) は両面ができる", () => {
    const g = new GeoBuilder();
    wall(g, 0, 0, 0, 3, 10, 0, 0, 3, 0xffffff);
    expect(g.vertexCount).toBe(8);
    const geo = g.build()!;
    expect(geo.getIndex()!.count).toBe(12);
  });

  it("shade は明るさを変え、白を超えない", () => {
    expect(shade(0x808080, 0.5)).toBe(0x404040);
    expect(shade(0xf0f0f0, 2)).toBe(0xffffff);
    expect(shade(0x123456, 1)).toBe(0x123456);
  });
});
