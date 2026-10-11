import { CITY_SONG, midiHz, type Song } from "./music";
import { chatterLevel, falloff, HEAR_RANGE, panOf, trafficLevel } from "./soundMath";

/**
 * ゲームの音 (音声機能で作る。音声ファイルは使わない)。
 * 車の走行音・建設の音・話し声は、聞く人 (カメラの中心) から近いものだけが聞こえる。
 * BGM は、タイトルは明るく、街はラジオ風に流す。
 */
const ENABLED_KEY = "ccim.audio.v1";
const LOOK_AHEAD = 0.25;

/** 毎フレーム、音を決めるために渡す、今の街の様子。位置はすべてタイル。 */
export interface SoundFrame {
  center: { x: number; y: number };
  right: { x: number; y: number };
  /** 近くを走る車の重み (距離と速さ) と、その重心。 */
  traffic: { weight: number; x: number; y: number };
  /** 近くの建設 (手で積む / クレーン) の重みと、その重心。 */
  hand: { weight: number; x: number; y: number };
  crane: { weight: number; x: number; y: number };
  /** 近くの住んでいる人の数。 */
  residents: number;
  /** いま建設中の場所。ここから消えた場所は、建物が建ち上がった (ドン) として鳴らす。 */
  sites: { x: number; y: number }[];
}

/** 聞く人の近くにいる住民の数 (聞こえる範囲の中)。 */
export function residentsNear(cells: Iterable<{ x: number; y: number; residents: number }>, cx: number, cy: number): number {
  let n = 0;
  for (const c of cells) {
    if (c.residents <= 0) continue;
    if (falloff(Math.hypot(c.x + 0.5 - cx, c.y + 0.5 - cy)) > 0) n += c.residents;
  }
  return n;
}

