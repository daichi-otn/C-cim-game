import * as THREE from "three";
import type { City } from "../sim/city";
import type { TransitMode, TransitStop } from "../sim/transit";
import { TILE } from "./terrain3d";

type Segment = { x0: number; y0: number; x1: number; y1: number; length: number };

function colorOf(mode: TransitMode): number { return mode === "bus" ? 0xe0a72f : mode === "subway" ? 0x8d63d2 : 0x3f9ed8; }

/** 公共交通の車両を路線の停留所間で往復させる。 */
export class TransitVehicle3D {
  readonly group = new THREE.Group();
  private vehicles = new Map<number, { group: THREE.Group; segments: Segment[]; total: number; clock: number }>();
  private key = "";
  constructor(private city: City) {}

  update(dt: number): void {
    const key = `${this.city.transitVersion}:${this.city.graph.version}:${this.city.transitLines.map((line) => `${line.id}:${line.mode}:${line.stopIds.join(",")}`).join("|")}`;
    if (key !== this.key) { this.key = key; this.rebuild(); }
    for (const line of this.city.transitLines) {
      const vehicle = this.vehicles.get(line.id); if (!vehicle || vehicle.total <= 0) continue;
      vehicle.clock = (vehicle.clock + dt) % 12;
      const distance = vehicle.total * (vehicle.clock < 6 ? vehicle.clock / 6 : 2 - vehicle.clock / 6);
      let remain = distance;
      for (const segment of vehicle.segments) {
        if (remain > segment.length) { remain -= segment.length; continue; }
        const t = segment.length ? remain / segment.length : 1;
        vehicle.group.position.set((segment.x0 + (segment.x1 - segment.x0) * t) * TILE, 3, (segment.y0 + (segment.y1 - segment.y0) * t) * TILE);
        vehicle.group.rotation.y = -Math.atan2(segment.y1 - segment.y0, segment.x1 - segment.x0);
        break;
      }
    }
  }

  private rebuild(): void {
    for (const vehicle of this.vehicles.values()) { vehicle.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); this.group.remove(vehicle.group); }
    this.vehicles.clear();
    for (const line of this.city.transitLines) {
      const stops = line.stopIds.map((id) => this.city.transitStops.find((stop) => stop.id === id)).filter((stop): stop is TransitStop => !!stop);
      const segments: Segment[] = [];
      for (let i = 0; i + 1 < stops.length; i++) { const a = stops[i]!, b = stops[i + 1]!, length = Math.hypot(b.x - a.x, b.y - a.y); segments.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, length }); }
      const total = segments.reduce((sum, segment) => sum + segment.length, 0); if (!total) continue;
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2, 2.5), new THREE.MeshLambertMaterial({ color: colorOf(line.mode) }));
      group.add(body); this.group.add(group); this.vehicles.set(line.id, { group, segments, total, clock: 0 });
    }
  }

  dispose(): void { for (const vehicle of this.vehicles.values()) vehicle.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); this.vehicles.clear(); }
}
