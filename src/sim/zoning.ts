import { RoadGraph, isAccessEdge } from "./roadGraph";
import { isBuildableTile } from "./roadPlacement";
import { hash2 } from "./rng";
import { tileAt } from "./terrain";

export const enum ZoneType {
  None = 0,
  Residential = 1,
  Commercial = 2,
  Industrial = 3,
  /** オフィス。働き口 (雇用) だけを生み、煙や悪臭は出さない。通勤だけで買い物の行き先にはならない。 */
  Office = 4,
}

/** 道路の中心線からこの距離 (タイル) より近いタイルは道路そのもの。ゾーンは塗れない。 */
export const ROAD_CLEARANCE = 0.5;
/** 道路の中心線からこの距離 (タイル) 以内なら、ゾーンを塗れる。 */
export const ZONE_REACH = 3;
/** 1回の矩形指定で塗れる一辺の最大タイル数。 */
export const MAX_RECT_SIZE = 40;
/** 建物の見た目の種類数 (variant は 1..BUILDING_VARIANTS)。 */
export const BUILDING_VARIANTS = 3;

/** 建物の見た目の種類 (variant 1..3) ごとの、住宅の定員・商業の雇用数・工業の雇用数。 */
export const RESIDENT_CAPACITY = [4, 8, 12] as const;
export const COMMERCIAL_JOBS = [3, 6, 9] as const;
export const INDUSTRIAL_JOBS = [4, 8, 12] as const;

/**
 * 区画の密度。塗るときに選び、建つ建物の大きさと人数・雇用が決まる。
 * 0 は密度を決めない昔の区画 (建物の大きさは場所ごとにまちまち)。昔のセーブデータや内部の計算で使う。
 */
export type Density = 0 | 1 | 2 | 3 | 4;
/** 密度の段階 (1 = 低, 2 = 中, 3 = 高, 4 = 超高)。すべての区画で使う。 */
export const DENSITIES: readonly Density[] = [1, 2, 3, 4];
/** 密度の段階の数 (すべての区画で 4 段階)。 */
export const DENSITY_LEVELS = 4;

/** 密度ごとの、住宅の定員・雇用数 (低・中・高)。 */
export const DENSITY_CAPACITY: Record<ZoneType.Residential | ZoneType.Commercial | ZoneType.Industrial | ZoneType.Office, readonly number[]> = {
  [ZoneType.Residential]: [4, 16, 48, 100],
  [ZoneType.Commercial]: [3, 12, 36, 100],
  [ZoneType.Industrial]: [4, 12, 30, 90],
  [ZoneType.Office]: [6, 24, 72, 200],
};

/** その密度の建物が建つために、近くに必要な道路の容量 (台/日)。低密度はどんな道路でもよい。 */
export const DENSITY_MIN_ROAD_CAPACITY: Record<Density, number> = { 0: 0, 1: 0, 2: 100, 3: 180, 4: 380 };

/** 区画の種類と密度の名前 (ツールの案内などに使う)。 */
export const ZONE_NAMES: Record<ZoneType.Residential | ZoneType.Commercial | ZoneType.Industrial | ZoneType.Office, readonly string[]> = {
  [ZoneType.Residential]: ["低密度住宅", "中密度住宅", "高密度住宅", "超高密度住宅"],
  [ZoneType.Commercial]: ["商店", "商業施設", "商業ビル", "超高層商業ビル"],
  [ZoneType.Industrial]: ["軽工業", "工業", "重工業", "大規模工場"],
  [ZoneType.Office]: ["小規模オフィス", "オフィスビル", "高層オフィス", "超高層オフィス"],
};

/**
 * 建物 (種類 tier = 1..3) の定員 (住宅) または雇用数 (それ以外)。
 * density が 1..3 ならその密度の表、0 なら昔の表 (tier だけで決まる)。オフィスは昔の表がなく、いつも密度の表。
 */
export function capacityOf(zone: ZoneType, tier: number, density: Density): number {
  if (density === 0 && zone !== ZoneType.Office) {
    return (zone === ZoneType.Residential ? RESIDENT_CAPACITY : zone === ZoneType.Commercial ? COMMERCIAL_JOBS : INDUSTRIAL_JOBS)[tier - 1]!;
  }
  const d = density === 0 ? tier : density;
  const table = DENSITY_CAPACITY[zone as keyof typeof DENSITY_CAPACITY];
  return table[Math.min(d, table.length) - 1]!; // 超高密度は住宅だけ。ほかの区画は、いちばん高い密度の値になる
}

