import { describe, expect, it } from "vitest";
import { CITY_SONG, midiHz, songSeconds, TITLE_SONG } from "../src/audio/music";

describe("楽譜", () => {
  it("A4 は 440Hz、1 オクターブ上は 2 倍", () => {
    expect(midiHz(69)).toBeCloseTo(440, 9);
    expect(midiHz(81)).toBeCloseTo(880, 6);
  });
  it("どの小節も 4 拍ぶん (拍の合計が 4)", () => {
    for (const song of [TITLE_SONG, CITY_SONG])
      for (const bar of song.bars) expect(bar.melody.reduce((s, [, b]) => s + b, 0)).toBe(4);
  });
  it("曲の長さは、小節数と速さで決まる", () => {
    expect(songSeconds(TITLE_SONG)).toBeCloseTo((4 * 4 * 60) / 96, 9);
  });
});
