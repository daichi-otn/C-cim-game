import { describe, expect, it } from "vitest";
import { City } from "../src/sim/city";
import { isInMap } from "../src/sim/mapSize";

describe("M13 マップサイズ", () => {
  it("サイズごとに拡張範囲を判定する", () => {
    expect(isInMap("small", 64, 64)).toBe(true);
    expect(isInMap("small", 65, 0)).toBe(false);
    expect(isInMap("large", 200, 200)).toBe(true);
    expect(isInMap("country", 1800, 1800)).toBe(true);
    expect(isInMap("country", 2100, 0)).toBe(false);
  });
  it("マップサイズを保存し、古いデータは中サイズにする", () => {
    const city = new City(1, undefined, undefined, "small");
    expect(City.fromData(city.toData()).mapSize).toBe("small");
    const data = city.toData(); delete data.mapSize;
    expect(City.fromData(data).mapSize).toBe("medium");
  });
});
