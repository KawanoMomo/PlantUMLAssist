# 製品仕様書 — PlantUMLAssist v5.0

v5.0「整理の版」の成果物(TICKET-roadmap-20261115-2114-3)。整理表 `docs/spec/feature-triage.md` で「残す」と、「統合」で残した側の機能だけを、利用者の場面ごとに書く。
外した機能(整理表の「消す」と「統合」の消す枝)は載せない。設計の経緯は `docs/superpowers/specs/`、判断は `docs/adr/`、用語は `CONTEXT.md`。

## 製品の約束

- **本文が正本**。図は PlantUML の本文(`.puml` のテキスト)から描く。GUI の操作は本文を書き換えるだけで、図だけが持つ状態は無い
- **1 操作は名指しした要素だけを最小の差分で変える**。押した要素の行だけが変わり、ほかの行(改行コード・字下げ・コメント・空行・文字コード)は 1 バイトも動かない
- **保存先に書くのは `.puml` と、利用者が押した書き出しだけ**。控え・印・設定を保存先に置かない。保存先にあるほかのファイルは読み書きしない
- **外へ何も送らない**。描画は既定で PC の中の `lib/plantuml.jar` で行う(online の描画は jar が使えない人が自分で選んだときだけ)
- **守り**: 保存・自動保存・Undo・既存の `.puml` を壊さず開くこと。整理でも外さない

## 読み方

- 1 行が 1 つの機能。「整理表」の列は整理表の行番号(1 つの機能に統合した行は並べて書く)。unit `tests/roadmap-20261115-2114-3-product-spec.test.js` が、この列の番号と整理表の「残す」「統合」の行が過不足なく一致することを確かめる
- 「入口」はボタン・パネル・ショートカット。「振る舞い」は本文に何行の差分が出るか・何が変わらないか。「確かめる」はその振る舞いを守る spec(`tests/scenarios`・`tests/e2e`。画面を持たない土台は unit)
- 「入口」の「」で囲んだ語は画面にそのまま出る語。unit `tests/roadmap-20261115-2114-4-terms.test.js` が、どれも画面(`plantuml-assist.html` と `src/`)に実在することを確かめる

### 画面の語

右パネル(選択中・末尾に追加)で同じ役の欄とボタンは、6 図種で同じ語を出す。語の正本は `src/ui/terms.js`(この表と同じ値)。日本語と英語を併記しない。PlantUML の記法(`activate` 等)は記法として添えてよい。
unit `tests/roadmap-20261115-2114-4-terms.test.js` が、この表と `src/ui/terms.js` が一致し、6 図種の右パネルにこの語が出て、別の言い方(Alias・Label・Stereotype・Type・「更新」・「クラスを削除」・「○○ / English」)が出ないことを確かめる。

| 役 | 語 | 出る所 |
|---|---|---|
| `id` | 名前 (id) | 参加者・アクター・ユースケース・コンポーネント・クラス・状態の識別子(`as` の後ろ) |
| `label` | 表示名 | 図に出る要素の名前(`"…" as` の前) |
| `edgeLabel` | ラベル | 関係・枝・アクションの線や箱に乗る文字 |
| `stereotype` | ステレオタイプ | `<<…>>` |
| `kind` | 種類 | 参加者の形・枠の種類・クラスの種類 |
| `del` | ✕ 削除 | 選んだ要素を消すボタン |
| `apply` | 変更を反映 | 欄の値を本文に書くボタン |
| `renameRefs` | 名前を変えたら関係の行も付け替える | 名前 (id) を変えたときに参照する行も直す |
| `arrow` | 矢印の種類 | メッセージの矢印 |
| `lineColor` | 線の色 | メッセージ・関係・遷移の線 |
| `color` | 色 | 要素の塗り |
| `textColor` | 文字色 | 本文の書式 |
| `direction` | 向き | 関係の向き |
| `multiplicity` | 多重度 | 関係の両端 |
| `relationKind` | 関係の種類 | 関係を足す・直す |
| `addRelation` | 関係を追加 | 2 つ選んだとき |
| `condition` | 条件 | `alt` / `loop` などの枠 |
| `insertHere` | この位置に挿入 | 選んだ行の前後に足す |
| `reorder` | 並び替え | ↑ ↓ |
| `swimlane` | スイムレーン | アクションの所属 |
| `inferActivation` | 呼び出しの開始・終了を自動で入れる (activate) | メッセージを選んだとき |

