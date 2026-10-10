import * as THREE from "three";
import type { Weather } from "../sim/weather";
import { WeatherBlend } from "../render/weatherLook";
import { ParticleLayer } from "./particles3d";

const MAX_RAIN = 700;
const MAX_SNOW = 500;

/** 乱数 (見た目が毎回同じになるよう、数式で作る)。 */
const rnd = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * 天気の見た目 (雨・雪の粒)。視点のまわりに粒を降らせる (どこへ動かしても、画面に同じ密度で降る)。
 * 雨・雪・曇りの強さは blend が、天気が変わるとなめらかに切り替える。見た目だけで、街の計算には関わらない。
 */
export class Weather3D {
  readonly group = new THREE.Group();
  readonly blend = new WeatherBlend();
  private rain: THREE.LineSegments;
  private rainPos = new Float32Array(MAX_RAIN * 6);
  private snow = new ParticleLayer(MAX_SNOW, { soft: true });
  /** 雨・雪の粒の量の倍率 (グラフィック設定)。 */
  private particleScale = 1;

  setParticleScale(v: number): void {
    this.particleScale = v;
  }
  private clock = 0;
  private first = true;

  constructor() {
    this.group.name = "weather";
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    geo.setDrawRange(0, 0);
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4d6f0, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 6;
    this.group.add(this.rain, this.snow.points);
  }

  /** dt: 経過秒。center: 視点の地面の点。span: 粒を降らせる範囲の一辺 (世界の px)。night: 夜は雨や雪を暗くする。 */
  update(dt: number, weather: Weather, center: { x: number; y: number }, span: number, zoom: number, pixelRatio: number, night: number): void {
    if (this.first) {
      this.blend.snap(weather);
      this.first = false;
    } else {
      this.blend.update(weather, dt);
    }
    this.clock += dt;
    const b = this.blend;
    const t = this.clock;
    const half = span / 2;
    const H = 260;
    // 雨: 斜めに落ちる細い線
    const rainN = Math.floor(MAX_RAIN * b.rain * this.particleScale);
    const slant = 0.18 + b.wind * 0.12;
    for (let i = 0; i < rainN; i++) {
      const sp = 220 + rnd(i + 3) * 120;
      const y = H - ((t * sp + rnd(i + 7) * H * 3) % H);
      const x = center.x + ((rnd(i + 1) * span + t * sp * slant * 0.6) % span) - half;
      const z = center.y + (rnd(i + 2) * span % span) - half;
      this.rainPos.set([x, y, z, x + 3.2 * slant * 3, y + 11, z], i * 6);
    }
    (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.rain.geometry.setDrawRange(0, rainN * 2);
    const rainMat = this.rain.material as THREE.LineBasicMaterial;
    rainMat.opacity = 0.55 * Math.min(1, b.rain) * (1 - 0.45 * night);
    this.rain.visible = rainN > 0;
    // 雪: ゆっくり舞い落ちる白い粒
    this.snow.setScale(zoom, pixelRatio);
    this.snow.begin();
    const snowN = Math.floor(MAX_SNOW * b.snow * this.particleScale);
    for (let i = 0; i < snowN; i++) {
      const sp = 22 + rnd(i + 11) * 18;
      const y = H - ((t * sp + rnd(i + 17) * H * 3) % H);
      const sway = Math.sin(t * (0.8 + rnd(i + 5)) + i) * 6;
      const x = center.x + ((rnd(i + 4) * span + t * 6 * b.wind) % span) - half + sway;
      const z = center.y + (rnd(i + 6) * span % span) - half;
      this.snow.add(x, y, z, 1.6 + rnd(i + 9) * 1.8, 0xffffff, 0.9 * Math.min(1, b.snow) * (1 - 0.4 * night));
    }
    this.snow.end();
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.dispose();
  }
}
