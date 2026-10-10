import * as THREE from "three";
import { baseRect, wallHeight } from "./buildingShape";
import type { City } from "../sim/city";
import { FacilityType } from "../sim/facilities";
import { hash2 } from "../sim/rng";
import { ZoneType } from "../sim/zoning";
import { factoryChimney } from "./buildingGeo";
import { smokePoint, steamPoints, windTurbines } from "./facilityShape3d";
import { ParticleLayer } from "./particles3d";
import { TILE } from "./terrain3d";

/** 同時に出す粒の上限。 */
const MAX_PARTICLES = 700;
/** 建った直後の建物にかける足場が残る時間 (秒。建物が大きいほど長い)。 */
const SCAFFOLD_SEC = [1.2, 1.8, 2.6] as const;

type Kind = "smoke" | "steam" | "dust" | "spark";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
}

interface Emitter {
  kind: "smoke" | "steam";
  x: number;
  y: number;
  z: number;
  /** 1 秒に出す粒の数。 */
  rate: number;
  carry: number;
}

interface Scaffold {
  key: string;
  age: number;
  life: number;
  lines: THREE.LineSegments;
}

/** 煙突の煙・発電所の蒸気・建物が建つ/壊れるときの土ぼこりと火花・足場・風車の羽根。見た目だけで、街の計算には関わらない。 */
export class Effects3D {
  readonly group = new THREE.Group();
  private layer = new ParticleLayer(MAX_PARTICLES);
  private particles: Particle[] = [];
  private emitters: Emitter[] = [];
  private emittersKey = "";
  private scaffolds: Scaffold[] = [];
  private blades: { group: THREE.Group; speed: number; phase: number }[] = [];
  private bladeRoot = new THREE.Group();
  /** 前回の建物の一覧 (アンカー → 建物の大きさ)。増減を見つけて土ぼこりと足場を出す。 */
  private seen = new Map<string, { b: number; w: number; h: number; built: number }>();
  private seenVersion = -1;
  private first = true;
  private clock = 0;
  private spin = 0;
  /** 風の強さ (0〜1。天気による)。 */
  windLevel = 0.3;

  constructor(private city: City) {
    this.group.name = "effects";
    this.group.add(this.layer.points, this.bladeRoot);
  }

