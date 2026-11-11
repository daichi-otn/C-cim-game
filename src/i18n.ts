export type Locale = "ja" | "en";
export const LOCALE_STORAGE_KEY = "ccim.locale.v1";

const TEXT: Record<string, Record<Locale, string>> = {
  menu: { ja: "メニュー", en: "Menu" },
  close: { ja: "閉じる", en: "Close" },
  titleBack: { ja: "タイトルへ (マップ選択)", en: "Title (map selection)" },
  help: { ja: "使い方・操作キー", en: "Help & controls" },
  tutorial: { ja: "チュートリアル (新しい街で)", en: "Tutorial (new city)" },
  language: { ja: "言語: 日本語", en: "Language: English" },
  budget: { ja: "先月の予算内訳（市の財布）", en: "Last month's budget (city treasury)" },
  loans: { ja: "融資", en: "Loans" },
  policies: { ja: "条例", en: "Policies" },
  stats: { ja: "統計・目標", en: "Statistics & goals" },
  land: { ja: "土地・資源", en: "Land & resources" },
  transit: { ja: "公共交通", en: "Public transit" },
  save: { ja: "セーブ・ロード", en: "Save & load" },
  display: { ja: "表示", en: "Display" },
  graphics: { ja: "グラフィック", en: "Graphics" },
};

export function loadLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : "ja";
  } catch { return "ja"; }
}

export function setLocale(locale: Locale): void {
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* 保存できなくても現在の画面は切り替える */ }
  document.documentElement.lang = locale;
}

export function text(key: string, locale: Locale): string { return TEXT[key]?.[locale] ?? key; }

export function applyLocale(root: ParentNode, locale: Locale): void {
  setLocale(locale);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = text(key, locale);
  }
}
