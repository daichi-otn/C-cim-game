import { describe, expect, it } from "vitest";
import { Camera3D, MAX_PITCH, MAX_ZOOM, MIN_PITCH, MIN_ZOOM } from "../src/render3d/camera3d";

const near = (a: { x: number; y: number }, b: { x: number; y: number }, d = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
  void d;
};

function cam(yaw = 0, pitch = (50 * Math.PI) / 180, zoom = 1.3) {
  const c = new Camera3D();
  c.setSize(1280, 720);
  c.x = 200;
  c.y = 120;
  c.yaw = yaw;
  c.pitch = pitch;
  c.zoom = zoom;
  return c;
}

describe("3D 視点の計算", () => {
  it("画面の中心には、見ている地面の点が映る", () => {
    const c = cam(0.7, 0.9, 2);
    near(c.worldToScreen({ x: c.x, y: c.y }), { x: 640, y: 360 });
    near(c.screenToWorld({ x: 640, y: 360 }), { x: c.x, y: c.y });
  });

  it("画面 → 地面 → 画面で、元に戻る (どの向き・角度でも)", () => {
    for (const yaw of [0, 0.5, 2, -1.3, 3.5]) {
      for (const pitch of [MIN_PITCH, 0.8, 1.2, MAX_PITCH]) {
        const c = cam(yaw, pitch, 0.8);
        for (const s of [{ x: 10, y: 20 }, { x: 1200, y: 700 }, { x: 640, y: 100 }]) near(c.worldToScreen(c.screenToWorld(s)), s);
      }
    }
  });

  it("真上から、北が上なら、昔の 2D 視点と同じ (1 タイル 16px のとき 16px ずつ)", () => {
    const c = cam(0, MAX_PITCH, 1);
    c.setTopDown();
    c.x = 640;
    c.y = 360;
    const p = c.worldToScreen({ x: 656, y: 376 });
    expect(p.x).toBeCloseTo(656, 1);
    expect(p.y).toBeCloseTo(376, 1); // 見下ろす角度が 89.5 度なので、わずかに (0.01px ほど) ずれる
    const w = c.screenToWorld({ x: 100, y: 50 });
    expect(w.x).toBeCloseTo(100, 1);
    expect(w.y).toBeCloseTo(50, 1);
  });

  it("東は右、南は下に見える (yaw = 0)", () => {
    const c = cam(0, 1.0, 1);
    const o = c.worldToScreen({ x: c.x, y: c.y });
    expect(c.worldToScreen({ x: c.x + 10, y: c.y }).x).toBeGreaterThan(o.x);
    expect(c.worldToScreen({ x: c.x, y: c.y + 10 }).y).toBeGreaterThan(o.y);
  });

  it("傾けると、奥行き方向 (南北) は縮んで見える (sin 倍)", () => {
    const c = cam(0, Math.PI / 6, 1);
    const a = c.worldToScreen({ x: c.x, y: c.y });
    const b = c.worldToScreen({ x: c.x, y: c.y + 100 });
    expect(b.y - a.y).toBeCloseTo(100 * Math.sin(Math.PI / 6), 5);
    expect(c.worldToScreen({ x: c.x + 100, y: c.y }).x - a.x).toBeCloseTo(100, 5);
  });

  it("高さのある点は、画面の上に見える (傾けるほど大きくずれ、真上からならずれない)", () => {
    const flat = cam(0, MAX_PITCH, 1);
    const tilted = cam(0, (35 * Math.PI) / 180, 1);
    const p = { x: flat.x + 20, y: flat.y + 5 };
    expect(flat.worldToScreen(p, 30).y).toBeGreaterThan(flat.worldToScreen(p, 0).y - 1); // 真上: ほぼずれない
    expect(tilted.worldToScreen(p, 30).y).toBeLessThan(tilted.worldToScreen(p, 0).y - 20);
  });

  it("ドラッグで動かすと、つかんだ地面の点が指についてくる", () => {
    for (const yaw of [0, 1.1, -2.2]) {
      const c = cam(yaw, 0.9, 1.5);
      const grab = { x: 300, y: 500 };
      const g = c.screenToWorld(grab);
      c.panByScreen(70, -40);
      near(c.worldToScreen(g), { x: 370, y: 460 });
    }
  });

  it("ズームしても、カーソルの下の地面の点は動かない。ズームの範囲は決まっている", () => {
    const c = cam(0.4, 1.0, 1);
    const a = { x: 900, y: 200 };
    const g = c.screenToWorld(a);
    c.zoomAt(a, 1.5);
    near(c.screenToWorld(a), g);
    expect(c.zoom).toBeCloseTo(1.5);
    for (let i = 0; i < 60; i++) c.zoomAt(a, 1.2);
    expect(c.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 120; i++) c.zoomAt(a, 1 / 1.2);
    expect(c.zoom).toBe(MIN_ZOOM);
  });

  it("回しても、カーソルの下の地面の点は動かない。90 度回すと、東が画面の下に来る", () => {
    const c = cam(0, 1.0, 1);
    const a = { x: 400, y: 300 };
    const g = c.screenToWorld(a);
    c.rotateAt(a, 0.8);
    near(c.screenToWorld(a), g);
    const d = cam(Math.PI / 2, 1.0, 1);
    const o = d.worldToScreen({ x: d.x, y: d.y });
    expect(d.worldToScreen({ x: d.x + 10, y: d.y }).y).toBeLessThan(o.y); // 東は上
  });

  it("見下ろす角度は、範囲内に収まる", () => {
    const c = cam();
    c.tilt(10);
    expect(c.pitch).toBe(MAX_PITCH);
    c.tilt(-10);
    expect(c.pitch).toBe(MIN_PITCH);
  });

  it("見えている地面の範囲は、画面の 4 隅の地面の点を囲む", () => {
    const c = cam(0.6, 0.7, 1);
    const b = c.visibleBounds();
    for (const s of [{ x: 0, y: 0 }, { x: 1280, y: 0 }, { x: 0, y: 720 }, { x: 1280, y: 720 }]) {
      const w = c.screenToWorld(s);
      expect(w.x).toBeGreaterThanOrEqual(b.x0 - 1e-6);
      expect(w.x).toBeLessThanOrEqual(b.x1 + 1e-6);
      expect(w.y).toBeGreaterThanOrEqual(b.y0 - 1e-6);
      expect(w.y).toBeLessThanOrEqual(b.y1 + 1e-6);
    }
    expect(c.visibleBounds(50).x0).toBeCloseTo(b.x0 - 50);
  });
});
