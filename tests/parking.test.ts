import { describe, expect, it } from "vitest";
import { parkingUsed } from "../src/sim/parking";
describe("M12 駐車場", () => {
  it("公共交通が駐車需要を減らす", () => expect(parkingUsed(1000, 0, 200)).toBeGreaterThan(parkingUsed(1000, 100, 200)));
});
