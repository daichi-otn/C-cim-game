import * as THREE from "three";

/**
 * タイトル画面の背景: 夕暮れの街で、タワークレーンがビルを 1 階ずつ組み上げる (3D)。
 * 影を落とし、ビルはコンクリートとガラスの質感、クレーンは格子状の骨組みで描く。見た目だけのもの。
 */

const FLOOR_H = 2.6;
const MAX_FLOORS = 10;
/** 1 階ぶんの、クレーンの作業時間 (秒)。 */
const CYCLE = 4.6;
const CRANE_X = -10;
const CRANE_Z = -2;
const CRANE_TOP = 44;

/** 0〜1 の、番号から決まる値 (いつも同じ)。 */
const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 91.7 + k * 13.3) * 43758.5453;
  return x - Math.floor(x);
};

/** ガラスの窓の模様: 明かりの点いた窓と、暗い窓。 */
function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#24283a";
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 16)
    for (let x = 0; x < 128; x += 16) {
      g.fillStyle = "#2c3346";
      g.fillRect(x + 1, y + 1, 14, 14);
      if (rnd(x * 3 + y, 9) > 0.55) {
        g.fillStyle = `rgba(255, ${190 + Math.floor(rnd(x, y) * 40)}, 120, 0.95)`;
        g.fillRect(x + 3, y + 3, 10, 10);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface TitleCrane {
  render(seconds: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** タイトル画面の 3D 背景を作る。canvas に WebGL で描く。 */
export function createTitleCrane(canvas: HTMLCanvasElement): TitleCrane {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb88062, 80, 230);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

  // 空: 上は夜の青、下は夕焼けの色
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext("2d")!;
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(0.5, "#3a2b5c");
  grad.addColorStop(0.85, "#e4775a");
  grad.addColorStop(1, "#f2a06b");
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  // 光: 低い夕日 (影を落とす) と、空の光
  scene.add(new THREE.HemisphereLight(0xffd2a8, 0x1a1830, 0.9));
  const sun = new THREE.DirectionalLight(0xffa868, 2.2);
  sun.position.set(-50, 30, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -20, near: 1, far: 200 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // 地面 (舗装の色)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x23222e, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 周りの街のビル (コンクリートとガラス)
  const win = windowTexture();
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, map: win, roughness: 0.25, metalness: 0.45, emissive: 0x3a2410, emissiveMap: win, emissiveIntensity: 0.7 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6c6a78, roughness: 0.9 });
  const buildings: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const w = 5 + rnd(i, 1) * 6;
    const h = 10 + rnd(i, 2) * 34;
    const x = -100 + rnd(i, 3) * 200;
    const z = -48 + rnd(i, 4) * 74;
    if (Math.abs(x - CRANE_X) < 20 && z > -14) continue; // 作業の場所は空ける
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + rnd(i, 5) * 0.4)), rnd(i, 6) > 0.5 ? glass : concrete);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    buildings.push(b);
  }

  // 建設中のビル: 柱と床 (鉄骨) を、1 階ずつ増やす
  const site = new THREE.Group();
  site.position.set(4, 0, -2);
  scene.add(site);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.45, metalness: 0.55 });
  const colGeo = new THREE.BoxGeometry(0.7, FLOOR_H, 0.7);
  const slabGeo = new THREE.BoxGeometry(12, 0.5, 12);
  const floors: THREE.Group[] = [];
  for (let f = 0; f < MAX_FLOORS; f++) {
    const g = new THREE.Group();
    g.position.y = f * FLOOR_H;
    for (const [cx, cz] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]] as const) {
      const c = new THREE.Mesh(colGeo, steel);
      c.position.set(cx, FLOOR_H / 2, cz);
      c.castShadow = true;
      g.add(c);
    }
    const slab = new THREE.Mesh(slabGeo, steel);
    slab.position.y = FLOOR_H + 0.25;
    slab.castShadow = true;
    slab.receiveShadow = true;
    g.add(slab);
    g.visible = false;
    site.add(g);
    floors.push(g);
  }

  // タワークレーン: 格子の塔、旋回する腕 (上下の弦材と斜材)、カウンターウエイト、フック
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.6, metalness: 0.4 });
  const crane = new THREE.Group();
  crane.position.set(CRANE_X, 0, CRANE_Z);
  scene.add(crane);
  const bar = (len: number, thick: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), mat);
  // 塔: 4 本の柱と、一定の間隔の水平材・斜材
  const tower = new THREE.Group();
  crane.add(tower);
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]] as const) {
    const leg = bar(CRANE_TOP, 0.22, yellow);
    leg.position.set(dx, CRANE_TOP / 2, dz);
    leg.castShadow = true;
    tower.add(leg);
  }
  for (let y = 2; y < CRANE_TOP; y += 3) {
    for (const [ax, az, rx, rz] of [[0, -1.2, 2.4, 0.2], [0, 1.2, 2.4, 0.2], [-1.2, 0, 0.2, 2.4], [1.2, 0, 0.2, 2.4]] as const) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(rx, 0.18, rz), dark);
      rung.position.set(ax, y, az);
      tower.add(rung);
    }
  }
  const slew = new THREE.Group(); // 旋回する上部
  slew.position.y = CRANE_TOP;
  crane.add(slew);
  const JIB = 28;
  // 腕: 上下の弦材 (長い棒) と、斜めの格子
  for (const y of [-0.9, 0.9]) {
    const chord = bar(JIB, 0.25, yellow);
    chord.rotation.z = Math.PI / 2;
    chord.position.set(JIB / 2 - 4, y, 0);
    chord.castShadow = true;
    slew.add(chord);
  }
  for (let x = -4; x < JIB - 4; x += 2) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.16), dark);
    brace.position.set(x + 1, 0, 0);
    brace.rotation.z = 0.7;
    slew.add(brace);
  }
  // カウンターウエイトとキャブ
  const weight = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2.6), dark);
  weight.position.set(-6, 0.5, 0);
  weight.castShadow = true;
  slew.add(weight);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.8), new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.3, metalness: 0.2 }));
  cab.position.set(-2.4, 2.0, 0.6);
  slew.add(cab);
  // 作業の位置 (トロリー) とワイヤー、フック、吊り荷
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.8), dark);
  slew.add(trolley);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  slew.add(wire);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), dark);
  slew.add(hook);
  const load = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 11), steel);
  load.castShadow = true;
  slew.add(load);
  // 航空障害灯 (塔の先で点滅)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b2e }));
  beacon.position.y = CRANE_TOP + 1.2;
  crane.add(beacon);

  const size = { w: 1, h: 1 };
  void size;
  return {
    render(seconds: number) {
      // 作業の周期: 1 階ぶん。床の数は時間で増え、最後まで行くと最初から組み直す
      const cycles = Math.floor(seconds / CYCLE);
      const p = (seconds % CYCLE) / CYCLE;
      const built = Math.min(cycles % (MAX_FLOORS + 3), MAX_FLOORS);
      floors.forEach((g, i) => (g.visible = i < built));
      // 旋回: 資材置き場 (右) から、建設中のビルの上 (左) へ運ぶ
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const pickAng = -0.85;
      const placeAng = 0.5;
      const ang = p < 0.35 ? pickAng : p < 0.7 ? pickAng + (placeAng - pickAng) * ease : placeAng;
      slew.rotation.y = ang;
      // 吊り荷の高さ: 持ち上げて、運んで、下ろす
      const top = built * FLOOR_H + 3;
      const lift = p < 0.2 ? p / 0.2 : p < 0.7 ? 1 : p < 0.92 ? 1 - (p - 0.7) / 0.22 : 0;
      const hookY = -CRANE_TOP + 9 + lift * (CRANE_TOP - top - 9) * 0.7;
      const reach = 4 + (JIB - 8) * (0.3 + 0.6 * Math.min(1, Math.abs(Math.sin(ang * 2))));
      trolley.position.set(reach, -0.9, 0);
      wire.position.set(reach, hookY / 2, 0);
      wire.scale.y = -hookY;
      hook.position.set(reach, hookY - 0.5, 0);
      load.position.set(reach, hookY - 1.2, 0);
      load.visible = p < 0.92;
      // カメラは、ゆっくり寄ったり引いたり
      const drift = Math.sin(seconds * 0.07) * 3;
      camera.position.set(-4 + drift, 26, 92);
      camera.lookAt(0, 20, -6);
      renderer.render(scene, camera);
    },
    resize(width: number, height: number) {
      size.w = width;
      size.h = height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      // 広い画面では、景色を右へずらす (中央のメニューに、クレーンが隠れないように)
      camera.setViewOffset(width, height, width > 700 ? -width * 0.24 : 0, 0, width, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      renderer.dispose();
      skyTex.dispose();
      win.dispose();
      glass.dispose();
      concrete.dispose();
    },
  };
}
