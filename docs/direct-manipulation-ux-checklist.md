# 直接操作 UX 設計チェックリスト

2026-04-20 Sequence 図の UX 改善サイクルで得られた観点のまとめ。他の図形
(Class, State, Activity, Flowchart 等) を新規に実装・改修する際の参照資料。

「作れる」と「使える」の間にある品質の差分を、具体的な失敗パターンと対策の
ペアで列挙する。全項目を新規実装時に順に確認すること。

---

## 観点 A: 全要素が "選択可能" であること

図上に見えている情報 = 編集可能な単位、というメンタルモデルを守る。
**片方だけクリックできて、残りは DSL 直書き** になると編集フロー全体の
信頼性が崩れる。

### チェック項目

- [ ] ラベル有無に関わらず要素が選択できる
  - 失敗例: `<g class="message">` に `<text>` が無い (矢印のみ) と bbox が
    null で選択不可になる
  - 対策: `<line>` 等の幾何要素から bbox を自前計算するフォールバック
- [ ] 小さすぎて掴めない要素には当たり判定を広げたクリックボックスを置く
  - 失敗例: `<rect width="1" height="1">` プレースホルダ + `pointer-events:none`
    で物理的にクリック不能
  - 対策: 対象の近傍に 20px 以上の高さの透明 rect を配置
- [ ] 対称要素の両端 (head / tail, start / end) のどちらでも選択可能
  - 失敗例: participant の上端だけ選択対象になっていて下端が反応しない
  - 対策: 同じ `data-id` を持つ複数 rect を生成し、どこをクリックしても同じ
    selection に解決される状態にする
- [ ] 線や帯のような細要素はクリック幅を padding して確保
- [ ] 重ね描画 (group bbox が複数レイヤで描画される) は x,y,w,h で dedup してから
    source DSL と 1:1 対応させる

## 観点 B: 再クリック = 選択解除 (toggle)

選択済み要素を再クリックしたら選択解除される。「どうやって選択を解除するのか」を
ユーザーに考えさせない。

### チェック項目

- [ ] `setSelected([item])` の代わりに **toggle 関数** を使う
  - 失敗例: click ハンドラが毎回 `setSelected([newItem])` するので
    「同じものをクリック」したときに UI に変化なし → 選択解除の方法が不明
  - 対策: 同一 id+type+line の単独選択中なら `clearSelection()`、それ以外は
    `setSelected([newItem])` (または `selectItem` ヘルパー)
- [ ] Shift+クリックで複数選択/個別解除 (multi toggle) がサポートされる

## 観点 C: 選択中 = 編集モード

選択状態は「この要素を今編集している」という明示的なモード。他の
「新規挿入」系アクションは抑制して混乱を避ける。

### チェック項目

- [ ] 選択中は hover/insert 系の視覚ガイドを表示しない
  - 失敗例: ユーザーが要素を選択 → 別の場所にマウスを移動すると挿入ガイド
    線が出る → 「ここをクリックすれば挿入できる」と示唆してしまう
  - 対策: mousemove ハンドラで `selection.getSelected().length > 0` を
    チェックし、ガイドをクリア
- [ ] 選択中の空白クリックは **選択解除のみ**、挿入 popup は開かない
  - 失敗例: 空白クリックで「選択解除」と「挿入 popup」が同時発火 →
    解除後に挿入フォームが出て、ユーザは2つの別操作が起きたと錯覚
  - 対策: popup を開く前に `selection.getSelected().length === 0` を確認
- [ ] 選択状態になった瞬間に古いガイドは即クリア (mousemove を待たずに
    selection onChange で消す)

## 観点 D: テキスト入力の連続性

「編集中にレンダリングが挟まって入力がブツ切れになる」 = 致命的な UX 崩壊。
render を走らせるタイミングを厳密に設計する。

### チェック項目

- [ ] 入力の各 keystroke では textarea / input の値を壊さない
  - 失敗例: `input` イベントで即座に parse → re-render → textarea を
    再構築 → focus 消失
  - 対策: `input` はプレビュー更新まで、DSL への反映 (change event) は
    blur 時に発火
- [ ] ツールバー経由の編集は blur しないので、`change` を明示 dispatch
  - 失敗例: B/I/U/色ボタンは click 後も focus 保持 (blur しない) →
    `change` 発火せず DSL に反映されない
  - 対策: `insertWrapAtSelection` 等の直後で `new Event('change', {bubbles:true})`
    を dispatch
- [ ] Enter キーで改行挿入した後も textarea 内に focus が残る
- [ ] debounce は **150ms 以下** (300ms は体感的に遅い)
- [ ] 連続編集で render キューが溜まらないよう、trailing edge のみ発火

## 観点 E: 履歴 (Undo / Redo) の粒度

「Ctrl+Z が効かない」 = 失敗した編集を戻せない恐怖感。

### チェック項目

- [ ] **直接操作系 (drag, click for color change, etc.) も履歴に積む**
  - 失敗例: drag でアクター移動した後に Ctrl+Z しても、テキスト編集系しか
    戻らない → 「ドラッグで壊した」と感じる
  - 対策: drag の mouseup (実際に DSL が変化したタイミング) で `pushHistory()`
- [ ] **text が実際に変わったときだけ** push
  - 失敗例: drag の目的地が元と同じ場合に no-op push → Ctrl+Z を何度
    押しても「同じ状態」に戻るだけで体感的に undo が壊れる
  - 対策: `if (newText !== mmdText) pushHistory()` のガード
- [ ] Undo された結果から再度編集を続けられる (編集バッファが復元される)

## 観点 F: レスポンシブネス

「操作してから結果が見えるまでの時間」は直接 UX の信頼感に影響する。

### チェック項目