/** この区画で選べる密度 (すべての区画で 4 段階: 低・中・高・超高)。 */
export function densitiesOf(_zone: ZoneType): readonly Density[] {
  return [1, 2, 3, 4];
}

/**
 * 密度ごとの、建物の大きさ (幅 × 高さ) の候補。建てるたびに、この中から種子と場所で決める (同じ場所なら同じ大きさ)。
 * 低密度は 1〜2 マス、中密度は 4〜6 マス、高密度は 9〜12 マス。同じものを 2 つ入れて、いちばん多い大きさを出やすくする。
 * 密度を決めない昔の区画は、いつも 1×1。
 */
export const LOT_SIZES: Record<Density, readonly (readonly [number, number])[]> = {
  0: [[1, 1]],
  1: [[1, 1], [1, 1], [2, 1], [1, 2]],
  2: [[2, 2], [2, 2], [3, 2], [2, 3]],
  3: [[3, 3], [3, 3], [4, 3], [3, 4]],
  // 超高密度は、1 マス 100 人。2×1・1×2 の建物で約 200 人、2×2 で約 400 人
  4: [[2, 1], [1, 2], [2, 1], [2, 2]],
};

/** タイル (x,y) に建てるときの、希望する建物の大きさ。 */
export function pickLotSize(seed: number, x: number, y: number, density: Density): readonly [number, number] {
  const list = LOT_SIZES[density];
  return list[Math.floor(hash2(seed ^ 0x10751, x, y) * list.length)]!;
}

/** 希望の大きさから、1×1 まで順に小さくした候補 (大きいほうの辺から 1 ずつ削る)。 */
export function shrinkSteps(w: number, h: number): [number, number][] {
  const out: [number, number][] = [[w, h]];
  while (w > 1 || h > 1) {
    if (w >= h) w--;
    else h--;
    out.push([w, h]);
  }
  return out;
}

/** 建物の面積 (タイル数)。 */
export const lotArea = (c: { w: number; h: number }) => c.w * c.h;

/** 建物の中心 (タイルの座標。タイルの角が整数)。 */
export const lotCenter = (c: { x: number; y: number; w: number; h: number }) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

/** 建物 1 棟の定員 (住宅) または雇用数 (それ以外)。1 マスあたりの数に、面積をかける。 */
export const cellCapacity = (c: ZoneCell) => Math.floor(capacityOf(c.zone, c.building, c.density) * c.w * c.h * c.aging); // 老朽化で、定員は整数に切り捨てる

export interface CityTotals {
  /** 住民の総数。 */
  population: number;
  /** 商業・工業の雇用数 (建物の定員の合計)。 */
  jobsC: number;
  jobsI: number;
  /** オフィスの雇用数。 */
  jobsO?: number;
  /** 病気で働けない住民の数 (population の内数)。税を払わず、働き手にも数えない。 */
  sick?: number;
}

export interface ZoneCell {
  x: number;
  y: number;
  zone: ZoneType;
  /** 0 = 空き地、1.. = 建物の見た目の種類。密度が決まっている区画では、密度と同じ。 */
  building: number;
  /** 塗ったときに選んだ密度 (1 = 低、2 = 中、3 = 高)。0 = 密度を決めない昔の区画。 */
  density: Density;
  /** 住宅の入居者数。建物の定員まで少しずつ増える。 */
  residents: number;
  /** 建物の大きさ (タイル数)。アンカー (左上のタイル) だけが意味を持つ。1×1 が昔の建物。定員・雇用・ごみ・電力などは「1 マスあたりの数 × w × h」。 */
  w: number;
  h: number;
  /** 複数マスの建物の、アンカー以外のタイルが持つ: アンカーのタイルのキー ("x,y")。アンカーと単独の建物では undefined。 */
  part?: string;
  /** 電力・水道・下水が足りている建物か。足りない建物は住民や雇用に数えず、税も入らない。 */
  served: boolean;
  /** このタイルの近くにある、建物の出入口になれる道路の容量の最大 (台/日)。道路網と一緒に City が求める。 */
  roadCap: number;
  /** このタイルが面している、道路でつながった範囲の番号。0 = 道路が届かない、-1 = 未計算 (City が計算する)。 */
  net: number;
  /** 周りの環境 (City が毎日求め直す。保存はしない)。住宅のタイルだけ意味がある。 */
  env: CellEnv;
  /** 建物が建った日 (通し番号の日)。建物がないときは 0。 */
  built: number;
  /** 老朽化による、定員・雇用の割合 (1 = 新築。City が毎日求め直す。保存はしない)。 */
  aging: number;
}

