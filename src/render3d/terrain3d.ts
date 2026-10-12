import * as THREE from "three";
import { CHUNK_SIZE, heightAt, profileOf } from "../sim/terrain";
import { renderTerrainTexture, resolutionFor } from "./terrainTexture";

/** 1 タイルの大きさ (px。世界の単位)。 */
export const TILE = 16;
const CHUNK_PX = CHUNK_SIZE * TILE;
/** チャンク 1 枚あたりの、メッシュの分割数 (1 タイルを 2 分割)。 */
const SUBDIV = CHUNK_SIZE;
/** 1 フレームに作るチャンクの数の上限 (一度に作ると、動きが止まるため)。 */
const BUILDS_PER_FRAME = 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 水面の高さ。水の地形はここより下に沈み、その上は青い地面の色で水に見える。 */
export const WATER_Z = -2.2;

/**
 * 世界の点 (wx, wy: px) の地面の高さ (px)。街を建てる平地・砂浜・森は 0。水辺は沈み、山は盛り上がる。
 * 道路・建物は、いつも高さ 0 の地面に載る (山の中は、トンネルが通る)。
 */
export function groundHeight(seed: number, wx: number, wy: number): number {
  const h = heightAt(seed, wx / TILE, wy / TILE);
  const P = profileOf(seed);
  if (h < P.sand) {
    // 水の深さに応じて沈み、砂浜の端で 0 に戻る
    return WATER_Z * 1.4 * (1 - smooth(0.3, P.sand, h));
  }
  // 山: 標高が高いほど、急に盛り上がる (ふもとはなだらか、高いところは峰になる)
  if (h > P.mountain - 0.03) {
    const t = h - (P.mountain - 0.03);
    return (t * 380 + t * t * 2600) * smooth(0, 0.04, t);
  }
  return 0;
}

/** 地形のメッシュ。見えているチャンクだけを作り、離れたものは捨てる。拡大率に応じて、色の絵の細かさを切り替える。 */
export class Terrain3D {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private res = 0;
  private material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  /** 季節の色合い (掛ける色) と、雪の白さ (自ら発する明るさ)。新しく作るチャンクにも使う。 */
  private tint = new THREE.Color(0xffffff);
  private snow = new THREE.Color(0x000000);

  constructor(private seed: number) {
    this.group.name = "terrain";
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  /** 世界の可視範囲 (px) とズーム倍率から、必要なチャンクを作り、要らないものを捨てる。 */
  update(b: { x0: number; y0: number; x1: number; y1: number }, zoom: number): void {
    const res = resolutionFor(zoom);
    if (res !== this.res) {
      this.disposeChunks();
      this.res = res;
    }
    const minCx = Math.floor(b.x0 / CHUNK_PX);
    const maxCx = Math.floor(b.x1 / CHUNK_PX);
    const minCy = Math.floor(b.y0 / CHUNK_PX);
    const maxCy = Math.floor(b.y1 / CHUNK_PX);
    const wanted: string[] = [];
    for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) wanted.push(`${cx},${cy}`);
    const keep = new Set(wanted);
    let built = 0;
    for (const key of wanted) {
      if (this.chunks.has(key)) continue;
      if (built >= BUILDS_PER_FRAME && this.chunks.size > 0) break; // 続きは次のフレームで
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      this.chunks.set(key, this.build(cx, cy));
      built++;
    }
    for (const [key, mesh] of this.chunks) {
      if (!keep.has(key)) {
        this.disposeMesh(mesh);
        this.chunks.delete(key);
      }
    }
  }

  /** 季節の色合いと雪の白さを、すべてのチャンクに反映する。tint: 掛ける色、snow: 0〜1 (雪が積もった白さ)。 */
  setSeason(tint: number, snow: number): void {
    this.tint.set(tint);
    this.snow.setRGB(0.62 * snow, 0.66 * snow, 0.72 * snow);
    for (const m of this.chunks.values()) {
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.color.copy(this.tint);
      mat.emissive.copy(this.snow);
    }
  }

  private build(cx: number, cy: number): THREE.Mesh {
    const n = SUBDIV + 1;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const wx = cx * CHUNK_PX + (i / SUBDIV) * CHUNK_PX;
        const wy = cy * CHUNK_PX + (j / SUBDIV) * CHUNK_PX;
        const k = j * n + i;
        pos[k * 3] = wx;
        pos[k * 3 + 1] = groundHeight(this.seed, wx, wy);
        pos[k * 3 + 2] = wy;
        uv[k * 2] = i / SUBDIV;
        uv[k * 2 + 1] = 1 - j / SUBDIV; // テクスチャの上が北 (y が小さいほう)
      }
    }
    const idx = new Uint32Array(SUBDIV * SUBDIV * 6);
    let t = 0;
    for (let j = 0; j < SUBDIV; j++) {
      for (let i = 0; i < SUBDIV; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        // 上向きの面になる向きで並べる
        idx[t++] = a;
        idx[t++] = c;
        idx[t++] = b;
        idx[t++] = b;
        idx[t++] = c;
        idx[t++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(renderTerrainTexture(this.seed, cx, cy, this.res));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, color: this.tint.clone(), emissive: this.snow.clone() }));
    mesh.receiveShadow = true;
    mesh.name = `chunk ${cx},${cy}`;
    this.group.add(mesh);
    return mesh;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    const m = mesh.material as THREE.MeshLambertMaterial;
    m.map?.dispose();
    m.dispose();
  }

  private disposeChunks(): void {
    for (const m of this.chunks.values()) this.disposeMesh(m);
    this.chunks.clear();
  }

  dispose(): void {
    this.disposeChunks();
    this.material.dispose();
  }
}
