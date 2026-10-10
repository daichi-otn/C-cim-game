import { Tile, tileAt } from "./terrain";
import { isBuildableTile, type Point } from "./roadPlacement";

/** 道路の特別な区間。橋は水の上、トンネルは山の下を通る。 */
export const enum Structure {
  None = 0,
  Bridge = 1,
  Tunnel = 2,
}

export interface StructureSpec {
  name: string;
  /** 同じ種類の道路の建設費・維持費の何倍か。 */
  costMult: number;
  upkeepMult: number;
  /** 1 つながりの最大の長さ (タイル)。これより長い水や山は越えられない。 */
  maxLength: number;
  /** 通る地形。 */
  over: string;
}

export const STRUCTURE_SPECS: Record<Exclude<Structure, Structure.None>, StructureSpec> = {
  [Structure.Bridge]: { name: "橋", costMult: 3, upkeepMult: 2, maxLength: 14, over: "水の上" },
  [Structure.Tunnel]: { name: "トンネル", costMult: 4, upkeepMult: 2.5, maxLength: 10, over: "山の下" },
};

export const isStructure = (v: unknown): v is Structure => v === 0 || v === 1 || v === 2;

/** 建設費・維持費の倍率 (特別でない区間は 1)。 */
export const costMultOf = (s: Structure) => (s === Structure.None ? 1 : STRUCTURE_SPECS[s].costMult);
export const upkeepMultOf = (s: Structure) => (s === Structure.None ? 1 : STRUCTURE_SPECS[s].upkeepMult);

/** 道路を敷くときの、経路の 1 区間。 */
export interface PathPiece {
  a: Point;
  b: Point;
  structure: Structure;
  /** 橋・トンネルが連続する区間のまとまりの番号 (0 = 特別でない)。同じまとまりは、撤去のとき一緒に消える。 */
  run: number;
}

export type PathPlan = { ok: true; pieces: PathPiece[]; bridge: number; tunnel: number } | { ok: false; reason: string };

const SAMPLE_STEP = 0.25;

const classify = (seed: number, x: number, y: number): Structure => {
  const t = tileAt(seed, Math.floor(x), Math.floor(y));
  if (t === Tile.Water) return Structure.Bridge;
  if (t === Tile.Mountain) return Structure.Tunnel;
  return Structure.None;
};

/**
 * 折れ線の経路を、地形ごとの区間に分ける。陸の上は普通の道路、水の上は橋、山の下はトンネルになる。
 * 次の場合は敷けない: 始点・終点が水や山の中、橋やトンネルが長すぎる、橋とトンネルが直接つながる (間に陸が要る)。
 */
export function planPath(seed: number, pts: readonly Point[]): PathPlan {
  if (pts.length < 2) return { ok: false, reason: "道路の長さがありません" };
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (classify(seed, first.x, first.y) !== Structure.None || classify(seed, last.x, last.y) !== Structure.None) {
    return { ok: false, reason: "水や山の中から始めたり、終えたりはできません (岸や山のふもとから)" };
  }
  const pieces: PathPiece[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const steps = Math.max(1, Math.ceil(len / SAMPLE_STEP));
    // 各サンプルの区分を調べ、変わる所 (サンプルの中間) で区切る
    let runStart = 0;
    let runClass = classify(seed, a.x, a.y);
    const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    for (let k = 1; k <= steps; k++) {
      const c = classify(seed, at(k / steps).x, at(k / steps).y);
      if (c !== runClass) {
        const cut = (k - 0.5) / steps;
        pieces.push({ a: at(runStart), b: at(cut), structure: runClass, run: 0 });
        runStart = cut;
        runClass = c;
      }
    }
    pieces.push({ a: at(runStart), b: at(1), structure: runClass, run: 0 });
  }
  // 連続する橋・トンネルをまとまりにして、長さと隣り合わせを調べる
  let nextRun = 1;
  let bridge = 0;
  let tunnel = 0;
  let i = 0;
  while (i < pieces.length) {
    const s = pieces[i]!.structure;
    if (s === Structure.None) {
      i++;
      continue;
    }
    let j = i;
    let length = 0;
    while (j < pieces.length && pieces[j]!.structure === s) {
      length += Math.hypot(pieces[j]!.b.x - pieces[j]!.a.x, pieces[j]!.b.y - pieces[j]!.a.y);
      pieces[j]!.run = nextRun;
      j++;
    }
    nextRun++;
    const spec = STRUCTURE_SPECS[s];
    if (length > spec.maxLength + 1e-6) return { ok: false, reason: `${spec.name}は ${spec.maxLength} タイルまでです (この区間は約 ${Math.round(length)} タイル)` };
    if (j < pieces.length && pieces[j]!.structure !== Structure.None) return { ok: false, reason: "橋とトンネルは直接つなげません (間に陸が必要です)" };
    if (s === Structure.Bridge) bridge += length;
    else tunnel += length;
    i = j;
  }
  return { ok: true, pieces, bridge, tunnel };
}

/** 陸地か (橋・トンネルなしで道路を敷けるか)。 */
export const isLandPoint = (seed: number, x: number, y: number) => isBuildableTile(tileAt(seed, Math.floor(x), Math.floor(y)));
