/** 途中の状態を取り出せる乱数。セーブ・ロードで、続きから同じ列を再現するのに使う。 */
export interface StatefulRng {
  /** 0以上1未満を返す。 */
  next(): number;
  /** いまの内部状態。createStatefulRng(seed, state) に渡すと、ここから同じ列が続く。 */
  state(): number;
}

/** シード付き疑似乱数 (mulberry32)。state を渡すと、その状態から再開する。 */
export function createStatefulRng(seed: number, state?: number): StatefulRng {
  let a = (state ?? seed) >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
}

/** シード付き疑似乱数 (mulberry32)。0以上1未満を返す。 */
export function createRng(seed: number): () => number {
  const r = createStatefulRng(seed);
  return () => r.next();
}

/** 整数格子点ごとに決まる 0..1 のハッシュ値。チャンク境界でも同じ値になる。 */
export function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
