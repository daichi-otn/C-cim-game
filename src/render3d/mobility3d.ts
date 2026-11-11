import * as THREE from "three";
import type { City } from "../sim/city";
import { TILE } from "./terrain3d";

type Walker = { group: THREE.Mesh; x0: number; y0: number; x1: number; y1: number; clock: number };

/** 住民の家と職場を結ぶ歩行者・自転車の軽量表示。多すぎる住民は代表サンプルにする。 */
export class Mobility3D {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];
  private key = "";
  constructor(private city: City) {}

  update(dt: number): void {
    const people = this.city.people.filter((person) => person.work).slice(0, 100);
    const key = `${this.city.zones.version}:${people.map((person) => `${person.id}:${person.home.join(",")}:${person.work?.join(",")}`).join("|")}`;
    if (key !== this.key) { this.key = key; this.rebuild(people); }
    for (const walker of this.walkers) {
      walker.clock = (walker.clock + dt) % 10;
      const t = walker.clock < 5 ? walker.clock / 5 : 2 - walker.clock / 5;
      walker.group.position.set((walker.x0 + (walker.x1 - walker.x0) * t) * TILE, 2.2, (walker.y0 + (walker.y1 - walker.y0) * t) * TILE);
    }
  }

  private rebuild(people: { id: number; home: [number, number]; work: [number, number] | null }[]): void {
    for (const walker of this.walkers) { walker.group.geometry.dispose(); (walker.group.material as THREE.Material).dispose(); this.group.remove(walker.group); }
    this.walkers = [];
    for (const person of people) {
      if (!person.work || (person.home[0] === person.work[0] && person.home[1] === person.work[1])) continue;
      const bike = person.id % 5 === 0;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bike ? 1.8 : 1.1, bike ? 1.5 : 2, bike ? 0.7 : 1.1), new THREE.MeshLambertMaterial({ color: bike ? 0xf0a33a : 0xd8e8ef }));
      this.group.add(mesh); this.walkers.push({ group: mesh, x0: person.home[0] + 0.5, y0: person.home[1] + 0.5, x1: person.work[0] + 0.5, y1: person.work[1] + 0.5, clock: person.id % 10 });
    }
  }

  dispose(): void { for (const walker of this.walkers) { walker.group.geometry.dispose(); (walker.group.material as THREE.Material).dispose(); } this.walkers = []; }
}
