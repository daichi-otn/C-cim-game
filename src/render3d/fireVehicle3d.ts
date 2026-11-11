import * as THREE from "three";
import type { City } from "../sim/city";
import type { EmergencyStep } from "../sim/emergencyRoute";
import { TILE } from "./terrain3d";

/** 出動経路上を走り、現場で停止する消防車。 */
export class FireVehicle3D {
  readonly group = new THREE.Group();
  private body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 3.5), new THREE.MeshLambertMaterial({ color: 0xcc201b }));
  private light = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 2.4), new THREE.MeshBasicMaterial({ color: 0xff4949 }));
  private key = "";
  private route: EmergencyStep[] = [];
  private elapsed = 0;
  constructor(private city: City) {
    this.group.add(this.body, this.light); this.light.position.y = 2;
    this.group.visible = false;
  }
  update(dt: number): void {
    const fire = this.city.fire;
    const key = fire ? `${fire.x}:${fire.y}:${fire.started}:${this.city.graph.version}:${this.city.zones.version}:${this.city.facilitiesVersion}:${this.city.networkVersion}` : "";
    if (key !== this.key) {
      this.key = key;
      const cell = fire ? this.city.zones.get(fire.x, fire.y) : undefined;
      this.route = cell ? this.city.fireDispatch(cell)?.route ?? [] : [];
      this.elapsed = fire ? Math.max(0, (this.city.day - fire.started) * 0.5) : 0;
    }
    this.group.visible = this.route.length > 0;
    if (!this.group.visible) return;
    this.elapsed += dt;
    const graph = this.city.graph;
    const lengths = this.route.map((s) => {
      const e = graph.edges.get(s.edge); if (!e) return 0;
      const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!;
      return Math.hypot(b.x - a.x, b.y - a.y) * Math.abs(s.to - s.from);
    });
    const total = lengths.reduce((a, b) => a + b, 0);
    let remaining = total * Math.min(1, this.elapsed / 0.8);
    for (let i = 0; i < this.route.length; i++) {
      const s = this.route[i]!, length = lengths[i]!;
      if (remaining > length && i + 1 < this.route.length) { remaining -= length; continue; }
      const e = graph.edges.get(s.edge); if (!e) return;
      const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!;
      const t = s.from + (s.to - s.from) * (length > 0 ? Math.min(1, remaining / length) : 1);
      this.group.position.set((a.x + (b.x - a.x) * t) * TILE, 3, (a.y + (b.y - a.y) * t) * TILE);
      this.group.rotation.y = -Math.atan2((b.y - a.y) * Math.sign(s.to - s.from), (b.x - a.x) * Math.sign(s.to - s.from));
      break;
    }
  }
  dispose(): void { this.body.geometry.dispose(); this.body.material.dispose(); this.light.geometry.dispose(); this.light.material.dispose(); }
}
