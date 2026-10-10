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
      "C-cim は、何もない土地に街をつくる経営シミュレーションです。道路を引き、区画を塗り、電気や水道をそろえると、住民が引っ越してきます。",
      "このチュートリアルは、実際に操作しながら進みます。ゲームの時間は止めてあるので、ゆっくり読んでください。いつでも「やめる」で閉じられます。",
    ],
    highlight: [],
  },
  {
    id: "camera",
    title: "画面を動かす",
    body: ["マウスでドラッグすると地図が動きます。ホイールを回すと、カーソルの位置を中心に拡大・縮小します。", "地図を動かして、ホイールで拡大・縮小もしてみましょう。"],
    highlight: [],
    check: (c) => c.moved && c.zoomed,
  },
  {
    id: "road",
    title: "道路を引く",
    body: [
      "街は道路から始まります。下の「道路」ボタン(キー {{tool.road}})を押して、地図の平らな場所を2回クリックしましょう。1回目が始点、2回目が終点です。",
      "続けてクリックすると、折れ線のようにつなげて引けます。やめるときは Esc か右クリック。水と山の上には引けません。",
    ],
    highlight: ["#tool-road"],
    check: (c) => c.city.graph.totalLength() >= 12,
  },
  {
    id: "roadtype",
    title: "道路の種類",
    body: [
      "「道路」ツールを選ぶと、下にパレットが出ます。細道から高速道路まで 10 種類あり、広い道ほど多くの車が通れますが、お金がかかります。",
      "「大通り」などを選んで、さっきの道路の上をなぞると、その部分を作り替えられます(差額だけかかります)。試してみましょう。",
    ],
    highlight: ["#road-palette"],
    check: (c) => [...c.city.graph.edges.values()].some((e) => e.type !== RoadType.Street),
  },
  {
    id: "residential",
    title: "住宅ゾーンを塗る",
    body: [
      "次は住む人のための区画です。「住宅」ボタン(キー {{tool.zoneR}})を押し、道路のそばの2か所をクリックして、四角形に塗ります。",
      "下のパレットで密度を選べます。低密度は一軒家(1 階建て)、中密度は 3 階建て以上の集合住宅(通り以上の道路が必要)、高密度は 15 階建て以上の高層マンション(大通り以上が必要)。まずは中密度のままで大丈夫です。塗れるのは道路から3タイル以内の陸地で、赤く出る場所には塗れません。",
    ],
    highlight: ["#tool-zoneR"],
    check: (c) => count(c.city, ZoneType.Residential) >= 6,
  },
  {
    id: "jobs",
    title: "商業と工業を塗る",
    body: [
      "住宅だけでは街は育ちません。住民には働き口と買い物をする店が必要です。「商業」(キー {{tool.zoneC}})と「工業」(キー {{tool.zoneI}})も道路のそばに塗りましょう。",
      "工場は煙や騒音が出るので、住宅から少し離すのがコツです。そのほか「オフィス」(キー {{tool.zoneO}})は、煙を出さない働き口です。人が増えて街が整ってきたら試してみましょう。",
    ],
    highlight: ["#tool-zoneC", "#tool-zoneI"],
    check: (c) => count(c.city, ZoneType.Commercial) >= 4 && count(c.city, ZoneType.Industrial) >= 4,
  },
  {
    id: "utilities",
    title: "電気・水道・下水",
    body: [
      "建物が建つには、電力・水道・下水の3つが必要です。「発電所」(キー {{tool.power}})、「給水」(キー {{tool.water}})、「下水」(キー {{tool.sewage}})を、道路から3タイル以内に建てましょう。カーソルが施設の中心になり、緑なら建てられます。",
      "給水ポンプ場だけは、湖や海に面した水辺に置きます。施設と建物は、同じ道路でつなげておく必要があります。",
    ],
    highlight: ["#tool-power", "#tool-water", "#tool-sewage"],
    check: (c) => hasFacility(c.city, FacilityType.Power) && hasFacility(c.city, FacilityType.Water) && hasFacility(c.city, FacilityType.Sewage),
  },
  {
    id: "outside",
    title: "外部接続",
    body: ["住民は外の世界から引っ越してきます。その入口が「外部接続」(キー {{tool.outside}})です。道路のそばに建てて、住宅のある道路とつなぎましょう。"],
    highlight: ["#tool-outside"],
    check: (c) => hasFacility(c.city, FacilityType.Outside),
  },
  {
    id: "grow",
    title: "街が育つのを見る",
    body: [
      "準備ができました。右上の速度ボタン(または Space)で時間を動かしましょう。4x にすると速く進みます。",
      "建物が建ち、住民が増えていきます。右上の「人口」が 20 人を超えるまで待ちましょう。",
    ],
    highlight: ["#speed"],
    check: (c) => c.city.zones.totals().population >= 20,
  },
  {
    id: "demand",
    title: "需要と税率",
    body: [
      "右上の3本のバーは、住宅・商業・工業の「需要」です。右(緑)に伸びているほど、その区画に建物が建ちやすくなります。",
      "税率は − ＋ で変えられます。高いと収入は増えますが、需要が下がります。試しに税率を変えてみましょう。",
    ],
    highlight: ["#tax-down", "#tax-up"],
    check: (c) => Math.abs(c.city.taxRate - DEFAULT_TAX_RATE) > 1e-9,
  },
  {
    id: "services",
    title: "公共サービス",
    body: [
      "警察署(P)、消防署(I)、病院(H)、学校(K)を建てると、まわりの建物にサービスが届き、幸福度が上がります。範囲は施設のまわりの円で表示されます。",
      "病院は、環境の悪い場所に住む人の病気も減らします。どれか1つ建ててみましょう。",
    ],
    highlight: ["#tool-police", "#tool-fire", "#tool-hospital", "#tool-school"],
    check: (c) => [...c.city.facilities.values()].some((f) => FACILITY_SPECS[f.type].coverage !== null),
  },
  {
    id: "problems",
    title: "渋滞と環境",
    body: [
      "道路が混むと渋滞し、住民の通勤が滞ります。キー {{view.traffic}} で道路の混雑を色で見られます(赤は渋滞)。道路を増やしたり、広い道路にしたりして分散しましょう。",
      "工場や発電所の近くの住宅は、大気汚染で住民が病気になります。キー {{view.env}} で環境の悪い場所が色で見えます。住宅と工場は離して配置しましょう。",
      "右上のパネルの赤い文字は、街の問題を教えてくれます。",
    ],
    highlight: ["#notices"],
  },
  {
    id: "save",
    title: "保存と再開",
    body: ["画面左下の「メニュー」(キー {{game.menu}})から、街を保存・読み込みできます。1か月ごとに自動セーブもされます。メニューを開いてみましょう。"],
    highlight: ["#menu-button"],
    check: (c) => c.menuSeen,
  },
  {
    id: "done",
    title: "チュートリアル完了!",
    body: [
      "基本はこれで以上です。ここからは自由に街を育ててください。",
      "お金がなくなりそうなときは税率を見直す、需要のバーが低い区画は塗りすぎない、電力や水道は余裕をもって増やす、がコツです。",
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
