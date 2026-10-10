import * as THREE from "three";
import type { City } from "../sim/city";
import { ROAD_SPECS } from "../sim/roadTypes";
import { Structure } from "../sim/structures";
import { GeoBuilder } from "./geo";
import { TILE } from "./terrain3d";

const POLE_H = 9;

/** 街灯: 道路ぞいに 3 タイルおきに、道の両側へ交互に。橋・歩行者道にも (トンネルは除く)。夜はランプが灯り、路面に光だまりができる。 */
export class StreetLights3D {
  readonly group = new THREE.Group();
  private poles: THREE.Mesh | null = null;
  private lamps: THREE.Mesh | null = null;
  private glow: THREE.Mesh | null = null;
  private lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private version = -1;

  constructor(private city: City) {
    this.group.name = "streetlights";
  }

  setNight(night: number): void {
    const o = Math.min(1, night * 1.15);
    this.lampMat.opacity = o;
    this.glowMat.opacity = o * 0.55;
    this.group.visible = true;
    if (this.lamps) this.lamps.visible = o > 0.02;
    if (this.glow) this.glow.visible = o > 0.02;
  }

  update(): void {
    const { graph } = this.city;
    if (graph.version === this.version) return;
    this.version = graph.version;
    this.clear();
    const poles = new GeoBuilder();
    const lamps = new GeoBuilder();
    const glow = new GeoBuilder();
    for (const e of graph.edges.values()) {
      if (e.structure === Structure.Tunnel) continue;
      const a = graph.nodes.get(e.a)!;
      const b = graph.nodes.get(e.b)!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) * TILE;
      if (len < 1e-6) continue;
      const ux = ((b.x - a.x) * TILE) / len;
      const uz = ((b.y - a.y) * TILE) / len;
      const off = Math.max(4, ROAD_SPECS[e.type].capacity > 0 ? 7 : 3.5);
      let side = 1;
      for (let d = TILE * 1.2; d < len; d += TILE * 3) {
        const x = a.x * TILE + ux * d - uz * off * side;
        const z = a.y * TILE + uz * d + ux * off * side;
        side = -side;
        const y0 = e.structure === Structure.Bridge ? 2.6 : 0;
        poles.box(x - 0.25, z - 0.25, 0.5, 0.5, y0, y0 + POLE_H, 0x555b61, 0x555b61);
        poles.box(x - 0.2 - ux * 0.0, z - 0.2, 0.4 + 1.6, 0.4, y0 + POLE_H - 0.3, y0 + POLE_H, 0x555b61, 0x555b61);
        lamps.ball(x + 0.9, y0 + POLE_H - 0.5, z, 1.0, 0xfff3c9);
        glow.disc(x, z, 9, y0 + 0.9, 0x6b5a2a, 12);
        glow.disc(x, z, 5, y0 + 0.92, 0x8a7430, 12);
      }
    }
    const pg = poles.build();
    if (pg) {
      this.poles = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.poles.castShadow = true;
      this.group.add(this.poles);
    }
    const lg = lamps.build();
    if (lg) {
      this.lamps = new THREE.Mesh(lg, this.lampMat);
      this.group.add(this.lamps);
    }
    const gg = glow.build();
    if (gg) {
      this.glow = new THREE.Mesh(gg, this.glowMat);
      this.glow.renderOrder = 2;
      this.group.add(this.glow);
    }
  }

  private clear(): void {
    for (const m of [this.poles, this.lamps, this.glow]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.poles = this.lamps = this.glow = null;
  }

  dispose(): void {
    this.clear();
    this.lampMat.dispose();
    this.glowMat.dispose();
  }
}
