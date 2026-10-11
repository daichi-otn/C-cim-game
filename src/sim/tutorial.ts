import type { City } from "./city";
import { FACILITY_SPECS, FacilityType } from "./facilities";
import { RoadType } from "./roadTypes";
import { DEFAULT_TAX_RATE } from "./demand";
import { ZoneType } from "./zoning";

/** チュートリアルが、進み具合を判断するために見る、ゲームの状態。 */
export interface TutorialContext {
  city: City;
  /** カメラが最初の位置から動いたか / ズームしたか。 */
  moved: boolean;
  zoomed: boolean;
  /** 速度 (0 = 一時停止)。 */
  speed: number;
  /** メニューを開いたことがあるか。 */
  menuSeen: boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  /** 段落ごとの説明。 */
  body: string[];
  /** 目立たせたい画面の部品 (CSS セレクタ)。 */
  highlight: string[];
  /** この条件を満たしたら「できました」になり、次へ進む。なければ、「次へ」ボタンを押して進む説明だけの手順。 */
  check?: (c: TutorialContext) => boolean;
}

const count = (city: City, zone: ZoneType) => [...city.zones.cells.values()].filter((c) => c.zone === zone).length;
const hasFacility = (city: City, type: FacilityType) => [...city.facilities.values()].some((f) => f.type === type);

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "welcome",
    title: "ようこそ、市長さん",
    body: [
      "ここは、何もない土地に街をつくるゲームです。「道路を引く」→「住む場所と働く場所を塗る」→「電気と水を届ける」の順に進めると、人が引っ越してきます。",
      "このあとの説明は、実際に画面を押しながら進みます。時間は止めてあるので、ゆっくり読んでください。やめたいときは「やめる」を押せば閉じられます。",
    ],
    highlight: [],
  },
  {
    id: "camera",
    title: "画面を動かす",
    body: [
      "1. マウスの左ボタンを押したまま動かすと、地図が動きます。(スマホは指でなぞります)",
      "2. マウスのホイールを回すと、拡大・縮小ができます。(スマホは指2本で広げたり、狭めたりします)",
      "両方やってみると、次に進めます。",
    ],
    highlight: [],
    check: (c) => c.moved && c.zoomed,
  },
  {
    id: "road",
    title: "道路を引く",
    body: [
      "1. 画面の下にある「道路」ボタン(キー {{tool.road}})を押します。矢印のボタンです。",
      "2. 地図の平らな場所を1回クリックします。これが道路の始まりです。",
      "3. もう1回クリックすると、道路ができます。続けてクリックすると、道路を折れ線のようにつなげられます。",
      "やめるときは Esc キーか右クリックです。水や山の上には道路を引けません。",
    ],
    highlight: ["#tool-road"],
    check: (c) => c.city.graph.totalLength() >= 12,
  },
  {
    id: "roadtype",
    title: "道路の種類",
    body: [
      "「道路」を選ぶと、ボタンの下に道路の種類が並びます。細い道から高速道路まで 10 種類あります。広い道ほど多くの車が通れますが、お金がかかります。",
      "「大通り」を選んで、さっき引いた道路の上をなぞってみましょう。道路が作り替えられます。差額だけお金がかかります。",
    ],
    highlight: ["#road-palette"],
    check: (c) => [...c.city.graph.edges.values()].some((e) => e.type !== RoadType.Street),
  },
  {
    id: "residential",
    title: "住宅ゾーンを塗る",
    body: [
      "1. 人が住む場所を作ります。「住宅」ボタン(キー {{tool.zoneR}})を押します。",
      "2. 道路のそばの場所を2か所クリックします。その間が四角く塗られます。",
      "下に並ぶ「低・中・高」は、建物の高さです。低は1階建ての一軒家、中は3階建ての集合住宅、高は15階建てのマンションです。まずは「中」のままで大丈夫です。",
      "赤く出る場所には塗れません。道路から3マス以内の陸地に塗りましょう。",
    ],
    highlight: ["#tool-zoneR"],
    check: (c) => count(c.city, ZoneType.Residential) >= 6,
  },
  {
    id: "jobs",
    title: "商業と工業を塗る",
    body: [
      "住民には、働く場所と買い物をする店が必要です。道路のそばに、同じように塗りましょう。",
      "「商業」(キー {{tool.zoneC}})は店、「工業」(キー {{tool.zoneI}})は工場です。工場は煙や音を出すので、住宅から少し離して塗るのがコツです。",
      "「オフィス」(キー {{tool.zoneO}})は、煙を出さない働く場所です。",
    ],
    highlight: ["#tool-zoneC", "#tool-zoneI"],
    check: (c) => count(c.city, ZoneType.Commercial) >= 4 && count(c.city, ZoneType.Industrial) >= 4,
  },
  {
    id: "utilities",
    title: "電気・水道・下水",
    body: [
      "建物が建つには、電気・水・下水の3つが必要です。それぞれ施設を置きます。",
      "1. 「発電所」(キー {{tool.power}})、「給水」(キー {{tool.water}})、「下水」(キー {{tool.sewage}})のどれかを押します。",
      "2. 道路から3マス以内をクリックします。カーソルの場所が緑なら置けます。",
      "給水は、湖や海の水辺に置きます。施設と建物は、同じ道路でつながっている必要があります。",
    ],
    highlight: ["#tool-power", "#tool-water", "#tool-sewage"],
    check: (c) => hasFacility(c.city, FacilityType.Power) && hasFacility(c.city, FacilityType.Water) && hasFacility(c.city, FacilityType.Sewage),
  },
  {
    id: "outside",
    title: "外部接続",
    body: [
      "住民は、外の世界から引っ越してきます。その入口が「外部接続」(キー {{tool.outside}})です。",
      "道路のそばに置いて、住宅のある道路とつなげましょう。",
    ],
    highlight: ["#tool-outside"],
    check: (c) => hasFacility(c.city, FacilityType.Outside),
  },
  {
    id: "grow",
    title: "街が育つのを見る",
    body: [
      "1. 画面の右上にある ▶ ボタンを押すと、時間が進みます。(キーボードなら Space キーです)",
      "2. 「4x」を押すと、もっと速く進みます。",
      "右上の「人口」が 20 人を超えるまで待ちましょう。",
    ],
    highlight: ["#speed"],
    check: (c) => c.city.zones.totals().population >= 20,
  },
  {
    id: "demand",
    title: "需要と税率",
    body: [
      "右上の3本の棒は「需要」です。住宅・商業・工業それぞれ、建物が建ちやすいかを表します。緑が右に長いほど、建ちやすいです。",
      "税率は「−」と「＋」で変えられます。上げるとお金は増えますが、需要は下がります。「＋」を押して、税率を変えてみましょう。",
    ],
    highlight: ["#tax-down", "#tax-up"],
    check: (c) => Math.abs(c.city.taxRate - DEFAULT_TAX_RATE) > 1e-9,
  },
  {
    id: "services",
    title: "公共サービス",
    body: [
      "「警察」(P)・「消防」(I)・「病院」(H)・「学校」(K)は、まわりの建物を助けます。施設のまわりの円が、助けの届く範囲です。",
      "病院は、空気の悪い場所に住む人の病気も減らします。どれか1つを、住宅のそばに置いてみましょう。",
    ],
    highlight: ["#tool-police", "#tool-fire", "#tool-hospital", "#tool-school"],
    check: (c) => [...c.city.facilities.values()].some((f) => FACILITY_SPECS[f.type].coverage !== null),
  },
  {
    id: "problems",
    title: "渋滞と環境",
    body: [
      "道路が混むと、車が進みにくくなります。キー {{view.traffic}} を押すと、道路の混み具合が色で見えます。赤は混んでいる道路です。",
      "工場や発電所のそばの住宅は、空気が汚れて住民が病気になります。キー {{view.env}} を押すと、空気の悪い場所が見えます。",
      "右上の赤い文字は、いま街にある問題です。",
    ],
    highlight: ["#notices"],
  },
  {
    id: "save",
    title: "保存と再開",
    body: [
      "1. 画面の左下にある「メニュー」(キー {{game.menu}})を押します。",
      "2. メニューから、街を保存したり、読み込んだりできます。1か月ごとに、自動でも保存されます。",
      "メニューを開いてみましょう。",
    ],
    highlight: ["#menu-button"],
    check: (c) => c.menuSeen,
  },
  {
    id: "done",
    title: "チュートリアル完了!",
    body: [
      "おつかれさまでした。基本はこれで以上です。ここからは自由に街を育ててください。",
      "お金が足りないときは税率を下げ、需要の低い場所は塗りすぎないのがコツです。",
    ],
    highlight: [],
  },
];

