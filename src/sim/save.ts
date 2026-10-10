import { City, type CityData } from "./city";

/** セーブデータの形式の版。形式を変えたら増やす。 */
export const SAVE_VERSION = 1;
/** 手動で使えるスロットの数。このほかに自動セーブがある。 */
export const SLOT_COUNT = 3;
export const AUTO_SLOT = "auto";
export type SlotId = string;

export interface SaveData {
  version: number;
  mapId: string;
  mapName: string;
  /** 保存した時刻 (ミリ秒)。 */
  savedAt: number;
  city: CityData;
  /**
   * 画面の位置と拡大率。center が true なら (x, y) は画面の中心に見える地面の点 (3D 視点。yaw = 向き、pitch = 見下ろす角度)。
   * center がない昔のデータ (2D) は、(x, y) が画面の左上の地面の点で、向きと角度はない。
   */
  view: { x: number; y: number; zoom: number; yaw?: number; pitch?: number; center?: boolean };
  /** ゲームの速度 (0 = 一時停止)。 */
  speed: number;
}

/** 一覧に出す要約。 */
export interface SaveSummary {
  slot: SlotId;
  mapName: string;
  savedAt: number;
  day: number;
  money: number;
  population: number;
}

export class SaveError extends Error {}

/** 街を保存用のデータにする。 */
export function makeSave(
  city: City,
  ctx: { mapId: string; mapName: string; view: SaveData["view"]; speed: number },
  now = Date.now(),
): SaveData {
  return { version: SAVE_VERSION, mapId: ctx.mapId, mapName: ctx.mapName, savedAt: now, city: city.toData(), view: ctx.view, speed: ctx.speed };
}

/** 保存文字列を読み込む。壊れていれば SaveError (理由は日本語)。街のデータの中身は City.fromData が確かめる。 */
export function parseSave(text: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("セーブデータを読み込めません (形式が壊れています)");
  }
  const d = raw as Partial<SaveData> | null;
  if (!d || typeof d !== "object") throw new SaveError("セーブデータを読み込めません (形式が壊れています)");
  if (d.version !== SAVE_VERSION) {
    throw new SaveError(
      typeof d.version === "number" && d.version > SAVE_VERSION
        ? "新しいバージョンのセーブデータです。ゲームを更新してください"
        : "古い形式のセーブデータです",
    );
  }
  const view = d.view;
  if (
    typeof d.mapId !== "string" || typeof d.mapName !== "string" || !Number.isFinite(d.savedAt) ||
    !d.city || typeof d.city !== "object" || !view || !Number.isFinite(view.x) || !Number.isFinite(view.y) ||
    !Number.isFinite(view.zoom) || !Number.isFinite(d.speed) ||
    (view.yaw !== undefined && !Number.isFinite(view.yaw)) || (view.pitch !== undefined && !Number.isFinite(view.pitch))
  ) {
    throw new SaveError("セーブデータを読み込めません (必要な情報が足りません)");
  }
  return d as SaveData;
}

/** セーブデータから街を復元する。壊れていれば SaveError。 */
export function loadCity(save: SaveData): City {
  try {
    const city = City.fromData(save.city);
    city.refresh();
    return city;
  } catch (e) {
    throw new SaveError(`セーブデータの街を復元できません (${e instanceof Error ? e.message : "不明なエラー"})`);
  }
}

export function summarize(slot: SlotId, save: SaveData): SaveSummary {
  let population = 0;
  for (const z of save.city.zones) if (z[2] === 1) population += z[4]; // ゾーンの種類 1 = 住宅
  return { slot, mapName: save.mapName, savedAt: save.savedAt, day: save.city.day, money: save.city.money, population };
}

/** localStorage と同じ形の保存先 (テストでは差し替える)。 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** スロットごとにセーブデータを保存・読込する。 */
export class SaveStore {
  constructor(private storage: KeyValueStorage, private prefix = "ccim.save.") {}

  static slots(): SlotId[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => String(i + 1));
  }

  private key(slot: SlotId) {
    return this.prefix + slot;
  }

  /** 保存する。保存先がいっぱいなどで書けなければ SaveError。 */
  write(slot: SlotId, data: SaveData): void {
    try {
      this.storage.setItem(this.key(slot), JSON.stringify(data));
    } catch {
      throw new SaveError("保存できませんでした (ブラウザの保存領域がいっぱいか、使えない設定です)");
    }
  }

  /** 読み込む。空きなら null。壊れていれば SaveError。 */
  read(slot: SlotId): SaveData | null {
    let text: string | null;
    try {
      text = this.storage.getItem(this.key(slot));
    } catch {
      throw new SaveError("セーブデータにアクセスできません (ブラウザの設定を確認してください)");
    }
    return text === null ? null : parseSave(text);
  }

  remove(slot: SlotId): void {
    try {
      this.storage.removeItem(this.key(slot));
    } catch {
      /* 消せなくても困らない */
    }
  }

  /** 全スロット (手動 + 自動) の要約。空きは null、壊れているものは null にして理由を broken に入れる。 */
  list(): { slot: SlotId; summary: SaveSummary | null; broken?: string }[] {
    return [...SaveStore.slots(), AUTO_SLOT].map((slot) => {
      try {
        const data = this.read(slot);
        return { slot, summary: data ? summarize(slot, data) : null };
      } catch (e) {
        return { slot, summary: null, broken: e instanceof Error ? e.message : "読み込めません" };
      }
    });
  }
}
