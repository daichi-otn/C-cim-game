import { describe, expect, it } from "vitest";
import { ACTION_DEFS, DEFAULT_KEYMAP, KEYMAP_STORAGE_KEY, actionFor, bindKey, isAssignable, keyLabel, normalizeKey, parseKeymap, resolveKeyTokens, type ActionId, type Keymap } from "../src/keymap";
import { HELP_SECTIONS } from "../src/help";
import { TUTORIAL_STEPS } from "../src/sim/tutorial";
import { DEFAULT_CAMERA_BINDINGS, KeyCamera } from "../src/render3d/keyCamera";

const TOKEN = /\{\{([\w.]+)\}\}/g;
const tokensIn = (texts: string[]) => texts.flatMap((t) => [...t.matchAll(TOKEN)].map((m) => m[1]!));

describe("初期設定", () => {
  it("どの操作も、重ならないキーを 1 つずつ持つ", () => {
    const keys = ACTION_DEFS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(isAssignable(k)).toBe(true);
  });

  it("操作の名前は、ID も名前も重ならない", () => {
    expect(new Set(ACTION_DEFS.map((a) => a.id)).size).toBe(ACTION_DEFS.length);
    for (const a of ACTION_DEFS) expect(a.label.length).toBeGreaterThan(0);
  });

  it("視点のキーの初期設定は、昔と同じ W A S D Q E R F", () => {
    expect(DEFAULT_KEYMAP["cam.forward"]).toBe("w");
    expect(DEFAULT_KEYMAP["cam.back"]).toBe("s");
    expect(DEFAULT_KEYMAP["cam.left"]).toBe("a");
    expect(DEFAULT_KEYMAP["cam.right"]).toBe("d");
    expect(DEFAULT_KEYMAP["cam.yawLeft"]).toBe("q");
    expect(DEFAULT_KEYMAP["cam.yawRight"]).toBe("e");
    expect(DEFAULT_KEYMAP["cam.pitchUp"]).toBe("r");
    expect(DEFAULT_KEYMAP["cam.pitchDown"]).toBe("f");
  });
});

describe("キーの見た目と比べ方", () => {
  it("英字は小文字に、Space は Space と表す", () => {
    expect(normalizeKey("W")).toBe("w");
    expect(normalizeKey("Home")).toBe("Home");
    expect(keyLabel("w")).toBe("W");
    expect(keyLabel(" ")).toBe("Space");
  });

  it("使えるのは印字できる 1 文字と特別なキーだけ (Escape・Enter・Tab は使えない)", () => {
    expect(isAssignable("1")).toBe(true);
    expect(isAssignable(",")).toBe(true);
    expect(isAssignable(" ")).toBe(true);
    expect(isAssignable("Home")).toBe(true);
    expect(isAssignable("Escape")).toBe(false);
    expect(isAssignable("Enter")).toBe(false);
    expect(isAssignable("Tab")).toBe(false);
    expect(isAssignable("ArrowUp")).toBe(false);
  });
});

describe("キーの割り当て", () => {
  it("割り当てると、そのキーは新しい操作を指す", () => {
    const r = bindKey(DEFAULT_KEYMAP, "tool.zoneR", "N");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map["tool.zoneR"]).toBe("n");
    expect(actionFor(r.map, "n")).toBe("tool.zoneR");
    expect(actionFor(r.map, "4")).toBeUndefined();
    expect(r.swapped).toBeUndefined();
  });

  it("使われているキーを選ぶと、2 つの操作のキーを入れ替える", () => {
    const r = bindKey(DEFAULT_KEYMAP, "tool.zoneR", "5");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.swapped).toBe("tool.zoneC");
    expect(r.map["tool.zoneR"]).toBe("5");
    expect(r.map["tool.zoneC"]).toBe("4");
  });

  it("同じ操作に同じキーを割り当てても、入れ替えにはならない", () => {
    const r = bindKey(DEFAULT_KEYMAP, "tool.zoneR", "4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.swapped).toBeUndefined();
    expect(r.map).toEqual(DEFAULT_KEYMAP);
  });

  it("使えないキーは割り当てない", () => {
    const r = bindKey(DEFAULT_KEYMAP, "tool.zoneR", "Escape");
    expect(r.ok).toBe(false);
  });
});

describe("保存された設定の読み込み", () => {
  it("保存がなければ初期設定", () => {
    expect(parseKeymap(null)).toEqual(DEFAULT_KEYMAP);
  });

  it("壊れた文字列は初期設定", () => {
    expect(parseKeymap("{not json")).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap("42")).toEqual(DEFAULT_KEYMAP);
  });

  it("使えないキーや、同じキーが重なっているものは初期設定", () => {
    expect(parseKeymap(JSON.stringify({ "tool.zoneR": "Escape" }))).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap(JSON.stringify({ "tool.zoneR": 4 }))).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap(JSON.stringify({ "tool.zoneR": "5" }))).toEqual(DEFAULT_KEYMAP); // 5 と重なる
  });

  it("保存されていた分だけ変えて、足りない操作は初期設定のまま", () => {
    const m = parseKeymap(JSON.stringify({ "tool.zoneR": "n", "cam.forward": "PageUp" }));
    expect(m["tool.zoneR"]).toBe("n");
    expect(m["cam.forward"]).toBe("PageUp");
    expect(m["tool.zoneC"]).toBe("5");
  });

  it("保存の名前は、バージョン付き", () => {
    expect(KEYMAP_STORAGE_KEY).toContain("v1");
  });
});

describe("文章のキーの置き換え", () => {
  it("{{操作}} を、いまの設定のキーの名前に置き換える", () => {
    const m: Keymap = { ...DEFAULT_KEYMAP, "tool.road": "x" as Keymap[ActionId] };
    expect(resolveKeyTokens("道路 ({{tool.road}}) と {{game.pause}}", m)).toBe("道路 (X) と Space");
  });

  it("知らない名前はそのまま残す", () => {
    expect(resolveKeyTokens("{{no.such}}", DEFAULT_KEYMAP)).toBe("{{no.such}}");
  });

  it("使い方とチュートリアルの印は、すべて存在する操作を指す", () => {
    const ids = new Set(ACTION_DEFS.map((a) => a.id));
    const used = tokensIn([...HELP_SECTIONS.flatMap((s) => s.lines), ...TUTORIAL_STEPS.flatMap((s) => s.body)]);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(ids.has(id as ActionId)).toBe(true);
  });
});

describe("視点のキーの割り当て", () => {
  it("初期設定の WASD で動かせ、ほかのキーは取らない", () => {
    const cam = new KeyCamera(DEFAULT_CAMERA_BINDINGS);
    expect(cam.down("w")).toBe(true);
    expect(cam.down("1")).toBe(false);
  });

  it("割り当てを変えると、新しいキーで動き、古いキーは取らない", () => {
    const cam = new KeyCamera(DEFAULT_CAMERA_BINDINGS);
    cam.setBindings({ ...DEFAULT_CAMERA_BINDINGS, w: "i" });
    expect(cam.down("w")).toBe(false);
    expect(cam.down("I")).toBe(true);
    cam.up("i");
  });
});
