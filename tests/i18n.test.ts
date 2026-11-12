import { describe, expect, it } from "vitest";
import { formatMoney, text } from "../src/i18n";

describe("M15 言語切り替え", () => {
  it("主要メニューの日本語と英語を切り替える", () => {
    expect(text("menu", "ja")).toBe("メニュー");
    expect(text("menu", "en")).toBe("Menu");
    expect(text("close", "en")).toBe("Close");
    expect(text("menu", "zh-CN")).toBe("菜单");
    expect(text("menu", "ko")).toBe("메뉴");
  });
  it("円とドルを表示できる", () => {
    expect(formatMoney(1500, "JPY", "ja")).toContain("￥");
    expect(formatMoney(1500, "USD", "en")).toContain("$");
    expect(formatMoney(1600, "USD", "en", 160)).toContain("$10");
  });
});
