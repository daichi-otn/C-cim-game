import type { City } from "../sim/city";
import type { Lighting } from "../render/lighting";
import type { FacilityType } from "../sim/facilities";
import { Scene3D } from "./scene3d";
import { Effects3D } from "./effects3d";
import { StreetLights3D } from "./lights3d";
import { Nature3D } from "./nature3d";
import { Weather3D } from "./weather3d";
import { seasonTint, snowCover } from "../render/weatherLook";
import { mixColor } from "../render/lighting";
import { FacilityPreview3D } from "./facilityPreview3d";
import { Overlays3D } from "./overlays3d";
import { Roads3D } from "./roads3d";
import { Structures3D } from "./structures3d";
import { Districts3D } from "./districts3d";
import { GRAPHICS_VALUES, type GraphicsLevels } from "./graphicsSettings";
import { Construction3D } from "./construction3d";
import { districtAt } from "../sim/district";
import { Traffic3D } from "./traffic3d";
import { Zones3D } from "./zones3d";
import { Terrain3D } from "./terrain3d";
import type { Camera3D } from "./camera3d";

/** 道路ツールのプレビュー・カーソル・色付けの、描画側の受け口。 */
export interface RoadPreviewApi {
  showPreview(seg: { ax: number; ay: number; bx: number; by: number; valid: boolean; type?: number; oneWay?: boolean; points?: { x: number; y: number }[]; control?: { x: number; y: number }; extra?: { x: number; y: number }[][] } | null): void;
  showEdges(ids: readonly number[] | null, color: number): void;
  showCursor(p: { x: number; y: number } | null, color: number): void;
}

const nullRoads: RoadPreviewApi = { showPreview() {}, showEdges() {}, showCursor() {} };

/**
 * 3D の街の表示全体。main.ts からは、これだけを通して描画する。
 * setCity で街を切り替え (前の街の表示は捨てる)、update で 1 フレームぶんの状態を渡し、render で描く。
 */
export class World3D {
  readonly scene: Scene3D;
  private roadView: Roads3D | null = null;
  private terrain: Terrain3D | null = null;
  private zones: Zones3D | null = null;
  private structures: Structures3D | null = null;
  private construction: Construction3D | null = null;
  private districts: Districts3D | null = null;
  private natureDistrictsVersion = -1;
  /** グラフィック設定を反映する (メニューから変えたとき、街を作ったとき)。 */
  applyGraphics(l: GraphicsLevels): void {
    this.scene.setShadows(l.shadows > 0, GRAPHICS_VALUES.shadows[l.shadows] || 1024);
    this.scene.setBaseScale(GRAPHICS_VALUES.resolution[l.resolution]!);
    this.treesOn = l.trees > 0;
    this.treeDensity = GRAPHICS_VALUES.trees[l.trees]!;
    if (this.nature) this.nature.group.visible = this.treesOn;
    this.traffic?.setCarScale(GRAPHICS_VALUES.cars[l.cars]!);
    this.weather.setParticleScale(GRAPHICS_VALUES.weather[l.weather]!);
  }
  private traffic: Traffic3D | null = null;
  private overlays: Overlays3D | null = null;
  private effects: Effects3D | null = null;
  private nature: Nature3D | null = null;
  private streetLights: StreetLights3D | null = null;
  private weather = new Weather3D();
  private facilityPreview = new FacilityPreview3D();
  private city: City | null = null;

  private treesOn: boolean;
  /** 木を描く割合の上限 (1 = 標準)。重い環境 (ソフトウェア描画) では小さくする。 */
  private treeDensity: number;

  constructor(host: HTMLElement, opts: { shadows?: boolean; antialias?: boolean; scale?: number; trees?: boolean; treeDensity?: number } = {}) {
    this.scene = new Scene3D(host, opts);
    this.treesOn = opts.trees ?? true;
    this.treeDensity = opts.treeDensity ?? 1;
  }

  /** 道路ツールのプレビューなどの受け口 (街がまだなければ、何もしない)。 */
  get roads(): RoadPreviewApi {
    return this.roadView ?? nullRoads;
  }

  get canvas(): HTMLCanvasElement {
    return this.scene.renderer.domElement;
  }

  get view(): Camera3D {
    return this.scene.view;
  }

  /** 音のために、聞く人の近くを走る車と、建設中の場所を調べる (タイル)。 */
  soundTraffic(cx: number, cy: number) {
    return this.traffic?.soundAt(cx, cy) ?? { weight: 0, x: cx, y: cy };
  }

  soundConstruction(cx: number, cy: number) {
    return this.construction?.soundAt(cx, cy) ?? { sites: [], hand: { weight: 0, x: cx, y: cy }, crane: { weight: 0, x: cx, y: cy } };
  }

  get chunkCount(): number {
    return this.terrain?.chunkCount ?? 0;
  }

  resize(): void {
    this.scene.resize(window.innerWidth, window.innerHeight);
  }

