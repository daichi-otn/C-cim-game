export type Locale = "ja" | "en" | "zh-CN" | "ko";
export type Currency = "JPY" | "USD";
export const LOCALE_STORAGE_KEY = "ccim.locale.v2";
export const CURRENCY_STORAGE_KEY = "ccim.currency.v1";
export const USD_RATE_STORAGE_KEY = "ccim.usdRate.v1";

export const LOCALES: readonly { id: Locale; name: string }[] = [
  { id: "ja", name: "日本語" },
  { id: "en", name: "English" },
  { id: "zh-CN", name: "简体中文" },
  { id: "ko", name: "한국어" },
];

const TEXT: Record<string, Record<Locale, string>> = {
  menu: { ja: "メニュー", en: "Menu", "zh-CN": "菜单", ko: "메뉴" },
  close: { ja: "閉じる", en: "Close", "zh-CN": "关闭", ko: "닫기" },
  titleBack: { ja: "タイトルへ (マップ選択)", en: "Title (map selection)", "zh-CN": "返回标题（选择地图）", ko: "타이틀로 (맵 선택)" },
  help: { ja: "使い方・操作キー", en: "Help & controls", "zh-CN": "帮助与操作", ko: "도움말 및 조작" },
  tutorial: { ja: "チュートリアル (新しい街で)", en: "Tutorial (new city)", "zh-CN": "教程（新城市）", ko: "튜토리얼 (새 도시)" },
  language: { ja: "言語", en: "Language", "zh-CN": "语言", ko: "언어" },
  currency: { ja: "通貨", en: "Currency", "zh-CN": "货币", ko: "통화" },
  budget: { ja: "先月の予算内訳（市の財布）", en: "Last month's budget (city treasury)", "zh-CN": "上月预算明细（城市金库）", ko: "지난달 예산 내역 (시 재정)" },
  loans: { ja: "融資", en: "Loans", "zh-CN": "贷款", ko: "융자" },
  policies: { ja: "条例", en: "Policies", "zh-CN": "政策", ko: "정책" },
  stats: { ja: "統計・目標", en: "Statistics & goals", "zh-CN": "统计与目标", ko: "통계 및 목표" },
  land: { ja: "土地・資源", en: "Land & resources", "zh-CN": "土地与资源", ko: "토지 및 자원" },
  transit: { ja: "公共交通", en: "Public transit", "zh-CN": "公共交通", ko: "대중교통" },
  save: { ja: "セーブ・ロード", en: "Save & load", "zh-CN": "保存与读取", ko: "저장 및 불러오기" },
  display: { ja: "表示", en: "Display", "zh-CN": "显示", ko: "표시" },
  graphics: { ja: "グラフィック", en: "Graphics", "zh-CN": "图形", ko: "그래픽" },
  money: { ja: "資金", en: "Money", "zh-CN": "资金", ko: "자금" },
  population: { ja: "人口", en: "Population", "zh-CN": "人口", ko: "인구" },
  weather: { ja: "季節・天気", en: "Season & weather", "zh-CN": "季节与天气", ko: "계절 및 날씨" },
  newGameStart: { ja: "この設定で始める", en: "Start with these settings", "zh-CN": "使用此设置开始", ko: "이 설정으로 시작" },
  mapBack: { ja: "マップを選び直す", en: "Choose another map", "zh-CN": "重新选择地图", ko: "맵 다시 선택" },
  disasterSetting: { ja: "災害あり（火災・発電施設の故障・洪水・地震）", en: "Disasters (fires, outages, floods, earthquakes)", "zh-CN": "启用灾害（火灾、停电、洪水、地震）", ko: "재해 있음 (화재·정전·홍수·지진)" },
  tutorialPrev: { ja: "戻る", en: "Back", "zh-CN": "返回", ko: "뒤로" },
  tutorialNext: { ja: "次へ", en: "Next", "zh-CN": "下一步", ko: "다음" },
  tutorialSkip: { ja: "この手順を飛ばす", en: "Skip this step", "zh-CN": "跳过此步骤", ko: "이 단계 건너뛰기" },
  tutorialFinish: { ja: "終了", en: "Finish", "zh-CN": "完成", ko: "완료" },
  tutorialDone: { ja: "✓ できました!", en: "✓ Done!", "zh-CN": "✓ 完成！", ko: "✓ 완료!" },
};

