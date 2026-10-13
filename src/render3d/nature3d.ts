import * as THREE from "three";
import { hash2 } from "../sim/rng";
import { CHUNK_SIZE, Tile, heightAt, profileOf, tileAt } from "../sim/terrain";
import { leafLook } from "../render/weatherLook";
import { mixColor } from "../render/lighting";
import { TILE } from "./terrain3d";

const CHUNK_PX = CHUNK_SIZE * TILE;
/** 1 フレームに作る森のチャンクの数の上限。 */
const BUILDS_PER_FRAME = 2;
/** 森の木の、地の緑 (4 種類の濃さ)。季節の色 (春の花・秋の紅葉・冬の雪) を、ここへ混ぜる。 */
const TREE_SHADES = [0x2e7a35, 0x2a6c31, 0x3a8a3c, 0x24602c];
/** 針葉樹の、地の緑 (山のふもとの、濃い青みの緑)。季節の色はほとんど混ぜない。 */
const CONIFER_SHADES = [0x1d4f34, 0x23583a, 0x2b6244];

interface Tree {
  x: number;
  z: number;
  /** 樹冠の半径 (px)。 */
  r: number;
  trunk: number;
  shade: number;
  tone: 0 | 1;
}

/** 木の種類ごとの、描画のまとまり (同じ形の木を、1 回の描画でまとめて出す)。 */
interface Grove {
  crown: THREE.InstancedMesh;
  trunk: THREE.InstancedMesh;
  trees: Tree[];
  conifer: boolean;
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
 * 森の木 (3D)。見えているチャンクの森のタイルに木を立てる。低い森は丸い葉の木 (広葉樹)、山のふもとは細長い針葉樹。
 * 季節で葉の色が変わり (春は花、秋は紅葉、冬は雪)、風で揺れる。
 * 木の位置は種子から決まる (同じ地形ならいつも同じ)。見た目だけで、街の計算には関わらない。
 */
export class Nature3D {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Grove[]>();
  private uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  private crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private coniferMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  // 1 本の木を軽くするため、樹冠は 20 面体、針葉樹は 6 角錐、幹は 4 角柱 (側面だけ)。木は数が多いので、ここが描画の重さのほとんどを決める
  private crownGeo = new THREE.IcosahedronGeometry(1, 0);
  private coniferGeo = new THREE.ConeGeometry(1, 1, 6, 1, false);
  private trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 1, 4, 1, true);
  private seasonKey = "";
  private day = 0;
  /** タイルごとの木の多さ (0 少ない / 1 ふつう / 2 多い)。地区で決まる。 */
  private levelAt: (tx: number, ty: number) => number = () => 1;

  constructor(private seed: number) {
    this.group.name = "nature";
    this.trunkGeo.translate(0, 0.5, 0);
    this.coniferGeo.translate(0, 0.5, 0); // 底が y=0、先が y=1
    addSway(this.crownMat, this.uniforms);
    addSway(this.coniferMat, this.uniforms);
    addSway(this.trunkMat, this.uniforms);
  }

  /** タイルごとの木の多さを決める関数を入れ替える。木は作り直す。 */
  setLevelAt(fn: (tx: number, ty: number) => number): void {
    this.levelAt = fn;
    this.invalidate();
  }

  /** 木をすべて作り直す (地区の木の多さが変わったとき)。 */
  invalidate(): void {
    for (const groves of this.chunks.values()) this.removeGroves(groves);
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
    for (const [key, groves] of this.chunks) {
      if (!keep.has(key)) {
        this.removeGroves(groves);
        this.chunks.delete(key);
      }
    }
    for (const groves of this.chunks.values()) {
      for (const g of groves) {
        const n = Math.ceil(g.trees.length * keepRatio);
        g.crown.count = n;
        g.trunk.count = n;
      }
    }
    // 季節の色は、6 日ごとに、すべての木に付け直す
    const sk = `${Math.floor(day / 6)}`;
    if (sk !== this.seasonKey) {
      this.seasonKey = sk;
      for (const groves of this.chunks.values()) for (const g of groves) this.recolor(g);
    }
  }