/** 住宅のタイルが受ける環境の悪さ (0 = 問題なし、1 = 最悪) と、その結果の病人の数。 */
export interface CellEnv {
  /** 工場・発電所による大気汚染。 */
  air: number;
  /** 交通量の多い道路や工場による騒音。 */
  noise: number;
  /** 下水処理場による悪臭。 */
  odor: number;
  /** 3 つを合わせた健康へのリスク (0〜1)。 */
  risk: number;
  /** 病気で寝込んでいる住民の数 (病院が近いと減る)。 */
  sick: number;
  /** 病院の範囲内か。 */
  cared: boolean;
}

export const cleanEnv = (): CellEnv => ({ air: 0, noise: 0, odor: 0, risk: 0, sick: 0, cared: false });

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const key = (x: number, y: number) => `${x},${y}`;

/** 2つのタイル座標から、x0<=x1, y0<=y1 の矩形を作る。始点から各辺が maxSize タイルを超えないよう終点側を切り詰める。 */
export function normalizeRect(ax: number, ay: number, bx: number, by: number, maxSize = MAX_RECT_SIZE): Rect {
  const clampTo = (a: number, b: number) => Math.min(Math.max(b, a - (maxSize - 1)), a + (maxSize - 1));
  const cx = clampTo(ax, bx);
  const cy = clampTo(ay, by);
  return { x0: Math.min(ax, cx), y0: Math.min(ay, cy), x1: Math.max(ax, cx), y1: Math.max(ay, cy) };
}

/** タイル (tx,ty) にゾーンを塗れるか。陸地で、道路そのものではなく、道路の近く (ZONE_REACH 以内) であること。 */
export function canZone(seed: number, graph: RoadGraph, tx: number, ty: number): boolean {
  if (!isBuildableTile(tileAt(seed, tx, ty))) return false;
  const d = graph.distanceToRoad(tx + 0.5, ty + 0.5, ZONE_REACH);
  if (d < ROAD_CLEARANCE) return false;
  // 高速道路の近くだけでは、建物の出入口がないので塗れない
  return graph.distanceToRoad(tx + 0.5, ty + 0.5, ZONE_REACH, isAccessEdge) <= ZONE_REACH;
}

/** タイル単位のゾーンと、そこに建つ建物。 */
export class ZoneMap {
  readonly cells = new Map<string, ZoneCell>();
  /** 変更のたびに増える。描画側が再描画の要否を判断するのに使う。 */
  version = 0;
  /** 今日の日 (通し番号)。建物が建った日の記録に使う。City が毎日、建てる前に設定する。 */
  day = 0;

  /** ゾーンを塗れない (施設が建っているなど) タイルかを返す関数。City が設定する。 */
  blocked: (tx: number, ty: number) => boolean = () => false;

  constructor(private seed: number) {}

  /** ゾーンを塗れるか: 地形・道路との距離 (canZone) に加えて、施設などが建っていないこと。 */
  canZoneAt(graph: RoadGraph, tx: number, ty: number): boolean {
    return !this.blocked(tx, ty) && canZone(this.seed, graph, tx, ty);
  }

  get(tx: number, ty: number): ZoneCell | undefined {
    return this.cells.get(key(tx, ty));
  }