## 開く

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #14 #8 | ファイルを開く | 手元の `.puml` を開いて直す | 上部バー「Import ▾」→「ファイルを開く…」/「クリップボードから開く」、タブ列の「開く」、ドラッグ&ドロップ | 開いただけでは本文は変わらない。改行コード・文字コードは開いたままを保つ | `tests/e2e/scenarios/human-06-open-local-files.spec.js` |
| #2 | タブで複数の図を開く | 6 図種の図を 1 枚ずつタブで開き、切り替えて直す | タブ列・タブ列の ＋(新しい図) | タブを替えても他のタブの本文は変わらない。再読み込みしても開いていた図を失わない | `tests/e2e/legacy/blk-human-1850-diagram-tabs.spec.js` |
| #3 | 図種レール | 新しい図の図種を選ぶ | 左端の「SEQ」/「UC」/「CMP」/「CLS」/「ACT」/「ST」 | 図種を替えても書いてある本文を上書きしない | `tests/e2e/legacy/blk-builder-0803-4-diagram-rail.spec.js` |
| #96 | 最近開いた図 | 前に開いた図を開き直す | Ctrl+K の「最近開いた図」 | 開くだけ。本文は変わらない | `tests/blk-junior-20260915-2346-recent-files.test.js` |
| #31 #78 | 日本語名・別名つき宣言 | `interface "GPIO制御" as IGpio` のような宣言を壊さず開いて直す。Alias 欄に日本語を打つと、識別子を自動で割り当てると押す前に知らせる | 追加フォームの Alias 欄 | 表示名と識別子を取り違えない。開いた宣言の書き方は変えない | `tests/e2e/legacy/blk-junior-0630-alias-hint.spec.js` |
| #67 #73 #80 | 図種の判定 | 旧記法の activity 図・宣言だけのコンポーネント図・略記だけのユースケース図を正しい図種で開く | 開いたとき(自動) | 判定は読むだけ。本文は変えない | `tests/e2e/scenarios/migrator-03-legacy-activity.spec.js` |

