import * as THREE from "three";
import type { City } from "../sim/city";
import { ZoneType, type ZoneCell } from "../sim/zoning";
import { addLot, type Parts } from "./buildingGeo";
import type { District } from "../sim/district";
import { addFacility } from "./facilityGeo";
import type { FacilityLike } from "./facilityShape3d";
import { GeoBuilder } from "./geo";
import { applyFacadeShader } from "./facadeShader";
import { frontRotation } from "./orientation";

/** 建物と施設を、このタイル数四方のまとまり (ブロック) ごとに 1 つのメッシュにする。変わったブロックだけ作り直す。 */
const BLOCK = 16;

interface Block {
  solid: THREE.Mesh | null;
  glass: THREE.Mesh | null;
  lit: THREE.Mesh | null;
  sig: string;
}

/**
 * 区画の建物と施設の 3D 表示。ブロックごとに、不透明な面・窓ガラス・夜に灯る窓の 3 つのメッシュを持つ。
 * 夜の窓の明るさは、setNight で全体にまとめて変える。
 */
export class Structures3D {
  readonly group = new THREE.Group();
  private blocks = new Map<string, Block>();
  private solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35 });
  private litMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  private lastKey = "";
  private snowUniform = { value: 0 };

  /** 建設中の場所 (ここには描かない。建設の演出が描く)。 */
  constructor(private city: City, private construction?: { isHidden(key: string): boolean; version: number }) {
    this.group.name = "structures";
    // 上向きの面 (屋根) を、雪の量だけ白くする
    const u = this.snowUniform;
    applyFacadeShader(this.solidMat, u);
  }

  /** 屋根に積もった雪の量 (0〜1)。 */
  setSnow(v: number): void {
    this.snowUniform.value = v;
  }

  /** 夜の度合い (0 = 昼、1 = 真夜中) に合わせて、窓の灯りを変える。 */
  setNight(night: number): void {
    const o = Math.min(1, night * 1.15);
    this.litMat.opacity = o;
    for (const b of this.blocks.values()) if (b.lit) b.lit.visible = o > 0.02;
  }

  update(): void {
    const { zones } = this.city;
    let unserved = 0;
    for (const c of zones.cells.values()) if (c.building > 0 && !c.served) unserved++;
    const key = `${zones.version}:${unserved}:${this.city.facilitiesVersion}:${this.city.networkVersion}:${this.city.districtsVersion}:${this.construction?.version ?? 0}:${this.city.graph.version}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    // ブロックごとに、建物と施設を集める
    interface Item {
      lot?: ZoneCell;
      district?: District;
      rot?: number;
      fac?: FacilityLike & { id: number };
      sig: string;
    }
    const perBlock = new Map<string, Item[]>();
    const add = (bx: number, by: number, it: Item) => {
      const k = `${bx},${by}`;
      let list = perBlock.get(k);
      if (!list) perBlock.set(k, (list = []));
      list.push(it);
    };
    for (const c of zones.cells.values()) {
      if (c.building === 0) continue;
      if (this.construction?.isHidden(`${c.x},${c.y}`)) continue; // 建設中は、建設の演出が描く
      const occ = c.zone !== ZoneType.Residential || c.residents > 0 ? 1 : 0;
      const g = this.city.districtOf(c);
      const rot = frontRotation(this.city.graph, c);
      add(Math.floor(c.x / BLOCK), Math.floor(c.y / BLOCK), { lot: c, district: g, rot, sig: `L${c.x},${c.y},${c.w},${c.h},${c.building},${c.density},${c.served ? 1 : 0},${occ},${c.built},${g?.id ?? 0}:${g?.color ?? 0},r${rot.toFixed(4)}` });
    }
    for (const f of this.city.facilities.values()) {
      const conn = (this.city.facilityNet.get(f.id) ?? 0) !== 0 ? 1 : 0;
      add(Math.floor(f.x / BLOCK), Math.floor(f.y / BLOCK), { fac: f, sig: `F${f.id},${f.type},${f.x},${f.y},${f.size},${conn}` });
    }
    // 変わったブロックだけ作り直し、なくなったブロックは消す
    for (const [k, list] of perBlock) {
      list.sort((a, b) => (a.sig < b.sig ? -1 : 1));
      const sig = list.map((i) => i.sig).join("|");
      const old = this.blocks.get(k);
      if (old && old.sig === sig) continue;
      if (old) this.removeBlock(k, old);
      this.blocks.set(k, this.makeBlock(list.map((i) => i), sig));
    }
    for (const [k, b] of this.blocks) {
      if (!perBlock.has(k)) {
        this.removeBlock(k, b);
        this.blocks.delete(k);
      }
    }
  }

  private makeBlock(items: { lot?: ZoneCell; district?: District; rot?: number; fac?: FacilityLike & { id: number } }[], sig: string): Block {
    const parts: Parts = { solid: new GeoBuilder(), glass: new GeoBuilder(), lit: new GeoBuilder() };
    for (const it of items) {
      if (it.lot) addLot(parts, it.lot, it.district?.color, it.rot);
      else if (it.fac) {
        const conn = (this.city.facilityNet.get(it.fac.id) ?? 0) !== 0;
        addFacility(parts, it.fac, conn, true);
      }
    }
    const mk = (b: GeoBuilder, mat: THREE.Material, cast: boolean, receive: boolean): THREE.Mesh | null => {
      const geo = b.build();
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      this.group.add(m);
      return m;
    };
    const block: Block = {
      solid: mk(parts.solid, this.solidMat, true, true),
      glass: mk(parts.glass, this.glassMat, false, true),
      lit: mk(parts.lit, this.litMat, false, false),
      sig,
    };
    if (block.lit) {
      block.lit.renderOrder = 3;
      block.lit.visible = this.litMat.opacity > 0.02;
    }
    return block;
  }

  private removeBlock(_key: string, b: Block): void {
    for (const m of [b.solid, b.glass, b.lit]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
  }

  dispose(): void {
    for (const [k, b] of this.blocks) this.removeBlock(k, b);
    this.blocks.clear();
    this.solidMat.dispose();
    this.glassMat.dispose();
    this.litMat.dispose();
  }
}
