import { describe, expect, it } from "vitest";
import { emergencyText, headlineText } from "../src/audio/speech";

describe("ニュースの文章", () => {
  it("人口・資金・税率を読み上げる文章になる", () => {
    const t = headlineText({ population: 1234, money: 5000000, taxRate: 0.1 });
    expect(t).toContain("1,234 人");
    expect(t).toContain("5,000,000 円");
    expect(t).toContain("10 パーセント");
  });
});

describe("緊急速報の文章", () => {
  it("緊急速報と、題名・お願いを含む", () => {
    const t = emergencyText("大雨の警報", "高いところへ避難してください。");
    expect(t.startsWith("緊急速報です。")).toBe(true);
    expect(t).toContain("大雨の警報");
    expect(t).toContain("避難");
  });
});
