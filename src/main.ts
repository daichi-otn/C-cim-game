import { World3D } from "./render3d/world3d";
import { isSoftwareRenderer } from "./render3d/scene3d";
import { DEFAULT_PITCH, MAX_PITCH, MAX_ZOOM, MIN_ZOOM } from "./render3d/camera3d";
import { KeyCamera } from "./render3d/keyCamera";
import { SEASON_NAMES, WEATHER_NAMES } from "./sim/weather";
import { DAY_MODE_NAMES, DayClock, START_HOUR, formatHour } from "./render/lighting";
import { drawMapPreview } from "./render/mapPreview";
import { City, type RoadQuote } from "./sim/city";
import { DISTRICT_COLORS, GREENERY_NAMES, type Greenery } from "./sim/district";
import { ACTION_DEFS, DEFAULT_KEYMAP, KEY_GROUP_NAMES, KEYMAP_STORAGE_KEY, actionFor, bindKey, keyLabel, parseKeymap, resolveKeyTokens, type ActionId, type KeyGroup, type Keymap } from "./keymap";
import { type CameraBindings } from "./render3d/keyCamera";
import { HELP_SECTIONS } from "./help";
import { DEFAULT_GRAPHICS, GRAPHICS_LABELS, GRAPHICS_LEVEL_NAMES, GRAPHICS_STORAGE_KEY, parseGraphics, type GraphicsKey, type GraphicsLevels } from "./render3d/graphicsSettings";
import { planLoop, type LoopPlan } from "./sim/loopPlan";
import { GARBAGE_GRACE } from "./sim/environment";
import { COVERAGES, COVERAGE_NAMES, FACILITY_SPECS, FacilityType, SERVICES, type Service } from "./sim/facilities";
import { MAPS, findStart, mapNameFor, randomSeed, seedFromText } from "./sim/maps";
import { curvePoints, snapPoint } from "./sim/roadPlacement";
import { STRUCTURE_SPECS, Structure, isLandPoint } from "./sim/structures";
import { ZONE_COLORS } from "./render3d/colors";
import { TILE as TILE_PX } from "./render3d/terrain3d";
import { DEFAULT_ROAD_TYPE, ROAD_SPECS, ROAD_TYPES, type RoadType } from "./sim/roadTypes";
import {
  AUTO_SLOT,
  SaveError,
  SaveStore,
  loadCity,
  makeSave,
  type KeyValueStorage,
  type SlotId,
} from "./sim/save";
import { TUTORIAL_DONE_KEY, Tutorial } from "./sim/tutorial";
import { DENSITY_CAPACITY, DENSITY_MIN_ROAD_CAPACITY, ZONE_NAMES, ZoneType, densitiesOf, normalizeRect, type Density } from "./sim/zoning";

