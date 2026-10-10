import * as THREE from "three";
import { FLOOR_PX } from "./buildingShape";

/**
 * 建物の材質に、実物に近い質感を足す (見た目だけ。形や色の基準は変えない)。
 * - 壁: 細かいざらつき・階ごとの継ぎ目・地面の近くの陰 (AO)
 * - 屋根: 砂利のようなざらつき
 * - 雪: 上向きの面だけ白くする (snow の量で決まる)
 * 座標はワールド (px)。メッシュは回転せず、そのまま置かれている前提。
 */
export function applyFacadeShader(mat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial, snow: { value: number }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = snow;
    shader.uniforms.uFloorPx = { value: FLOOR_PX };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vUp;\nvarying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvUp = normal.y;\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uSnow;
uniform float uFloorPx;
varying float vUp;
varying vec3 vWp;
float fhash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float wall = 1.0 - smoothstep(0.35, 0.65, abs(vUp));
  float roof = smoothstep(0.55, 0.9, vUp);
  // ざらつき: 壁は細かく、屋根は砂利のように粗く
  float grain = fhash(floor(vWp * 0.9)) - 0.5;
  float gravel = fhash(floor(vWp * 0.35)) - 0.5;
  float shadeK = 1.0 + grain * 0.07 * wall + gravel * 0.10 * roof;
  // 階ごとの継ぎ目 (壁だけ、少し暗い線)
  float seam = mod(vWp.y, uFloorPx);
  shadeK *= mix(1.0, 0.9 + 0.1 * smoothstep(0.0, 0.25, seam), wall);
  // 地面の近くは、建物の陰で暗い (AO)
  shadeK *= mix(1.0, mix(0.72, 1.0, smoothstep(0.0, 9.0, vWp.y)), wall);
  diffuseColor.rgb *= shadeK;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), uSnow * smoothstep(0.55, 0.9, vUp));
}`,
      );
  };
}
