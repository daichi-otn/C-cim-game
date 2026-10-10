import * as THREE from "three";
import type { Lighting } from "../render/lighting";
import { Camera3D } from "./camera3d";

/** 視点から見える範囲 (奥行き)。山の高さや、斜めから見たときの遠くまでを含める。 */
const CAMERA_DISTANCE = 4000;
const NEAR = 10;
const FAR = 12000;

/** 昼と夜の空の色 (地平線の色)。画面の背景として、傾けて遠くまで見たときにだけ見える。 */
const SKY_DAY = new THREE.Color(0x9cc6ea);
const SKY_NIGHT = new THREE.Color(0x0a1538);
const SKY_DUSK = new THREE.Color(0xff9a6a);

/**
 * 描画が GPU ではなく、ソフトウェア (CPU) で行われるか。ヘッドレスのブラウザ (SwiftShader など) や、GPU のない環境でそうなる。
 * 3D の描画はとても重くなるので、影や木を控えめにする目安にする。
 */
export function isSoftwareRenderer(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export interface SceneEnv {
  /** 時刻 (0〜24)。 */
  hour: number;
  lighting: Lighting;
  /** 曇りの暗さ (0〜1。雨や雪の日は大きい)。 */
  overcast: number;
}

/**
 * 3D の舞台: 描画器・光・正射影のカメラ。街の見た目 (地形・道路・建物…) は、ここの scene に追加する。
 * 世界の座標は、three の x = 東、z = 南、y = 高さ (px。1 タイル = 16)。
 */
export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR);
  /** 視点の状態 (操作はこちらに対して行い、描画の前に camera へ反映する)。 */
  readonly view = new Camera3D();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b7a5a, 0.6);
  private shadowsOn: boolean;

  /** 描画の細かさ (画面の画素に対する倍率) の上限と、いま使っている値。 */
  private baseScale: number;
  private scale: number;
  private frameMs = 33;
  private lastFrameAt = 0;
  private frames = 0;
  private slowFor = 0;
  private fastFor = 0;

  constructor(host: HTMLElement, opts: { shadows?: boolean; antialias?: boolean; scale?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true, powerPreference: "high-performance" });
    this.renderer.localClippingEnabled = true; // 建設中の建物を、地面から少しずつ見せる (切り取り面)
    // 描画の細かさ (画面の画素に対する倍率)。高解像度の画面は 2 まで。重いときは render() が自動で下げる
    this.baseScale = opts.scale ?? Math.min(window.devicePixelRatio || 1, 2);
    this.scale = this.baseScale;
    this.renderer.setPixelRatio(this.scale);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.shadowsOn = opts.shadows ?? true;
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.background = SKY_DAY.clone();
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = this.shadowsOn;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    const sc = this.sun.shadow.camera;
    sc.near = 10;
    sc.far = 6000;
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.view.setSize(width, height);
  }

  /** 視点 (view) を three のカメラに反映する。 */
  syncCamera(): void {
    const v = this.view;
    const cam = this.camera;
    cam.left = -v.width / 2 / v.zoom;
    cam.right = v.width / 2 / v.zoom;
    cam.top = v.height / 2 / v.zoom;
    cam.bottom = -v.height / 2 / v.zoom;
    cam.near = NEAR;
    cam.far = FAR;
    cam.updateProjectionMatrix();
    const u = v.up;
    const cosP = Math.cos(v.pitch);
    const sinP = Math.sin(v.pitch);
    // 見ている点から、画面の下側 (−up) へ引いて、上へ持ち上げた位置に置く
    cam.position.set(v.x - u.x * cosP * CAMERA_DISTANCE, sinP * CAMERA_DISTANCE, v.y - u.y * cosP * CAMERA_DISTANCE);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.x, 0, v.y);
    // 影の範囲は、見ている点のまわりに合わせる (遠くの影は描かない)
    const half = Math.min(1400, Math.max(300, (Math.max(v.width, v.height) / v.zoom) * 0.75));
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
  }

  /** 時刻・曇りに合わせて、太陽と空の光を変える。 */
  applyEnvironment(env: SceneEnv): void {
    const night = env.lighting.night;
    const day = 1 - night;
    // 太陽: 6 時に東から昇り、12 時に真南の高い所、18 時に西へ沈む。夜は月明かりとして弱く青く
    const a = ((((env.hour % 24) + 24) % 24) - 6) / 12 * Math.PI; // 0..π が昼
    const dayLight = Math.max(0, Math.sin(a));
    const sunDir = new THREE.Vector3(Math.cos(a), Math.max(0.18, Math.sin(a) * 0.9 + 0.12), 0.45).normalize();
    const moon = dayLight <= 0.02;
    if (moon) sunDir.set(-0.4, 0.8, 0.3).normalize();
    this.sun.position.set(this.view.x + sunDir.x * 2500, sunDir.y * 2500, this.view.y + sunDir.z * 2500);
    this.sun.target.position.set(this.view.x, 0, this.view.y);
    const warm = new THREE.Color(0xffffff).lerp(new THREE.Color(env.lighting.color), Math.min(1, env.lighting.alpha * 2.2));
    const sunColor = moon ? new THREE.Color(0x6f86c8) : warm;
    const clear = 1 - Math.min(0.8, env.overcast * 3.2);
    this.sun.color.copy(sunColor);
    this.sun.intensity = moon ? 0.35 : (0.5 + 2.2 * dayLight) * clear;
    this.sun.castShadow = this.shadowsOn && !moon && clear > 0.35;
    this.hemi.intensity = (0.28 + 0.4 * day) * (0.85 + 0.15 * clear);
    this.hemi.color.set(night > 0.5 ? 0x4a5f9a : 0xbfd8ff);
    this.hemi.groundColor.set(night > 0.5 ? 0x1f2a3f : 0x6b7a5a);
    // 空の色 (背景): 昼は水色、朝夕は橙、夜は紺
    const sky = this.scene.background as THREE.Color;
    sky.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    sky.lerp(SKY_DUSK, Math.min(0.6, env.lighting.alpha * 1.5 * (night > 0.05 && night < 0.95 ? 1 : 0)));
    sky.lerp(new THREE.Color(0x8e98a4), Math.min(0.7, env.overcast * 3));
  }

  render(): void {
    this.adaptQuality();
    this.syncCamera();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 描画が追いつかないときは描画の細かさを下げ、余裕があれば元に戻す (弱い内蔵 GPU やソフトウェア描画でも、動きが止まらないように)。
   * 切り替えは数秒の平均で決め、一瞬の重さでは変えない。最初の数十フレームは、シェーダの準備で遅いので数えない。
   */
  private adaptQuality(): void {
    const now = performance.now();
    if (this.lastFrameAt > 0) {
      const ms = now - this.lastFrameAt;
      this.frameMs = this.frameMs * 0.9 + Math.min(ms, 250) * 0.1;
    }
    this.lastFrameAt = now;
    this.frames++;
    if (this.frames < 90) return;
    const dt = 1 / 60;
    if (this.frameMs > 40) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.frameMs < 22) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    const min = Math.max(0.5, this.baseScale * 0.5);
    if (this.slowFor > 2 && this.scale > min) {
      this.setScale(Math.max(min, this.scale * 0.8));
      this.slowFor = 0;
    } else if (this.fastFor > 5 && this.scale < this.baseScale) {
      this.setScale(Math.min(this.baseScale, this.scale * 1.15));
      this.fastFor = 0;
    }
  }

  private setScale(v: number): void {
    this.scale = Math.round(v * 100) / 100;
    this.renderer.setPixelRatio(this.scale);
  }

  /** 影のオン・オフと解像度 (グラフィック設定から)。 */
  setShadows(on: boolean, mapSize: number): void {
    this.shadowsOn = on;
    this.renderer.shadowMap.enabled = on;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** 描画の細かさの基準 (グラフィック設定から)。重いときの自動調整は、この値を上限にする。 */
  setBaseScale(v: number): void {
    this.baseScale = v;
    this.setScale(v);
  }

  /** いま描画に使っている細かさ (0.5〜上限)。 */
  get currentScale(): number {
    return this.scale;
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
