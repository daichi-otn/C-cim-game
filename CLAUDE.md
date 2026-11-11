# C-cim — Claude Code 向けの引き継ぎメモ

ブラウザで動く 3D の街づくり経営シミュレーション(Cities: Skylines の軽量版)。個人プロジェクト、販売なし。
**まず [README.md](README.md) を読む。** ゲームのルール・操作・ロードマップ(M1〜M17)・バージョン表がすべて書いてある。現在地はバージョン表の先頭と、ロードマップの ✅ で分かる。

## 技術と構成
TypeScript / Vite / three.js(3D 描画) / Vitest。サーバーなしの静的サイト。ユーザーとのやりとりは**日本語**。コード中のコメントも日本語(周囲に合わせる)。

- `src/sim/` … ロジック層。**描画ライブラリ(three.js)を import しない**(vitest が node で動くため)。街の状態は `city.ts` の `City` が持つ。
- `src/render3d/` … 描画層 (3D, three.js)。見た目だけで、街の計算には関わらない。入口は `world3d.ts` の `World3D` (setCity で街を切り替え、update で毎フレームの状態を渡し、render で描く)。視点の計算は純粋な `camera3d.ts`、形の計算は純粋な `buildingShape.ts` / `facilityShape3d.ts` / `windows3d.ts` (テストがある)。メッシュは `geo.ts` の `GeoBuilder` に頂点を溜めて作る。
- `src/render/` … 描画に使う純粋な計算だけ (`lighting.ts` 昼夜、`weatherLook.ts` 天気・季節の色、`mapPreview.ts` タイトルの地図)。
- `src/main.ts` … 入力・UI(パネル、ツールバー、パレット)・メインループ。
- `tests/` … 単体テスト(Vitest)。`tests/helpers.ts` の `setup()` が「道路 1 本 + 住宅/商業/工業 + 施設」の標準の街を作る。
- `e2e/` … ブラウザ自動操作(playwright-core)。`e2e/lib.mjs` に共通部品。

## コマンド
```bash
npm install
npm run dev        # 開発サーバー (http://localhost:5173)
npm test           # 単体テスト
npm run build      # 型チェック + ビルド
npm run e2e        # ブラウザ確認 (先に dev を起動。5173 固定のものがある)
npx tsc --noEmit   # 型チェックだけ
```
e2e は `node e2e/xxx.mjs "http://localhost:ポート/?seed=12345"` のように URL を渡せる(別ポートで dev を立てて試せる)。`?seed=12345` を付けるとタイトルを飛ばして原点から始まる(座標が固定される)。

## 公開版の更新 (GitHub Pages)
- 公開は https://daichi-otn.github.io/C-cim-game/。**`daichi-otn/C-cim-game` (公開用リポジトリ) の `main` に push すると、GitHub Actions (`.github/workflows/pages.yml`) が自動でビルドして公開を更新する。** Netlify は使わない (運用クレジットの停止で、更新できなくなったため)。 この C-cim (開発用・非公開) に push しても、公開は変わらない。
- 公開用は履歴を作り直したコピー (フォルダ `../C-cim-public`、作者は noreply アドレス `263363615+daichi-otn@users.noreply.github.com`)。更新の手順: `git archive HEAD` で最新を取り出す → CLAUDE.md を除く → README の URL を `C-cim-game` に直し、「新しいセッションを始めたとき」の節を外し、ライセンスの節を足す → `rsync -a --delete --exclude .git --exclude node_modules` で C-cim-public に反映 → 個人情報 (メール・パス) を検査 → noreply でコミットして push。
- 変更の確認が済んだら、毎回、追加の確認なしで公開用に push する (作業の途中のものは公開しない)。公開前に、`npx tsc --noEmit`・`npx vitest run`・必要な e2e を通す。

## 作業の進め方(ユーザーとの約束)
- 機能を 1 つ作るごとに: 単体テストを足す → 必要なら e2e を足す → README(機能の説明・バージョン表・「現在のバージョン」)と package.json / `src/main.ts` の `VERSION` を更新 → コミット → **`main` へ push**。
- **push は毎回、ユーザーの確認なしでしてよい**(恒久的に許可済み)。ただし force push はしない。
- 迷う設計(仕様の選択)は、勝手に決めず `AskUserQuestion` で 1 つずつ聞く。決まった内容は README の「計画の決定事項」に書く。
- 完了を報告するときは、テストの件数・通した e2e・**流していないもの**を正直に書く。
- 別セッションが同じフォルダで動いていることがある。作業は `git worktree add -b <ブランチ> ../C-cim-<名前> main` で別フォルダに分け、`node_modules` はシンボリックリンクで共有(`ln -s ../C-cim/node_modules node_modules`)。終わったら main で `git merge --ff-only <ブランチ>` → push。`package-lock.json` の未コミット変更は別セッションのものなので触らない。
- コミットメッセージは日本語。末尾に `Co-Authored-By: Claude ... <noreply@anthropic.com>` の行を付ける(システムの指示に従う)。

