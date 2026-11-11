import * as THREE from "three";
import { FacilityType, facilityCenter } from "../sim/facilities";
import { emergencyRoute, type EmergencyStep } from "../sim/emergencyRoute";
import type { City } from "../sim/city";
import { TILE } from "./terrain3d";

/** 警察署から道路網を巡回するパトカー。 */
export class PoliceVehicle3D {
  readonly group = new THREE.Group();
  private body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 3), new THREE.MeshLambertMaterial({ color: 0x2459a6 }));
  private light = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2), new THREE.MeshBasicMaterial({ color: 0x4ca6ff }));
  private route: EmergencyStep[] = [];
  private key = "";
  private elapsed = 0;
  constructor(private city: City) { this.group.add(this.body, this.light); this.light.position.y = 1.5; this.group.visible = false; }
  update(dt: number): void {
    const station = [...this.city.facilities.values()].find((f) => f.type === FacilityType.Police && this.city.facilityActive(f));
    const key = station ? `${station.id}:${this.city.graph.version}:${this.city.facilitiesVersion}:${this.city.networkVersion}` : "";
    if (key !== this.key) {
      this.key = key; this.elapsed = 0; this.route = [];
      if (station) {
        const edges = [...this.city.graph.edges.values()];
        const target = edges.length ? this.city.graph.nodes.get(edges[edges.length - 1]!.b) : undefined;
        if (target) this.route = emergencyRoute(this.city.graph, facilityCenter(station), target) ?? [];
      }
    }
    this.group.visible = this.route.length > 0;
    if (!this.group.visible) return;
    this.elapsed = (this.elapsed + dt) % 8;
    const graph = this.city.graph;
    const lengths = this.route.map((s) => { const e = graph.edges.get(s.edge); if (!e) return 0; const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!; return Math.hypot(b.x - a.x, b.y - a.y) * Math.abs(s.to - s.from); });
    const total = lengths.reduce((a, b) => a + b, 0); let remaining = total * Math.min(1, this.elapsed / 4);
    for (let i = 0; i < this.route.length; i++) {
      const s = this.route[i]!, length = lengths[i]!; if (remaining > length && i + 1 < this.route.length) { remaining -= length; continue; }
      const e = graph.edges.get(s.edge); if (!e) return; const a = graph.nodes.get(e.a)!, b = graph.nodes.get(e.b)!;
      const t = s.from + (s.to - s.from) * (length > 0 ? Math.min(1, remaining / length) : 1);
      this.group.position.set((a.x + (b.x - a.x) * t) * TILE, 2.5, (a.y + (b.y - a.y) * t) * TILE);
      this.group.rotation.y = -Math.atan2((b.y - a.y) * Math.sign(s.to - s.from), (b.x - a.x) * Math.sign(s.to - s.from)); break;
    }
  }
  dispose(): void { this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose(); this.light.geometry.dispose(); (this.light.material as THREE.Material).dispose(); }
}
