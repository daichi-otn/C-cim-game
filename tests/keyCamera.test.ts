import { describe, expect, it } from "vitest";
import { Camera3D, MAX_PITCH, MIN_PITCH } from "../src/render3d/camera3d";
import { KeyCamera } from "../src/render3d/keyCamera";

function make(yaw = 0) {
  const c = new Camera3D();
  c.setSize(1280, 720);
  c.x = 100;
  c.y = 100;
  c.yaw = yaw;
  c.pitch = 0.9;
  c.zoom = 1;
  return c;
}

describe("キーボードで視点を動かす", () => {
  it("W で画面の上へ (北へ)、S で下へ、D で右へ、A で左へ動く (yaw = 0)", () => {
    for (const [key, dx, dy] of [["w", 0, -1], ["s", 0, 1], ["d", 1, 0], ["a", -1, 0]] as const) {
      const c = make();
      const k = new KeyCamera();
      k.down(key);
      k.update(c, 0.1, true);
      expect(Math.sign(c.x - 100)).toBe(dx);
      expect(Math.sign(c.y - 100)).toBe(dy);
    }
  });

  it("向きを回すと、W は画面の上 (つまり回した向き) へ動く", () => {
    const c = make(Math.PI / 2);
    const k = new KeyCamera();
    k.down("w");
    k.update(c, 0.1, true);
    const moved = { x: c.x - 100, y: c.y - 100 };
    // yaw = 90 度のとき、画面の上は東 (x の正) へ向く
    expect(Math.sign(moved.x)).toBe(1);
    expect(Math.abs(moved.y)).toBeLessThan(1e-6);
  });

  it("拡大すると、同じ時間でも動く距離が小さい", () => {
    const near = make();
    const far = make();
    far.zoom = 4;
    const k1 = new KeyCamera();
    const k2 = new KeyCamera();
    k1.down("d");
    k2.down("d");
    k1.update(near, 0.1, true);
    k2.update(far, 0.1, true);
    expect(near.x - 100).toBeGreaterThan(far.x - 100);
  });

  it("Q と E で向きが反対向きに回る", () => {
    const q = make();
    const e = make();
    const kq = new KeyCamera();
    const ke = new KeyCamera();
    kq.down("q");
    ke.down("e");
    kq.update(q, 0.2, true);
    ke.update(e, 0.2, true);
    expect(q.yaw).toBeLessThan(0);
    expect(e.yaw).toBeGreaterThan(0);
    expect(q.yaw).toBeCloseTo(-e.yaw);
  });

  it("R で見下ろす角度が上がり (真上に近く)、F で下がる。範囲を超えない", () => {
    const c = make();
    const k = new KeyCamera();
    k.down("r");
    for (let i = 0; i < 200; i++) k.update(c, 0.05, true);
    expect(c.pitch).toBe(MAX_PITCH);
    k.up("r");
    k.down("f");
    for (let i = 0; i < 400; i++) k.update(c, 0.05, true);
    expect(c.pitch).toBe(MIN_PITCH);
  });

  it("視点のキーでないキーは、ほかの処理に回す (false)、離すと動かなくなる", () => {
    const k = new KeyCamera();
    expect(k.down("1")).toBe(false);
    expect(k.down("W")).toBe(true);
    const c = make();
    k.update(c, 0.1, true);
    expect(c.y).not.toBe(100);
    k.up("W");
    const before = c.y;
    k.update(c, 0.1, true);
    expect(c.y).toBe(before);
  });

  it("動かせない間 (メニューが開いている間) は、キーが押されていても動かない", () => {
    const k = new KeyCamera();
    k.down("d");
    const c = make();
    k.update(c, 0.1, false);
    expect(c.x).toBe(100);
    k.clear();
    k.update(c, 0.1, true);
    expect(c.x).toBe(100);
  });
});
