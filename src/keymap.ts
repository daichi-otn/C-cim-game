/**
 * 操作キーの一覧と、変更・保存・読み込みの計算 (純粋な計算だけ。画面には関わらない)。
 * 1 つのキーは 1 つの操作にだけ割り当てる。使っているキーを選んだら、2 つの操作のキーを入れ替える。
 */

export interface ActionDef {
  id: string;
  /** 設定の一覧の並び (グループ見出しの下) に使う名前。 */
  label: string;
  group: KeyGroup;
  /** 初期設定のキー (小文字。Space は " ")。 */
  key: string;
}

export type KeyGroup = "camera" | "view" | "game" | "road" | "tool";

export const KEY_GROUP_NAMES: Record<KeyGroup, string> = {
  camera: "視点を動かす",
  view: "表示",
  game: "ゲーム",
  road: "道路ツール",
  tool: "道具",
};

export const ACTION_DEFS = [
  { id: "cam.forward", label: "視点を前へ", group: "camera", key: "w" },
  { id: "cam.back", label: "視点を後ろへ", group: "camera", key: "s" },
  { id: "cam.left", label: "視点を左へ", group: "camera", key: "a" },
  { id: "cam.right", label: "視点を右へ", group: "camera", key: "d" },
  { id: "cam.yawLeft", label: "向きを左へ回す", group: "camera", key: "q" },
  { id: "cam.yawRight", label: "向きを右へ回す", group: "camera", key: "e" },
  { id: "cam.pitchUp", label: "仰角を上げる", group: "camera", key: "r" },
  { id: "cam.pitchDown", label: "仰角を下げる", group: "camera", key: "f" },
  { id: "view.topDown", label: "真上から / 斜めに切り替え", group: "view", key: "v" },
  { id: "view.yawLeft", label: "視点を 15 度左へ回す", group: "view", key: "," },
  { id: "view.yawRight", label: "視点を 15 度右へ回す", group: "view", key: "." },
  { id: "view.reset", label: "視点を標準に戻す", group: "view", key: "Home" },
  { id: "view.daylight", label: "時間帯の切り替え", group: "view", key: "l" },
  { id: "view.traffic", label: "交通の混雑の色分け", group: "view", key: "t" },
  { id: "view.env", label: "環境の色分け", group: "view", key: "o" },
  { id: "game.pause", label: "一時停止・再開", group: "game", key: " " },
  { id: "game.menu", label: "メニューを開く・閉じる", group: "game", key: "m" },
  { id: "road.curve", label: "曲線のオン・オフ", group: "road", key: "c" },
  { id: "road.oneWay", label: "一方通行のオン・オフ", group: "road", key: "z" },
  { id: "tool.pan", label: "移動", group: "tool", key: "1" },
  { id: "tool.road", label: "道路", group: "tool", key: "2" },
  { id: "tool.bulldoze", label: "撤去", group: "tool", key: "3" },
  { id: "tool.zoneR", label: "住宅", group: "tool", key: "4" },
  { id: "tool.zoneC", label: "商業", group: "tool", key: "5" },
  { id: "tool.zoneI", label: "工業", group: "tool", key: "6" },
  { id: "tool.unzone", label: "ゾーン解除", group: "tool", key: "7" },
  { id: "tool.zoneO", label: "オフィス", group: "tool", key: "b" },
  { id: "tool.upgrade", label: "道路変更", group: "tool", key: "u" },
  { id: "tool.district", label: "地区", group: "tool", key: "y" },
  { id: "tool.power", label: "発電所", group: "tool", key: "8" },
  { id: "tool.water", label: "給水", group: "tool", key: "9" },
  { id: "tool.sewage", label: "下水", group: "tool", key: "0" },
  { id: "tool.outside", label: "外部接続", group: "tool", key: "-" },
  { id: "tool.police", label: "警察署", group: "tool", key: "p" },
  { id: "tool.fire", label: "消防署", group: "tool", key: "i" },
  { id: "tool.hospital", label: "病院", group: "tool", key: "h" },
  { id: "tool.school", label: "学校", group: "tool", key: "k" },
  { id: "tool.green", label: "緑地", group: "tool", key: "x" },
  { id: "tool.garbage", label: "ごみ処理場", group: "tool", key: "g" },
  { id: "tool.loop", label: "四角道路", group: "tool", key: "j" },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTION_DEFS)[number]["id"];
export type Keymap = Record<ActionId, string>;

export const DEFAULT_KEYMAP: Keymap = Object.fromEntries(ACTION_DEFS.map((a) => [a.id, a.key])) as Keymap;

/** 割り当てられる特別なキー (1 文字のほかに使えるもの)。Escape・Enter・Tab は、取り消しなどに使うので割り当てない。 */
const SPECIAL_KEYS = ["Home", "End", "PageUp", "PageDown", "Insert", "Delete"];

/** キーボードの入力を、比べやすい形にする (英字は小文字)。 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** 画面に出すキーの名前。 */
export function keyLabel(key: string): string {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

/** このキーを割り当ててよいか (印字できる 1 文字か、特別なキー)。 */
export function isAssignable(key: string): boolean {
  if (key.length === 1) return key === " " || (key >= "!" && key <= "~");
  return SPECIAL_KEYS.includes(key);
}

/** キーに割り当てられた操作。 */
export function actionFor(map: Keymap, key: string): ActionId | undefined {
  const k = normalizeKey(key);
  return (Object.keys(map) as ActionId[]).find((id) => map[id] === k);
}

/** 操作にキーを割り当てる。そのキーを別の操作が使っていたら、2 つの操作のキーを入れ替える。 */
export function bindKey(map: Keymap, id: ActionId, rawKey: string): { ok: true; map: Keymap; swapped?: ActionId } | { ok: false; reason: string } {
  const key = normalizeKey(rawKey);
  if (!isAssignable(key)) return { ok: false, reason: `「${keyLabel(key)}」は割り当てられません` };
  const next: Keymap = { ...map };
  const other = actionFor(map, key);
  if (other !== undefined && other !== id) next[other] = map[id];
  next[id] = key;
  return other !== undefined && other !== id ? { ok: true, map: next, swapped: other } : { ok: true, map: next };
}

/** 保存された文字列から、操作キーを読む。壊れている・重なっているときは初期設定。足りない操作は初期設定のまま。 */
export function parseKeymap(raw: string | null): Keymap {
  if (!raw) return { ...DEFAULT_KEYMAP };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
  if (typeof data !== "object" || data === null) return { ...DEFAULT_KEYMAP };
  const map: Keymap = { ...DEFAULT_KEYMAP };
  const rec = data as Record<string, unknown>;
  for (const a of ACTION_DEFS) {
    const v = rec[a.id];
    if (v === undefined) continue;
    if (typeof v !== "string" || !isAssignable(normalizeKey(v))) return { ...DEFAULT_KEYMAP };
    map[a.id] = normalizeKey(v);
  }
  // 同じキーが 2 つの操作にあれば、壊れたとみなして初期設定に戻す
  if (new Set(Object.values(map)).size !== Object.keys(map).length) return { ...DEFAULT_KEYMAP };
  return map;
}

/** 文章の中の {{操作の名前}} を、いまの設定のキーの名前に置き換える (チュートリアルの説明などに使う)。 */
export function resolveKeyTokens(text: string, map: Keymap): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (whole, id: string) => (id in map ? keyLabel(map[id as ActionId]) : whole));
}

/** 保存先の名前 (localStorage)。 */
export const KEYMAP_STORAGE_KEY = "ccim.keymap.v1";
