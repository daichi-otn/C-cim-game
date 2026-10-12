import * as THREE from "three";

/**
 * タイトル画面の背景: タワークレーンが、ビルを 1 階ずつ組み上げる (3D)。
 * 夕暮れの街並みの中で、クレーンが旋回し、鉄骨の床を運んで積む。見た目だけのもの。
 */

const FLOOR_H = 2.4;
const MAX_FLOORS = 9;
/** 1 階ぶんの、クレーンの作業時間 (秒)。 */
const CYCLE = 4.2;

/** 窓の明かりの模様 (街のビル用)。 */
function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1a1830";
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 10)
    for (let x = 0; x < 64; x += 10) {
      const lit = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      if (lit - Math.floor(lit) > 0.45) {
        g.fillStyle = `rgba(255, ${190 + Math.floor((lit % 1) * 40)}, 120, 0.95)`;
        g.fillRect(x + 2, y + 3, 5, 5);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb8705a, 70, 210);
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
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  // 光: 夕暮れの斜めの光と、空の反射
  scene.add(new THREE.HemisphereLight(0xffc9a0, 0x1a1830, 1.1));
  const sun = new THREE.DirectionalLight(0xffb27a, 1.6);
  sun.position.set(-30, 25, 40);
  scene.add(sun);

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1b1a28, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const win = windowTexture();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b3361, map: win, roughness: 0.8, emissive: 0x20180c, emissiveMap: win, emissiveIntensity: 0.9 });
  // 周りの街のビル (奥にも手前にも、いくつか)
  const rnd = (i: number, k: number) => {
    const x = Math.sin(i * 91.7 + k * 13.3) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 26; i++) {
    const w = 4 + rnd(i, 1) * 5;
    const h = 8 + rnd(i, 2) * 26;
    const x = -90 + rnd(i, 3) * 180;
    const z = -40 + rnd(i, 4) * 70;
    if (Math.abs(x) < 26 && z > -6) continue; // 作業の場所は空ける
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bodyMat);
    b.position.set(x, h / 2, z);
    scene.add(b);
  }

  // 建設中のビル (1 階ずつ増える)
  const site = new THREE.Group();
  site.position.set(4, 0, -2);
  scene.add(site);
  const frame = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.3 });
  const floorGeo = new THREE.BoxGeometry(12, 0.6, 12);
  const floors: THREE.Mesh[] = [];
  for (let f = 0; f < MAX_FLOORS; f++) {
    const m = new THREE.Mesh(floorGeo, frame);
    m.position.y = f * FLOOR_H + FLOOR_H;
    m.visible = false;
    site.add(m);
    floors.push(m);
  }

  // タワークレーン
  const crane = new THREE.Group();
  crane.position.set(-12, 0, -2);
  scene.add(crane);
  const craneColor = new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.5 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2), craneColor);
  tower.position.y = 20;
  crane.add(tower);
  const slew = new THREE.Group(); // 旋回する部分
  slew.position.y = 40;
  crane.add(slew);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 0.9), craneColor);
  jib.position.x = 9;
  slew.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x4a4e55 }));
  counter.position.x = -4;
  slew.add(counter);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  slew.add(cable);
  const load = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 10), frame);
  slew.add(load);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
  lamp.position.set(-7, 1.2, 0);
  slew.add(lamp);

  const size = { w: 1, h: 1 };
  return {
    render(seconds: number) {
      // 作業の周期: 1 階ぶん。床の数は時間で増え、最後まで行くと最初から組み直す
      const cycles = Math.floor(seconds / CYCLE);
      const p = (seconds % CYCLE) / CYCLE;
      const built = cycles % (MAX_FLOORS + 2);
      floors.forEach((m, i) => (m.visible = i < Math.min(built, MAX_FLOORS)));
      // 旋回: 地面の資材置き場 (右) から、建設中のビルの上 (左) へ運ぶ
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const pickAng = -0.9;
      const placeAng = 0.5;
      const ang = p < 0.35 ? pickAng : p < 0.7 ? pickAng + (placeAng - pickAng) * ease : placeAng;
      slew.rotation.y = ang;
      // 吊り荷の高さ: 持ち上げて、運んで、下ろす
      const top = Math.min(built, MAX_FLOORS) * FLOOR_H + 2;
      const lift = p < 0.2 ? p / 0.2 : p < 0.7 ? 1 : p < 0.9 ? 1 - (p - 0.7) / 0.2 : 0;
      const hookY = -14 - lift * (26 - top) * 0.6;
      cable.scale.y = -hookY;
      cable.position.y = hookY / 2;
      load.position.set(7, hookY - 0.5, 0);
      load.visible = p < 0.92;
      lamp.position.y = 1.2;
      // カメラは、ゆっくり寄ったり引いたり
      const drift = Math.sin(seconds * 0.07) * 4;
      camera.position.set(-6 + drift, 22, 78);
      camera.lookAt(0, 16, -4);
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
      bodyMat.dispose();
    },
  };
}
