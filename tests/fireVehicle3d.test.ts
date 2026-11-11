import { describe, expect, it } from "vitest";
import { FireVehicle3D } from "../src/render3d/fireVehicle3d";
import { forceFacility, setup } from "./helpers";
import { FacilityType } from "../src/sim/facilities";

describe("消防車の表示", () => {
  it("出動経路を移動し、停止中は動かず、火災終了で消える", () => {
    const { city, x0, roadY } = setup();
    for (let i = 0; i < 90; i++) city.tick();
    forceFacility(city, FacilityType.Fire, x0 + 1, roadY - 2); city.refresh();
    const cell = [...city.zones.cells.values()].find((c) => c.building > 0 && c.part === undefined && c.x >= x0 + 5 && c.x <= x0 + 10)!;
    expect(cell).toBeDefined();
    city.disastersEnabled = true; city.fire = { x: cell.x, y: cell.y, started: city.day };
    const view = new FireVehicle3D(city);
    view.update(0); expect(view.group.visible).toBe(true);
    const x = view.group.position.x;
    view.update(0); expect(view.group.position.x).toBe(x);
    view.update(0.4); expect(view.group.position.x).not.toBe(x);
    view.update(1); const destination = view.group.position.x;
    view.update(1); expect(view.group.position.x).toBe(destination);
    city.fire = null; view.update(0); expect(view.group.visible).toBe(false);
    view.dispose();
  });
});
