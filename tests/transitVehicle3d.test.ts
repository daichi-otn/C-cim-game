import { describe, expect, it } from "vitest";
import { TransitVehicle3D } from "../src/render3d/transitVehicle3d";
import { setup } from "./helpers";

describe("公共交通車両の表示", () => {
  it("バス路線の車両が路線上を動く", () => {
    const { city } = setup();
    city.addBusLine();
    const view = new TransitVehicle3D(city); view.update(0);
    expect(view.group.children.length).toBe(1);
    const x = view.group.children[0]!.position.x; view.update(1); expect(view.group.children[0]!.position.x).not.toBe(x); view.dispose();
  });
});
