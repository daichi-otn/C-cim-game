import { describe, expect, it } from "vitest";
import { text } from "../src/i18n";

describe("M15 言語切り替え", () => {
  it("主要メニューの日本語と英語を切り替える", () => {
    expect(text("menu", "ja")).toBe("メニュー");
    expect(text("menu", "en")).toBe("Menu");
    expect(text("close", "en")).toBe("Close");
  });
});
