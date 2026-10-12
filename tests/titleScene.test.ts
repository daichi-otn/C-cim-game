import { describe, expect, it } from "vitest";
import { hash01, skylineHeights, windowLit } from "../src/render/titleScene";

describe("タイトル画面の背景", () => {
  it("同じ番号なら、いつも同じ値になる (0〜1 の範囲)", () => {
    expect(hash01(3, 4)).toBe(hash01(3, 4));
    for (let i = 0; i < 50; i++) {
      const v = hash01(i, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("ビルの高さは 0.35〜0.95 の範囲で、数はその数どおり", () => {
    const hs = skylineHeights(1, 20);
    expect(hs).toHaveLength(20);
    for (const h of hs) {
      expect(h).toBeGreaterThanOrEqual(0.35);
      expect(h).toBeLessThanOrEqual(0.95);
    }
  });
  it("窓の明かりは時間とともに変わる", () => {
    const first = windowLit(2, 1, 1, 0);
    expect(typeof first).toBe("boolean");
    expect(windowLit(2, 1, 1, 0)).toBe(windowLit(2, 1, 1, 1));
  });
});