- [ ] debounce は 150ms 以下 (2次指令として 100ms 前後が望ましい)
- [ ] 外部プロセス起動コスト (JVM / subprocess 等) を毎回払わない
  - 対策例: JVM を常駐化 (stdin/stdout pipe で再利用)
- [ ] debounce で trailing edge 単発発火、連打でも最後の1回しか render しない
- [ ] 編集→反映の初回は warmup コスト許容、2回目以降は 50ms 以下を目標
- [ ] 外部ネットワーク依存 (plantuml.com 等) は**警告バナー**を明示

## 観点 G: 視覚検証 (Visual Verification Gate)

CLAUDE.md の運用ルール: GUI 描画に影響する変更は、unit tests GREEN だけでは
マージ許可しない。

### チェック項目

- [ ] GUI 影響のある変更は Playwright MCP で実機スクリーンショット検証
- [ ] Evaluator エージェントで報告書が生成される
- [ ] 視覚的な regression (色崩れ, 位置ズレ, 要素消失) を unit tests では検出
      できないことを前提にする
- [ ] 修正した機能だけでなく、周辺機能に**副作用が出ていない**ことも確認

## 観点 H: 摩擦の排除 (micro-UX)

1つ1つは小さい苛立ちが積み上がると「使いにくい」という印象になる。

### チェック項目

- [ ] Windows で外部プロセスを起動する際は `CREATE_NO_WINDOW` でコンソール
    点滅を抑制
- [ ] ドラッグゴースト / カーソル変化 / ドロップインジケータ等のビジュアル
    フィードバックを必ず提供
- [ ] 操作可能な要素には `cursor: pointer` / `cursor: grab` を明示
- [ ] エラーメッセージは原因と対処を1文で書く
- [ ] 頻出操作 (挿入, 削除, 色変更) はキーボードショートカットやプロパティ
    パネルボタンを用意

## 観点 I: セキュリティ / ライセンス

個人開発ツールでも配布時に問題になる項目。

### チェック項目

- [ ] ローカル HTTP サーバーは **127.0.0.1 bind 固定** (`0.0.0.0` 禁止)
  - 失敗例: 外部ライブラリ (picoweb 等) が LAN 公開で待ち受けて、同一
    Wi-Fi の他端末から到達可能になる
  - 対策: CLI で bind 指定できないなら pipe 通信等のソケット不使用手段を選ぶ
- [ ] 外部プロセスの出力は subprocess の stdout/stderr で捕捉、**untrusted
    shell execution を避ける**
- [ ] サードパーティバイナリ (plantuml.jar 等) は**同梱しない**か、同梱する
    なら配布元ライセンスを README に明示
  - 本プロジェクトのライセンスと混ざらないよう `.gitignore` で除外し、
    fetch スクリプトで利用者に取得させる方針が簡潔
- [ ] 外部サービスへの送信は**警告バナー**で明示 (DSL に業務データが
    含まれる可能性)

## 観点 J: 仕様 / 実装の座標系整合

API を跨いだ index / ID の解釈ズレは、表面上は動いているように見えて
内部で静かにバグる。

### チェック項目

- [ ] **同一要素の重複表現は id で dedup**、座標値で dedup しない
  - 失敗例: participant 1つ = head/tail/lifeline の 3 rect で、x 座標が
    微妙に違う (lifeline は中心線に揃う) ため、座標丸め dedup が破綻
  - 対策: `data-id` や `alias` 基準で dedup
- [ ] **gap index と array index を混同しない**
  - 失敗例: N 要素の配列に対し挿入先は N+1 個の gap (両端 + 要素間)。この
    N+1 を N 要素の配列 index (0..N-1) と混同するとクランプで末尾が潰れる
  - 対策: API の docstring に「これは gap index か array index か」を明示
- [ ] 削除操作があると下流 index が 1 ずれる — 追加処理で補正
- [ ] 座標系ズレは unit test だけでは検出できないので **実機スクショ検証**

## 観点 K: ブランチ / PR 運用

連続する複数の改善を扱う際の摩擦を減らす。

### チェック項目

- [ ] 連続する開発は stack する (PR B の base = PR A の branch)
- [ ] 先行 PR がマージされたら後続 PR の base を master に手動変更
  (`gh pr edit --base master`)
- [ ] Rebase で同内容の重複コミットは git が自動で drop ("patch contents
  already upstream")
- [ ] master への直接 commit 禁止 (必ず feature branch)
- [ ] 破壊的操作 (force-push, repo 削除, 履歴書き換え) は事前の明示承認必須

---

## 図形別の事前チェック

**新規図形を実装する前に**:

1. DSL の**追加**だけでなく、以下の**修正フロー**も設計に含まれているか
   - 途中への挿入
   - 順序並び替え
   - 既存要素への注釈追加
   - 制御構造 (alt, loop, condition) で既存要素を囲む
2. SVG に重複要素 (head/tail/lifeline のような多重表現) があるか調査。
   dedup は id 基準で統一
3. 選択可能な要素を列挙して、**全要素が実際にクリックで反応する**か確認
4. Undo でユーザーの直前操作 (drag / rename / color) が戻せるか確認
5. 選択状態と挿入/hover アクションの競合を洗い出す

## 参考コミット (PlantUMLAssist feat/local-render-daemon)

- `perf(local-render): persistent JVM daemon + suppress console flash` — 観点 F, H
- `fix(sequence): suppress insert popup during drag + toggle-off on re-click` — 観点 B, C
- `fix(sequence): participant drag now lands at the indicated gap` — 観点 J
- `fix(sequence): suppress hover-insert guide while something is selected` — 観点 C
- `chore(lib): unbundle plantuml.jar — fetch script + docs` — 観点 I
- (issue26041901 関連) 全要素選択可能化 — 観点 A