  /** 街を切り替える。前の街の表示は破棄する。 */
  setCity(city: City): void {
    this.terrain?.dispose();
    if (this.terrain) this.scene.scene.remove(this.terrain.group);
    this.roadView?.dispose();
    if (this.roadView) this.scene.scene.remove(this.roadView.group);
    this.zones?.dispose();
    if (this.zones) this.scene.scene.remove(this.zones.group);
    this.structures?.dispose();
    if (this.structures) this.scene.scene.remove(this.structures.group);
    this.construction?.dispose();
    if (this.construction) this.scene.scene.remove(this.construction.group);
    this.districts?.dispose();
    if (this.districts) this.scene.scene.remove(this.districts.group);
    this.traffic?.dispose();
    if (this.traffic) this.scene.scene.remove(this.traffic.group);
    this.overlays?.dispose();
    if (this.overlays) this.scene.scene.remove(this.overlays.group);
    this.effects?.dispose();
    if (this.effects) this.scene.scene.remove(this.effects.group);
    this.nature?.dispose();
    if (this.nature) this.scene.scene.remove(this.nature.group);
    this.streetLights?.dispose();
    if (this.streetLights) this.scene.scene.remove(this.streetLights.group);
    this.city = city;
    this.terrain = new Terrain3D(city.seed);
    this.scene.scene.add(this.terrain.group);
    this.roadView = new Roads3D(city.graph);
    this.scene.scene.add(this.roadView.group);
    this.zones = new Zones3D(city.zones);
    this.scene.scene.add(this.zones.group);
    this.construction = new Construction3D(city);
    this.scene.scene.add(this.construction.group);
    this.structures = new Structures3D(city, this.construction);
    this.scene.scene.add(this.structures.group);
    this.districts = new Districts3D(city);
    this.scene.scene.add(this.districts.group);
    this.traffic = new Traffic3D(city, this.roadView);
    this.traffic.showHeat = this.trafficHeat;
    this.scene.scene.add(this.traffic.group);
    this.overlays = new Overlays3D(city);
    this.overlays.showHeat = this.envHeat;
    this.overlays.showLand = this.landHeatOn;
    this.scene.scene.add(this.overlays.group);
    this.effects = new Effects3D(city);
    this.scene.scene.add(this.effects.group);
    this.nature = new Nature3D(city.seed);
    this.nature.group.visible = this.treesOn;
    this.nature.setLevelAt((tx, ty) => districtAt(city.districts, tx, ty)?.greenery ?? 1);
    this.natureDistrictsVersion = city.districtsVersion;
    this.scene.scene.add(this.nature.group);
    this.streetLights = new StreetLights3D(city);
    this.scene.scene.add(this.streetLights.group);
    if (!this.weather.group.parent) this.scene.scene.add(this.weather.group);
    if (!this.facilityPreview.group.parent) this.scene.scene.add(this.facilityPreview.group);
  }

  private trafficHeatOn = false;
  private envHeatOn = false;

  /** 道路の混雑の色分け (T キー)。 */
  get trafficHeat(): boolean {
    return this.trafficHeatOn;
  }
  set trafficHeat(v: boolean) {
    this.trafficHeatOn = v;
    if (this.traffic) this.traffic.showHeat = v;
  }

  /** 住宅の環境の色分け (O キー)。 */
  private landHeatOn = false;

  /** 地価マップ (色分け) の切り替え。 */
  get landHeat(): boolean {
    return this.landHeatOn;
  }
  set landHeat(v: boolean) {
    this.landHeatOn = v;
    if (this.overlays) this.overlays.showLand = v;
  }

  get envHeat(): boolean {
    return this.envHeatOn;
  }
  set envHeat(v: boolean) {
    this.envHeatOn = v;
    if (this.overlays) this.overlays.showHeat = v;
  }

  showZonePreview(cells: { x: number; y: number; ok: boolean }[] | null, color: number): void {
    this.zones?.showPreview(cells, color);
  }

  showFacilityPreview(f: { type: FacilityType; x: number; y: number; ok: boolean } | null): void {
    this.facilityPreview.show(f);
  }

  /** 1 フレームの更新。dt は実時間の秒 (一時停止中・メニュー中は 0)、simDt はゲーム内の時間の進み (速度をかけたもの)。 */
  update(dt: number, f: { simDt: number; hour: number; lighting: Lighting }): void {
    if (!this.terrain || !this.city) return;
    const v = this.view;
    const city = this.city;
    const night = f.lighting.night;
    const pr = this.scene.renderer.getPixelRatio();
    const bounds = v.visibleBounds(160);
    // 天気と季節
    const span = Math.min(900, (Math.max(v.width, v.height) / v.zoom) * 1.3);
    this.weather.update(dt, city.weather, { x: v.x, y: v.y }, span, v.zoom, pr, night);
    const blend = this.weather.blend;
    const st = seasonTint(city.day);
    const snow = Math.min(1, snowCover(city.day) * 0.8 + blend.snow * 0.5);
    this.terrain.update(bounds, v.zoom);
    this.terrain.setSeason(mixColor(0xffffff, st.color, Math.min(1, st.alpha * 3)), snow * 0.8);
    this.scene.applyEnvironment({ hour: f.hour, lighting: f.lighting, overcast: blend.overcastAlpha });
    // 街の見た目
    this.roadView?.update();
    this.zones?.update();
    this.construction?.update(f.simDt); // 建設は、ゲームの時間で進む (一時停止中は止まる)
    this.structures?.update();
    this.districts?.update();
    if (this.nature && city.districtsVersion !== this.natureDistrictsVersion) {
      this.natureDistrictsVersion = city.districtsVersion;
      this.nature.invalidate();
    }
    this.structures?.setNight(night);
    this.structures?.setSnow(snow);
    this.traffic?.update(f.simDt, night);
    this.overlays?.update();
    this.streetLights?.update();
    this.streetLights?.setNight(night);
    if (this.nature && this.treesOn) this.nature.update(dt, blend.wind, city.day, bounds, v.zoom, this.treeDensity);
    if (this.effects) {
      this.effects.windLevel = blend.wind;
      this.effects.update(dt, v.zoom, pr, f.simDt);
    }
  }

  render(): void {
    this.scene.render();
  }
}
