import * as THREE from "three";

/**
 * 粒の描画 (煙・蒸気・土ぼこり・火花・雨・雪)。点 (Points) の大きさを、画面の拡大率に合わせて世界の大きさで決める。
 * 粒ごとに、位置・大きさ (世界の px)・色・透明度を持つ。
 */
export class ParticleLayer {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private mat: THREE.ShaderMaterial;
  count = 0;

  constructor(readonly capacity: number, opts: { soft?: boolean; additive?: boolean } = {}) {
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 1 }, uSoft: { value: opts.soft === false ? 0 : 1 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          gl_PointSize = max(1.0, aSize * uScale);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uSoft; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          if (d > 1.0) discard;
          float a = mix(1.0, 1.0 - d * d, uSoft) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo.setDrawRange(0, 0);
  }

  /** 画面の拡大率 (px/世界 1px) と、描画器の画素比を渡す。点の大きさ (世界の px) に、これをかけて画面の大きさにする。 */
  setScale(zoom: number, pixelRatio: number): void {
    this.mat.uniforms.uScale!.value = zoom * pixelRatio;
  }

  begin(): void {
    this.count = 0;
  }

  /** 粒を 1 つ足す (容量を超えたら無視)。 */
  add(x: number, y: number, z: number, size: number, color: number, alpha: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.col[i * 3] = ((color >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((color >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (color & 255) / 255;
    this.alpha[i] = alpha;
  }

  end(): void {
    this.geo.setDrawRange(0, this.count);
    for (const k of ["position", "aSize", "aColor", "aAlpha"]) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