## 直す(6 図種で共通の操作)

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #26 | ホバーで選択枠 | 図の要素にマウスを乗せると枠が出て、押すと選べる | プレビューの図 | 乗せる・押すだけでは本文は変わらない | `tests/e2e/scenarios/migrator-04-hover-frame.spec.js` |
| #12 | 本文と図の相互ジャンプ | 図の要素を押すと本文の行へ、本文の行から図の要素へ移る | プレビューの図・エディタの行 | 移るだけ。本文は変わらない | `tests/e2e/legacy/blk-primary-1203-design-click-to-line.spec.js` |
| #18 | 末尾に追加 | 要素・関係・注釈を図の末尾(選んでいれば選んだ位置)に足す | 右パネルの「末尾に追加」フォーム、Enter | 足した要素の行だけが増える(差分 1 行が基本) | `tests/e2e/legacy/scratch-tail-add.spec.js` |
| #19 | まとめてチップ | 複数の要素を 1 回の確定で足す | 末尾に追加の「まとめて」チップ | 足した行だけが増え、既存の行は動かない | `tests/e2e/legacy/blk-builder-0923-3-tail-kind-chips.spec.js` |
| #20 | 正当な入力を止めずに知らせる | PlantUML として正当な名前・記法は止めずに、気を付ける点だけを知らせる | 追加フォームの欄の下の一言 | 知らせても入力は止めない。本文に余計な行を書かない | `tests/e2e/legacy/blk-junior-0003-name-rule-text.spec.js` |
| #21 | 追加する位置 | 入れ子・境界の中に足す | 追加フォームの位置の選択 | 選んだ入れ子の中にだけ 1 行足す | `tests/e2e/scenarios/junior-11-band-inside-insert.spec.js` |
| #22 #4 | 行編集 | 図の 1 行だけを選んで書き換え・挿入・削除する | 「ツール」▾ →「行を書き換える」、Ctrl+K | 選んだ 1 行だけが変わる | `tests/e2e/legacy/blk-primary-2243-line-edit.spec.js` |
| #23 | キーボードで選び続ける | ↑↓ で隣の要素へ選択を移す | 要素を選んだ状態で ↑ ↓ | 選択だけが移る。本文は変わらない | `tests/e2e/legacy/feat-012-arrow-select.spec.js` |
| #5 | 元に戻す / やり直し | GUI の操作も本文の手入力も 1 つずつ戻す・やり直す | Ctrl+Z / Ctrl+Y | 戻すと本文が操作の前のバイト列に戻る | `tests/e2e/legacy/uc-16-undo-coverage.spec.js` |
| #24 | 位置を保ったズーム | 見ている場所を保ったまま拡大・縮小する | プレビュー右上のズーム帯(− / ＋ /「Fit」) | 表示だけ。本文は変わらない | `tests/e2e/legacy/blk-builder-0803-4b-zoom-hud.spec.js` |
| #25 #94 | 図の設定 | 図名・タイトルと図全体の外観(skinparam)を決める | 右パネル「図の設定」タブ | 設定した行だけが変わる・増える | `tests/e2e/legacy/blk-primary-0703-diagram-settings.spec.js` |
| #6 #48 | Ctrl+K コマンドパレット | 残した機能を名前で引く(入れ子の言い換え「子状態」等でも引ける) | Ctrl+K、上部バーの検索 | 引くだけでは本文は変わらない。押す先の無い行は無い | `tests/e2e/legacy/blk-builder-0803-command-palette.spec.js` |
| #4 #7 #9 | 画面の骨格 | 上部バー(保存の状態・Import ▾・Export ▾)、ツール ▾(行を書き換える・部品名を一括置換する・複数クラスに一括適用する の 1 段の一覧)、下端ステータス(パース・要素数・保存の結果) | 上部バー・タブ列右端の「ツール」▾(「行を書き換える」「部品名を一括置換する」「複数クラスに一括適用する」)・下端 | 表示と入口だけ。本文は変わらない | `tests/e2e/legacy/blk-primary-0823-design-tool-menu.spec.js` |
| #10 | ⚙ 設定 | 自動保存・エディタ・ショートカット・描画エンジンを設定する | 左下の「CFG」 | 設定はマシンの設定に書く。保存先には書かない | `tests/e2e/legacy/blk-builder-0843-3-settings-tabs.spec.js` |

## 直す(図種ごとの操作)

