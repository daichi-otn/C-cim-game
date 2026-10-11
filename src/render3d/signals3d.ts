import * as THREE from "three";
import type { City } from "../sim/city";
import { buildSignalPlan, lightOf, type Light } from "../sim/signals";
import type { Roads3D } from "./roads3d";
import { TILE } from "./terrain3d";

/** 信号機の柱と灯り。交差点の、道の入口ごとに 1 本立つ。灯りの色は、今の色 (青・黄・赤) で決まる。 */
const POLE_H = 10;
const LIGHT_COLOR: Record<Light, number> = { green: 0x3ddc6a, yellow: 0xffc83a, red: 0xff3b2e };

interface Head {
  x: number;
  y: number;
  z: number;
  group: number;
}

export class Signals3D {
  readonly group = new THREE.Group();
  private poles: THREE.InstancedMesh | null = null;
  private lamps: THREE.InstancedMesh | null = null;
  private heads: Head[] = [];
  private version = -1;
  private shown: Light[] = [];
  private poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4e55 });
  private lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private poleGeo = new THREE.BoxGeometry(0.7, POLE_H, 0.7);
  private lampGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);

  constructor(
    private city: City,
    private roads: Roads3D,
  ) {
    this.group.name = "signals";
  }

  /** 毎フレーム。clock は信号の時間 (秒)。色が変わったところだけ直す。 */
  update(clock: number): void {
    const graph = this.city.graph;
    if (graph.version !== this.version) {
      this.version = graph.version;
      this.build();
    }
    if (!this.lamps) return;
    this.heads.forEach((h, i) => {
      const light = lightOf(h.group, clock);
      if (this.shown[i] === light) return;
      this.shown[i] = light;
      this.lamps!.setColorAt(i, new THREE.Color(LIGHT_COLOR[light]));
    });
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  /** 信号の柱と灯りを、道の入口ごとに作る。道路が変わったときだけ。 */
  private build(): void {
    this.clear();
    const { graph } = this.city;
    const plan = buildSignalPlan(graph);
    for (const [nodeId, approaches] of plan) {
      const n = graph.nodes.get(nodeId)!;
      for (const [edgeId, group] of approaches) {
        const e = graph.edges.get(edgeId)!;
        const o = graph.nodes.get(e.a === nodeId ? e.b : e.a)!;
        const len = Math.hypot(o.x - n.x, o.y - n.y) || 1;
        const ux = (o.x - n.x) / len;
        const uy = (o.y - n.y) / len;
        // 交差点の手前の、道の端 (歩道の上)。道の右側に立てる
        const px = n.x + ux * 0.7 - uy * 0.4;
        const py = n.y + uy * 0.7 + ux * 0.4;
        const h = this.roads.heightOnEdge(edgeId, e.a === nodeId ? 0.02 : 0.98);
        this.heads.push({ x: px * TILE, y: h, z: py * TILE, group });
      }
    }
    if (this.heads.length === 0) return;
    const n = this.heads.length;
    this.poles = new THREE.InstancedMesh(this.poleGeo, this.poleMat, n);
    this.lamps = new THREE.InstancedMesh(this.lampGeo, this.lampMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    this.heads.forEach((h, i) => {
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, s);
      this.poles!.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(h.x, h.y + POLE_H + 1.2, h.z), q, s);
      this.lamps!.setMatrixAt(i, m);
      this.lamps!.setColorAt(i, new THREE.Color(LIGHT_COLOR.green));
      this.shown[i] = "green";
    });
    this.poles.castShadow = true;
    this.group.add(this.poles, this.lamps);
  }

  private clear(): void {
    this.heads = [];
    this.shown = [];
    for (const m of [this.poles, this.lamps]) if (m) this.group.remove(m);
    this.poles?.dispose();
    this.lamps?.dispose();
    this.poles = null;
    this.lamps = null;
  }

  dispose(): void {
    this.clear();
    this.poleGeo.dispose();
    this.lampGeo.dispose();
    this.poleMat.dispose();
    this.lampMat.dispose();
  }
}
