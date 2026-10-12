/**
 * 住民の年齢層 (純粋な計算)。子どもは学校へ行き、大人は働き、高齢者は年金で暮らす。
 * 家ごとの年齢の割合は、家の場所と街の種から決まる (同じ街なら、いつも同じ割合)。
 */

export interface AgeMix {
  child: number;
  adult: number;
  senior: number;
}

/** 0〜1 の、場所と種から決まる値 (いつも同じ)。 */
export function placeHash(seed: number, x: number, y: number, salt: number): number {
  const v = Math.sin((seed % 100000) * 12.9898 + x * 78.233 + y * 37.719 + salt * 4.1414) * 43758.5453;
  return v - Math.floor(v);
}

/** 家 (x, y) の年齢の割合。子どもは 2〜4 割、高齢者は 1〜3 割、残りが大人。 */
export function ageMixAt(seed: number, x: number, y: number): AgeMix {
  const child = 0.2 + 0.2 * placeHash(seed, x, y, 1);
  const senior = 0.1 + 0.2 * placeHash(seed, x, y, 2);
  return { child, senior, adult: 1 - child - senior };
}

/** 高齢者 1 人あたり、毎月の年金 (円)。 */
export const PENSION_PER_SENIOR = 900;

/** 学校に通えない子どもがいるとき、幸福度が下がる最大の量 (子どもの全員が通えないとき)。 */
export const UNSCHOOLED_HAPPINESS_PENALTY = 0.25;

/** 住民 1 人。家と働き先は、区画の左上のタイルの場所。働き先がないとき null。 */
export interface Person {
  id: number;
  home: [number, number];
  /** 生まれてからの日数。 */
  ageDays: number;
  work: [number, number] | null;
}

/** 年齢 (日数) から、子ども・大人・高齢者のどれか。 */
export function personGroupOf(ageDays: number): "child" | "adult" | "senior" {
  const years = ageDays / 365;
  if (years < 18) return "child";
  if (years < 65) return "adult";
  return "senior";
}

/** 家の年齢の割合から、新しい住民の年齢 (日数) を決める。id から決まるので、いつも同じ。 */
export function sampleAgeDays(seed: number, home: [number, number], id: number): number {
  const mix = ageMixAt(seed, home[0], home[1]);
  const u = placeHash(seed, id, 7, 3);
  const v = placeHash(seed, id, 11, 5);
  if (u < mix.child) return Math.floor((3 + v * 14) * 365);
  if (u < 1 - mix.senior) return Math.floor((18 + v * 46) * 365);
  return Math.floor((65 + v * 25) * 365);
}

export interface HomeSlot {
  x: number;
  y: number;
  /** この家に住んでいる人の数 (今の数)。 */
  residents: number;
}

/**
 * 住民の一覧を、家ごとの人数に合わせる。足りなければ新しく作り、多ければ若い順に減らす。
 * 働き先は、働き先の場所の一覧から、id で決める (働き先がなければ null)。
 * 戻り値は、新しい一覧と、次に使う id。
 */
export function reconcilePeople(
  seed: number,
  prev: Person[],
  homes: HomeSlot[],
  jobs: [number, number][],
  nextId: number,
): { people: Person[]; nextId: number } {
  const homeKey = (x: number, y: number) => `${x},${y}`;
  const wanted = new Map(homes.map((h) => [homeKey(h.x, h.y), h] as const));
  const byHome = new Map<string, Person[]>();
  for (const p of prev) {
    const k = homeKey(p.home[0], p.home[1]);
    if (!wanted.has(k)) continue; // 家がなくなった人は、いなくなる
    let list = byHome.get(k);
    if (!list) byHome.set(k, (list = []));
    list.push(p);
  }
  const out: Person[] = [];
  let id = nextId;
  for (const h of homes) {
    const k = homeKey(h.x, h.y);
    // 人数が減ったときは、若い人から出ていく (高齢者は残りやすい)
    const kept = [...(byHome.get(k) ?? [])]
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, Math.max(0, h.residents))
      .sort((a, b) => a.id - b.id);
    out.push(...kept);
    for (let i = kept.length; i < h.residents; i++) {
      const home: [number, number] = [h.x, h.y];
      const work = jobs.length > 0 ? jobs[Math.floor(placeHash(seed, id, 13, 17) * jobs.length)] ?? null : null;
      out.push({ id, home, ageDays: sampleAgeDays(seed, home, id), work });
      id++;
    }
  }
  // 働き先がなくなった人は、働き先を決め直す
  const jobSet = new Set(jobs.map(([x, y]) => `${x},${y}`));
  for (const p of out) {
    if (p.work && !jobSet.has(`${p.work[0]},${p.work[1]}`)) p.work = jobs.length > 0 ? jobs[p.id % jobs.length]! : null;
  }
  return { people: out, nextId: id };
}
