import type { CityTotals } from "./zoning";

/** 標準の税率。これより高いと需要が下がり、低いと上がる。 */
export const DEFAULT_TAX_RATE = 0.1;
/** 住民のうち働く人の割合。 */
export const WORKER_RATIO = 0.6;
/** 住民 1 人あたり、商業が必要とする雇用数 (買い物客として見込む)。 */
const SHOP_JOBS_PER_RESIDENT = 0.3;
/** 税率が標準より 1 (=100%) 高いと需要がどれだけ下がるか。10% 高いと 0.4 下がる。 */
const TAX_SENSITIVITY = 4;

/** 幸福度の中立の値。公共サービスが何も届いていないときの値で、需要に影響しない。 */
export const NEUTRAL_HAPPINESS = 0.5;
/** 幸福度が中立より 1 (=100%) 高いと需要がどれだけ上がるか。満点 (+0.5) で 0.2 上がる。 */
const HAPPINESS_SENSITIVITY = 0.4;

/** オフィスの需要が、幸福度が中立より 1 (=100%) 高いときにどれだけ上がるか。満点 (+0.5) で 0.5 上がる。 */
const OFFICE_HAPPINESS_SENSITIVITY = 1;

/** 住宅 (r)・商業 (c)・工業 (i)・オフィス (o) の需要。-1 (全く建たない) 〜 1 (とても建ちやすい)。 */
export interface Demand {
  r: number;
  c: number;
  i: number;
  /** オフィス。働き手が余り、街の幸福度が高い (学校や病院などが整っている) ほど高い。 */
  o: number;
}

const clamp = (v: number) => Math.min(1, Math.max(-1, v));

/**
 * 街の状態から需要を求める。
 * - 住宅: 働き口が住民より多いほど人が集まる。何もない街では少し正の値で始める。
 * - 商業: 住民の数に見合うだけの店が足りないほど高い。
 * - 工業: 働き口が足りず失業者がいるほど高い。
 * どれも、標準より税率が高いと下がり、幸福度が高い (公共サービスが届いている) と上がる。
 */
export function calcDemand(t: CityTotals, taxRate: number, happiness = NEUTRAL_HAPPINESS): Demand {
  const workers = (t.population - (t.sick ?? 0)) * WORKER_RATIO;
  const jobs = t.jobsC + t.jobsI + (t.jobsO ?? 0);
  const taxMod = (DEFAULT_TAX_RATE - taxRate) * TAX_SENSITIVITY + (happiness - NEUTRAL_HAPPINESS) * HAPPINESS_SENSITIVITY;
  const shopsWanted = t.population * SHOP_JOBS_PER_RESIDENT;
  return {
    r: clamp(0.3 + (jobs - workers) / (jobs + workers + 10) + taxMod),
    c: clamp((shopsWanted - t.jobsC) / (shopsWanted + t.jobsC + 10) + taxMod),
    i: clamp(0.1 + (workers - jobs) / (workers + jobs + 10) + taxMod),
    // オフィスは、働き手が余っていて、環境のよい街に集まる (幸福度の影響は、ほかの区画の 2 倍以上)
    o: clamp(-0.1 + (workers - jobs) / (workers + jobs + 10) + (DEFAULT_TAX_RATE - taxRate) * TAX_SENSITIVITY + (happiness - NEUTRAL_HAPPINESS) * OFFICE_HAPPINESS_SENSITIVITY),
  };
}