### シーケンス図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #32 #33 | 参加者とメッセージで起こす | 白紙から参加者とメッセージを足して図を起こす | 「末尾に追加」→ 参加者 / メッセージ | 足した参加者・メッセージの行だけが増える | `tests/scenarios/junior-1-s1.spec.js` |
| #34 | 参加者を選んだ右パネル | 参加者の名前・形・別名を直す、消す | 参加者を押す → 右パネル | その参加者の宣言行だけが変わる(改名は参照する行も) | `tests/e2e/legacy/lifeline-select-delete.spec.js` |
| #35 | メッセージを選んでから追加 | 選んだメッセージの From / To を引き継いで次の 1 本を足す | メッセージを押す → 末尾に追加 | 選んだ行の後に 1 行足す | `tests/e2e/legacy/blk-junior-2203-tail-endpoints.spec.js` |
| #36 | 矢印を言葉で選ぶ | 同期・応答・非同期・届かない を言葉で選び、向きを 1 クリックで替える | メッセージの右パネルの「矢印の種類」 | その行の矢印だけが変わる | `tests/e2e/legacy/blk-builder-0823-arrow-swap.spec.js` |
| #37 | シーケンス構成をまとめて追加 | 参加者・メッセージ・枠を 1 回で足す | 末尾に追加 → まとめて | 足した行だけが増える | `tests/e2e/legacy/blk-junior-0343-sequence-bulk.spec.js` |
| #38 | ＋ ここに挿入 | メッセージの間に 1 本差し込む | 図の行間の「＋ ここに挿入」 | 押した位置に 1 行だけ増える | `tests/e2e/legacy/uc-12-hover-insert.spec.js` |
| #39 | activate の帯の内外 | 帯の内側か外側かを選んで差し込む | 帯の付近の ＋ | 選んだ側に 1 行だけ増える | `tests/e2e/scenarios/junior-12-band-outside-insert.spec.js` |
| #40 | メッセージの選択範囲 | 矢印の線の周りを広く押してもメッセージを選べる | メッセージの矢印 | 選ぶだけ。本文は変わらない | `tests/e2e/legacy/blk-primary-0103-sequence-hover-line.spec.js` |
| #41 | 通し番号・線の色 | autonumber と線の色を付ける・外す | 「図の設定」の autonumber、メッセージの「線の色」 | autonumber の行・その行の色指定だけが変わる | `tests/e2e/legacy/blk-builder-1248-autonumber.spec.js` |
| #42 | alt / loop で囲む | 範囲を選んで枠で囲み、囲んだ後に範囲を伸ばす・縮める | メッセージの範囲選択 → 枠 | 枠の開始・終了の行だけが増える・動く | `tests/e2e/scenarios/human-04-wrap-range.spec.js` |
| #43 | 注釈の位置 | note の位置・対象の参加者・上下の順を変える | 注釈を押す → 右パネル | その note の行だけが変わる・動く | `tests/e2e/scenarios/human-05-note-placement.spec.js` |

### 状態遷移図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #45 | 状態と遷移をまとめて追加 | state と遷移を 1 回で足し、末尾以外にも置く | 末尾に追加 → まとめて | 足した行だけが増える | `tests/e2e/legacy/blk-junior-0443-state-bulk.spec.js` |
| #46 | 遷移の連続入力 | 状態を押して遷移を続けてつなぐ(trigger の候補は今の図の中の名前だけ) | 遷移のフォーム | 1 本ごとに 1 行足す | `tests/e2e/legacy/blk-primary-0723-transition-form.spec.js` |
| #47 | 子状態を追加 | 入れ子の子状態を足す、2 つ足して遷移でつなぐ | 状態の右パネル「＋ 子状態を追加」 | `{ }` の中に足した行だけが増える | `tests/e2e/scenarios/junior-09-state-child.spec.js` |
| #50 | 開始・終了・履歴 | [*] と [H] をどの入れ子のものか選んで足す | 末尾に追加 → 開始 / 終了 / 履歴 | 選んだ入れ子に 1 行足す | `tests/e2e/legacy/blk-builder-1244-4-state-other.spec.js` |
| #51 | 分岐・fork/join・入口/出口・並行領域 | 擬似状態と並行領域の区切りを GUI から足す | 末尾に追加 → その他 | 足した行だけが増える | `tests/e2e/legacy/blk-junior-2043-state-branch.spec.js` |
| #52 | 遷移を選んだ右パネル | 遷移のラベル・端点を直す | 遷移を押す → 右パネル | その遷移の行だけが変わる | `tests/e2e/legacy/state.spec.js` |
| #53 | 状態を選んだ右パネル | 状態の名前・色を直す | 状態を押す → 右パネル | その状態の行(改名は参照する行も)だけが変わる | `tests/e2e/legacy/blk-builder-1306-state-color.spec.js` |
| #54 | 状態遷移表 | 1 枚の図の遷移を表で確かめ、表から足す | プレビューの上の「状態遷移表」 | 表は読むだけ。表から足すと 1 行増える | `tests/e2e/legacy/blk-builder-1203-4-state-table.spec.js` |