export function loadLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.some((x) => x.id === raw) ? raw as Locale : "ja";
  } catch { return "ja"; }
}

export function loadCurrency(): Currency {
  try { return localStorage.getItem(CURRENCY_STORAGE_KEY) === "USD" ? "USD" : "JPY"; }
  catch { return "JPY"; }
}

export function setLocale(locale: Locale): void {
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* 保存できなくても現在の画面は切り替える */ }
  document.documentElement.lang = locale;
}

export function setCurrency(currency: Currency): void {
  try { localStorage.setItem(CURRENCY_STORAGE_KEY, currency); } catch { /* 保存できなくても現在の画面は切り替える */ }
}

export function loadUsdRate(): number {
  try {
    const value = Number(localStorage.getItem(USD_RATE_STORAGE_KEY));
    return Number.isFinite(value) && value >= 50 && value <= 500 ? value : 150;
  } catch { return 150; }
}

export function setUsdRate(rate: number): void {
  try { localStorage.setItem(USD_RATE_STORAGE_KEY, String(rate)); } catch { /* 保存できなくても現在の画面には反映する */ }
}

export function text(key: string, locale: Locale): string {
  return TEXT[key]?.[locale] ?? TEXT[key]?.en ?? key;
}

export function formatMoney(amountYen: number, currency: Currency, locale: Locale, usdRate = 150): string {
  const amount = currency === "USD" ? amountYen / usdRate : amountYen;
  const language = locale === "ja" ? "ja-JP" : locale === "zh-CN" ? "zh-CN" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(language, { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function applyLocale(root: ParentNode, locale: Locale): void {
  setLocale(locale);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = text(key, locale);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder;
    if (key) (el as HTMLInputElement).placeholder = text(key, locale);
  }
}

// 動的に生成される案内文にも最低限の翻訳を適用する。ゲームの数値・固有名詞はそのまま保持する。
const WORDS: Record<Exclude<Locale, "ja">, readonly [string, string][]> = {
  en: [
    ["お金が足りません", "Not enough money"], ["保存しました", "Saved"], ["保存できませんでした", "Could not save"], ["人口", "Population"], ["資金", "Money"], ["建物", "Buildings"], ["道路", "Roads"], ["施設", "Facilities"], ["交差点", "Intersections"], ["渋滞", "Traffic jam"], ["病気", "Sick"], ["通勤中", "Commuting"], ["なし", "None"], ["あり", "Connected"], ["良好", "Good"], ["季節・天気", "Season & weather"], ["先月の収支", "Last month's balance"], ["税率", "Tax rate"], ["電力", "Power"], ["水道", "Water"], ["下水", "Sewage"], ["ごみ", "Garbage"], ["外部接続", "Outside connection"], ["住宅需要", "Residential demand"], ["商業需要", "Commercial demand"], ["工業需要", "Industrial demand"], ["オフィス需要", "Office demand"], ["道路を引く", "Build roads"], ["道路", "Road"], ["住宅", "Residential"], ["商業", "Commercial"], ["工業", "Industrial"], ["オフィス", "Office"], ["公園", "Park"], ["保存", "Save"], ["読込", "Load"], ["削除", "Delete"], ["閉じる", "Close"], ["開始", "Start"], ["災害", "Disasters"], ["地震", "Earthquake"], ["洪水", "Flood"], ["火災", "Fire"], ["修理", "Repair"], ["無料", "Free"], ["周辺の土地を購入", "Buy nearby land"], ["整地", "Level terrain"], ["水路", "Water channel"], ["植林", "Plant trees"], ["農場", "Farm"], ["林業", "Forestry"], ["鉱山", "Mine"], ["油田", "Oil field"], ["公共交通", "Public transit"], ["バス", "Bus"], ["地下鉄", "Subway"], ["鉄道", "Rail"], ["駐車場", "Parking"], ["日本全体の地形", "Japan overview"], ["街へ戻る", "Return to city"], ["マップ", "Map"], ["人口", "Population"], ["現在", "Current"],
  ],
  "zh-CN": [
    ["お金が足りません", "资金不足"], ["保存しました", "已保存"], ["保存できませんでした", "无法保存"], ["人口", "人口"], ["資金", "资金"], ["建物", "建筑"], ["道路", "道路"], ["施設", "设施"], ["交差点", "交叉口"], ["渋滞", "拥堵"], ["病気", "患病"], ["通勤中", "通勤中"], ["なし", "无"], ["あり", "有"], ["良好", "良好"], ["季節・天気", "季节与天气"], ["先月の収支", "上月收支"], ["税率", "税率"], ["電力", "电力"], ["水道", "供水"], ["下水", "污水"], ["ごみ", "垃圾"], ["外部接続", "外部连接"], ["住宅需要", "住宅需求"], ["商業需要", "商业需求"], ["工業需要", "工业需求"], ["オフィス需要", "办公需求"], ["道路を引く", "修建道路"], ["住宅", "住宅"], ["商業", "商业"], ["工業", "工业"], ["オフィス", "办公"], ["保存", "保存"], ["読込", "读取"], ["削除", "删除"], ["閉じる", "关闭"], ["開始", "开始"], ["災害", "灾害"], ["地震", "地震"], ["洪水", "洪水"], ["火災", "火灾"], ["修理", "维修"], ["整地", "平整土地"], ["水路", "水渠"], ["植林", "植树"], ["農場", "农场"], ["林業", "林业"], ["鉱山", "矿山"], ["油田", "油田"], ["公共交通", "公共交通"], ["バス", "公交"], ["地下鉄", "地铁"], ["鉄道", "铁路"], ["駐車場", "停车场"], ["日本全体の地形", "日本全境地形"], ["街へ戻る", "返回城市"], ["マップ", "地图"], ["現在", "当前"],
  ],
  ko: [
    ["お金が足りません", "자금이 부족합니다"], ["保存しました", "저장했습니다"], ["保存できませんでした", "저장할 수 없습니다"], ["人口", "인구"], ["資金", "자금"], ["建物", "건물"], ["道路", "도로"], ["施設", "시설"], ["交差点", "교차로"], ["渋滞", "교통 체증"], ["病気", "환자"], ["通勤中", "통근 중"], ["なし", "없음"], ["あり", "있음"], ["良好", "양호"], ["季節・天気", "계절 및 날씨"], ["先月の収支", "지난달 수지"], ["税率", "세율"], ["電力", "전력"], ["水道", "상수도"], ["下水", "하수도"], ["ごみ", "쓰레기"], ["外部接続", "외부 연결"], ["住宅需要", "주거 수요"], ["商業需要", "상업 수요"], ["工業需要", "산업 수요"], ["オフィス需要", "오피스 수요"], ["道路を引く", "도로 건설"], ["住宅", "주거"], ["商業", "상업"], ["工業", "산업"], ["オフィス", "오피스"], ["保存", "저장"], ["読込", "불러오기"], ["削除", "삭제"], ["閉じる", "닫기"], ["開始", "시작"], ["災害", "재해"], ["地震", "지진"], ["洪水", "홍수"], ["火災", "화재"], ["修理", "수리"], ["整地", "평탄화"], ["水路", "수로"], ["植林", "식수"], ["農場", "농장"], ["林業", "임업"], ["鉱山", "광산"], ["油田", "유전"], ["公共交通", "대중교통"], ["バス", "버스"], ["地下鉄", "지하철"], ["鉄道", "철도"], ["駐車場", "주차장"], ["日本全体の地形", "일본 전체 지형"], ["街へ戻る", "도시로 돌아가기"], ["マップ", "맵"], ["現在", "현재"],
  ],
};

export function translateDom(root: ParentNode, locale: Locale): void {
  if (locale === "ja") return;
  const words = WORDS[locale];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  for (const textNode of nodes) {
    const parent = textNode.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "SELECT", "OPTION"].includes(parent.tagName)) continue;
    let value = textNode.nodeValue ?? "";
    for (const [from, to] of words) value = value.replaceAll(from, to);
    if (value !== textNode.nodeValue) textNode.nodeValue = value;
  }
}