  private removeGroves(groves: Grove[]): void {
    for (const g of groves) {
      this.group.remove(g.crown, g.trunk);
      g.crown.dispose();
      g.trunk.dispose();
    }
  }

  private build(cx: number, cy: number): Grove[] {
    const broad: Tree[] = [];
    const conifer: Tree[] = [];
    const P = profileOf(this.seed);
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
          // 山のふもと (標高が高い森) は針葉樹が多い
          const high = heightAt(this.seed, gx, gy) > P.mountain - 0.2;
          const count = 3 + Math.floor(hash2(this.seed + 11, gx, gy) * 2.99) + (level === 2 ? 2 : 0); // 多い地区は、森の木をさらに増やす
          for (let k = 0; k < count; k++) {
            if (level === 0 && hash2(this.seed + 71 + k, gx, gy) < 0.6) continue; // 少ない地区は、6 割の木を間引く
            const t = tree(gx, gy, k);
            const isConifer = high && hash2(this.seed + 91 + k, gx, gy) < 0.7;
            (isConifer ? conifer : broad).push(t);
          }
        } else if (tile === Tile.Grass && level === 2 && hash2(this.seed + 81, gx, gy) < 0.35) {
          broad.push(tree(gx, gy, 0)); // 多い地区は、草地にも木を植える
        }
      }
    }
    const groves: Grove[] = [];
    if (broad.length) groves.push(this.makeGrove(broad, false));
    if (conifer.length) groves.push(this.makeGrove(conifer, true));
    return groves;
  }

  private makeGrove(trees: Tree[], conifer: boolean): Grove {
    const crown = new THREE.InstancedMesh(conifer ? this.coniferGeo : this.crownGeo, conifer ? this.coniferMat : this.crownMat, trees.length);
    const trunk = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, trees.length);
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), new THREE.Vector3(1, t.trunk, 1));
      trunk.setMatrixAt(i, m);
      if (conifer) {
        // 針葉樹は、幹の上から細く高い円錐を立てる
        m.compose(new THREE.Vector3(t.x, t.trunk * 0.6, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r * 0.95, t.r * 2.6, t.r * 0.95));
      } else {
        m.compose(new THREE.Vector3(t.x, t.trunk + t.r * 0.55, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.r * 0.9, t.r));
      }
      crown.setMatrixAt(i, m);
    });
    crown.castShadow = true;
    trunk.castShadow = true;
    crown.receiveShadow = true;
    crown.frustumCulled = false;
    trunk.frustumCulled = false;
    const g: Grove = { crown, trunk, trees, conifer };
    this.recolor(g);
    this.group.add(crown, trunk);
    return g;
  }

  /** 樹冠の色: 地の緑に、季節の色 (春の花・秋の紅葉・冬の雪) を、季節ごとの濃さで混ぜる。針葉樹は季節の影響を弱くする。 */
  private recolor(g: Grove): void {
    const look = leafLook(this.day);
    const c = new THREE.Color();
    const shades = g.conifer ? CONIFER_SHADES : TREE_SHADES;
    const amount = Math.min(1, look.alpha * (g.conifer ? 0.4 : 1.15));
    g.trees.forEach((t, i) => {
      const base = shades[t.shade % shades.length]!;
      const season = t.tone === 0 ? look.c1 : look.c2;
      c.set(mixColor(base, season, amount));
      g.crown.setColorAt(i, c);
    });
    if (g.crown.instanceColor) g.crown.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const groves of this.chunks.values()) this.removeGroves(groves);
    this.chunks.clear();
    this.crownGeo.dispose();
    this.coniferGeo.dispose();
    this.trunkGeo.dispose();
    this.crownMat.dispose();
    this.coniferMat.dispose();
    this.trunkMat.dispose();
  }
}
