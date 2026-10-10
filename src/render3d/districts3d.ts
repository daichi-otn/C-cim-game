import * as THREE from "three";
import type { City } from "../sim/city";
import { TILE } from "./terrain3d";

/** 地区の囲みを、地面に薄い色の面と縁の線で描く。地区が変わったときだけ作り直す。 */
export class Districts3D {
  readonly group = new THREE.Group();
  private seen = -1;

  constructor(private city: City) {}

  update(): void {
    if (this.city.districtsVersion === this.seen) return;
    this.seen = this.city.districtsVersion;
    this.dispose();
    for (const g of this.city.districts) {
      const x0 = g.x0 * TILE;
      const z0 = g.y0 * TILE;
      const w = (g.x1 - g.x0) * TILE;
      const h = (g.y1 - g.y0) * TILE;
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x0 + w / 2, 0.4, z0 + h / 2);
      fill.renderOrder = 2;
      this.group.add(fill);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 0.6, z0), new THREE.Vector3(x0 + w, 0.6, z0), new THREE.Vector3(x0 + w, 0.6, z0 + h), new THREE.Vector3(x0, 0.6, z0 + h)]),
        new THREE.LineBasicMaterial({ color: g.color, transparent: true, opacity: 0.8 }),
      );
      edge.renderOrder = 2;
      this.group.add(edge);
    }
  }

  dispose(): void {
    for (const o of this.group.children) {
      const m = o as THREE.Mesh | THREE.LineLoop;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
