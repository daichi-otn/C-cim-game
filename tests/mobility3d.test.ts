import { describe, expect, it } from "vitest";
import { Mobility3D } from "../src/render3d/mobility3d";
import { setup } from "./helpers";

describe("歩行者と自転車の表示", () => {
  it("家と職場を持つ住民を表示して動かす", () => {
    const { city } = setup();
    city.people.push({ id: 1, home: [0, 0], ageDays: 9000, work: [10, 0] });
    const view = new Mobility3D(city); view.update(0);
    expect(view.group.children.length).toBe(1);
    const x = view.group.children[0]!.position.x; view.update(1); expect(view.group.children[0]!.position.x).not.toBe(x); view.dispose();
  });
});
