/**
 * BGM の楽譜 (データだけ)。音は音声機能で、この楽譜どおりに鳴らす (音声ファイルは使わない)。
 * タイトルは明るく、街は、ラジオから流れてくるような、少しこもった音にする。
 */

/** 1 小節 = 4 拍。melody は [MIDI の音の高さ, 拍の長さ] の並び。 */
export interface Bar {
  chord: number[];
  melody: [number, number][];
}

export interface Song {
  bpm: number;
  bars: Bar[];
  /** 街のラジオ風に、少しこもった音で鳴らすか。 */
  radio: boolean;
  /** ニュース番組のテーマ風: 短く鋭い音 (スタッカート) と、刻むドラム (キック・スネア・ハイハット)。 */
  news?: boolean;
  /** 落ち着いた街づくりの曲風: ゆったりした和音と、ピアノのような旋律。 */
  soft?: boolean;
}

export const TITLE_SONG: Song = {
  bpm: 96,
  radio: false,
  bars: [
    { chord: [48, 52, 55], melody: [[72, 1], [71, 1], [72, 1], [67, 1]] },
    { chord: [43, 47, 50], melody: [[74, 2], [71, 1], [67, 1]] },
    { chord: [45, 48, 52], melody: [[72, 2], [69, 2]] },
    { chord: [41, 45, 48], melody: [[65, 2], [67, 1], [69, 1]] },
  ],
};

/** 街の BGM: 落ち着いた街づくりの曲風 (ゆったりした和音と、ピアノのような旋律)。 */
export const CITY_SONG: Song = {
  bpm: 70,
  radio: false,
  soft: true,
  bars: [
    { chord: [48, 52, 55, 59], melody: [[72, 2], [76, 2]] },
    { chord: [45, 48, 52, 57], melody: [[74, 1], [72, 1], [69, 2]] },
    { chord: [41, 45, 48, 53], melody: [[69, 2], [72, 2]] },
    { chord: [43, 47, 50, 55], melody: [[74, 4]] },
  ],
};

/** MIDI の音の高さ (69 = A4 = 440Hz) を、周波数 (Hz) にする。 */
export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** 曲 1 周の長さ (秒)。 */
export function songSeconds(song: Song): number {
  return (song.bars.length * 4 * 60) / song.bpm;
}
