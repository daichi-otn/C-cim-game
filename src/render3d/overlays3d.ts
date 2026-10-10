import * as THREE from "three";
import type { City } from "../sim/city";
import { FACILITY_SPECS, FacilityType } from "../sim/facilities";
import { landColor } from "../sim/landValue";
import { sickRateOf } from "../sim/environment";
import { ZoneType } from "../sim/zoning";
import { baseRect, wallHeight } from "./buildingShape";
import { FACILITY_COLORS } from "./facilityGeo";
import { facilityHeight, spot } from "./facilityShape3d";
import { GeoBuilder } from "./geo";
import { TILE } from "./terrain3d";

/** 病人が多い住宅 (寝込む割合がこれ以上) に付ける、赤い十字のマーク。 */
const SICK_MARK_RATE = 0.12;

const BADGE_GLYPH: Record<FacilityType, string> = {
  [FacilityType.Power]: "電",
  [FacilityType.Water]: "水",
  [FacilityType.Sewage]: "下",
  [FacilityType.Outside]: "外",
  [FacilityType.Police]: "警",
  [FacilityType.Fire]: "消",
  [FacilityType.Hospital]: "病",
  [FacilityType.School]: "小",
  [FacilityType.MiddleSchool]: "中",
  [FacilityType.HighSchool]: "高",
  [FacilityType.University]: "大",
  [FacilityType.Park]: "園",
  [FacilityType.NoiseBarrier]: "壁",
  [FacilityType.Garbage]: "ご",
  [FacilityType.Wind]: "風",
  [FacilityType.Solar]: "陽",
};

const textures = new Map<string, THREE.CanvasTexture>();

function badgeTexture(type: FacilityType): THREE.CanvasTexture {
  const key = `b${type}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#20252b";
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `#${FACILITY_COLORS[type].toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = type === FacilityType.Hospital || type === FacilityType.Power || type === FacilityType.Solar || type === FacilityType.Wind ? "#20252b" : "#ffffff";
  ctx.font = "700 32px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(BADGE_GLYPH[type], 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, tex);
  return tex;
}

function crossTexture(): THREE.CanvasTexture {
  const hit = textures.get("cross");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e05a4f";
  ctx.fillRect(27, 14, 10, 36);
  ctx.fillRect(14, 27, 36, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set("cross", tex);
  return tex;
}

/**
 * 画面に重ねる印: 施設の種類のバッジ (構造物の上に浮かぶ)・環境の色分け (O キー)・病人が多い住宅の赤い十字。
 * 施設・建物・日付が変わったときだけ作り直す (カメラに向くスプライト)。
 */
export class Overlays3D {
  readonly group = new THREE.Group();
  private badges = new THREE.Group();
  private marks = new THREE.Group();
  private heat: THREE.Mesh | null = null;
  private key = "";
  /** 住宅の環境の悪さを色で表示するか。 */
  showHeat = false;
  /** 地価の色分け (地価マップ)。 */
  showLand = false;

  constructor(private city: City) {
    this.group.name = "overlays";
    this.group.add(this.badges, this.marks);
  }

  update(): void {
    const { city } = this;
    const key = `${city.facilitiesVersion}:${city.zones.version}:${city.day}:${city.trafficVersion}:${this.showHeat}:${this.showLand}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    // 施設のバッジ
    for (const f of city.facilities.values()) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(f.type), depthTest: false, transparent: true }));
      const o = spot(f, 0.86, 0.14);
      sp.position.set(o.x, Math.max(facilityHeight(f) * 0.7, 6) + 7, o.z);
      sp.scale.set(10, 10, 1);
      sp.renderOrder = 12;
      void FACILITY_SPECS;
      this.badges.add(sp);
    }
    // 環境の色分けと、病人マーク
    const g = new GeoBuilder();
    for (const c of city.zones.cells.values()) {
      if (this.showLand) {
        // 地価マップ: 区画のすべてを、地価の色で塗る (青 = 安い、赤 = 高い)
        g.rect(c.x * TILE, c.y * TILE, c.w * TILE, c.h * TILE, 0.9 + 0.1, landColor(city.landValues.get(`${c.x},${c.y}`) ?? 0));
      }
      if (c.zone !== ZoneType.Residential || c.building === 0) continue;
      if (this.showHeat && !this.showLand && c.env.risk > 0.02) {
        const a = 0.7 * c.env.air;
        const n = 0.3 * c.env.noise;
        const o = 0.4 * c.env.odor;
        const color = a >= n && a >= o ? 0x8a5a2c : n >= o ? 0x8a55c0 : 0x9bbf3f;
        g.rect(c.x * TILE, c.y * TILE, c.w * TILE, c.h * TILE, 0.9 + 0.1, color);
      }
      if (c.residents > 0 && sickRateOf(c.env.risk, c.env.cared) >= SICK_MARK_RATE) {
        const b = baseRect(c);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: crossTexture(), depthTest: false, transparent: true }));
        sp.position.set(b.x + 3, wallHeight(c) + 6, b.y + 3);
        sp.scale.set(6, 6, 1);
        sp.renderOrder = 12;
        this.marks.add(sp);
      }
    }
    const geo = g.build();
    if (geo) {
      this.heat = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthTest: false }));
      this.heat.renderOrder = 7;
      this.group.add(this.heat);
    }
  }

  private clear(): void {
    for (const grp of [this.badges, this.marks]) {
      for (const c of [...grp.children]) {
        grp.remove(c);
        (c as THREE.Sprite).material.dispose();
      }
    }
    if (this.heat) {
      this.group.remove(this.heat);
      this.heat.geometry.dispose();
      (this.heat.material as THREE.Material).dispose();
      this.heat = null;
    }
  }

  dispose(): void {
    this.clear();
  }
}