/** チュートリアルを終えたことを保存するキー。 */
export const TUTORIAL_DONE_KEY = "ccim.tutorial.done";
/** 条件を満たしてから、次へ進むまでの待ち時間 (ミリ秒)。「できました」を見せるため。 */
export const ADVANCE_DELAY_MS = 1400;

/** チュートリアルの進行。画面の描画は持たない。 */
export class Tutorial {
  index = 0;
  /** 現在の手順が条件を満たした時刻。まだなら null。 */
  private satisfiedAt: number | null = null;
  /** 閉じた (やめた、または最後まで終えた) か。 */
  closed = false;

  constructor(readonly steps: readonly TutorialStep[] = TUTORIAL_STEPS) {}

  get step(): TutorialStep {
    return this.steps[this.index]!;
  }
  get isLast(): boolean {
    return this.index === this.steps.length - 1;
  }
  /** 現在の手順の条件を満たしている (次へ進む待ち)。 */
  get satisfied(): boolean {
    return this.satisfiedAt !== null;
  }
  /** 手順を飛ばして、または「次へ」で、次へ進む。最後の手順なら閉じる。 */
  next(): void {
    this.satisfiedAt = null;
    if (this.isLast) this.closed = true;
    else this.index++;
  }
  /** ひとつ前の手順へ戻る。 */
  prev(): void {
    this.satisfiedAt = null;
    if (this.index > 0) this.index--;
  }
  close(): void {
    this.closed = true;
  }
  /** 毎フレーム呼ぶ。条件を満たしたら、少し待ってから次へ進む。次へ進んだら true。 */
  update(ctx: TutorialContext, nowMs: number): boolean {
    if (this.closed) return false;
    const check = this.step.check;
    if (!check) return false;
    if (!check(ctx)) {
      this.satisfiedAt = null;
      return false;
    }
    this.satisfiedAt ??= nowMs;
    if (nowMs - this.satisfiedAt >= ADVANCE_DELAY_MS) {
      this.next();
      return true;
    }
    return false;
  }
}
