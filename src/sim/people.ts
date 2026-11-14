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
  /** 就学の累積日数。省略された旧データでは年齢と種から補う。 */
  educationDays?: number;
}

export const EDUCATION_NAMES = ["未修了", "基礎教育", "中等教育", "高等教育"] as const;
export interface PersonLifeContext {
  schooled: boolean;
  cared: boolean;
  risk: number;
  landValue: number;
  taxRate: number;
  welfare: boolean;
  educationPolicy: number;
  medicalPolicy: number;
  trafficPolicy: number;
  /** 職場まで同じ道路網で移動できるか（方向別経路の保証ではない）。 */
  workConnected: boolean;
  workKind: "commercial" | "industrial" | "office" | null;
  shopDistance: number | null;
  congestion: number;
  happiness: number;
}

export interface PersonLife {
  occupation: "子ども" | "就業中" | "失業中" | "年金生活";
  education: number;
  attendingSchool: boolean;
  health: "良好" | "不調" | "療養中";
  healthRisk: number;
  income: number;
  livingCost: number;
  balance: number;
  /** 片道の推定分数。職場に接続できない就業者は null、通勤しない人は 0。 */
  commuteMinutes: number | null;
  shopping: "利用可能" | "遠い" | "店舗なし";
  satisfaction: number;
}

export function educationDaysOf(seed: number, p: Person): number {
  return p.educationDays ?? Math.floor(Math.min(16, Math.max(0, p.ageDays / 365 - 6)) * 365 * placeHash(seed, p.id, 23, 31));
}

/** 一日ごとだけ呼ぶ。メニュー表示や refresh では教育を進めない。 */
export function advanceEducation(seed: number, p: Person, schooled: boolean, policy: number): void {
  const days = educationDaysOf(seed, p);
  p.educationDays = Math.min(16 * 365, days + (p.ageDays >= 6 * 365 && personGroupOf(p.ageDays) === "child" && schooled ? 1 + policy * 0.25 : 0));
}

/** 月額は既存の年金と同じゲーム内の円。市の会計とは別の個人生活の目安。 */
export function personLifeOf(seed: number, p: Person, c: PersonLifeContext): PersonLife {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const group = personGroupOf(p.ageDays);
  const educationDays = educationDaysOf(seed, p);
  const education = educationDays >= 12 * 365 ? 3 : educationDays >= 9 * 365 ? 2 : educationDays >= 6 * 365 ? 1 : 0;
  const occupation = group === "child" ? "子ども" : group === "senior" ? "年金生活" : p.work ? "就業中" : "失業中";
  const healthRisk = clamp(c.risk * (c.cared ? 0.35 : 1) * [1, 0.82, 0.65][c.medicalPolicy]!);
  // 個人差は固定し、表示のたびに病状が変わらないようにする。
  const ill = placeHash(seed, p.id, 29, 37) < healthRisk * 0.6;
  const health = ill ? (c.cared ? "療養中" : "不調") : "良好";
  const commuteMinutes = group !== "adult" || !p.work ? 0 : !c.workConnected ? null
    : Math.round((5 + Math.hypot(p.work[0] - p.home[0], p.work[1] - p.home[1]) * 2) * (1 + Math.max(0, c.congestion)) * [1, 0.9, 0.8][c.trafficPolicy]!);
  const wage = occupation === "就業中" && c.workConnected
    ? (c.workKind === "office" ? 2400 : c.workKind === "industrial" ? 2100 : 1800) * (1 + education * 0.15) * (ill ? 0.5 : 1) : 0;
  const income = Math.round(wage * (1 - c.taxRate) + (group === "senior" ? PENSION_PER_SENIOR : 0) + (c.welfare ? 600 : 0));
  const shopping = c.shopDistance === null ? "店舗なし" : c.shopDistance > 12 ? "遠い" : "利用可能";
  const livingCost = Math.round((group === "child" ? 600 : 1000) + clamp(c.landValue) * 400 + (ill ? (c.cared ? 120 : 300) * (1 - c.medicalPolicy * 0.2) : 0) + (commuteMinutes ?? 0) * 2 + (shopping === "利用可能" ? 0 : 150));
  const balance = income - livingCost;
  const satisfaction = clamp(c.happiness * 0.5 + 0.35 + Math.max(-0.25, Math.min(0.15, balance / 6000)) - healthRisk * 0.2 - (ill ? 0.1 : 0) - (commuteMinutes === null ? 0.2 : Math.min(0.2, commuteMinutes / 600)) - (shopping === "店舗なし" ? 0.12 : shopping === "遠い" ? 0.05 : 0) - (group === "child" && !c.schooled ? 0.2 : 0));
  return { occupation, education, attendingSchool: group === "child" && p.ageDays >= 6 * 365 && c.schooled, health, healthRisk, income, livingCost, balance, commuteMinutes, shopping, satisfaction };
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
    if (!p.work || !jobSet.has(`${p.work[0]},${p.work[1]}`)) p.work = jobs.length > 0 ? jobs[p.id % jobs.length]! : null;
    p.educationDays = educationDaysOf(seed, p);
  }
  return { people: out, nextId: id };
}