### クラス図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #55 | クラス構成をまとめて追加 | 親クラス・派生クラス・関連を 1 つのフォームで足す | 末尾に追加 → まとめて | 足した行だけが増える | `tests/e2e/legacy/blk-junior-2143-class-scaffold.spec.js` |
| #56 | クラスを選んだ右パネル | 属性・操作を足す・直す・消す | クラスを押す → 右パネル | そのクラスの中の行だけが変わる | `tests/e2e/legacy/blk-primary-0803-class-members.spec.js` |
| #57 | 選んだクラスから関係を引く | 継承・実現・関連を向きを取り違えずに足す | クラスの右パネル →「+ この関係を追加」 | 関係の行を 1 行足す(継承は親を左に書く正規形) | `tests/e2e/legacy/class-overlay.spec.js` |

### アクティビティ図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #61 | 追加フォーム | アクション・分岐・終了を 1 つのフォームで足す | 末尾に追加 | 足した行だけが増える | `tests/e2e/legacy/activity.spec.js` |
| #62 | ＋ ここに挿入 | 流れの途中に差し込む | 図の行間の「＋ ここに挿入」 | 押した位置に行が増える | `tests/e2e/legacy/blk-primary-0823-activity-insert.spec.js` |
| #63 | 分岐のパターン | よく使う分岐を 1 クリックで入れ、分岐ラベルを直す | 末尾に追加 → 分岐 | if / else / endif が揃った行が増える | `tests/e2e/legacy/blk-junior-1803-wish-branch-pattern.spec.js` |
| #64 | アクションを選んだ右パネル | アクションの文言・順・色を直す | アクションを押す → 右パネル | その行だけが変わる・動く | `tests/e2e/legacy/blk-builder-1746-2-action-reorder.spec.js` |
| #66 | 色を付けても描ける | GUI で色を付けても PlantUML の警告帯が出ない | アクションの色 | PlantUML が描ける書き方で 1 行だけ変える | `tests/e2e/legacy/blk-builder-1243-1b-activity-color.spec.js` |

### コンポーネント図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #68 | まとめて追加 | コンポーネント・インタフェース・関係を 1 回で足す | 末尾に追加 → まとめて | 足した行だけが増える | `tests/e2e/legacy/blk-junior-2343-component-bulk.spec.js` |
| #69 | 関係の種類をカードで選ぶ | 依存・提供・要求などを意味の説明つきで選ぶ | 関係の追加フォーム | 関係の行を 1 行足す | `tests/e2e/legacy/blk-builder-1003-3-component-relation-cards.spec.js` |
| #70 | ステレオタイプと境界 | component / interface にステレオタイプを付け、folder / frame / node / rectangle の境界を作る | 末尾に追加 | 足した行・その宣言だけが変わる | `tests/e2e/legacy/blk-builder-1243-3c-component-stereotype.spec.js` |
| #71 | 関係を文で読む | 矢印に乗せると関係がその場に文で出る | 矢印のホバー | 表示だけ。本文は変わらない | `tests/e2e/legacy/blk-junior-1703-edge-hint.spec.js` |

### ユースケース図

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #76 | まとめて追加 | アクター・ユースケース・関連を 1 回で足す | 末尾に追加 → まとめて | 足した行だけが増える | `tests/e2e/legacy/blk-junior-2343-usecase-bulk.spec.js` |
| #77 | 2 つ選んで関係を追加 | 2 つ押すと「関係を追加」になり、種類を意味の説明つきで選ぶ | 要素を 2 つ選ぶ → 右パネルの「関係を追加」 | 関係の行を 1 行足す | `tests/e2e/legacy/blk-builder-1003-relation-add.spec.js` |
| #79 | 注釈と境界 | 注釈を足し、境界を rectangle で作る | 末尾に追加 → 注釈 / 境界 | 足した行だけが増える | `tests/e2e/legacy/blk-builder-1358-1-usecase-note.spec.js` |

