import * as THREE from "three";
import { hash2 } from "../sim/rng";
import { CHUNK_SIZE, Tile, tileAt } from "../sim/terrain";
import { leafLook } from "../render/weatherLook";
import { mixColor } from "../render/lighting";
import { TILE } from "./terrain3d";

const CHUNK_PX = CHUNK_SIZE * TILE;
/** 1 フレームに作る森のチャンクの数の上限。 */
const BUILDS_PER_FRAME = 2;
/** 森の木の、地の緑 (4 種類の濃さ)。季節の色 (春の花・秋の紅葉・冬の雪) を、ここへ混ぜる。 */
const TREE_SHADES = [0x2e7a35, 0x2a6c31, 0x3a8a3c, 0x24602c];

interface Tree {
  x: number;
  z: number;
  /** 樹冠の半径 (px)。 */
  r: number;
  trunk: number;
  shade: number;
  tone: 0 | 1;
}

/** 風で揺れる木のための、頂点の動き (instanceMatrix の位置で、木ごとに位相をずらす)。 */
function addSway(mat: THREE.MeshLambertMaterial, uniforms: { uTime: { value: number }; uWind: { value: number } }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float sway = sin(uTime * 1.6 + instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23);
        transformed.x += sway * uWind * (position.y + 1.0) * 0.16;
        transformed.z += cos(uTime * 1.3 + instanceMatrix[3].z * 0.31) * uWind * (position.y + 1.0) * 0.08;`,
      );
  };
}

/**
 * 森の木 (3D)。見えているチャンクの森のタイルに、幹と丸い樹冠の木を立てる。季節で葉の色が変わり (春は花、秋は紅葉、冬は雪)、風で揺れる。
 * 木の位置は種子から決まる (同じ地形ならいつも同じ)。見た目だけで、街の計算には関わらない。
 */
export class Nature3D {
  readonly group = new THREE.Group();
  private chunks = new Map<string, { crown: THREE.InstancedMesh; trunk: THREE.InstancedMesh; trees: Tree[] }>();
  private uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  private crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  // 1 本の木を軽くするため、樹冠は 20 面体、幹は 4 角柱 (側面だけ)。木は数が多いので、ここが描画の重さのほとんどを決める
  private crownGeo = new THREE.IcosahedronGeometry(1, 0);
  private trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 1, 4, 1, true);
  private seasonKey = "";
  private day = 0;
  /** タイルごとの木の多さ (0 少ない / 1 ふつう / 2 多い)。地区で決まる。 */
  private levelAt: (tx: number, ty: number) => number = () => 1;

  constructor(private seed: number) {
    this.group.name = "nature";
    this.trunkGeo.translate(0, 0.5, 0);
    addSway(this.crownMat, this.uniforms);
    addSway(this.trunkMat, this.uniforms);
  }

  /** タイルごとの木の多さを決める関数を入れ替える。木は作り直す。 */
  setLevelAt(fn: (tx: number, ty: number) => number): void {
    this.levelAt = fn;
    this.invalidate();
  }

  /** 木をすべて作り直す (地区の木の多さが変わったとき)。 */
  invalidate(): void {
    for (const c of this.chunks.values()) {
      this.group.remove(c.crown, c.trunk);
      c.crown.dispose();
      c.trunk.dispose();
    }
    this.chunks.clear();
  }

  /** dt: 経過秒、wind: 風の強さ (0〜1)、day: 経過日数 (季節の色)。b: 世界の可視範囲 (px)。zoom が小さい (遠い) ときは木を作らない。 */
  update(dt: number, wind: number, day: number, b: { x0: number; y0: number; x1: number; y1: number }, zoom: number, density = 1): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value = 0.2 + wind * 1.6;
    this.day = day;
    const show = zoom >= 0.35;
    this.group.visible = show;
    if (!show) return;
    // 遠いほど、木を間引く (一部の木だけを描く)
    const keepRatio = (zoom >= 1.2 ? 1 : zoom >= 0.8 ? 0.6 : zoom >= 0.55 ? 0.35 : 0.2) * density;
    const wanted: string[] = [];
    for (let cy = Math.floor(b.y0 / CHUNK_PX); cy <= Math.floor(b.y1 / CHUNK_PX); cy++) for (let cx = Math.floor(b.x0 / CHUNK_PX); cx <= Math.floor(b.x1 / CHUNK_PX); cx++) wanted.push(`${cx},${cy}`);
    const keep = new Set(wanted);
    let built = 0;
    for (const key of wanted) {
      if (this.chunks.has(key)) continue;
      if (built >= BUILDS_PER_FRAME && this.chunks.size > 0) break;
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      this.chunks.set(key, this.build(cx, cy));
      built++;
    }
    for (const [key, c] of this.chunks) {
      if (!keep.has(key)) {
        this.group.remove(c.crown, c.trunk);
        c.crown.dispose();
        c.trunk.dispose();
        this.chunks.delete(key);
      }
    }
    for (const c of this.chunks.values()) {
      const n = Math.ceil(c.trees.length * keepRatio);
      c.crown.count = n;
      c.trunk.count = n;
    }
    // 季節の色は、6 日ごとに、すべての木に付け直す
    const sk = `${Math.floor(day / 6)}`;
    if (sk !== this.seasonKey) {
      this.seasonKey = sk;
      for (const c of this.chunks.values()) this.recolor(c.crown, c.trees);
    }
  }

  private build(cx: number, cy: number) {
    const trees: Tree[] = [];
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const tree = (gx: number, gy: number, k: number): Tree => {
      const ox = hash2(this.seed + 21 + k, gx, gy);
      const oy = hash2(this.seed + 31 + k, gx, gy);
      const rr = 0.26 + hash2(this.seed + 41 + k, gx, gy) * 0.18;
      return {
        x: (gx + 0.15 + ox * 0.7) * TILE,
        z: (gy + 0.15 + oy * 0.7) * TILE,
        r: rr * TILE * 0.85,
        trunk: 3 + rr * 6,
        shade: Math.floor(hash2(this.seed + 51 + k, gx, gy) * TREE_SHADES.length),
        tone: hash2(this.seed + 61 + k, gx, gy) < 0.5 ? 0 : 1,
      };
    };
    for (let ty = 0; ty < CHUNK_SIZE; ty++) {
      for (let tx = 0; tx < CHUNK_SIZE; tx++) {
        const gx = x0 + tx;
        const gy = y0 + ty;
        const level = this.levelAt(gx, gy);
        const tile = tileAt(this.seed, gx, gy);
        if (tile === Tile.Forest) {
          const count = 3 + Math.floor(hash2(this.seed + 11, gx, gy) * 2.99) + (level === 2 ? 2 : 0); // 多い地区は、森の木をさらに増やす
          for (let k = 0; k < count; k++) {
            if (level === 0 && hash2(this.seed + 71 + k, gx, gy) < 0.6) continue; // 少ない地区は、6 割の木を間引く
            trees.push(tree(gx, gy, k));
          }
        } else if (tile === Tile.Grass && level === 2 && hash2(this.seed + 81, gx, gy) < 0.35) {
          trees.push(tree(gx, gy, 0)); // 多い地区は、草地にも木を植える
        }
      }
    }
    const crown = new THREE.InstancedMesh(this.crownGeo, this.crownMat, Math.max(1, trees.length));
    const trunk = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, Math.max(1, trees.length));
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), new THREE.Vector3(1, t.trunk, 1));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, t.trunk + t.r * 0.55, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.r * 0.9, t.r));
      crown.setMatrixAt(i, m);
    });
    crown.count = trees.length;
    trunk.count = trees.length;
    crown.castShadow = true;
    trunk.castShadow = true;
    crown.receiveShadow = true;
    crown.frustumCulled = false;
    trunk.frustumCulled = false;
    this.recolor(crown, trees);
    this.group.add(crown, trunk);
    return { crown, trunk, trees };
  }

  /** 樹冠の色: 地の緑に、季節の色 (春の花・秋の紅葉・冬の雪) を、季節ごとの濃さで混ぜる。 */
  private recolor(crown: THREE.InstancedMesh, trees: Tree[]): void {
    const look = leafLook(this.day);
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      const base = TREE_SHADES[t.shade]!;
      const season = t.tone === 0 ? look.c1 : look.c2;
      c.set(mixColor(base, season, Math.min(1, look.alpha * 1.15)));
      crown.setColorAt(i, c);
    });
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const c of this.chunks.values()) {
      c.crown.dispose();
      c.trunk.dispose();
    }
    this.chunks.clear();
    this.crownGeo.dispose();
    this.trunkGeo.dispose();
    this.crownMat.dispose();
    this.trunkMat.dispose();
  }
}
