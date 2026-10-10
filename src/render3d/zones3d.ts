import * as THREE from "three";
import { hash2 } from "../sim/rng";
import { ZoneType, type ZoneCell, type ZoneMap } from "../sim/zoning";
import { ZONE_COLORS } from "./colors";
import { GeoBuilder } from "./geo";
import { TILE } from "./terrain3d";

const SEED = 0x51ed;

/** 建っている敷地の地面 (芝生・駐車場・砂利)。 */
const LOT_COLORS: Record<number, number> = {
  [ZoneType.Residential]: 0x86b86a,
  [ZoneType.Commercial]: 0x70747b,
  [ZoneType.Industrial]: 0x9c978a,
  [ZoneType.Office]: 0x8f95a3,
};

const Y_EMPTY = 0.2;
const Y_LOT = 0.22;

/** ゾーンの色塗りと、建物の敷地の地面。zones.version が変わったときだけ作り直す。塗り範囲のプレビューも持つ。 */
export class Zones3D {
  readonly group = new THREE.Group();
  private ground: THREE.Mesh | null = null;
  private empty: THREE.Mesh | null = null;
  private preview: THREE.Mesh | null = null;
  private drawnVersion = -1;

  constructor(private zones: ZoneMap) {
    this.group.name = "zones";
  }

  update(): void {
    if (this.drawnVersion === this.zones.version) return;
    this.drawnVersion = this.zones.version;
    this.disposeGround();
    const lots = new GeoBuilder();
    const empty = new GeoBuilder();
    for (const c of this.zones.cells.values()) {
      if (c.building === 0 && c.part === undefined) this.addEmpty(empty, c);
      else this.addLotGround(lots, c);
    }
    const lg = lots.build();
    if (lg) {
      this.ground = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.ground.receiveShadow = true;
      this.group.add(this.ground);
    }
    const eg = empty.build();
    if (eg) {
      this.empty = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 }));
      this.empty.renderOrder = 1;
      this.group.add(this.empty);
    }
  }

  /** 未開発の区画: 色の付いた地面と、うすい区画線。密度が高いほど濃く、密度の数だけ印の点が付く。 */
  private addEmpty(g: GeoBuilder, c: ZoneCell): void {
    const x = c.x * TILE;
    const z = c.y * TILE;
    const color = ZONE_COLORS[c.zone] ?? 0xff00ff;
    g.rect(x, z, TILE, TILE, Y_EMPTY, color);
    g.rect(x + 0.4, z + 0.4, TILE - 0.8, 0.5, Y_EMPTY + 0.02, 0xffffff);
    g.rect(x + 0.4, z + TILE - 0.9, TILE - 0.8, 0.5, Y_EMPTY + 0.02, 0xffffff);
    g.rect(x + 0.4, z + 0.4, 0.5, TILE - 0.8, Y_EMPTY + 0.02, 0xffffff);
    g.rect(x + TILE - 0.9, z + 0.4, 0.5, TILE - 0.8, Y_EMPTY + 0.02, 0xffffff);
    for (let i = 0; i < c.density; i++) g.rect(x + TILE - 4 - i * 3, z + TILE - 4, 2, 2, Y_EMPTY + 0.03, 0xffffff);
  }

  private addLotGround(g: GeoBuilder, c: ZoneCell): void {
    const x = c.x * TILE;
    const z = c.y * TILE;
    g.rect(x, z, TILE, TILE, Y_LOT, LOT_COLORS[c.zone] ?? 0xff00ff);
    if (c.zone === ZoneType.Residential) {
      for (let i = 0; i < 4; i++) g.rect(x, z + i * 4, TILE, 2, Y_LOT + 0.01, 0x7aa95f); // 芝生のしま模様
    } else if (c.zone === ZoneType.Commercial || c.zone === ZoneType.Office) {
      for (let i = 1; i < 4; i++) g.rect(x + i * 4 - 0.25, z + TILE - 4, 0.5, 4, Y_LOT + 0.01, 0xe8e8e8); // 駐車場の白線
    } else {
      g.rect(x + hash2(SEED, c.x, c.y) * 8, z + 2, 5, 4, Y_LOT + 0.01, 0x8d887b); // 砂利・コンクリートのむら
    }
  }

  /** 塗り範囲のプレビュー。ok のタイルは指定色、塗れないタイルは赤で示す。null で消す。 */
  showPreview(cells: { x: number; y: number; ok: boolean }[] | null, color: number): void {
    if (this.preview) {
      this.group.remove(this.preview);
      this.preview.geometry.dispose();
      (this.preview.material as THREE.Material).dispose();
      this.preview = null;
    }
    if (!cells || cells.length === 0) return;
    const g = new GeoBuilder();
    for (const c of cells) g.rect(c.x * TILE, c.y * TILE, TILE, TILE, 0.9, c.ok ? color : 0xe05a4f);
    const geo = g.build();
    if (!geo) return;
    this.preview = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthTest: false }));
    this.preview.renderOrder = 10;
    this.group.add(this.preview);
  }

  private disposeGround(): void {
    for (const m of [this.ground, this.empty]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.ground = this.empty = null;
  }

  dispose(): void {
    this.disposeGround();
    this.showPreview(null, 0);
  }
}