  /** 矩形にゾーンを塗る。塗れないタイルは飛ばす。種類が変わった (または新しく塗れた) タイル数を返す。 */
  paintRect(graph: RoadGraph, r: Rect, type: ZoneType, density: Density = 0): number {
    if (type === ZoneType.None) return this.clearRect(r);
    let changed = 0;
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const cell = this.get(x, y);
        if (cell?.zone === type && cell.density === density) continue;
        if (!this.canZoneAt(graph, x, y)) continue;
        // 別の種類に塗り替えると、建っていた建物は取り壊される (複数マスの建物は、ほかのタイルも空き地に戻る)
        if (cell) this.demolishLot(cell);
        this.cells.set(key(x, y), { x, y, zone: type, building: 0, residents: 0, served: true, net: -1, roadCap: 0, density, w: 1, h: 1, env: cleanEnv(), built: 0, aging: 1 });
        changed++;
      }
    }
    if (changed > 0) this.version++;
    return changed;
  }

  /** 矩形内のゾーン (と建物) を解除する。解除したタイル数を返す。 */
  clearRect(r: Rect): number {
    let removed = 0;
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const cell = this.get(x, y);
        if (!cell) continue;
        this.demolishLot(cell); // 複数マスの建物の一部を解除したら、建物ごと取り壊す (残りのタイルは空き地に戻る)
        this.cells.delete(key(x, y));
        removed++;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  /** 道路の撤去や敷設で塗れなくなったゾーンを (建物ごと) 消す。消したタイル数を返す。 */
  revalidate(graph: RoadGraph): number {
    let removed = 0;
    for (const [k, c] of this.cells) {
      if (!this.canZoneAt(graph, c.x, c.y)) {
        this.demolishLot(c);
        this.cells.delete(k);
        removed++;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  /** 建物 (アンカーまたは一部のタイル) のアンカーを返す。建物でなければ cell そのもの。 */
  anchorOf(cell: ZoneCell): ZoneCell {
    return (cell.part !== undefined ? this.cells.get(cell.part) : undefined) ?? cell;
  }

  /** 建物の敷地のタイル (アンカーを先頭に)。単独の建物・空き地は、そのタイルだけ。 */
  lotCells(anchor: ZoneCell): ZoneCell[] {
    const out: ZoneCell[] = [];
    for (let dy = 0; dy < anchor.h; dy++) {
      for (let dx = 0; dx < anchor.w; dx++) {
        const t = this.cells.get(key(anchor.x + dx, anchor.y + dy));
        if (t) out.push(t);
      }
    }
    return out;
  }

  /**
   * cell を含む複数マスの建物を取り壊し、その敷地のタイルを (同じゾーンの) 空き地に戻す。1×1 の建物・空き地は何もしない。
   * 呼び出し側が、そのあとで cell そのものを消す・塗り替えるのに使う。
   */
  demolishLot(cell: ZoneCell): void {
    const anchor = this.anchorOf(cell);
    if (anchor.w * anchor.h <= 1) return;
    for (const t of this.lotCells(anchor)) {
      t.building = 0;
      t.residents = 0;
      t.part = undefined;
      t.w = 1;
      t.h = 1;
      t.served = true;
      t.net = -1;
      t.roadCap = 0;
      t.env = cleanEnv();
    }
  }

  /** (x,y) を左上に、w×h の空き地 (同じ種類・同じ密度のゾーンで、建物も建設中でもない) があるか。 */
  private lotFits(c: ZoneCell, w: number, h: number): ZoneCell[] | null {
    const tiles: ZoneCell[] = [];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const t = this.cells.get(key(c.x + dx, c.y + dy));
        if (!t || t.zone !== c.zone || t.density !== c.density || t.building !== 0 || t.part !== undefined) return null;
        tiles.push(t);
      }
    }
    return tiles;
  }

  /**
   * 空いているゾーンに、確率 chance で建物を建てる。chance にはゾーンの種類ごとに確率を返す関数も渡せる。
   * 密度を選んだ区画では、建物は複数マス (密度ごとの大きさの範囲から、場所ごとに決まる)。入りきらなければ、1×1 まで小さくして試す。
   * 広い建物ほど 1 回で多くの空き地を使うので、確率は面積をかけ (最大 1)、maxSpawn も「建てる棟数」ではなく使うタイル数の上限として数える。
   * 1 回に建てる棟数を返す。rng を固定すれば結果も固定される。
   */
  grow(
    rng: () => number,
    chance: number | ((zone: ZoneType, density: Density) => number) = 0.3,
    maxSpawn = Infinity,
    /**
     * false を返すと、その場所には建てない (電力・水道が足りないときなど)。建てる直前に呼ばれる。
     * tiles は建物が使うタイル (アンカーが先頭)。大きい建物から順に試し、最初に true を返したものを建てる。
     */
    allow: (cell: ZoneCell, variant: number, tiles: ZoneCell[]) => boolean = () => true,
  ): number {
    let spawned = 0;
    let used = 0;
    for (const c of this.cells.values()) {
      if (used >= maxSpawn) break;
      if (c.building !== 0 || c.part !== undefined) continue;
      const p = typeof chance === "number" ? chance : chance(c.zone, c.density);
      const [pw, ph] = pickLotSize(this.seed, c.x, c.y, c.density);
      if (rng() >= Math.min(1, p * pw * ph)) continue;
      // 密度を選んだ区画は、その密度の建物が建つ。昔の区画は、場所ごとにまちまちの大きさ
      const variant = c.density > 0 ? c.density : 1 + Math.floor(hash2(this.seed, c.x, c.y) * BUILDING_VARIANTS);
      for (const [w, h] of shrinkSteps(pw, ph)) {
        const tiles = this.lotFits(c, w, h);
        if (!tiles || !allow(c, variant, tiles)) continue;
        c.building = variant;
        c.built = this.day;
        c.aging = 1;
        c.w = w;
        c.h = h;
        for (const t of tiles) {
          if (t === c) continue;
          t.part = key(c.x, c.y);
          t.net = 0; // アンカー以外のタイルは、出入口を持たない (道路網の番号はアンカーが持つ)
          t.roadCap = 0;
        }
        spawned++;
        used += w * h;
        break;
      }
    }
    if (spawned > 0) this.version++;
    return spawned;
  }

  /**
   * 入居中の住宅に、住民を増やす (定員まで)。1 マスあたり 1 日 1 人 (複数マスの建物は、マス数ぶん)。増えた人数を返す。
   * canMoveIn で、住民が引っ越してこられない住宅 (外部と接続していないなど) を除ける。
   */
  fillResidents(canMoveIn: (cell: ZoneCell) => boolean = () => true): number {
    let added = 0;
    for (const c of this.cells.values()) {
      if (c.zone !== ZoneType.Residential || c.building === 0 || !c.served || !canMoveIn(c)) continue;
      const room = cellCapacity(c) - c.residents;
      if (room > 0) {
        const n = Math.min(room, c.w * c.h);
        c.residents += n;
        added += n;
      }
    }
    return added;
  }

  /** 人口と雇用数の合計 (電力・水道・下水が足りている建物だけ)。 */
  totals(): CityTotals {
    return this.totalsWhere(() => true);
  }

  /** 人口と雇用数の合計のうち、pred が true の建物だけ (地区ごとの税に使う)。 */
  totalsWhere(pred: (c: ZoneCell) => boolean): CityTotals {
    const t: CityTotals = { population: 0, jobsC: 0, jobsI: 0, jobsO: 0, sick: 0 };
    for (const c of this.cells.values()) {
      if (c.building === 0 || !c.served || !pred(c)) continue;
      if (c.zone === ZoneType.Residential) {
        t.population += c.residents;
        t.sick! += Math.min(c.residents, c.env.sick);
      } else if (c.zone === ZoneType.Commercial) t.jobsC += cellCapacity(c);
      else if (c.zone === ZoneType.Office) t.jobsO! += cellCapacity(c);
      else t.jobsI += cellCapacity(c);
    }
    return t;
  }

  /** 種類ごとのゾーン数と建物数。 */
  stats(): Record<"R" | "C" | "I" | "O", { zones: number; buildings: number }> {
    const s = {
      R: { zones: 0, buildings: 0 },
      C: { zones: 0, buildings: 0 },
      I: { zones: 0, buildings: 0 },
      O: { zones: 0, buildings: 0 },
    };
    for (const c of this.cells.values()) {
      const k = c.zone === ZoneType.Residential ? "R" : c.zone === ZoneType.Commercial ? "C" : c.zone === ZoneType.Office ? "O" : "I";
      s[k].zones++;
      if (c.building > 0) s[k].buildings++;
    }
    return s;
  }
}
