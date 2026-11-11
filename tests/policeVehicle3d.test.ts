import { describe, expect, it } from "vitest";
import { PoliceVehicle3D } from "../src/render3d/policeVehicle3d";
import { FacilityType } from "../src/sim/facilities";
import { forceFacility, setup } from "./helpers";

describe("警察車両の表示", () => {
  it("警察署がある道路網を巡回し、撤去後は消える", () => {
    const { city, x0, roadY } = setup();
    forceFacility(city, FacilityType.Police, x0 + 1, roadY - 2); city.refresh();
    const view = new PoliceVehicle3D(city); view.update(0);
    expect(view.group.visible).toBe(true);
    const x = view.group.position.x; view.update(0.4); expect(view.group.position.x).not.toBe(x);
    for (const f of [...city.facilities.values()]) if (f.type === FacilityType.Police) city.facilities.delete(f.id);
    city.facilitiesVersion++; city.refresh(); view.update(0); expect(view.group.visible).toBe(false); view.dispose();
  });
});