const VERSION = "0.49.8";
/** 速度 1x で、ゲーム内の 1 日が現実の何秒か。 */
const DAY_SEC = 0.5;
/** タブを切り替えて戻ったときなどに、一度に進めるゲーム内日数の上限。 */
const MAX_DAYS_PER_FRAME = 8;
const SPEEDS = [0, 1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
/** これ以上動かしたらクリックではなくドラッグ (地図の移動) とみなす。 */
const DRAG_THRESHOLD_PX = 5;
/** 自動セーブの間隔 (ゲーム内の日数。月末ごと)。 */
const AUTOSAVE_DAYS = 30;

type Tool = "pan" | "road" | "loop" | "upgrade" | "bulldoze" | "zoneR" | "zoneC" | "zoneI" | "zoneO" | "unzone" | "district" | "power" | "water" | "sewage" | "outside" | "police" | "fire" | "hospital" | "school" | "green" | "garbage";
/** 道具の操作 (tool.xxx) → 道具。キーは設定で変えられる (src/keymap.ts)。 */
const toolOf = (a: string | undefined): Tool | undefined => (a?.startsWith("tool.") ? (a.slice(5) as Tool) : undefined);
/** 保存された操作キーを読む (壊れていたり、使えないときは初期設定)。 */
function loadKeymap(): Keymap {
  try {
    return parseKeymap(localStorage.getItem(KEYMAP_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
}
function saveKeymap(map: Keymap): void {
  try {
    localStorage.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても、そのときの設定で遊べる
  }
}
/** 施設を建てるツールと、そのツールで選べる施設の種類 (2 つ以上あるときは、下のパレットか [ ] キーで選ぶ)。 */
const FACILITY_TOOLS: Partial<Record<Tool, readonly FacilityType[]>> = {
  power: [FacilityType.Power, FacilityType.Wind, FacilityType.Solar],
  water: [FacilityType.Water],
  sewage: [FacilityType.Sewage],
  outside: [FacilityType.Outside],
  police: [FacilityType.Police],
  fire: [FacilityType.Fire],
  hospital: [FacilityType.Hospital],
  school: [FacilityType.School, FacilityType.MiddleSchool, FacilityType.HighSchool, FacilityType.University],
  green: [FacilityType.Park, FacilityType.NoiseBarrier],
  garbage: [FacilityType.Garbage],
};

/** 施設の説明 (ツールの案内に出す)。 */
function facilityInfo(type: FacilityType): string {
  const spec = FACILITY_SPECS[type];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const outputNote: Record<string, string> = {
    wind: "(風の強い日ほど多い。雨の日 ×1.3・くもり ×1・晴れ ×0.8。汚染なし)",
    solar: "(晴れで最大。くもり ×0.5・雨 ×0.25・雪 ×0.2、夏は多く冬は少ない。汚染なし)",
  };
  const supply = spec.output ? `供給 ${spec.capacity}${outputNote[spec.output]}` : spec.waste ? `ごみを 1 日 ${spec.waste} 処理(道路でつなぐ。まわりに悪臭が出る)` : spec.relief ? `まわり半径 ${spec.radius} タイルの${[spec.relief.air > 0 ? `大気汚染 −${pct(spec.relief.air)}` : "", spec.relief.noise > 0 ? `騒音 −${pct(spec.relief.noise)}` : ""].filter(Boolean).join("・")}(近いほど強い)` : spec.coverage !== null ? `${COVERAGE_NAMES[spec.coverage]}が半径 ${spec.radius} タイルに届く${spec.officeBoost ? "・オフィスの需要が上がる" : ""}` : spec.service === null ? "住民が引っ越してくる入口" : `供給 ${spec.capacity}`;
  return `${spec.name}(${spec.size}×${spec.size}): 建設費 ${spec.cost.toLocaleString("ja-JP")} 円 / 維持費 ${spec.upkeep.toLocaleString("ja-JP")} 円/月 / ${supply}`;
}
/** ゾーンを塗る (または解除する) ツールと、その種類。 */
const ZONE_TOOLS: Partial<Record<Tool, ZoneType>> = {
  zoneR: ZoneType.Residential,
  zoneC: ZoneType.Commercial,
  zoneI: ZoneType.Industrial,
  zoneO: ZoneType.Office,
  unzone: ZoneType.None,
};

/** いま遊んでいる街。表示 (3D) は World3D が持つ。マップを選び直したり、ロードしたりすると作り直す。 */
interface Game {
  city: City;
  mapId: string;
  mapName: string;
}

/** localStorage が使えない環境 (プライベートモードなど) でも動くよう、使えなければメモリ上に保存する。 */
function createStorage(): KeyValueStorage {
  try {
    const probe = "ccim.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const yen = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString("ja-JP")}`;
const formatDate = (day: number) => `${Math.floor(day / 360) + 1}年${Math.floor((day % 360) / 30) + 1}月${(day % 30) + 1}日`;

async function main() {
  // 見た目の確認用 (e2e): ?topdown を付けると、真上から北を上にして見る (画面の点とタイルの対応が、昔の 2D と同じになる)
  const params = new URLSearchParams(location.search);
  // 描画の設定。GPU のない環境 (ソフトウェア描画) は 3D がとても重いので、影・ギザギザの補正・木を控えめにする。
  // URL で変えられる: ?quality=high で標準に戻す、?quality=low で軽くする。個別に、?shadows=0|1 ?aa=0|1 ?trees=0 ?scale=0.5
  const soft = params.get("quality") === "low" || (params.get("quality") !== "high" && isSoftwareRenderer());
  const flag = (name: string, standard: boolean) => (params.has(name) ? params.get(name) !== "0" : standard);
  let world: World3D;
  try {
    world = new World3D(document.body, {
      shadows: flag("shadows", !soft),
      antialias: flag("aa", !soft),
      scale: params.has("scale") ? Number(params.get("scale")) : soft ? 0.75 : undefined,
      trees: params.get("trees") !== "0",
      treeDensity: soft ? 0.3 : 1,
    });
  } catch {
    // WebGL が使えない (古いブラウザ・GPU もソフトウェア描画も無効な環境)。真っ暗にせず、理由を出して止める
    const note = document.createElement("div");
    note.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#1b1f24;color:#fff;font:15px/1.7 sans-serif;text-align:center;z-index:99";
    note.textContent = "このブラウザでは 3D の表示(WebGL)が使えないため、街を表示できません。Chrome・Edge・Safari の新しいバージョンで開き直すか、ブラウザの「ハードウェア アクセラレーション」を有効にしてください。";
    document.body.appendChild(note);
    return;
  }
  const camera = world.view;
  // ホスティング (Netlify) が右下に重ねるバッジ (id: nl-badge-frame) があるときは、画面の下の道具が隠れないように、位置を上げる
  const markBadge = () => document.body.classList.toggle("has-badge", document.getElementById("nl-badge-frame") !== null);
  markBadge();
  new MutationObserver(markBadge).observe(document.body, { childList: true });
  // 情報パネル: 小さい画面では、畳んだり開いたりできる
  $("panel-toggle").addEventListener("click", () => $("panel").classList.toggle("open"));
  // グラフィック設定: メニューで変えて、保存する。保存がなければ、描画が軽い環境では「低」から始める
  const loadGraphics = (): GraphicsLevels => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(GRAPHICS_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw === null && soft) return Object.fromEntries(Object.keys(DEFAULT_GRAPHICS).map((k) => [k, 1])) as GraphicsLevels;
    return parseGraphics(raw);
  };
  let graphics: GraphicsLevels = loadGraphics();
  world.applyGraphics(graphics);
  let keymap: Keymap = loadKeymap();
  const keyName = (id: ActionId) => keyLabel(keymap[id]);
  const camBindings = (m: Keymap): CameraBindings => ({
    w: m["cam.forward"], s: m["cam.back"], a: m["cam.left"], d: m["cam.right"], q: m["cam.yawLeft"], e: m["cam.yawRight"], r: m["cam.pitchUp"], f: m["cam.pitchDown"],
  });
  const keyCam = new KeyCamera(camBindings(keymap));
  window.addEventListener("keyup", (e) => keyCam.up(e.key));
  window.addEventListener("blur", () => keyCam.clear());
  const dayClock = new DayClock();
  /** 天気の見た目の切り替え (雨・雪・曇りの強さ) は、描画側が持つ。ここでは時刻と天気を渡すだけ。 */
  window.addEventListener("resize", () => world.resize());
  // 開発者モード (すべての条件を無視する)。?dev=1 で始めるか、メニューのチェックで切り替える
  let devMode = params.has("dev");
  const storage = createStorage();
  const store = new SaveStore(storage);

  let g: Game | null = null;
  /** T キーで切り替える、道路の混雑の色分け。街を作り直しても引き継ぐ。 */
  let showHeat = false;
  /** O キーで切り替える、住宅の環境 (大気汚染・騒音・悪臭) の色分け。 */
  let showEnv = false;

  const hud = $("hud");
  // 画面左上の開発者向けの表示 (座標・ズーム・数など) は、公開版では隠す。?debug=1 で出せる (テストは、見えなくても文字を読む)
  if (!params.has("debug") && !params.has("dev")) hud.style.display = "none";
  const tip = $("tip");
  const toast = $("toast");
  const titleEl = $("title");
  const menuEl = $("menu");
  const helpEl = $("help");
  /** 操作キーを変えるとき、次に押したキーを割り当てる操作。 */
  let capturing: ActionId | null = null;
  let tipUntil = 0;
  let toastTimer = 0;

  /** 画面下に案内を出す。seconds 秒たつと消える。 */
  function showTip(text: string, seconds = 3) {
    tip.textContent = text;
    tip.style.display = text ? "block" : "none";
    tipUntil = performance.now() + seconds * 1000;
  }
  /** 画面上に短いお知らせを出す。 */
  function showToast(text: string, isError = false) {
    toast.textContent = text;
    toast.classList.toggle("error", isError);
    toast.classList.remove("hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 3000);
  }
  /** タイトル画面かメニューが開いている間は、ゲームの時間も入力も止める。 */
  const modalOpen = () => !titleEl.classList.contains("hidden") || !menuEl.classList.contains("hidden") || !helpEl.classList.contains("hidden");

  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#toolbar button")];
  let tool: Tool = "pan";
  let roadStart: { x: number; y: number } | null = null;
  /** 四角い道路: 1 つ目の角 (タイル)。区切りの数は、下のパレットで選ぶ。 */
  let loopStart: { x: number; y: number } | null = null;
  /** 区画 6 マスごとに区切りの道路を入れるか。 */
  let loopBlocks = true;
  const loopPalette = $("loop-palette");
  const loopLabelBox = $("loop-labels");
  const loopLabelEls: HTMLElement[] = [];
  const clearLoopLabels = () => {
    for (const el of loopLabelEls) el.style.display = "none";
  };
  const loopLabel = (i: number, x: number, y: number, text: string) => {
    if (!loopLabelEls[i]) loopLabelEls.push(loopLabelBox.appendChild(document.createElement("div")) as HTMLElement);
    const el = loopLabelEls[i]!;
    el.style.display = "block";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = text;
  };
  for (const [on, text] of [[false, "区切りなし"], [true, "区画 6 マス"]] as const) {
    const b = document.createElement("button");
    b.textContent = text;
    b.classList.toggle("active", on === loopBlocks);
    b.addEventListener("click", () => {
      loopBlocks = on;
      for (const o of loopPalette.querySelectorAll("button")) o.classList.toggle("active", o === b);
    });
    loopPalette.appendChild(b);
  }
  let zoneStart: { x: number; y: number } | null = null; // ゾーン矩形の1つ目の角 (タイル座標)
  /** 地区ツールで、囲みの 1 つ目の角 (タイル)。 */
  let districtStart: { x: number; y: number } | null = null;
  /** 設定を開いている地区 (パネルで選ぶ)。 */
  let selectedDistrict: number | null = null;
  let cursor: { x: number; y: number } | null = null; // タイル単位のワールド座標 (スナップ前)

  // ---- 区画の密度 ----
  let zoneDensity: Density = 2;
  const zonePalette = $("zone-palette");
  const zoneBuildable = (t: ZoneType) => t === ZoneType.Residential || t === ZoneType.Commercial || t === ZoneType.Industrial || t === ZoneType.Office;
  /** 密度の説明 (ツールの案内に出す)。 */
  const densityInfo = (z: ZoneType.Residential | ZoneType.Commercial | ZoneType.Industrial | ZoneType.Office, d: Density) => {
    const need = DENSITY_MIN_ROAD_CAPACITY[d];
    const people = z === ZoneType.Residential ? "住民" : "雇用";
    const road = d === 2 ? "通り" : d === 3 ? "大通り" : "幹線道路";
    return `${ZONE_NAMES[z][d - 1]!}: 1 マスに${people} ${DENSITY_CAPACITY[z][d - 1]!} 人${need > 0 ? `・容量 ${need} 以上の道路(${road}など)に面す` : "・どんな道路でもよい"}`;
  };
  /** パレットの密度ごとの需要 (表示)。 */
  const densityNeedEls = new Map<number, HTMLElement>();
  function updateDensityNeed(city: City) {
    const z = ZONE_TOOLS[tool];
    if (z === undefined || !zoneBuildable(z)) return;
    for (const [d, el] of densityNeedEls) {
      const v = Math.round(city.densityOf(z, d) * 100);
      el.textContent = `需要 ${v >= 0 ? "+" : ""}${v}%`;
      el.style.color = v >= 0 ? "#7bd88f" : "#e05a4f";
    }
  }
  function renderZonePalette() {
    const z = ZONE_TOOLS[tool];
    zonePalette.classList.toggle("hidden", z === undefined || !zoneBuildable(z));
    if (z === undefined || !zoneBuildable(z)) return;
    if (!densitiesOf(z).includes(zoneDensity)) zoneDensity = 3; // 超高密度は住宅だけ
    zonePalette.textContent = "";
    densityNeedEls.clear();
    for (const d of densitiesOf(z)) {
      const b = document.createElement("button");
      b.id = `zone-density-${d}`;
      b.classList.toggle("active", d === zoneDensity);
      b.innerHTML = `${ZONE_NAMES[z][d - 1]!}<span>${DENSITY_CAPACITY[z][d - 1]!}${z === ZoneType.Residential ? "人/マス" : "雇用/マス"}</span><span class="need"></span>`;
      b.addEventListener("click", () => selectDensity(d));
      densityNeedEls.set(d, b.querySelector<HTMLElement>(".need")!);
      zonePalette.append(b);
    }
  }
  function selectDensity(d: Density) {
    zoneDensity = d;
    previewKey = "";
    renderZonePalette();
    const z = ZONE_TOOLS[tool];
    if (z !== undefined && zoneBuildable(z)) showTip(densityInfo(z, d), 5);
  }

  // ---- 施設の種類 (学校など、1 つのツールに複数の種類があるもの) ----
  const facilityPalette = $("facility-palette");
  const facilityChoice: Partial<Record<Tool, number>> = {};
  /** いまのツールで建てる施設の種類。施設のツールでなければ undefined。 */
  const currentFacility = (): FacilityType | undefined => {
    const list = FACILITY_TOOLS[tool];
    return list?.[Math.min(facilityChoice[tool] ?? 0, list.length - 1)];
  };
  function renderFacilityPalette() {
    const list = FACILITY_TOOLS[tool];
    facilityPalette.classList.toggle("hidden", !list || list.length < 2);
    if (!list || list.length < 2) return;
    facilityPalette.textContent = "";
    const chosen = currentFacility();
    list.forEach((type, i) => {
      const spec = FACILITY_SPECS[type];
      const b = document.createElement("button");
      b.id = `facility-${type}`;
      b.classList.toggle("active", type === chosen);
      b.innerHTML = `${spec.name}<span>半径 ${spec.radius}</span>`;
      b.addEventListener("click", () => selectFacility(i));
      facilityPalette.append(b);
    });
  }
  function selectFacility(i: number) {
    const list = FACILITY_TOOLS[tool];
    if (!list) return;
    facilityChoice[tool] = ((i % list.length) + list.length) % list.length;
    renderFacilityPalette();
    showTip(facilityInfo(currentFacility()!), 5);
  }

  // ---- 道路の種類 ----
  let roadType: RoadType = DEFAULT_ROAD_TYPE;
  const palette = $("road-palette");
  const roadInfo = (t: RoadType) => {
    const s = ROAD_SPECS[t];
    return `${s.name}: ${s.cost.toLocaleString("ja-JP")} 円/タイル・維持費 ${s.upkeep.toLocaleString("ja-JP")} 円/月・${s.capacity === 0 ? "車は通れない" : `容量 ${s.capacity} 台/日`}。${s.note}`;
  };
  function selectRoadType(t: RoadType) {
    roadType = t;
    for (const b of palette.querySelectorAll("button")) b.classList.toggle("active", Number((b as HTMLElement).dataset.road) === t);
    showTip(roadInfo(t), 5);
  }
  for (const t of ROAD_TYPES) {
    const b = document.createElement("button");
    b.dataset.road = String(t);
    b.id = `road-type-${t}`;
    b.innerHTML = `${ROAD_SPECS[t].name}<span>${(ROAD_SPECS[t].cost / 10_000).toLocaleString("ja-JP")}万</span>`;
    b.addEventListener("click", () => selectRoadType(t));
    palette.append(b);
  }
  palette.querySelector(`[data-road="${roadType}"]`)?.classList.add("active");
  // 一方通行: 始点から終点への向きに敷く
  let roadOneWay = false;
  const oneWayBtn = document.createElement("button");
  oneWayBtn.id = "road-oneway";
  oneWayBtn.className = "oneway";
  oneWayBtn.innerHTML = `一方通行<span>${keyLabel(keymap["road.oneWay"])}</span>`;
  oneWayBtn.id = "road-oneway";
  const setOneWay = (on: boolean) => {
    roadOneWay = on;
    oneWayBtn.classList.toggle("active", on);
    showTip(on ? `一方通行: 始点から終点の向きに敷きます。既存の道路をなぞると向きが変わります。もう一度 ${keyName("road.oneWay")} で解除` : "一方通行を解除しました", 4);
  };
  oneWayBtn.addEventListener("click", () => setOneWay(!roadOneWay));
  palette.append(oneWayBtn);
  // 曲線: 始点 → 制御点 → 終点の 3 クリックで敷く
  let roadCurve = false;
  let roadControl: { x: number; y: number } | null = null;
  const curveBtn = document.createElement("button");
  curveBtn.id = "road-curve";
  curveBtn.className = "oneway";
  curveBtn.innerHTML = `曲線<span>${keyLabel(keymap["road.curve"])}</span>`;
  const setCurve = (on: boolean) => {
    roadCurve = on;
    roadControl = null;
    curveBtn.classList.toggle("active", on);
    showTip(on ? `曲線: 始点、曲がり具合を決める点、終点の順に3回クリックします。もう一度 ${keyName("road.curve")} で直線に戻します` : "直線に戻しました", 4);
  };
  curveBtn.addEventListener("click", () => setCurve(!roadCurve));
  palette.append(curveBtn);
  let roadQuoteKey = "";
  let roadQuote: RoadQuote | null = null;
  let upgradeEdges: number[] = [];
  let upgradeOk = false;

  function setTool(next: Tool) {
    tool = next;
    loopStart = null;
    loopPalette.classList.toggle("hidden", next !== "loop");
    clearLoopLabels();
    palette.classList.toggle("hidden", next !== "road" && next !== "upgrade");
    // 一方通行・曲線は、道路を新しく敷くときだけ
    for (const id of ["road-oneway", "road-curve"]) document.getElementById(id)?.classList.toggle("hidden", next === "upgrade");
    renderZonePalette();
    renderFacilityPalette();
    roadQuoteKey = "";
    roadStart = null;
    roadControl = null;
    zoneStart = null;
    districtStart = null;
    for (const b of buttons) b.classList.toggle("active", b.dataset.tool === next);
    world.canvas.style.cursor = next === "pan" ? "grab" : "crosshair";
  }
  for (const b of buttons) b.addEventListener("click", () => setTool(b.dataset.tool as Tool));

  // ツールバーが折り返して高さが変わっても、パレットや案内が重ならないようにする
  const toolbarEl = $("toolbar");
  const syncToolbarHeight = () => document.documentElement.style.setProperty("--tb", `${toolbarEl.offsetHeight}px`);
  new ResizeObserver(syncToolbarHeight).observe(toolbarEl);
  syncToolbarHeight();

  // ---- 時間と速度 ----
  let speed: Speed = 1;
  let speedBeforePause: Speed = 1;
  let dayTimer = 0;
  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>("#speed button")];
  function setSpeed(next: Speed) {
    speed = next;
    for (const b of speedButtons) b.classList.toggle("active", Number(b.dataset.speed) === next);
  }
  for (const b of speedButtons) b.addEventListener("click", () => setSpeed(Number(b.dataset.speed) as Speed));

  // ---- セーブ・ロード ----
  function currentSave() {
    const { city, mapId, mapName } = g!;
    return makeSave(city, { mapId, mapName, view: { x: camera.x, y: camera.y, zoom: camera.zoom, yaw: camera.yaw, pitch: camera.pitch, center: true }, speed });
  }
  function autosave() {
    if (!g || tutorial) return; // チュートリアルの街は、ふだんの自動セーブを上書きしない
    try {
      store.write(AUTO_SLOT, currentSave());
    } catch {
      /* 自動セーブに失敗しても、ゲームは続ける */
    }
  }

  /** 街を作り直して、表示を切り替える。saved があればその状態から、なければ新しい街を始める。 */
  function startGame(o: { seed: number; mapId: string; mapName: string; saved?: { city: City; view: { x: number; y: number; zoom: number; yaw?: number; pitch?: number; center?: boolean }; speed: number }; origin?: boolean; tutorial?: boolean }) {
    const city = o.saved?.city ?? new City(o.seed);
    city.devMode = devMode; // 開発者モードは街のデータには入らず、画面の設定として、新しい街・読み込んだ街に引き継ぐ
    world.setCity(city);
    world.trafficHeat = showHeat;
    world.envHeat = showEnv;
    dayClock.hour = START_HOUR;
    g = { city, mapId: o.mapId, mapName: o.mapName };

    const W = window.innerWidth;
    const H = window.innerHeight;
    if (o.saved) {
      const v = o.saved.view;
      camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
      if (v.center) {
        camera.x = v.x;
        camera.y = v.y;
        camera.yaw = v.yaw ?? 0;
        camera.pitch = v.pitch ?? DEFAULT_PITCH;
      } else {
        // 昔の 2D のデータ: (x, y) は画面の左上の地面の点。画面の中心に直して、真上からではなく、標準の角度で見る
        camera.x = v.x + W / 2 / camera.zoom;
        camera.y = v.y + H / 2 / camera.zoom;
        camera.yaw = 0;
        camera.pitch = DEFAULT_PITCH;
      }
    } else if (o.origin) {
      // ?seed= つきの開始 (e2e): 地面の原点が画面の左上に来る、真上からの視点 (昔の 2D と同じ座標になる)
      camera.zoom = 1;
      camera.x = W / 2;
      camera.y = H / 2;
      camera.setTopDown();
    } else {
      // 街づくりに向いた広い平地が画面の中央に来るようにする
      const start = findStart(city.seed);
      camera.zoom = 1;
      camera.yaw = 0;
      camera.pitch = params.has("topdown") ? MAX_PITCH : DEFAULT_PITCH;
      camera.x = start.x * TILE_PX;
      camera.y = start.y * TILE_PX;
    }
    setTool("pan");
    startTutorial(!!o.tutorial);
    setSpeed((o.tutorial ? 0 : (o.saved?.speed ?? 1)) as Speed);
    speedBeforePause = speed === 0 ? 1 : speed;
    dayTimer = 0;
    previewKey = "";
    lastRefreshKey = "";
    lastAutosaveDay = city.day;
    titleEl.classList.add("hidden");
    menuEl.classList.add("hidden");
  }

  // ---- チュートリアル ----
  let tutorial: Tutorial | null = null;
  let tutStart = { x: 0, y: 0, zoom: 1 };
  let menuSeen = false;
  let tutShownKey = "";
  const tutEl = $("tutorial");
  const hintTargets = new Set<Element>();
  function clearHints() {
    for (const el of hintTargets) el.classList.remove("hint");
    hintTargets.clear();
  }
  function startTutorial(on: boolean) {
    clearHints();
    tutorial = on ? new Tutorial() : null;
    tutShownKey = "";
    menuSeen = false;
    tutStart = { x: camera.x, y: camera.y, zoom: camera.zoom };
    tutEl.classList.toggle("hidden", !on);
  }
  function endTutorial(completed: boolean) {
    if (completed) {
      try {
        storage.setItem(TUTORIAL_DONE_KEY, "1");
      } catch {
        /* 保存できなくても、チュートリアルは終えられる */
      }
    }
    startTutorial(false);
    showToast(completed ? "チュートリアルを終えました。自由に街を育ててください" : "チュートリアルを閉じました");
  }
  /** チュートリアルの表示を、手順が変わったときや条件を満たしたときだけ更新する。 */
  function updateTutorial(game: Game) {
    if (!tutorial) return;
    const t = tutorial;
    const advanced = t.update(
      { city: game.city, moved: Math.hypot(camera.x - tutStart.x, camera.y - tutStart.y) > 24, zoomed: Math.abs(camera.zoom - tutStart.zoom) > 0.04, speed, menuSeen },
      performance.now(),
    );
    if (t.closed) {
      endTutorial(true);
      return;
    }
    const key = `${t.index}:${t.satisfied}:${advanced}`;
    if (key === tutShownKey) return;
    tutShownKey = key;
    const s = t.step;
    $("tut-title").textContent = s.title;
    $("tut-count").textContent = `${t.index + 1} / ${t.steps.length}`;
    $("tut-bar").style.width = `${((t.index + (t.satisfied ? 1 : 0)) / t.steps.length) * 100}%`;
    const body = $("tut-body");
    body.textContent = "";
    for (const para of s.body) {
      const p = document.createElement("p");
      const text = resolveKeyTokens(para, keymap);
      // タッチの端末には、キーの案内 ((キー 2) など) は要らない
      p.textContent = matchMedia("(pointer: coarse)").matches ? text.replace(/\(キー [^)]*\)/g, "") : text;
      body.append(p);
    }
    $("tut-done").classList.toggle("hidden", !t.satisfied);
    $("tut-prev").classList.toggle("hidden", t.index === 0);
    $("tut-next").textContent = t.isLast ? "終了" : s.check ? "この手順を飛ばす" : "次へ";
    $("tut-next").classList.toggle("primary", !s.check || t.isLast);
    clearHints();
    for (const sel of s.highlight) for (const el of document.querySelectorAll(sel)) {
      el.classList.add("hint");
      hintTargets.add(el);
    }
  }
  $("tut-next").addEventListener("click", () => {
    tutorial?.next();
    if (tutorial?.closed) endTutorial(true);
  });
  $("tut-prev").addEventListener("click", () => tutorial?.prev());
  $("tut-close").addEventListener("click", () => endTutorial(false));
  const tutorialSeed = MAPS[0]!;
  const beginTutorial = () => startGame({ seed: tutorialSeed.seed, mapId: tutorialSeed.id, mapName: tutorialSeed.name, tutorial: true });
  $("tutorial-start").addEventListener("click", beginTutorial);
  let tutArmed = false;
  $("menu-tutorial").addEventListener("click", function () {
    const b = $("menu-tutorial");
    if (!tutArmed) {
      tutArmed = true;
      b.textContent = "いまの街は閉じます。もう一度押すと開始";
      window.setTimeout(() => {
        tutArmed = false;
        b.textContent = "チュートリアル (新しい街で)";
      }, 3000);
      return;
    }
    tutArmed = false;
    b.textContent = "チュートリアル (新しい街で)";
    if (g) autosave();
    beginTutorial();
  });

  /** スロットを読み込んで、その街から再開する。失敗したら理由を返す (成功なら null)。 */
  function loadSlot(slot: SlotId): string | null {
    try {
      const save = store.read(slot);
      if (!save) return "このスロットは空です";
      const city = loadCity(save);
      startGame({ seed: city.seed, mapId: save.mapId, mapName: save.mapName, saved: { city, view: save.view, speed: save.speed } });
      return null;
    } catch (e) {
      return e instanceof SaveError ? e.message : "読み込めませんでした";
    }
  }

  function slotLabel(slot: SlotId) {
    return slot === AUTO_SLOT ? "自動セーブ" : `スロット${slot}`;
  }

  /** スロット一覧を描く。title: 読み込みだけ。menu: 保存・読み込み・削除。 */
  function renderSlots(container: HTMLElement, mode: "title" | "menu", report: (msg: string, isError?: boolean) => void) {
    container.textContent = "";
    for (const { slot, summary, broken } of store.list()) {
      const row = document.createElement("div");
      row.className = "slot";
      const info = document.createElement("div");
      info.className = "info";
      const title = document.createElement("b");
      title.textContent = slotLabel(slot);
      const detail = document.createElement("span");
      if (summary) {
        detail.textContent = `${summary.mapName} / ${formatDate(summary.day)} / 人口 ${summary.population.toLocaleString("ja-JP")} / ${yen(summary.money)} 円 / 保存: ${new Date(summary.savedAt).toLocaleString("ja-JP")}`;
      } else if (broken) {
        detail.textContent = broken;
        detail.className = "broken";
      } else {
        detail.textContent = "空き";
        detail.className = "empty";
      }
      info.append(title, detail);
      row.append(info);

      const add = (label: string, id: string, onClick: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => {
        const b = document.createElement("button");
        b.className = "btn" + (opts.danger ? " danger" : "");
        b.id = id;
        b.textContent = label;
        b.disabled = !!opts.disabled;
        b.addEventListener("click", onClick);
        row.append(b);
      };
      const prefix = mode === "menu" ? "menu" : "title";
      if (mode === "menu" && slot !== AUTO_SLOT) {
        add("保存", `menu-save-${slot}`, () => {
          const overwrite = !!summary;
          try {
            store.write(slot, currentSave());
            report(`${slotLabel(slot)}に${overwrite ? "上書き" : ""}保存しました`);
          } catch (e) {
            report(e instanceof SaveError ? e.message : "保存できませんでした", true);
          }
          renderSlots(container, mode, report);
        }, { disabled: !g });
      }
      add("読込", `${prefix}-load-${slot}`, () => {
        const err = loadSlot(slot);
        if (err) report(err, true);
        else showToast(`${slotLabel(slot)}を読み込みました`);
      }, { disabled: !summary });
      if (mode === "menu" && slot !== AUTO_SLOT) {
        let armed = false;
        add("削除", `menu-delete-${slot}`, function (this: void) {
          const b = document.getElementById(`menu-delete-${slot}`) as HTMLButtonElement;
          if (!armed) {
            armed = true;
            b.textContent = "本当に削除";
            b.classList.add("armed");
            window.setTimeout(() => {
              armed = false;
              b.textContent = "削除";
              b.classList.remove("armed");
            }, 3000);
            return;
          }
          store.remove(slot);
          report(`${slotLabel(slot)}を削除しました`);
          renderSlots(container, mode, report);
        }, { disabled: !summary, danger: true });
      }
      container.append(row);
    }
  }

  // ---- タイトル画面 (マップ選択) とメニュー ----
  const titleMsg = $("title-msg");
  const menuMsg = $("menu-msg");
  const reportTitle = (msg: string, isError = false) => {
    titleMsg.textContent = msg;
    titleMsg.classList.toggle("error", isError);
  };
  const reportMenu = (msg: string, isError = false) => {
    menuMsg.textContent = msg;
    menuMsg.classList.toggle("error", isError);
  };

  const mapsEl = $("maps");
  for (const m of MAPS) {
    const card = document.createElement("button");
    card.className = "map-card";
    card.id = `map-${m.id}`;
    const canvas = document.createElement("canvas");
    const name = document.createElement("b");
    name.textContent = m.name;
    const desc = document.createElement("span");
    desc.textContent = m.description;
    card.append(canvas, name, desc);
    card.addEventListener("click", () => startGame({ seed: m.seed, mapId: m.id, mapName: m.name }));
    mapsEl.append(card);
    // 縮小図は重いので、タイトル画面が最初に開いたあとに描く
    window.setTimeout(() => drawMapPreview(canvas, m.seed), 0);
  }

  const seedInput = $<HTMLInputElement>("seed-input");
  const startCustom = (seed: number) => startGame({ seed, mapId: "custom", mapName: mapNameFor(seed) });
  $("seed-start").addEventListener("click", () => {
    const seed = seedFromText(seedInput.value);
    if (seed === null) reportTitle("シード値を入力してください (数字でも言葉でもかまいません)", true);
    else startCustom(seed);
  });
  seedInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("seed-start").click();
  });
  $("seed-random").addEventListener("click", () => startCustom(randomSeed()));

  function openTitle() {
    if (g) autosave();
    menuEl.classList.add("hidden");
    reportTitle("");
    renderSlots($("title-slots"), "title", reportTitle);
    let done = false;
    try {
      done = storage.getItem(TUTORIAL_DONE_KEY) === "1";
    } catch {
      /* 読めなければ未クリア扱い */
    }
    $("tutorial-note").classList.toggle("hidden", !done);
    $("tutorial-start").classList.toggle("primary", !done);
    $("title-close").classList.toggle("hidden", !g);
    titleEl.classList.remove("hidden");
  }
  $("title-close").addEventListener("click", () => titleEl.classList.add("hidden"));

  function openMenu() {
    if (!g || !titleEl.classList.contains("hidden")) return;
    reportMenu("");
    $("menu-map").textContent = `マップ: ${g.mapName} (シード ${g.city.seed})`;
    renderSlots($("menu-slots"), "menu", reportMenu);
    menuEl.classList.remove("hidden");
    menuSeen = true;
  }
  const closeMenu = () => menuEl.classList.add("hidden");
  $("menu-button").addEventListener("click", () => (menuEl.classList.contains("hidden") ? openMenu() : closeMenu()));
  $("menu-close").addEventListener("click", closeMenu);
  $("menu-title").addEventListener("click", openTitle);
  /** グラフィック設定の欄を作る: 項目ごとに 5 つの段階のボタン。 */
  const graphicsBox = $("menu-graphics");
  function renderGraphicsMenu() {
    graphicsBox.textContent = "";
    for (const k of Object.keys(DEFAULT_GRAPHICS) as GraphicsKey[]) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 8px;margin:8px 0;color:#d4dae2;font-size:14px";
      const name = document.createElement("span");
      name.textContent = GRAPHICS_LABELS[k];
      name.style.cssText = "flex:1 1 110px";
      const btns = document.createElement("span");
      btns.style.cssText = "display:flex;flex-wrap:wrap;gap:4px";
      GRAPHICS_LEVEL_NAMES.forEach((text, i) => {
        const b = document.createElement("button");
        b.className = "btn";
        b.textContent = text;
        b.style.cssText = "padding:4px 8px;font-size:12px";
        b.classList.toggle("primary", graphics[k] === i);
        b.addEventListener("click", () => {
          graphics = { ...graphics, [k]: i };
          try {
            localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(graphics));
          } catch {
            // 保存できなくても、そのときの設定で描画する
          }
          world.applyGraphics(graphics);
          renderGraphicsMenu();
        });
        btns.appendChild(b);
      });
      row.append(name, btns);
      graphicsBox.appendChild(row);
    }
  }
  renderGraphicsMenu();
  const landBox = $<HTMLInputElement>("menu-land");
  landBox.addEventListener("change", () => {
    world.landHeat = landBox.checked;
  });
  const devBox = $<HTMLInputElement>("menu-dev");
  devBox.checked = devMode;
  devBox.addEventListener("change", () => {
    devMode = devBox.checked;
    if (g) {
      g.city.devMode = devMode;
      g.city.refresh();
    }
    reportMenu(devMode ? "開発者モードをオンにしました (条件をすべて無視します)" : "開発者モードをオフにしました");
  });

  // ---- キー入力 ----
  const typing = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.tagName === "INPUT";
  window.addEventListener("keydown", (e) => {
    if (typing(e) || capturing) return;
    const a = actionFor(keymap, e.key);
    if (a === "game.menu") {
      if (titleEl.classList.contains("hidden") && helpEl.classList.contains("hidden")) menuEl.classList.contains("hidden") ? openMenu() : closeMenu();
      return;
    }
    if (e.key === "Escape" && !helpEl.classList.contains("hidden")) {
      closeHelp();
      return;
    }
    if (e.key === "Escape" && !menuEl.classList.contains("hidden")) {
      closeMenu();
      return;
    }
    if (modalOpen() || !g) return;
    // 視点の操作のキー (設定で決める) は、道具のキーより先に見る。押している間ずっと動く
    if (!e.ctrlKey && !e.metaKey && keyCam.down(e.key)) return;
    // 視点: 真上 / 斜め、15 度ずつ回す、標準に戻す
    if (a === "view.topDown") {
      if (camera.pitch > MAX_PITCH - 0.05) camera.pitch = DEFAULT_PITCH;
      else camera.setTopDown();
      showTip(camera.pitch > MAX_PITCH - 0.05 ? `真上から見ています。もう一度 ${keyName("view.topDown")} で斜めの視点に戻します` : `斜めの視点です。${keyName("view.topDown")} で真上から見ます (道路や建物の裏を見るとき)`, 3);
      return;
    }
    if (a === "view.yawLeft" || a === "view.yawRight") {
      camera.yaw += (a === "view.yawRight" ? 1 : -1) * (Math.PI / 12);
      return;
    }
    if (a === "view.reset") {
      camera.yaw = 0;
      camera.pitch = DEFAULT_PITCH;
      return;
    }
    if (a === "view.daylight") {
      const mode = dayClock.cycleMode();
      showTip(`時間帯: ${DAY_MODE_NAMES[mode]}${mode === "auto" ? "" : ""}。もう一度 ${keyName("view.daylight")} で切り替え`, 3);
      return;
    }
    if (tool === "road" && a === "road.curve") {
      setCurve(!roadCurve);
      return;
    }
    if (tool === "road" && a === "road.oneWay") {
      setOneWay(!roadOneWay);
      return;
    }
    if (a === "view.traffic") {
      showHeat = world.trafficHeat = !showHeat;
      showTip(showHeat ? `交通の混雑を色で表示します (緑: 空き / 黄: 容量いっぱい / 赤: 渋滞)。もう一度 ${keyName("view.traffic")} で戻します` : "交通の混雑の色分けを消しました", 3);
      return;
    }
    if (a === "view.env") {
      showEnv = world.envHeat = !showEnv;
      showTip(showEnv ? `住宅の環境を色で表示します (茶: 大気汚染 / 紫: 騒音 / 黄緑: 悪臭、濃いほど悪い)。赤い十字は病人が多い住宅。もう一度 ${keyName("view.env")} で戻します` : "環境の色分けを消しました", 4);
      return;
    }
    const t = toolOf(a);
    if (t) {
      setTool(t);
      const zt = ZONE_TOOLS[t];
      if (zt !== undefined && zoneBuildable(zt)) showTip(densityInfo(zt as ZoneType.Residential, zoneDensity), 5);
      const type = currentFacility();
      if (type !== undefined) showTip(facilityInfo(type), 4);
    } else if (e.key === "Escape") roadStart = zoneStart = roadControl = loopStart = null;
    else if (a === "game.pause") {
      e.preventDefault();
      if (speed === 0) setSpeed(speedBeforePause || 1);
      else {
        speedBeforePause = speed as Speed;
        setSpeed(0);
      }
    }
  });
  // ---- 使い方・操作キーの設定 ----
  const helpGuide = $("help-guide");
  const keyTable = $("key-table");
  const keyMsgEl = $("key-msg");
  const keyMsg = (text: string) => {
    keyMsgEl.textContent = text;
  };
  const actionLabel = (id: ActionId) => ACTION_DEFS.find((d) => d.id === id)?.label ?? id;
  function renderGuide() {
    helpGuide.textContent = "";
    for (const sec of HELP_SECTIONS) {
      const h = document.createElement("h3");
      h.textContent = sec.title;
      helpGuide.append(h);
      for (const line of sec.lines) {
        const p = document.createElement("p");
        p.textContent = resolveKeyTokens(line, keymap);
        helpGuide.append(p);
      }
    }
  }
  function renderKeyTable() {
    keyTable.textContent = "";
    for (const g of Object.keys(KEY_GROUP_NAMES) as KeyGroup[]) {
      const head = document.createElement("div");
      head.className = "key-group";
      head.textContent = KEY_GROUP_NAMES[g];
      keyTable.append(head);
      for (const def of ACTION_DEFS.filter((d) => d.group === g)) {
        const row = document.createElement("div");
        row.className = "key-row";
        const name = document.createElement("span");
        name.textContent = def.label;
        const right = document.createElement("span");
        const kbd = document.createElement("kbd");
        kbd.textContent = keyLabel(keymap[def.id]);
        const change = document.createElement("button");
        change.textContent = capturing === def.id ? "キーを押す…" : "変更";
        change.addEventListener("click", () => {
          capturing = def.id;
          keyMsg(`「${def.label}」の新しいキーを押してください (Esc で取り消し)`);
          renderKeyTable();
        });
        right.append(kbd, " ", change);
        row.append(name, right);
        keyTable.append(row);
      }
    }
  }
  /** 割り当てを変えたあと、画面に出ているキーの名前を、すべて新しい設定に合わせる。 */
  function refreshKeyLabels() {
    for (const b of buttons) {
      const t = b.dataset.tool;
      const k = b.querySelector("kbd");
      if (t && k) k.textContent = keyLabel(keymap[`tool.${t}` as ActionId]);
    }
    const menuKey = $("menu-button").querySelector("kbd");
    if (menuKey) menuKey.textContent = keyLabel(keymap["game.menu"]);
    $("pause-key").textContent = keyLabel(keymap["game.pause"]);
    const curveKey = document.querySelector("#road-curve span");
    if (curveKey) curveKey.textContent = keyLabel(keymap["road.curve"]);
    const oneWayKey = document.querySelector("#road-oneway span");
    if (oneWayKey) oneWayKey.textContent = keyLabel(keymap["road.oneWay"]);
    if (!helpEl.classList.contains("hidden")) {
      renderGuide();
      renderKeyTable();
    }
  }
  // 割り当て中は、押したキーをほかの操作に回さない (キャプチャで先に受け取る)
  window.addEventListener(
    "keydown",
    (e) => {
      if (capturing === null) return;
      e.preventDefault();
      e.stopPropagation();
      const id = capturing;
      capturing = null;
      if (e.key === "Escape") {
        keyMsg("変更を取り消しました");
        renderKeyTable();
        return;
      }
      const res = bindKey(keymap, id, e.key);
      if (!res.ok) {
        keyMsg(res.reason);
        renderKeyTable();
        return;
      }
      keymap = res.map;
      saveKeymap(keymap);
      keyCam.setBindings(camBindings(keymap));
      refreshKeyLabels();
      keyMsg(res.swapped ? `「${actionLabel(id)}」と「${actionLabel(res.swapped)}」のキーを入れ替えました` : `「${actionLabel(id)}」を「${keyLabel(keymap[id])}」にしました`);
    },
    { capture: true },
  );
  $("key-reset").addEventListener("click", () => {
    keymap = { ...DEFAULT_KEYMAP };
    saveKeymap(keymap);
    keyCam.setBindings(camBindings(keymap));
    capturing = null;
    refreshKeyLabels();
    keyMsg("初期設定に戻しました");
  });
  function openHelp() {
    closeMenu();
    helpEl.classList.remove("hidden");
    keyMsg("");
    refreshKeyLabels();
  }
  function closeHelp() {
    helpEl.classList.add("hidden");
    capturing = null;
    if (g) openMenu();
  }
  $("menu-help").addEventListener("click", openHelp);
  $("help-close").addEventListener("click", closeHelp);
  refreshKeyLabels();
  setTool("pan");

  const toTile = (clientX: number, clientY: number) => {
    const w = camera.screenToWorld({ x: clientX, y: clientY });
    return { x: w.x / TILE_PX, y: w.y / TILE_PX };
  };

  /** 施設 (2×2) の左上のタイル。カーソルが施設の中心に来るようにする。 */
  const facilityOrigin = (t: { x: number; y: number }, size: number) => ({ x: Math.round(t.x - size / 2), y: Math.round(t.y - size / 2) });

  /** 四角い道路の見積もり: 枠と区切りの道路を、それぞれ見積もって合わせる。 */
  function loopQuote(plan: LoopPlan): { ok: boolean; cost: number; reason?: string } {
    if (!plan.ok) return { ok: false, cost: 0, reason: plan.reason };
    const { city } = g!;
    const qs = [city.quotePath([...plan.corners, plan.corners[0]!], roadType, false), ...plan.dividers.map((d) => city.quotePath(d, roadType, false))];
    const bad = qs.find((q) => !q.ok);
    return { ok: !bad, cost: qs.reduce((sum, q) => sum + q.cost, 0), reason: bad?.reason };
  }

  let loopKey = "";
  let loopShown: LoopPlan | null = null;
  /** 四角い道路の表示: 枠の線・各辺の長さ (m)・角の角度・費用。カーソルの位置が変わったときだけ計算し直す。 */
  function updateLoopPreview() {
    if (!g) return;
    const { graph } = g.city;
    if (!cursor) {
      world.roads.showPreview(null);
      clearLoopLabels();
      return;
    }
    const end = { x: Math.floor(cursor.x) + 0.5, y: Math.floor(cursor.y) + 0.5 };
    const start = loopStart ?? end;
    const key = `${start.x},${start.y}|${end.x},${end.y}|${loopBlocks}|${roadType}|${graph.version}`;
    if (key !== loopKey) {
      loopKey = key;
      loopShown = planLoop(start, end, loopBlocks);
    }
    const plan = loopShown!;
    const q = loopQuote(plan);
    const c = plan.corners;
    const ring = [...c, c[0]!];
    if (loopStart) {
      // 枠と区切りを、半透明の道路で予告する (敷けるなら緑、敷けないなら赤)
      world.roads.showPreview({ ax: c[0]!.x, ay: c[0]!.y, bx: c[2]!.x, by: c[2]!.y, valid: q.ok, type: roadType, oneWay: false, points: ring, extra: plan.dividers });
    } else {
      world.roads.showPreview(null);
    }
    // 表示の位置: 辺の中点・角・中心を、画面の座標にする
    const toScreen = (x: number, y: number) => camera.worldToScreen({ x: x * TILE_PX, y: y * TILE_PX });
    const sideMid = (a: { x: number; y: number }, b: { x: number; y: number }) => toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (!plan.ok) {
      clearLoopLabels();
      if (loopStart) tip.textContent = plan.reason ?? "";
      return;
    }
    const sides = [sideMid(c[0]!, c[1]!), sideMid(c[1]!, c[2]!)];
    const s0 = sides[0]!;
    const s1 = sides[1]!;
    loopLabel(0, s0.x, s0.y, `${Math.round(plan.sideMeters[0])} m`);
    loopLabel(1, s1.x, s1.y, `${Math.round(plan.sideMeters[1])} m`);
    const corner = toScreen(c[0]!.x, c[0]!.y);
    loopLabel(2, corner.x, corner.y, "90°");
    const mid = toScreen((c[0]!.x + c[2]!.x) / 2, (c[0]!.y + c[2]!.y) / 2);
    loopLabel(3, mid.x, mid.y, q.ok ? `${q.cost.toLocaleString("ja-JP")} 円` : q.reason ?? "");
    if (loopStart && q.ok && !g.city.canAfford(q.cost)) tip.textContent = "お金が足りません";
  }

  function onClick(clientX: number, clientY: number) {
    if (!g) return;
    const { city } = g;
    const { graph, zones } = city;
    const t = toTile(clientX, clientY);
    if (tool === "road") {
      const p = snapPoint(graph, t.x, t.y);
      if (!roadStart) {
        if (isLandPoint(city.seed, p.x, p.y)) roadStart = p; // 始点は陸の上 (橋・トンネルの途中からは始められない)
        return;
      }
      if (roadCurve && !roadControl) {
        roadControl = p; // 1 回目: 曲がり具合を決める点
        return;
      }
      const pts = roadCurve && roadControl ? curvePoints(roadStart, roadControl, p) : [roadStart, p];
      // 敷けない (水や山が長すぎる等)・お金が足りないときは敷けない (始点はそのまま)
      if (city.buildPath(pts, roadType, roadOneWay)) {
        roadStart = p; // 続けて引ける
        roadControl = null;
      } else {
        const q = city.quotePath(pts, roadType, roadOneWay);
        if (!q.ok) showTip(q.reason ?? "ここには敷けません", 3);
        else if (!city.canAfford(q.cost)) showTip("お金が足りません", 3);
      }
    } else if (tool === "loop") {
      // 四角い道路: 1 回目で角、2 回目で反対の角。枠と区切りを一度に敷く
      const tile = { x: t.x, y: t.y };
      if (!loopStart) {
        loopStart = tile;
        return;
      }
      const plan = planLoop(loopStart, tile, loopBlocks);
      const q = loopQuote(plan);
      if (!q.ok) {
        showTip(q.reason ?? "ここには敷けません", 3);
        return;
      }
      if (!city.canAfford(q.cost)) {
        showTip("お金が足りません", 3);
        return;
      }
      city.buildPath([...plan.corners, plan.corners[0]!], roadType, false);
      for (const d of plan.dividers) city.buildPath(d, roadType, false);
      loopStart = null;
      showTip(`四角い道路を敷きました (${q.cost.toLocaleString("ja-JP")} 円)`, 3);
    } else if (tool === "upgrade") {
      // 道路をクリックすると、その道路 (ひとつながりの区間) を、パレットで選んだ種類に変える
      const e = graph.nearestEdge(t.x, t.y, 0.7);
      if (!e) {
        showTip("道路をクリックしてください", 2);
        return;
      }
      const q = city.quoteUpgrade(e.id, roadType);
      if (q.sections === 0) showTip(`${ROAD_SPECS[roadType].name}: すでにその種類です`, 2);
      else if (!city.canAfford(q.cost)) showTip("お金が足りません", 3);
      else if (city.upgradeRoad(e.id, roadType)) showTip(`${ROAD_SPECS[roadType].name}に変えました (${q.cost.toLocaleString("ja-JP")} 円)`, 3);
    } else if (tool === "bulldoze") {
      // 施設の上なら施設を、そうでなければ近くの道路を取り壊す
      const f = city.facilityAt(Math.floor(t.x), Math.floor(t.y));
      if (f) {
        city.removeFacility(f.id);
        return;
      }
      const e = graph.nearestEdge(t.x, t.y, 0.6);
      if (e) graph.removeChain(e.id); // 曲線は一続きで消える
    } else if (tool in FACILITY_TOOLS) {
      const type = currentFacility()!;
      const at = facilityOrigin(t, FACILITY_SPECS[type].size);
      const res = city.placeFacility(type, at.x, at.y);
      if (!res.ok) showTip(res.reason);
      else showTip("");
    } else if (tool === "district") {
      // 2 回クリックで囲む (1 回目は角。2 回目で地区ができる)
      const tile = { x: Math.floor(t.x), y: Math.floor(t.y) };
      if (!districtStart) {
        districtStart = tile;
        showTip("もう一方の角をクリックします", 3);
        return;
      }
      const res = city.addDistrict(districtStart.x, districtStart.y, tile.x, tile.y);
      districtStart = null;
      if (res.ok) {
        selectedDistrict = res.id ?? null;
        showTip("地区を作りました。右のパネルで名前や税率を決められます", 4);
      } else showTip(res.reason ?? "地区を作れません", 3);
    } else if (tool in ZONE_TOOLS) {
      const tile = { x: Math.floor(t.x), y: Math.floor(t.y) };
      if (!zoneStart) {
        zoneStart = tile;
        return;
      }
      const r = normalizeRect(zoneStart.x, zoneStart.y, tile.x, tile.y);
      zones.paintRect(graph, r, ZONE_TOOLS[tool]!, zoneBuildable(ZONE_TOOLS[tool]!) ? zoneDensity : 0);
      zoneStart = null;
    }
  }

  // 入力: 5px 以内ならクリック、それ以上動かしたらドラッグ (地図の移動)
  let pressed = false;
  let moved = false;
  /** 右ボタン・中ボタン・Alt を押しながらのドラッグは、視点を回す (横: 向き、縦: 見下ろす角度)。 */
  let orbiting = false;
  let downAt = { x: 0, y: 0 };
  let last = { x: 0, y: 0 };
  const ORBIT_YAW_PER_PX = 0.006;
  const ORBIT_PITCH_PER_PX = 0.005;
  // 指 (タッチ): 指が 2 本なら、つまんで拡大・縮小、ひねって回す。1 本の指は、移動ツールのときだけ画面を動かす。
  // 道路や区画のツールでは、指のタップが 1 回目・2 回目のクリックになる (ドラッグで動かさない)
  const touchPts = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; angle: number } | null = null;
  const pinchState = () => {
    const [a, b] = [...touchPts.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };
  world.canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      world.canvas.setPointerCapture(e.pointerId);
      if (touchPts.size === 2) {
        // 2 本目の指: つまみ・ひねりの操作に切り替える (タップとしては扱わない)
        const st = pinchState();
        pinch = { dist: st.dist, angle: st.angle };
        pressed = false;
        moved = true;
        return;
      }
      cursor = toTile(e.clientX, e.clientY); // タップした場所に、建てる場所の案内を出す
      pressed = true;
      moved = false;
      orbiting = false;
      downAt = last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    pressed = true;
    moved = false;
    orbiting = e.button !== 0 || e.altKey;
    downAt = last = { x: e.clientX, y: e.clientY };
    world.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1) e.preventDefault();
  });
  world.canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      if (!touchPts.has(e.pointerId)) return;
      touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cursor = toTile(e.clientX, e.clientY);
      if (touchPts.size >= 2 && pinch) {
        const st = pinchState();
        camera.zoomAt(st.mid, st.dist / pinch.dist);
        camera.yaw -= st.angle - pinch.angle;
        pinch = { dist: st.dist, angle: st.angle };
        return;
      }
      if (!pressed) return;
      if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_THRESHOLD_PX) moved = true;
      if (moved && tool === "pan") camera.panByScreen(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      return;
    }
    cursor = toTile(e.clientX, e.clientY);
    if (!pressed) return;
    if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_THRESHOLD_PX) moved = true;
    if (moved) {
      if (orbiting) {
        // 画面の中心の地面の点を軸に回す。下へ引くと、より真上から見る
        camera.yaw += (e.clientX - last.x) * ORBIT_YAW_PER_PX;
        camera.tilt((e.clientY - last.y) * ORBIT_PITCH_PER_PX);
      } else {
        camera.panByScreen(e.clientX - last.x, e.clientY - last.y);
      }
      last = { x: e.clientX, y: e.clientY };
    }
  });
  world.canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      touchPts.delete(e.pointerId);
      if (touchPts.size < 2) pinch = null;
      if (!pressed) return;
      pressed = false;
      if (!moved && touchPts.size === 0) onClick(e.clientX, e.clientY);
      return;
    }
    if (!pressed) return;
    pressed = false;
    if (!moved && !orbiting) onClick(e.clientX, e.clientY);
    else if (!moved && e.button === 2) roadStart = zoneStart = roadControl = loopStart = null; // 右クリックで道路の始点などをキャンセル
  });
  world.canvas.addEventListener("pointercancel", (e) => {
    touchPts.delete(e.pointerId);
    if (touchPts.size < 2) pinch = null;
    pressed = false;
  });
  world.canvas.style.touchAction = "none"; // ブラウザの拡大・スクロールに取られないように
  world.canvas.addEventListener("pointerleave", () => (cursor = null));
  world.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  world.canvas.addEventListener("auxclick", (e) => e.preventDefault());

  // ホイールでズーム (カーソルの下の地面の点を固定)。Ctrl / Cmd を押しながらなら、視点を回す
  world.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        camera.rotateAt({ x: e.clientX, y: e.clientY }, (e.deltaY > 0 ? 1 : -1) * 0.08);
        return;
      }
      camera.zoomAt({ x: e.clientX, y: e.clientY }, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    },
    { passive: false },
  );

  // ボタンをクリックしたあとにフォーカスが残ると、Space キーでそのボタンが押されてしまうので外す
  document.addEventListener("click", (e) => (e.target as HTMLElement).blur?.());

  // タブを閉じる・切り替えるときに、いまの街を自動セーブする
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autosave();
  });
  window.addEventListener("pagehide", autosave);

  const panel = {
    date: $("date"),
    weather: $("weather"),
    money: $("money"),
    pop: $("pop"),
    balance: $("balance"),
    tax: $("tax"),
    util: Object.fromEntries(SERVICES.map((k) => [k, $(`util-${k}`)])) as Record<Service, HTMLElement>,
    notices: $("notices"),
    garbage: $("util-garbage"),
    outside: $("outside"),
    happiness: $("happiness"),
    traffic: $("traffic"),
    health: $("health"),
    coverage: $("coverage"),
    bars: { r: $("bar-r"), c: $("bar-c"), i: $("bar-i"), o: $("bar-o") },
  };
  $("tax-down").addEventListener("click", () => g?.city.setTaxRate(g.city.taxRate - 0.01));
  $("tax-up").addEventListener("click", () => g?.city.setTaxRate(g.city.taxRate + 0.01));
  /** 需要バー: 中央が 0。正なら右へ緑、負なら左へ赤。 */
  function setBar(el: HTMLElement, v: number) {
    el.style.width = `${Math.abs(v) * 50}%`;
    el.style.left = v >= 0 ? "50%" : `${50 + v * 50}%`;
    el.style.background = v >= 0 ? "#7bd88f" : "#e05a4f";
  }
  /** 地区の一覧と、選んだ地区の設定。作り直すのは、地区が変わったときだけ。財布の額は毎回書き直す。 */
  const districtsEl = $("districts");
  let districtsShown = -1;
  let shownSelection: number | null = null;
  const walletEls = new Map<number, HTMLElement>();
  function renderDistricts(city: City) {
    if (districtsShown === city.districtsVersion && shownSelection === selectedDistrict) {
      for (const g of city.districts) {
        const el = walletEls.get(g.id);
        if (el) el.textContent = `${yen(g.wallet)} 円`;
      }
      return;
    }
    districtsShown = city.districtsVersion;
    shownSelection = selectedDistrict;
    walletEls.clear();
    districtsEl.textContent = "";
    if (city.districts.length === 0) return;
    const head = document.createElement("div");
    head.className = "row sub";
    head.innerHTML = "<span>地区 (財布)</span><span></span>";
    districtsEl.appendChild(head);
    for (const g of city.districts) {
      const row = document.createElement("div");
      row.className = "dist";
      const sw = document.createElement("button");
      sw.className = "sw";
      sw.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      sw.title = "色を変える";
      sw.addEventListener("click", () => {
        const i = DISTRICT_COLORS.indexOf(g.color);
        city.updateDistrict(g.id, { color: DISTRICT_COLORS[(i + 1) % DISTRICT_COLORS.length]! });
      });
      const nm = document.createElement("button");
      nm.className = "nm" + (selectedDistrict === g.id ? " sel" : "");
      nm.textContent = g.name;
      nm.addEventListener("click", () => {
        selectedDistrict = selectedDistrict === g.id ? null : g.id;
      });
      const w = document.createElement("span");
      w.textContent = `${yen(g.wallet)} 円`;
      walletEls.set(g.id, w);
      row.append(sw, nm, w);
      districtsEl.appendChild(row);
      if (selectedDistrict !== g.id) continue;
      const box = document.createElement("div");
      box.className = "detail";
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 20;
      name.value = g.name;
      name.addEventListener("change", () => {
        if (!city.updateDistrict(g.id, { name: name.value })) name.value = g.name;
      });
      const tax = document.createElement("div");
      tax.className = "row";
      const followCity = g.taxRate === undefined;
      const shownRate = Math.round((followCity ? city.taxRate : g.taxRate!) * 100);
      const label = document.createElement("span");
      label.textContent = followCity ? "税率 (市と同じ)" : "税率";
      const taxBtns = document.createElement("span");
      const down = document.createElement("button");
      down.textContent = "−";
      const val = document.createElement("b");
      val.textContent = `${shownRate}%`;
      const up = document.createElement("button");
      up.textContent = "＋";
      const base = followCity ? city.taxRate : g.taxRate!;
      down.addEventListener("click", () => city.updateDistrict(g.id, { taxRate: base - 0.01 }));
      up.addEventListener("click", () => city.updateDistrict(g.id, { taxRate: base + 0.01 }));
      taxBtns.append(down, " ", val, " ", up);
      tax.append(label, taxBtns);
      const reset = document.createElement("label");
      const resetBox = document.createElement("input");
      resetBox.type = "checkbox";
      resetBox.checked = followCity;
      resetBox.addEventListener("change", () => city.updateDistrict(g.id, { taxRate: resetBox.checked ? undefined : city.taxRate }));
      reset.append(resetBox, "市の税率に従う");
      const allow = document.createElement("div");
      allow.className = "row";
      const allowLabel = document.createElement("span");
      allowLabel.textContent = "建ててよい密度";
      const boxes = document.createElement("span");
      (["低", "中", "高", "超高"] as const).forEach((text, i) => {
        const l = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = g.allowed[i]!;
        cb.addEventListener("change", () => {
          const next = [...g.allowed] as [boolean, boolean, boolean, boolean];
          next[i] = cb.checked;
          city.updateDistrict(g.id, { allowed: next });
        });
        l.append(cb, text);
        boxes.appendChild(l);
      });
      allow.append(allowLabel, boxes);
      const green = document.createElement("div");
      green.className = "row";
      const greenLabel = document.createElement("span");
      greenLabel.textContent = "木の多さ";
      const greenBtns = document.createElement("span");
      GREENERY_NAMES.forEach((text, i) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.classList.toggle("active", g.greenery === i);
        b.addEventListener("click", () => city.updateDistrict(g.id, { greenery: i as Greenery }));
        greenBtns.appendChild(b);
      });
      green.append(greenLabel, greenBtns);
      const del = document.createElement("button");
      del.textContent = "地区を消す";
      del.addEventListener("click", () => {
        city.removeDistrict(g.id);
        selectedDistrict = null;
      });
      box.append(name, tax, reset, allow, green, del);
      districtsEl.appendChild(box);
    }
  }

  function updatePanel(city: City) {
    renderDistricts(city);
    updateDensityNeed(city);
    const d = city.date;
    panel.date.textContent = `${d.year}年${d.month}月${d.day}日`;
    panel.weather.textContent = `${SEASON_NAMES[city.season]}・${WEATHER_NAMES[city.weather]}`;
    panel.money.textContent = `${yen(city.money)} 円`;
    panel.money.style.color = city.money < 0 ? "#e05a4f" : "";
    panel.pop.textContent = city.zones.totals().population.toLocaleString("ja-JP");
    const net = city.lastMonth.income - city.lastMonth.expense;
    panel.balance.textContent = `${net >= 0 ? "+" : ""}${yen(net)} 円/月`;
    panel.tax.textContent = `${Math.round(city.taxRate * 100)}%`;
    for (const k of SERVICES) {
      const u = city.utilities[k];
      const el = panel.util[k];
      el.textContent = u.supply === 0 ? "なし" : `${Math.round(u.used)} / ${Math.round(u.supply)}`;
      el.style.color = u.supply === 0 || u.used >= u.supply * 0.9 ? "#e05a4f" : "";
    }
    const gb = city.garbage;
    panel.garbage.textContent = gb.supply === 0 ? (gb.load > 0 ? `${Math.round(gb.load)} (処理場なし)` : "なし") : `${Math.round(gb.load)} / ${gb.supply}`;
    panel.garbage.style.color = gb.penalty > 0 ? "#e05a4f" : gb.worst >= GARBAGE_GRACE * 0.8 ? "#f2c230" : "";
    const linked = city.outsideNets.size > 0;
    panel.outside.textContent = linked ? "あり" : "なし";
    panel.outside.style.color = linked ? "#7bd88f" : "#e05a4f";
    const hl = city.health;
    panel.health.textContent = hl.sick < 0.5 ? "良好" : `病人 ${Math.round(hl.sick)} 人`;
    panel.health.style.color = hl.sick < 0.5 ? "" : hl.homesAtRisk > 2 ? "#e05a4f" : "#f2c230";
    const tr = city.traffic;
    panel.traffic.textContent = tr.trips === 0 ? "—" : `${Math.round(tr.avgCongestion * 100)}%${tr.jammed > 0 ? ` (渋滞 ${tr.jammed})` : ""}`;
    panel.traffic.style.color = tr.jammed > 0 ? "#e05a4f" : tr.avgCongestion > 0.6 ? "#f2c230" : "";
    panel.happiness.textContent = `${Math.round(city.happiness * 100)}%`;
    panel.coverage.textContent = COVERAGES.map((k, i) => {
      const c = city.coverage[k];
      return `${COVERAGE_NAMES[k]} ${c.total === 0 ? "-" : Math.round((c.covered / c.total) * 100) + "%"}${i % 2 === 0 ? "   " : i < COVERAGES.length - 1 ? "\n" : ""}`;
    }).join("");
    panel.notices.textContent = city.notices().join("\n");
    setBar(panel.bars.r, city.demand.r);
    setBar(panel.bars.c, city.demand.c);
    setBar(panel.bars.i, city.demand.i);
    setBar(panel.bars.o, city.demand.o);
  }

  let previewKey = "";
  let lastRefreshKey = "";
  let lastAutosaveDay = 0;
  /** ゾーン塗りのプレビュー。カーソルのタイルや道路が変わったときだけ計算し直す。 */
  function updateZonePreview(game: Game) {
    const { city } = game;
    const type = ZONE_TOOLS[tool];
    if (type === undefined || !cursor) {
      if (previewKey !== "") world.showZonePreview(null, 0);
      previewKey = "";
      return;
    }
    const tx = Math.floor(cursor.x);
    const ty = Math.floor(cursor.y);
    const k = `${tool}|${zoneDensity}|${zoneStart?.x},${zoneStart?.y}|${tx},${ty}|${city.graph.version}|${city.zones.version}`;
    if (k === previewKey) return;
    previewKey = k;
    const r = zoneStart ? normalizeRect(zoneStart.x, zoneStart.y, tx, ty) : normalizeRect(tx, ty, tx, ty);
    const cells: { x: number; y: number; ok: boolean }[] = [];
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        // 解除ツールは、ゾーンのあるタイルだけを対象として示す
        const ok = type === ZoneType.None ? city.zones.get(x, y) !== undefined : city.zones.canZoneAt(city.graph, x, y);
        cells.push({ x, y, ok });
      }
    }
    world.showZonePreview(cells, type === ZoneType.None ? 0xffffff : ZONE_COLORS[type]!);
  }

  /** 施設ツールのプレビュー。置けない理由はカーソルの近くの案内に出す。 */
  function updateFacilityPreview(game: Game) {
    const { city } = game;
    const type = currentFacility();
    if (type === undefined || !cursor) {
      world.showFacilityPreview(null);
      return;
    }
    const at = facilityOrigin(cursor, FACILITY_SPECS[type].size);
    const check = city.checkFacility(type, at.x, at.y);
    const affordable = city.canAfford(FACILITY_SPECS[type].cost);
    world.showFacilityPreview({ type, x: at.x, y: at.y, ok: check.ok && affordable });
    tipUntil = 0;
    tip.style.display = "block";
    if (!check.ok) tip.textContent = check.reason;
    else if (!affordable) tip.textContent = "お金が足りません";
    else {
      const spec = FACILITY_SPECS[type];
      const reach = spec.coverage !== null ? ` / ${COVERAGE_NAMES[spec.coverage]}が半径 ${spec.radius} タイルに届く` : spec.relief ? ` / 半径 ${spec.radius} タイルの汚染・騒音を減らす` : "";
      tip.textContent = `${spec.name}(${spec.size}×${spec.size}): クリックで建設 (${spec.cost.toLocaleString("ja-JP")} 円${reach})`;
    }
  }

  let lastFrameAt = performance.now();
  const frame = () => {
    requestAnimationFrame(frame);
    const nowMs = performance.now();
    const deltaMS = nowMs - lastFrameAt;
    lastFrameAt = nowMs;
    if (!g) return;
    const { city } = g;
    const { graph, zones } = city;
    const realDt = Math.min(deltaMS, 250) / 1000;
    if (!modalOpen()) dayClock.advance(realDt);
    keyCam.update(camera, realDt, !modalOpen());
    const lighting = dayClock.lighting;

    // 道路が変わったら、塗れなくなったゾーンを消す (一時停止中も)
    city.syncRoads();
    city.syncNetworks();
    // 道路・施設・ゾーンが変わったら供給や公共サービスの届き具合を求め直す (一時停止中も、パネルが最新になるように)
    const refreshKey = `${graph.version}:${city.facilitiesVersion}:${zones.version}`;
    if (refreshKey !== lastRefreshKey) {
      lastRefreshKey = refreshKey;
      city.refresh();
    }
    // 速度に応じて 1 日ずつ進める (需要に応じた建物の建設・住民の入居・月末の収支)。タイトルやメニューが開いている間は止める
    if (!modalOpen()) {
      dayTimer += realDt * speed;
      for (let n = 0; dayTimer >= DAY_SEC && n < MAX_DAYS_PER_FRAME; n++) {
        dayTimer -= DAY_SEC;
        city.tick();
        if (city.day - lastAutosaveDay >= AUTOSAVE_DAYS) {
          lastAutosaveDay = city.day;
          autosave();
        }
      }
      dayTimer = Math.min(dayTimer, DAY_SEC);
    }
    updatePanel(city);
    updateTutorial(g);
    world.update(modalOpen() ? 0 : realDt, { simDt: modalOpen() ? 0 : realDt * speed, hour: dayClock.hour, lighting });
    updateZonePreview(g);
    updateFacilityPreview(g);
    if (tipUntil && performance.now() > tipUntil && tool !== "pan") tipUntil = 0;
    if (tipUntil === 0 && !(tool in FACILITY_TOOLS && cursor) && !(tool === "road" && roadStart) && !(tool === "upgrade" && cursor)) tip.style.display = "none";

    if (tool === "loop") updateLoopPreview();
    if (tool === "road" && cursor) {
      const p = snapPoint(graph, cursor.x, cursor.y);
      if (roadStart) {
        // 曲線は、制御点を決めたあとだけ曲線を表示する (その前は、制御点にするための直線)
        const curved = roadCurve && roadControl !== null;
        const pts = curved ? curvePoints(roadStart, roadControl!, p) : [roadStart, p];
        // 見積もりは、カーソルや道路が変わったときだけ求め直す (曲線で制御点を待っている間は、直線で見積もる)
        const waiting = roadCurve && !roadControl;
        const qk = `${roadStart.x},${roadStart.y}|${roadControl?.x},${roadControl?.y}|${p.x},${p.y}|${roadType}|${roadOneWay}|${graph.version}`;
        if (qk !== roadQuoteKey) {
          roadQuoteKey = qk;
          roadQuote = city.quotePath(pts, roadType, roadOneWay);
          const q = roadQuote;
          const extra = [q.bridge > 0 ? `${STRUCTURE_SPECS[Structure.Bridge].name} ${Math.round(q.bridge)} タイル` : "", q.tunnel > 0 ? `${STRUCTURE_SPECS[Structure.Tunnel].name} ${Math.round(q.tunnel)} タイル` : ""].filter(Boolean).join("・");
          tipUntil = 0;
          tip.style.display = "block";
          tip.textContent = waiting
            ? "曲線: 曲がり具合を決める点をクリック"
            : !q.ok
              ? q.reason ?? "ここには敷けません"
              : q.sections === 0
                ? `${ROAD_SPECS[roadType].name}: すでに同じ道路があります`
                : `${ROAD_SPECS[roadType].name}${roadOneWay ? " (一方通行)" : ""}${curved ? " (曲線)" : ""}${extra ? `・${extra}` : ""}: ${q.cost.toLocaleString("ja-JP")} 円${!city.canAfford(q.cost) ? " (お金が足りません)" : ""}`;
        }
        const valid = !!roadQuote?.ok;
        world.roads.showPreview({ ax: roadStart.x, ay: roadStart.y, bx: p.x, by: p.y, valid, type: roadType, oneWay: roadOneWay, points: pts, control: roadCurve ? (roadControl ?? undefined) : undefined });
        world.roads.showCursor(p, valid ? 0x7bd88f : 0xe05a4f);
      } else {
        world.roads.showPreview(null);
        world.roads.showCursor(p, isLandPoint(city.seed, p.x, p.y) ? 0x7bd88f : 0xe05a4f);
      }
    } else if (tool === "upgrade" && cursor) {
      // カーソルの下の道路 (ひとつながり) を色で示し、費用を案内する (変わらない・足りないときは赤)
      const e = graph.nearestEdge(cursor.x, cursor.y, 0.7);
      if (!e) {
        world.roads.showEdges(null, 0);
      } else {
        const key = `${e.id}|${roadType}|${graph.version}`;
        if (key !== roadQuoteKey) {
          roadQuoteKey = key;
          const q = city.quoteUpgrade(e.id, roadType);
          upgradeEdges = q.edges;
          upgradeOk = q.sections > 0 && city.canAfford(q.cost);
          tipUntil = 0;
          tip.style.display = "block";
          tip.textContent = q.sections === 0 ? `${ROAD_SPECS[roadType].name}: すでにその種類です` : `${ROAD_SPECS[roadType].name}に変える: ${q.cost.toLocaleString("ja-JP")} 円 (${q.sections} 区間)${!city.canAfford(q.cost) ? " お金が足りません" : ""}`;
        }
        world.roads.showEdges(upgradeEdges.length > 0 ? upgradeEdges : city.graph.roadRun(e.id), upgradeOk ? 0x7bd88f : 0xe05a4f);
      }
    } else if (tool !== "loop") {
      world.roads.showPreview(null); // 四角い道路の予告は、updateLoopPreview が出す
    }

    const st = zones.stats();
    hud.textContent =
      `C-cim v${VERSION}  tool=${tool}  zoom=${camera.zoom.toFixed(2)}  ` +
      `pos=(${Math.round(camera.x)}, ${Math.round(camera.y)})  chunks=${world.chunkCount}  ` +
      `roads: nodes=${graph.nodes.size} edges=${graph.edges.size}  ` +
      `zones: R=${st.R.zones} C=${st.C.zones} I=${st.I.zones}  ` +
      `buildings: R=${st.R.buildings} C=${st.C.buildings} I=${st.I.buildings}  ` +
      `facilities=${city.facilities.size}  seed=${city.seed}  time=${formatHour(dayClock.hour)}  offices: zones=${st.O.zones} buildings=${st.O.buildings}`;
    world.render();
  };
  requestAnimationFrame(frame);

  // ---- 起動 ----
  // ?seed=数字 を付けると、タイトル画面を飛ばしてそのシードの街をすぐ始める (動作確認用。真上からの視点で、画面は原点が左上)
  const querySeed = params.has("seed") ? seedFromText(params.get("seed")!) : null;
  if (querySeed !== null) startGame({ seed: querySeed, mapId: "custom", mapName: mapNameFor(querySeed), origin: true });
  else openTitle();
}

main();
