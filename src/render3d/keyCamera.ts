import type { Camera3D } from "./camera3d";
import { normalizeKey } from "../keymap";

/** 視点を動かす向き: w/s = 前後、a/d = 左右、q/e = 向き、r/f = 仰角。これは向きの名前で、押すキーは設定で決める。 */
export const CAMERA_KEYS = ["w", "a", "s", "d", "q", "e", "r", "f"] as const;
export type CameraKey = (typeof CAMERA_KEYS)[number];
/** 向き → 押すキー。 */
export type CameraBindings = Record<CameraKey, string>;
export const DEFAULT_CAMERA_BINDINGS: CameraBindings = { w: "w", s: "s", a: "a", d: "d", q: "q", e: "e", r: "r", f: "f" };

/** 画面の 1 秒あたりの移動 (px)。拡大するほど、地面上の移動は小さくなる。 */
const MOVE_PX_PER_SEC = 420;
const YAW_RAD_PER_SEC = 1.3;
const PITCH_RAD_PER_SEC = 0.9;

export class KeyCamera {
  private held = new Set<CameraKey>();
  private byKey = new Map<string, CameraKey>();

  constructor(bindings: CameraBindings = DEFAULT_CAMERA_BINDINGS) {
    this.setBindings(bindings);
  }

  /** 押すキーを変える。押したままのキーは、離したものとして扱う。 */
  setBindings(b: CameraBindings): void {
    this.byKey = new Map(CAMERA_KEYS.map((dir) => [normalizeKey(b[dir]), dir] as const));
    this.held.clear();
  }

  /** キーが押されたら true (視点の操作に使うキーだったら、ほかの処理には回さない)。 */
  down(key: string): boolean {
    const dir = this.byKey.get(normalizeKey(key));
    if (dir === undefined) return false;
    this.held.add(dir);
    return true;
  }

  up(key: string): void {
    const dir = this.byKey.get(normalizeKey(key));
    if (dir !== undefined) this.held.delete(dir);
  }

  /** ウィンドウのフォーカスが外れたときなど、押しっぱなしを解除する。 */
  clear(): void {
    this.held.clear();
  }

  /** dt: 経過秒。active が false のときは動かさない (メニューなどが開いているとき)。 */
  update(view: Camera3D, dt: number, active: boolean): void {
    if (!active || this.held.size === 0 || dt <= 0) return;
    const step = MOVE_PX_PER_SEC * dt / view.zoom;
    const r = view.right;
    const u = view.up;
    let fwd = 0;
    let side = 0;
    if (this.held.has("w")) fwd += 1;
    if (this.held.has("s")) fwd -= 1;
    if (this.held.has("d")) side += 1;
    if (this.held.has("a")) side -= 1;
    if (fwd !== 0 || side !== 0) {
      view.x += (u.x * fwd + r.x * side) * step;
      view.y += (u.y * fwd + r.y * side) * step;
    }
    if (this.held.has("q")) view.yaw -= YAW_RAD_PER_SEC * dt;
    if (this.held.has("e")) view.yaw += YAW_RAD_PER_SEC * dt;
    if (this.held.has("r")) view.tilt(PITCH_RAD_PER_SEC * dt);
    if (this.held.has("f")) view.tilt(-PITCH_RAD_PER_SEC * dt);
  }
}