## 描く

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #157 #155 | jar で描く | 本文を打つたび・操作のたびに図を描き直す | 自動(`POST /render`、ローカルの `server.py`) | 描くだけ。本文は変わらない | `tests/e2e/scenarios/human-01-first-run-jar.spec.js` |
| #13 | 描けなくても直前の図を残す | 描画に失敗しても直前の図を消さず、読めない行を知らせる | プレビューの知らせの帯 | 本文は変えない | `tests/e2e/legacy/blk-primary-1303-render-error-overlay.spec.js` |
| #90 | 共通ファイルの `!include` | 共通ファイルを `!include` した図を描く | 本文の `!include` | 共通ファイルを読むだけで書かない | `tests/blk-primary-20260929-1108-include-dir.test.js` |
| #159 #173 | 外へ送らない | `lib/plantuml.jar`(推奨版は `lib/PLANTUML_VERSION`。⚙ 設定の描画エンジンで選ぶ・公式から取得する)で PC の中で描く | ⚙ 設定 →「描画エンジン」 | 既定の local では図も本文も外へ送らない | `tests/e2e/legacy/blk-builder-2237-2-toolbar-render-mode.spec.js` |

## 保存する

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #82 | 保存先の図はそのファイルに書く | 保存先から開いた図を直して同じファイルに書く | Ctrl+S、上部バーの「保存」、自動保存 | 確認の窓・`-編集中` の控えを出さず、そのファイルだけを書く | `tests/scenarios/primary-5-s1.spec.js` |
| #93 | 無変更保存のバイト一致 | 直していない図を保存しても中身が変わらない | Ctrl+S | 改行・字下げ・コメント・空行・文字コードを保ち、バイト単位で一致する | `tests/e2e/scenarios/migrator-05-save-unchanged.spec.js` |
| #86 | 自動保存は図の名前で書く | 打つたびに図の名前のファイルへ自動で書く | ⚙ 設定の「自動保存」 | 図種ではなく図の名前の 1 ファイルだけに書く | `tests/e2e/legacy/auto-save.spec.js` |
| #81 | 保存先を覚える | 保存先のフォルダをマシンの設定として覚える | FILES の保存先の右クリック「別のフォルダを保存先にする…」 | 設定に書くだけ。保存先には書かない | `tests/e2e/legacy/blk-junior-0843-save-dir-remembered.spec.js` |
| #85 | どこに書いたかを出す | 保存直後に書いたファイル名を出し、パスはマウスを乗せて読む | 下端ステータス | 表示だけ | `tests/e2e/legacy/blk-junior-2009-save-target-chip.spec.js` |
| #92 | 図名を変えたら付け替える | 図名を変えたら前の名前のファイルを残さず付け替える | 「図の設定」の図名、「FILES」の名前変更 | 前の名前の写しを残さない | `tests/e2e/legacy/blk-junior-1603-doc-name.spec.js` |
| #91 | 差し替えで書く | 保存は差し替えで書き、書きかけを読ませない | 保存(自動) | 途中の中身を保存先に残さない | `tests/scenarios/roadmap-20261115-2114.spec.js` |
| #87 #17 #107 | この図の履歴 | 保存のたびの版を並べ、前の版と見比べる・差分を見る・戻す | 「FILES」のファイルの右クリック →「この図の履歴」、右の枠の「見比べ」/「差分」 | 見るだけでは本文は変わらない。戻すと前の版の本文になる | `tests/scenarios/owner-20261115-2141.spec.js` |

