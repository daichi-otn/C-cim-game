/**
 * 人の声の読み上げ (ブラウザの音声合成) と、その文章 (純粋な計算)。
 * 日本語の声がない端末では、声は出ない (文章は画面にも出すので、困らない)。
 */

export interface CityNews {
  population: number;
  money: number;
  taxRate: number;
}

/** 街のニュース (市の広報)。数字を読み上げる。 */
export function headlineText(n: CityNews): string {
  const pct = Math.round(n.taxRate * 100);
  return `こちらは市の広報です。現在の人口は ${n.population.toLocaleString("ja-JP")} 人、資金は ${Math.round(n.money).toLocaleString("ja-JP")} 円です。税率は ${pct} パーセントです。`;
}

/** 緊急速報の文章。題名と、住民へのお願い。 */
export function emergencyText(title: string, detail: string): string {
  return `緊急速報です。${title}。${detail}`;
}

/** 読み上げる。声が使えない端末では、何もしない。 */
export function speak(text: string, rate = 1, pitch = 1.05): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = rate;
    u.pitch = pitch;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch {
    /* 読み上げられなくても、ゲームは続ける */
  }
}