## 設計の方針と、はまりやすい点
- **導出できる状態は保存しない。** セーブには基本データだけ入れ、道路網・供給・交通・環境・需要は読み込み後に `city.refresh()` で求め直す。
- **セーブデータの後方互換を守る。** 新しい項目は、タプルの末尾に「省略可能」で足し、古いデータは既定値(昔の動き)にする。不正な値は `fromData` で `throw`。テストに「古いデータ」「不正な値」を必ず入れる。
- 道路: `RoadGraph`(ノードと区間)。区間は `type`(10 種)・`oneWay`・`chain`(曲線/橋の一続き)・`structure`(橋/トンネル)を持つ。曲線は短い直線の連なり。
- 建物は複数マスを使う(M17)。セルは 1 タイルごとのままで、建物は左上のセル(アンカー)が `w`×`h` を持ち、残りのタイルは `part`(アンカーのキー)で印を付ける。供給・交通・環境などはアンカーだけを見る。定員・雇用・使用量は `cellCapacity(c)` / `lotArea(c)`(1 マスあたり × マス数)を使う。区画は `ZoneType`(住宅/商業/工業/オフィス)× 密度(`density` 0=昔の区画 / 1〜3)。定員は `capacityOf()` を使う(表を直接引かない)。
- 天気と季節 (`src/sim/weather.ts`) は日と種子から決まる導出値で、セーブしない。電力・交通・環境・需要・税収が参照する (倍率の表は weather.ts)。描画は `weatherView` / `natureView` / `effectsView`。
- 建物・施設は 3D (`buildingGeo.ts` / `facilityGeo.ts` が形を `GeoBuilder` に溜め、`structures3d.ts` が 16 タイル四方のブロックごとにメッシュにする。変わったブロックだけ作り直す)。窓の灯り・煙突の煙・足場・病人マークは、`buildingShape` / `facilityShape3d` の同じ基準 (煙突の位置など) を使う。世界の座標は three の x = 東、z = 南、y = 高さ (px)。
- 開発者モード (`city.devMode`、メニューまたは `?dev=1`): 供給・需要・環境・お金などの条件を無視する見た目確認用。保存しない。条件を足すときは、devMode のときにどうするかも決める。お金の判定は `city.canAfford()` を使う。
- 交通は 1 日ぶんの交通量を集計するモデル(経路探索 + 混雑による再割り振り)。車の動きは見た目だけ。
- テストで施設を置くとき、`facilitySlots()` が道路の南北に置き場を取っているので、**ゾーンと重ならない場所**を選ぶ(重なるとゾーンが消える)。
- e2e で金額などの表示を読むときは、クリックの後に **200〜300ms 待つ**(パネルは次のフレームで更新される)。ヘッドレス(ソフトウェア描画)は遅く、描画が重いと「時間が遅く進む」ので、e2e の時間の判定が落ちる。3D は特に重く、GPU のない環境は自動で軽量モード (影・補正なし、木を減らす) になる (`isSoftwareRenderer`)。描画を足すときは、軽量モードで fps (15 fps 前後が基準) を測る。**描画の重さを一番左右するのは木 (インスタンス数 × 面数)**。街を作ってから状態を見るテストは、最初に一時停止 (`#speed button[data-speed='0']`) して、操作中に日数が進まないようにする。e2e の画面操作は、?seed= 付き (真上の視点) で、昔の 2D と同じ座標 (`px()` など) が使える。
- ユーザーは他の環境でも続きを開発する。作業の最後は必ず push して、README に現状を反映しておく。

## 次にやること
README のロードマップを見る。M8 まで、M10 の「区画の種類」、M16(昼夜・光・煙・天気と季節・木々の揺れ・建設の足場)、チュートリアルは完了。M9(施設の拡充と環境対策。施設 16 種類)も完了。M10(地価に応じた税収・老朽化と建て替え・見た目の多様化・地区の管理)は v0.32.0 で完了。M17(施設の大型化・区画の建物の複数マス化)も完了。次は、M11(予算・政策・災害)など。着手前に、ユーザーに順序を確認する。
