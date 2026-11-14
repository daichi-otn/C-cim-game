import { describe, expect, it } from "vitest";
import { loadCity, makeSave, parseSave } from "../src/sim/save";
import { setup } from "./helpers";

const CTX = { mapId: "lakeside", mapName: "湖畔の平野", view: { x: 0, y: 0, zoom: 1 }, speed: 1 };

function assertFinite(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), path).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFinite(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertFinite(entry, `${path}.${key}`);
  }
}

describe("M25 公開品質", () => {
  it("長時間プレイ後も数値が有限で、保存・復元して続きが一致する", () => {
    const { city } = setup();
    for (let i = 0; i < 720; i++) city.tick();
    const save = makeSave(city, CTX, 123);
    assertFinite(save);

    const restored = loadCity(parseSave(JSON.stringify(save)));
    expect(restored.day).toBe(city.day);
    expect(restored.toData()).toEqual(city.toData());

    for (let i = 0; i < 30; i++) {
      city.tick();
      restored.tick();
    }
    expect(restored.toData()).toEqual(city.toData());
  }, 30000);
});
