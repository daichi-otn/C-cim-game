import { describe, expect, it } from "vitest";
import { HAND_MAX_FLOORS, basePose, buildStyleOf, constructionSeconds, cranePose, planSites, workerPose } from "../src/render3d/constructionShape";

describe("建て方", () => {
  it("低い建物は手で作り、高い建物はクレーンで作る", () => {
    expect(buildStyleOf(1)).toBe("hand");
    expect(buildStyleOf(HAND_MAX_FLOORS)).toBe("hand");
    expect(buildStyleOf(HAND_MAX_FLOORS + 1)).toBe("crane");
    expect(buildStyleOf(15)).toBe("crane");
  });
});

describe("基礎と建物の見える高さ", () => {
  it("最初は何も見えず、基礎を掘り、その後で建物が上がる", () => {
    expect(basePose(0, "crane", 20).reveal).toBe(0);
    expect(basePose(0, "crane", 20).foundation).toBe(0);
    expect(basePose(0.1, "crane", 20).foundation).toBeGreaterThan(0);
    expect(basePose(0.1, "crane", 20).reveal).toBe(0);
    const mid = basePose(0.5, "crane", 20).reveal;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("手で作るときは段ごとに止まりながら上がる (途中の値の種類が少ない)", () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 200; i++) seen.add(basePose(i / 200, "hand", 6).reveal);
    expect(seen.size).toBeLessThanOrEqual(4); // 段の数 (3) + 0
    expect(basePose(1, "hand", 6).reveal).toBe(1);
  });

  it("クレーンのときは、途中も滑らかに上がる", () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 200; i++) seen.add(basePose(i / 200, "crane", 6).reveal);
    expect(seen.size).toBeGreaterThan(50);
  });

  it("建物の見える高さは、下がらない", () => {
    for (const style of ["hand", "crane"] as const) {
      let last = -1;
      for (let i = 0; i <= 100; i++) {
        const r = basePose(i / 100, style, 12).reveal;
        expect(r).toBeGreaterThanOrEqual(last);
        last = r;
      }
      expect(last).toBe(1);
    }
  });
});

describe("クレーン", () => {
  it("塔は最初に立つ", () => {
    expect(cranePose(0).tower).toBe(0);
    expect(cranePose(0.1).tower).toBeGreaterThan(0);
    expect(cranePose(0.5).tower).toBe(1);
  });

  it("荷は持ち上げ、運び、下ろし、空で戻る (往復の中で、荷を持つ時間がある)", () => {
    const loaded = [...Array(100).keys()].map((i) => cranePose(i / 100)).filter((c) => c.loaded).length;
    expect(loaded).toBeGreaterThan(20);
    expect(loaded).toBeLessThan(80);
  });

  it("腕は置き場と建物の上を行き来し、0〜1 に収まる", () => {
    for (let i = 0; i <= 100; i++) {
      const c = cranePose(i / 100);
      expect(c.slew).toBeGreaterThanOrEqual(0);
      expect(c.slew).toBeLessThanOrEqual(1);
      expect(c.hook).toBeGreaterThanOrEqual(0);
      expect(c.hook).toBeLessThanOrEqual(1);
    }
  });

  it("完成の時は、荷を持っていない", () => {
    expect(cranePose(1).loaded).toBe(false);
  });
});

describe("作業員", () => {
  it("歩き、ときどき止まってトンカチを打つ", () => {
    const moving = [...Array(60).keys()].map((i) => workerPose(i * 0.1, 0));
    expect(moving.some((w) => w.walk > 0)).toBe(true);
    expect(moving.some((w) => w.hammer > 0)).toBe(true);
    for (const w of moving) {
      expect(w.u).toBeGreaterThanOrEqual(0);
      expect(w.u).toBeLessThanOrEqual(1);
    }
  });
});

describe("建設の時間", () => {
  it("建てる時間は 3〜9 秒、大きい建物ほど長い", () => {
    expect(constructionSeconds(1)).toBeGreaterThanOrEqual(3);
    expect(constructionSeconds(10)).toBeGreaterThan(constructionSeconds(3));
    expect(constructionSeconds(100)).toBe(9);
  });
});

describe("建て始める場所と、やめる場所", () => {
  it("新しく建った場所は建て始め、建った日が変わった場所は止めてから建て直す", () => {
    const seen = new Map([
      ["1,1", 10],
      ["2,2", 20],
    ]);
    const now = new Map([
      ["1,1", 10],
      ["2,2", 35],
      ["3,3", 40],
    ]);
    const { start, stop } = planSites(seen, now);
    expect(start.sort()).toEqual(["2,2", "3,3"]);
    expect(stop).toEqual(["2,2"]);
  });

  it("なくなった場所は止める", () => {
    const { start, stop } = planSites(new Map([["1,1", 5]]), new Map());
    expect(start).toEqual([]);
    expect(stop).toEqual(["1,1"]);
  });
});
