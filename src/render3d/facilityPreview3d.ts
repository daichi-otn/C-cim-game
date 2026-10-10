import * as THREE from "three";
import { FACILITY_SPECS, type FacilityType } from "../sim/facilities";
import type { Parts } from "./buildingGeo";
import { FACILITY_COLORS, addFacility } from "./facilityGeo";
import { GeoBuilder } from "./geo";
import { TILE } from "./terrain3d";

/** 施設を建てる前のプレビュー: 半透明の施設の姿、緑 (建てられる) か赤 (建てられない) の敷地、サービスの届く範囲の円。 */
export class FacilityPreview3D {
  readonly group = new THREE.Group();
  private key = "";

  show(f: { type: FacilityType; x: number; y: number; ok: boolean } | null): void {
    const key = f ? `${f.type},${f.x},${f.y},${f.ok}` : "";
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!f) return;
    const spec = FACILITY_SPECS[f.type];
    const size = spec.size;
    const parts: Parts = { solid: new GeoBuilder(), glass: new GeoBuilder(), lit: new GeoBuilder() };
    addFacility(parts, { type: f.type, x: f.x, y: f.y, size }, true, false);
    const mats: THREE.Material[] = [];
    for (const [b, m] of [[parts.solid, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.8 })], [parts.glass, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.8 })]] as const) {
      const geo = b.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, m);
      mats.push(m);
      this.group.add(mesh);
    }
    // 敷地の色 (緑 = 建てられる、赤 = 建てられない)
    const side = size * TILE;
    const mark = new GeoBuilder();
    mark.rect(f.x * TILE, f.y * TILE, side, side, 1.1, f.ok ? 0x7bd88f : 0xe05a4f);
    const mg = mark.build();
    if (mg) {
      const mesh = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthTest: false }));
      mesh.renderOrder = 10;
      this.group.add(mesh);
    }
    // サービスの届く範囲の円
    if (spec.radius > 0) {
      const color = FACILITY_COLORS[f.type];
      const cx = (f.x + size / 2) * TILE;
      const cz = (f.y + size / 2) * TILE;
      const R = spec.radius * TILE;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthTest: false }));
      disc.position.set(cx, 1.0, cz);
      disc.renderOrder = 9;
      const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.8, R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false }));
      ring.position.set(cx, 1.05, cz);
      ring.renderOrder = 9;
      this.group.add(disc, ring);
    }
  }

  private clear(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
  }

  dispose(): void {
    this.clear();
  }
}
