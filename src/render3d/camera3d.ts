/**
 * 3D 視点の計算 (描画ライブラリには依存しない)。正射影 (遠近をつけない) のカメラで、地面の格子が歪まない。
 *
 * 世界の座標 (px。1 タイル = 16) は、x が東、y が南、高さ h は上。
 * target: 画面の中心に見えている地面の点。zoom: 地面 1px が画面何 px か。
 * yaw: 地面を見る向きの回転 (0 = 北が画面の上)。pitch: 見下ろす角度 (π/2 = 真上から)。
 */
export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;
/** 見下ろす角度の範囲。真上 (π/2) の少し手前までにして、向きが決まらなくなるのを避ける。 */
export const MIN_PITCH = (25 * Math.PI) / 180;
export const MAX_PITCH = (89.5 * Math.PI) / 180;
/** 新しい街を始めるときの見下ろす角度 (度)。 */
export const DEFAULT_PITCH = (50 * Math.PI) / 180;

export class Camera3D {
  /** 画面の中心に見える地面の点 (世界の px)。 */
  x = 0;
  y = 0;
  zoom = 1;
  yaw = 0;
  pitch = DEFAULT_PITCH;
  /** 画面の大きさ (px)。 */
  width = 1280;
  height = 720;

  /** 画面の右向きの、地面での単位ベクトル。 */
  get right(): Point {
    return { x: Math.cos(this.yaw), y: Math.sin(this.yaw) };
  }

  /** 画面の上向きの、地面での単位ベクトル (yaw = 0 なら北 = y の負の向き)。 */
  get up(): Point {
    return { x: Math.sin(this.yaw), y: -Math.cos(this.yaw) };
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** 地面の点 p (高さ h) が画面のどこに見えるか。 */
  worldToScreen(p: Point, h = 0): Point {
    const r = this.right;
    const u = this.up;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const across = dx * r.x + dy * r.y;
    const along = dx * u.x + dy * u.y; // 画面の上へ向かう距離
    return {
      x: this.width / 2 + across * this.zoom,
      y: this.height / 2 - (along * Math.sin(this.pitch) + h * Math.cos(this.pitch)) * this.zoom,
    };
  }

  /** 画面の点 s の下にある、地面 (高さ 0) の点。 */
  screenToWorld(s: Point): Point {
    const r = this.right;
    const u = this.up;
    const across = (s.x - this.width / 2) / this.zoom;
    const along = -(s.y - this.height / 2) / (this.zoom * Math.sin(this.pitch));
    return { x: this.x + across * r.x + along * u.x, y: this.y + across * r.y + along * u.y };
  }

  /** 画面上のピクセル移動量ぶんだけ、地面をつかんで動かす (ドラッグ用)。 */
  panByScreen(dx: number, dy: number): void {
    const r = this.right;
    const u = this.up;
    const across = dx / this.zoom;
    const along = -dy / (this.zoom * Math.sin(this.pitch));
    this.x -= across * r.x + along * u.x;
    this.y -= across * r.y + along * u.y;
  }

  /** 画面座標 anchor の下にある地面の点を固定したまま、ズームする。 */
  zoomAt(anchor: Point, factor: number): void {
    const before = this.screenToWorld(anchor);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(anchor);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** 画面座標 anchor の下の地面の点を中心に、回す (yaw)。 */
  rotateAt(anchor: Point, dYaw: number): void {
    const before = this.screenToWorld(anchor);
    this.yaw += dYaw;
    const after = this.screenToWorld(anchor);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** 見下ろす角度を変える (範囲内に収める)。画面中心の地面の点は動かない。 */
  tilt(dPitch: number): void {
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dPitch));
  }

  /** 画面に見えている地面の範囲 (世界の px)。画面の 4 隅の地面の点を囲む長方形。 */
  visibleBounds(margin = 0): { x0: number; y0: number; x1: number; y1: number } {
    const pts = [
      this.screenToWorld({ x: 0, y: 0 }),
      this.screenToWorld({ x: this.width, y: 0 }),
      this.screenToWorld({ x: 0, y: this.height }),
      this.screenToWorld({ x: this.width, y: this.height }),
    ];
    return {
      x0: Math.min(...pts.map((p) => p.x)) - margin,
      y0: Math.min(...pts.map((p) => p.y)) - margin,
      x1: Math.max(...pts.map((p) => p.x)) + margin,
      y1: Math.max(...pts.map((p) => p.y)) + margin,
    };
  }

  /** 真上から、北を上にして見る (e2e や、道路を見やすくするとき)。 */
  setTopDown(): void {
    this.yaw = 0;
    this.pitch = MAX_PITCH;
  }
}