## 書き出す

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #147 | Export ▾ | 今の図を SVG / PNG / PNG(透過背景)/ クリップボードに書き出す | 上部バー「Export ▾」(「SVGとして保存」「PNGとして保存」「PNG（透過背景）」「クリップボードにコピー」)、Ctrl+E | 利用者が押した 1 枚だけを書く。本文は変わらない。SVG と PNG は PlantUML の背景(既定は白地)を持ち、透明は「PNG(透過背景)」と `skinparam backgroundColor transparent` の図だけ | `tests/e2e/scenarios/junior-05-export-image.spec.js`、`tests/reviewer-20261115-2300-svg-background.test.js` |

## フォルダで図を扱う

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #1 | FILES ツリー | 保存先を選ぶ・替える、図を開く・絞る、新しい図、名前変更・複製・移動・削除、外から落とした `.puml` を開く、未保存の ● | 左の「FILES」、Ctrl+P、右クリック、↑↓ Enter | 開く・絞るだけでは何も書かない。名前変更・削除は押したファイルだけ | `tests/e2e/legacy/blk-junior-1103-folder-filter.spec.js` |
| #95 #101 | 保存フォルダの一覧 | 保存先の図を並べて絞り、印を付けてまとめて開く。1 枚を消しても前の版が残る図の行から戻す | FILES の保存先・タブ列の一覧 | 開く・絞るだけでは何も書かない。削除は押した 1 枚だけ | `tests/e2e/scenarios/primary-01-fourteen-docs.spec.js` |
| #105 #106 | 読むだけのフォルダ | 隣のフォルダの図を書かずに開いて見る | FILES の「読むだけ」節 | そのフォルダには書かない | `tests/e2e/scenarios/junior-09-senior-pane.spec.js` |
| #89 | GIT 欄 | 保存先の Git の変更・履歴を見て、図を開く | 「FILES」の「GIT」節 | 見るだけ。コミットしない | `tests/blk-human-20260923-1702-git-panel.test.js` |

## 図をまたいで名前を替える

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #115 #72 #118 | ⇄ 一括置換 | 開いている図と保存先の図をまたいで部品名を替える。過去の置換の組を押すと両欄が埋まる | 「ツール」▾ →「部品名を一括置換する」、Ctrl+H | 名前の箇所だけが替わり、記法と他の行は動かない | `tests/e2e/scenarios/primary-02-bulk-rename.spec.js` |
| #116 | 当てる図を選ぶ | 当てる図を先に数えて選ぶ・絞る | ⇄ 一括置換のパネル | 選んだ図だけに当てる | `tests/e2e/legacy/blk-primary-0723-wish-folder-impact.spec.js` |

## 配布と確かめる入口

| 整理表 | 機能 | できること | 入口 | 振る舞い | 確かめる |
|---|---|---|---|---|---|
| #15 #170 | Windows 単体アプリ | Python・Java を入れずに portable zip かインストーラで使う(固有アイコン、落ちたときは crash.log と日本語の知らせ) | `start.bat`、`PlantUMLAssist.exe`(`packaging/` と `app.py` から作る) | ローカルで描き、外へ送らない | `tests/blk-human-20260915-1200-portable-crash.test.js` |
| #171 | 版ごとの配布物 | タグを打つと setup.exe と portable.zip を Releases に付ける | `.github/workflows/windows-app.yml` | 図や本文は含めない | `tests/blk-human-2200-app-bridge.test.js` |
| #172 | 更新を確認 | 新版・変更点・インストーラの取得先を開く(自動では取らない) | ⚙ 設定 → 情報「更新を確認」 | 図や本文は送らない | `tests/blk-human-20260917-0900-update-install.test.js` |
| #169 | アイコンを作る道具 | 配布のアイコンを作る | `tools/ico.js`・`tools/make-icon.js` | 製品の画面には出ない | `tests/ico.test.js` |
| #156 | 確かめる入口 | 準備・unit・台本の scenario をまとめて回す | `scripts\build.ps1`・`scripts\test.ps1`・`scripts\verify.ps1` | 試験の保存先は `PUA_DATA_ROOT` の試験用フォルダだけ | `tests/e2e-servers.test.js` |