export function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private radio!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private trafficV!: { gain: GainNode; pan: StereoPannerNode };
  private craneV!: { gain: GainNode; pan: StereoPannerNode };
  private chatterV!: { gain: GainNode };
  private enabled = loadEnabled();
  private song: Song = CITY_SONG;
  private playing = false;
  private timer = 0;
  private nextBar = 0;
  private barIndex = 0;
  private nextHammer = 0;
  private prevSites = new Map<string, { x: number; y: number }>();
  private last: SoundFrame | null = null;

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 最初の操作のとき (ブラウザは、押されるまで音を出させない)。音の仕組みを作って、BGM を流す。 */
  unlock(): void {
    if (!this.ctx) this.build();
    void this.ctx?.resume();
    if (this.ctx && !this.playing) this.startMusic();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(ENABLED_KEY, on ? "on" : "off");
    } catch {
      /* 保存できなくても、音は変えられる */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  /** BGM を変える (タイトル・街)。同じ曲なら、そのまま流す。 */
  playSong(song: Song): void {
    if (song === this.song && this.playing) return;
    this.song = song;
    this.stopMusic();
    if (this.ctx) this.startMusic();
  }

  /** 毎フレーム呼ぶ。近くの音の大きさと左右を決め直す。 */
  update(f: SoundFrame): void {
    this.last = f;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    // 車の走行音
    this.trafficV.gain.gain.setTargetAtTime(on * trafficLevel(f.traffic.weight) * 0.22, t, 0.15);
    this.trafficV.pan.pan.setTargetAtTime(panOf(f.traffic.x - f.center.x, f.traffic.y - f.center.y, f.right), t, 0.15);
    // クレーン (ウインチの低い唸り)
    this.craneV.gain.gain.setTargetAtTime(on * Math.min(1, f.crane.weight) * 0.14, t, 0.2);
    this.craneV.pan.pan.setTargetAtTime(panOf(f.crane.x - f.center.x, f.crane.y - f.center.y, f.right), t, 0.2);
    // 話し声 (住んでいる人が多いほど、にぎやか)
    this.chatterV.gain.gain.setTargetAtTime(on * chatterLevel(f.residents) * 0.09, t, 0.3);
    // 手で積む音 (トン・カン): 近いほど、よく大きく
    if (f.hand.weight > 0.02 && t >= this.nextHammer) {
      this.burst(f.hand.x, f.hand.y, Math.min(1, f.hand.weight) * 0.5, 1800);
      this.nextHammer = t + 0.3 + Math.random() * 0.5;
    }
    // 建ち上がった建物 (建設の場所が消えた) は、ドンと鳴らす
    const now = new Map<string, { x: number; y: number }>(f.sites.map((s) => [`${s.x},${s.y}`, s]));
    for (const [k, s] of this.prevSites) if (!now.has(k)) this.thud(s.x, s.y);
    this.prevSites = now;
  }

  // ---- 中身 ----

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(ctx.destination);
    // BGM: 街はラジオ風 (こもった音)、タイトルはそのまま
    this.radio = ctx.createBiquadFilter();
    this.radio.type = "bandpass";
    this.radio.frequency.value = 1100;
    this.radio.Q.value = 0.8;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.radio);
    this.radio.connect(this.master);
    // 雑音の元 (ノイズ) を 2 秒ぶん作って、繰り返し使う
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.trafficV = this.loopVoice(ctx, "bandpass", 700, 0.9);
    this.craneV = this.loopVoice(ctx, "lowpass", 260, 0.7, "sawtooth", 58);
    const ch = this.loopVoice(ctx, "bandpass", 900, 0.6);
    this.chatterV = { gain: ch.gain };
    ch.pan.disconnect();
    ch.gain.connect(this.master);
  }

  /** 繰り返す雑音 (または低い鋸波) を、フィルターと音量と左右につなぐ。 */
  private loopVoice(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number, wave?: OscillatorType, pitch?: number) {
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    if (wave) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = pitch ?? 60;
      osc.connect(filter);
      osc.start();
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(filter);
      src.start();
    }
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    return { gain, pan };
  }

  private startMusic(): void {
    if (!this.ctx) return;
    this.playing = true;
    this.nextBar = this.ctx.currentTime + 0.1;
    this.barIndex = 0;
    this.radio.type = this.song.radio ? "bandpass" : "lowpass";
    this.radio.frequency.value = this.song.radio ? 1100 : 12000;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stopMusic(): void {
    this.playing = false;
    clearInterval(this.timer);
  }

  /** 先の小節まで、音の予約を入れる (ずれないように、少し先まで)。 */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const beat = 60 / this.song.bpm;
    while (this.nextBar < ctx.currentTime + LOOK_AHEAD) {
      this.scheduleBar(this.song.bars[this.barIndex]!, this.nextBar, beat);
      this.nextBar += 4 * beat;
      this.barIndex = (this.barIndex + 1) % this.song.bars.length;
    }
  }

  private scheduleBar(bar: Song["bars"][number], t: number, beat: number): void {
    const len = 4 * beat;
    // 和音 (うすく伸ばす)
    for (const m of bar.chord) this.tone(midiHz(m), "triangle", t, len, 0.035, 0.08);
    // 低音 (1 拍目と 3 拍目)
    const root = midiHz(bar.chord[0]! - 12);
    this.tone(root, "sine", t, beat, 0.12, 0.02);
    this.tone(root, "sine", t + 2 * beat, beat, 0.1, 0.02);
    // 旋律
    let mt = t;
    for (const [m, b] of bar.melody) {
      this.tone(midiHz(m), this.song.radio ? "square" : "triangle", mt, b * beat, 0.05, 0.03);
      mt += b * beat;
    }
  }

  /** 1 つの音: 立ち上がりから消えるまで。out は BGM の音の出口。 */
  private tone(hz: number, wave: OscillatorType, t: number, dur: number, level: number, release: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.02);
    g.gain.setValueAtTime(level, Math.max(t + 0.021, t + dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 一瞬の雑音 (トン・カン)。高さは、フィルターの周波数。 */
  private burst(x: number, y: number, level: number, freq: number): void {
    const ctx = this.ctx!;
    const f = this.last;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(level * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const pan = ctx.createStereoPanner();
    pan.pan.value = f ? panOf(x - f.center.x, y - f.center.y, f.right) : 0;
    src.connect(hp);
    hp.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    src.start(t, Math.random(), 0.06);
  }

  /** 建ち上がった建物の、ドンという音。 */
  private thud(x: number, y: number): void {
    const ctx = this.ctx;
    const f = this.last;
    if (!ctx || !f || !this.enabled) return;
    const dist = Math.hypot(x - f.center.x, y - f.center.y);
    const level = falloff(dist, HEAR_RANGE) * 0.5;
    if (level <= 0) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const pan = ctx.createStereoPanner();
    pan.pan.value = panOf(x - f.center.x, y - f.center.y, f.right);
    osc.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.36);
  }
}