  /** dt は実時間 (粒や煙)。simDt はゲームの時間 (足場の演出。一時停止中は止まる)。 */
  update(dt: number, zoom: number, pixelRatio: number, simDt = dt): void {
    this.clock += dt;
    const wind = (Math.sin(this.clock * 0.13) * 5 + 4) * (0.5 + this.windLevel);
    this.syncEmitters();
    this.watchBuildings();
    for (const e of this.emitters) {
      e.carry += e.rate * dt;
      while (e.carry >= 1) {
        e.carry -= 1;
        if (this.particles.length < MAX_PARTICLES) this.spawn(e, wind);
      }
    }
    this.layer.setScale(zoom, pixelRatio);
    this.layer.begin();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      if (p.kind === "smoke" || p.kind === "steam") {
        p.vx += (wind - p.vx) * dt * 0.6;
        p.vy += dt * 0.5;
      } else {
        p.vx *= 1 - dt * 2.2;
        p.vz *= 1 - dt * 2.2;
        p.vy -= dt * (p.kind === "spark" ? 20 : 4);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.3 && (p.kind === "dust" || p.kind === "spark")) p.y = 0.3;
      this.draw(p, t);
    }
    this.layer.end();
    this.updateScaffolds(simDt);
    this.updateBlades(dt);
  }

  private draw(p: Particle, t: number): void {
    switch (p.kind) {
      case "smoke":
        this.layer.add(p.x, p.y, p.z, p.size * (1.4 + t * 3.6) * 2, lerpColor(0x4a4744, 0xb9b6b0, t), 0.5 * (1 - t) * Math.min(1, t * 6));
        break;
      case "steam":
        this.layer.add(p.x, p.y, p.z, p.size * (1.6 + t * 4.8) * 2, 0xffffff, 0.45 * (1 - t) * Math.min(1, t * 6));
        break;
      case "dust":
        this.layer.add(p.x, p.y, p.z, p.size * (1.2 + t * 3.2) * 2, 0xd8cfb8, 0.65 * (1 - t));
        break;
      case "spark":
        this.layer.add(p.x, p.y, p.z, p.size * (1 - t * 0.6) * 2, 0xffe08a, 0.95 * (1 - t));
        break;
    }
  }

  private spawn(e: Emitter, wind: number): void {
    const r = Math.random;
    if (e.kind === "smoke") {
      this.particles.push({ kind: "smoke", x: e.x + (r() - 0.5) * 1.2, y: e.y, z: e.z + (r() - 0.5) * 1.2, vx: wind * 0.3, vy: 4 + r() * 3, vz: 0, age: 0, life: 2.4 + r() * 1.4, size: 1.3 + r() * 0.8 });
    } else {
      this.particles.push({ kind: "steam", x: e.x + (r() - 0.5) * 2.5, y: e.y, z: e.z + (r() - 0.5) * 2.5, vx: wind * 0.2, vy: 5 + r() * 3, vz: 0, age: 0, life: 2.6 + r() * 1.4, size: 2 + r() * 1.2 });
    }
  }

  /** 煙突のある工場と発電所・ごみ処理場から、煙や蒸気が出るようにする。建物や施設が変わったときだけ作り直す。 */
  private syncEmitters(): void {
    const { city } = this;
    const key = `${city.zones.version}:${city.facilitiesVersion}`;
    if (key === this.emittersKey) return;
    this.emittersKey = key;
    const next: Emitter[] = [];
    for (const c of city.zones.cells.values()) {
      // 工場の煙突は、建物の大きさが 2 以上のとき。供給が途絶えると止まる
      if (c.zone !== ZoneType.Industrial || c.building < 2 || !c.served) continue;
      const ch = factoryChimney(c);
      next.push({ kind: "smoke", x: ch.x, y: ch.y1, z: ch.z, rate: (c.building >= 3 ? 2.2 : 1.4) * Math.sqrt(c.w * c.h), carry: hash2(5, c.x, c.y) });
    }
    for (const f of city.facilities.values()) {
      if ((city.facilityNet.get(f.id) ?? 0) === 0) continue;
      if (f.type === FacilityType.Power) steamPoints(f).forEach((p, i) => next.push({ kind: "steam", x: p.x, y: p.y, z: p.z, rate: i === 0 ? 2.5 : 2, carry: i * 0.5 }));
      else if (f.type === FacilityType.Garbage) {
        const p = smokePoint(f);
        next.push({ kind: "smoke", x: p.x, y: p.y, z: p.z, rate: 1.6, carry: 0.3 });
      }
    }
    this.emitters = next;
    this.rebuildBlades();
  }

  /** 風力発電所の羽根 (3 枚)。ハブを中心に、南を向いた面で回る。 */
  private rebuildBlades(): void {
    for (const b of this.blades) {
      this.bladeRoot.remove(b.group);
      b.group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
    }
    this.blades = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
    for (const f of this.city.facilities.values()) {
      if (f.type !== FacilityType.Wind) continue;
      windTurbines(f).forEach((t, i) => {
        const grp = new THREE.Group();
        grp.position.set(t.x, t.h, t.z + 1.6);
        for (let k = 0; k < 3; k++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, t.r, 0.3), mat);
          blade.position.set(0, t.r / 2, 0);
          const pivot = new THREE.Group();
          pivot.rotation.z = (k * Math.PI * 2) / 3;
          pivot.add(blade);
          grp.add(pivot);
        }
        this.bladeRoot.add(grp);
        this.blades.push({ group: grp, speed: i === 0 ? 1 : 1.25, phase: hash2(9, f.x + i, f.y) * Math.PI * 2 });
      });
    }
  }

  private updateBlades(dt: number): void {
    this.spin += dt * (0.8 + this.windLevel * 3.2);
    for (const b of this.blades) b.group.rotation.z = -(this.spin * b.speed + b.phase);
  }

  /** 建物が新しく建った・なくなったところに、土ぼこりを出す。建った建物には足場をかける。 */
  private watchBuildings(): void {
    const { zones } = this.city;
    if (zones.version === this.seenVersion) return;
    this.seenVersion = zones.version;
    const now = new Map<string, { b: number; w: number; h: number; built: number }>();
    for (const c of zones.cells.values()) if (c.building > 0) now.set(`${c.x},${c.y}`, { b: c.building, w: c.w, h: c.h, built: c.built });
    if (!this.first) {
      for (const [k, v] of now) {
        const old = this.seen.get(k);
        // 建て替えは同じ大きさでも建った日が変わるので、それも見る
        if (!old || old.b !== v.b || old.w !== v.w || old.h !== v.h || old.built !== v.built) this.burst(k, "built", v);
      }
      for (const [k, v] of this.seen) if (!now.has(k)) this.burst(k, "gone", v);
    }
    this.first = false;
    this.seen = now;
  }

  private burst(key: string, why: "built" | "gone", lot: { b: number; w: number; h: number }): void {
    const [tx, ty] = key.split(",").map(Number) as [number, number];
    const cx = (tx + lot.w / 2) * TILE;
    const cz = (ty + lot.h / 2) * TILE;
    const n = Math.round((why === "built" ? 9 : 12) * Math.sqrt(lot.w * lot.h)); // 広い建物ほど土ぼこりが多い
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 10 + Math.random() * 14;
      this.particles.push({ kind: "dust", x: cx, y: 1, z: cz, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, age: 0, life: 0.55 + Math.random() * 0.35, size: 1.6 + Math.random() * 1.2 });
    }
    if (why === "built") {
      for (let i = 0; i < 4 && this.particles.length < MAX_PARTICLES; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({ kind: "spark", x: cx, y: 4, z: cz, vx: Math.cos(a) * 18, vy: 8, vz: Math.sin(a) * 18, age: 0, life: 0.4 + Math.random() * 0.2, size: 0.9 });
      }
      this.addScaffold(key, tx, ty, lot);
    }
  }

  /** 建ちたての建物の足場: 敷地のまわりに、支柱と横木の格子が建物の高さまで立つ。だんだん薄れて消える。 */
  private addScaffold(key: string, tx: number, ty: number, lot: { b: number; w: number; h: number }): void {
    const c = this.city.zones.get(tx, ty);
    if (!c || c.building === 0) return;
    this.scaffolds = this.scaffolds.filter((s) => {
      if (s.key !== key) return true;
      this.group.remove(s.lines);
      s.lines.geometry.dispose();
      return false;
    });
    const b = baseRect(c);
    const h = wallHeight(c) + 2;
    const x0 = b.x - 0.8;
    const x1 = b.x + b.w + 0.8;
    const z0 = b.y - 0.8;
    const z1 = b.y + b.h + 0.8;
    const pts: number[] = [];
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => pts.push(ax, ay, az, bx, by, bz);
    const poles = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 4));
      for (let i = 0; i <= n; i++) seg(ax + ((bx - ax) * i) / n, 0, az + ((bz - az) * i) / n, ax + ((bx - ax) * i) / n, h, az + ((bz - az) * i) / n);
    };
    poles(x0, z0, x1, z0);
    poles(x1, z0, x1, z1);
    poles(x1, z1, x0, z1);
    poles(x0, z1, x0, z0);
    const rungs = Math.max(2, Math.round(h / 4.5));
    for (let k = 1; k <= rungs; k++) {
      const y = (h * k) / rungs;
      seg(x0, y, z0, x1, y, z0);
      seg(x1, y, z0, x1, y, z1);
      seg(x1, y, z1, x0, y, z1);
      seg(x0, y, z1, x0, y, z0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9a14a, transparent: true }));
    this.group.add(lines);
    const life = SCAFFOLD_SEC[Math.min(2, Math.max(0, lot.b - 1))]! + 0.25 * (lot.w * lot.h - 1);
    this.scaffolds.push({ key, age: 0, life: Math.min(4.5, life), lines });
  }

  private updateScaffolds(dt: number): void {
    for (let i = this.scaffolds.length - 1; i >= 0; i--) {
      const s = this.scaffolds[i]!;
      s.age += dt;
      if (s.age >= s.life) {
        this.group.remove(s.lines);
        s.lines.geometry.dispose();
        (s.lines.material as THREE.Material).dispose();
        this.scaffolds.splice(i, 1);
        continue;
      }
      const t = s.age / s.life;
      (s.lines.material as THREE.LineBasicMaterial).opacity = t < 0.7 ? 0.95 : 0.95 * (1 - (t - 0.7) / 0.3);
    }
  }

  dispose(): void {
    this.layer.dispose();
    for (const s of this.scaffolds) {
      s.lines.geometry.dispose();
      (s.lines.material as THREE.Material).dispose();
    }
    for (const b of this.blades) b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
