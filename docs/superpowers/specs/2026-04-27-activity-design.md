# Activity Diagram Design (v0.7.0)

- **作成日**: 2026-04-27
- **対象**: PlantUMLAssist v0.7.0 — Tier1 ロードマップの 5 番目の図形 (Activity diagram、最初から overlay-driven)
- **base ブランチ**: `feat/class-v0.6.1` (PR #7 + #8 が master に merge される前提)
- **次ブランチ**: `feat/activity-v0.7.0`
- **親 spec**: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md` § 3.5
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

---

## 1. 背景と動機

v0.6.1 までで Sequence / UseCase / Component / Class の 4 図形が overlay-driven で完成。Tier1 master § 4.1 によれば v0.7.0 は **Activity diagram** で、初期から overlay-driven で実装する。

Activity diagram は **Tier1 中で最大の難所**:

- 制御構造 (if/while/fork) が深くネストする → DSL 木構造の parser
- 複数行 action label → v0.6.1 で追加した `extractMultiLineTextBBoxes(g, {mode:'tspan-per-line'})` の最初の実機検証
- 新記法 / legacy 記法の二重表記が PlantUML 仕様内に共存 → canonical 化方針確定

v0.7.0 のゴール:

1. **新記法 primary** (start / stop / end / action / if/elseif/else/endif / while/endwhile / repeat/repeat while / fork/fork again/end fork)
2. **Legacy parse-only** (旧記法 `(*) --> :foo;` 形式は読み込み + 新記法に正規化、emit は新記法のみ)
3. **Swimlane (partition)** `|name|` ブロック
4. **Note** `note right` / `note left` (action 直後)
5. **Overlay-driven**: action rect / decision diamond / start-stop circle / fork bar / control-flow arrow を SVG で click 選択
6. ADR-109 で canonical DSL form を確定

---

## 2. 適用範囲 (in / out)

### v0.7.0 で達成する (in)

- 6 node kinds: `start` / `stop` / `end` / `action` / `decision` (if/while のヘッダ) / `merge` (endif/endwhile)
- 制御構造 4 種:
  - `if (cond) then (label)` ... `elseif (cond) then (label)` ... `else (label)` ... `endif`
  - `while (cond) is (label)` ... `endwhile`
  - `repeat` ... `repeat while (cond) is (label)`
  - `fork` ... `fork again` ... `end fork`
- Swimlane: `|swimlane name|` (partition の現代記法)
- Note: `note right` / `note left` の **1行 + 複数行** (`end note`)、action の直後に attached
- Property panel based 編集 (action text / 制御 condition / branch label / swimlane name / note text)
- Tail-add で各種ノード/制御構造/swimlane/note を追加
- Overlay click 選択 (action / decision / start-stop / fork bar)
- ADR-109: Activity canonical DSL form
- Legacy parse-only (新記法に正規化された normalized form を返すが emit は新記法のみ)
- E2E: 7 業務 UC (master spec § 9 の Activity 用に新規策定)
- Evaluator visual sweep (10-cell α/γ matrix)

### v0.7.0 では やらない (out → v0.7.1+ へ繰越)

- **detach / kill** — Tier2
- **rake** (subactivity 参照) — Tier2
- **connector** (`(A)` ラベル付き接続点) — Tier2
- **partition reuse** (同一 swimlane を非連続区間で出現) — Tier2
- **note on link** — Tier2
- **drag-to-reorder** action — v0.8.0+ で member drag と統合
- **graphviz layout 影響** (PlantUML が graphviz 経由で auto-layout する分の検証) — best-effort、SVG 構造の安定性は仕様外

---

## 3. Sprint 構造 (4-Phase, ~28 commits)

```
Phase 0: ADR + ブランチ + テンプレート (~2 commits)
   └─ ADR-109: Activity canonical DSL form (新記法 primary)
   └─ feat/activity-v0.7.0 branch (派生元: feat/class-v0.6.1)
   └─ design + plan commit

Phase A: Parser (~10 commits)
   └─ start/stop/end (3 keyword)
   └─ action `:text;` (single-line)
   └─ multi-line action (バッククオート / 複数行 ; 終端)
   └─ if/elseif/else/endif (recursive)
   └─ while/endwhile (recursive)
   └─ repeat / repeat while (recursive)
   └─ fork / fork again / end fork (recursive)
   └─ swimlane (partition pseudo-block)
   └─ note right / note left (1行 + 複数行)
   └─ legacy parse → 新記法 normalize
   └─ detectDiagramType に Activity 判定追加

Phase B: Updater + UI (~10 commits)
   └─ formatter: 各 kind ごとの canonical emit
   └─ add/update/delete ops (action / control / swimlane / note)
   └─ buildOverlay: 6 種 SVG 形状の overlay rect 生成
   └─ renderProps: 4 layouts (action edit / control edit / swimlane edit / note edit + multi-select 不対応)
   └─ Tail-add UI (kind selector with 制御構造 wizard)
   └─ HTML / parser-utils / module 登録

Phase C: E2E + Visual sweep (~4 commits)
   └─ Activity UC × 7 件 (start-to-stop / action chain / simple if / nested if / while / fork / swimlane)
   └─ extractMultiLineTextBBoxes tspan-per-line mode 実機検証
   └─ Evaluator dispatch + 必要なら hotfix

Phase D: Docs + PR (~2 commits)
   └─ README + CHANGELOG v0.7.0
   └─ PR description draft
```

推定合計: ~28 commits, 1 sprint。

---

## 4. データモデル

```javascript
// parse() 戻り値
{
  meta: { title: string, startUmlLine: number | null },
  nodes: [Node, ...],   // top-level node list (recursive 構造を含む)
  swimlanes: [{ id, label, line, endLine }, ...],
  notes: [{ id, position, attachedNodeId, text, line, endLine }, ...],
}

// Node 共通
{
  kind: 'start' | 'stop' | 'end' | 'action' | 'if' | 'while' | 'repeat' | 'fork',
  id: string,           // module 内 unique '__a_<N>'
  line: number,         // 開始行
  endLine: number,      // 制御構造の場合は対応する閉じ行 (endif/endwhile/end fork)、それ以外は line と同じ
  swimlaneId: string | null,  // 所属 swimlane (top-level swimlane block)
}

// kind: 'start' / 'stop' / 'end'
// (追加フィールドなし)

// kind: 'action'
{
  ...Node,
  text: string,         // ':...;' から抽出した text (\n を含むことがある)
}

// kind: 'if' (decision)
{
  ...Node,
  condition: string,    // '(cond)' から抽出
  branches: [
    { kind: 'then'|'elseif'|'else', condition?: string, label: string, body: [Node, ...], line, endLine }
  ],
}

// kind: 'while'
{
  ...Node,
  condition: string,
  label: string,        // 'is (label)' の label, 省略可
  body: [Node, ...],
}

// kind: 'repeat'
{
  ...Node,
  condition: string,    // 'repeat while (cond)' の cond
  label: string,
  body: [Node, ...],
}

// kind: 'fork'
{
  ...Node,
  branches: [{ body: [Node, ...], line, endLine }],
}
```

Note の `attachedNodeId` は `node.id` を参照。Action ノードの直後に出現した note を attach する。

---

## 5. ADR-109 — Activity Canonical DSL Form (要点)

PlantUML Activity の表記揺れを canonical 化:

| バリエーション | canonical |
|---|---|
| `start` / `:start;` (legacy) | `start` (専用キーワード) |
| `stop` / `:stop;` | `stop` |
| `end` / `:end;` | `end` |
| `:action;` (1行) / `:action\nmore\n;` (複数行) | `:action;` for 1-line / `:line1\nline2;` for multi-line (preserve original text) |
| `if (cond)` / `if (cond) then` / `if (cond) then (yes)` | `if (cond) then (yes)` (label 省略時 `yes` を補完) |
| `else` / `else (no)` | `else (no)` (label 省略時 `no` を補完) |
| `endif` (空白揺れ) | `endif` |
| `while (cond) is (yes)` / `while (cond)` | `while (cond) is (yes)` (label 省略時 `yes` を補完) |
| `endwhile` (空白揺れ) | `endwhile` |
| `repeat` ... `repeat while (cond)` | `repeat ... repeat while (cond) is (yes)` (label 省略時 `yes` を補完) |
| `fork again` (空白揺れ `forkagain`) | `fork again` (空白入り) |
| `end fork` (空白揺れ `endfork`) | `end fork` |
| Legacy `(*) --> :foo;` | 新記法に変換 (`start` + `:foo;` + 後続 transition は順次連結) |
| Swimlane: `|color|name|` (色付き) | v0.7.0 では color 部分を捨てて `|name|` のみ canonical (色は v0.7.1 へ繰越) |
| Note: `note right`, `note left` | 1行 / 複数行は class v0.6.1 と同じ自動判定 |

ADR-109 として `docs/adr/ADR-109-activity-canonical-form.md` に記載。

---

## 6. Property Panel UI

### 6.1 Action 選択時

```
┌─ Action (L5) ─────────────────────────────┐
│ Swimlane: Frontend  ← read-only           │
│ Text:                                     │
│ ┌─────────────────────────────────────┐   │
│ │ ユーザーが                          │   │
│ │ ログインボタンを押す                │   │
│ └─────────────────────────────────────┘   │
│ ─ Notes ─────                             │
│   ▸ right "TODO: i18n"      [edit][✕]    │
│ [+ Note]                                  │
│ [↑ 上へ] [↓ 下へ] [✕ 削除]                │
└────────────────────────────────────────────┘
```

multi-line text は textarea。Note 一覧 + 追加 (Class v0.6.1 と同パターン)。

### 6.2 If/While/Repeat/Fork 選択時 (control-structure)

```
┌─ If decision (L8) ─────────────────────────┐
│ Condition: [認証成功?]                    │
│ ─ Branches ─                              │
│ ▸ then (yes)        edit body / [✕ branch] │
│ ▸ elseif (期限切れ?) then (yes) [✕]        │
│ ▸ else (no)         edit body              │
│ [+ elseif]                                 │
│ [↑ 上へ] [↓ 下へ] [✕ 構造ごと削除]        │
└────────────────────────────────────────────┘
```

各 branch の body は read-only navigable (click でその branch 内の最初の action にフォーカス移動)。`+ elseif` で elseif branch 追加。`[✕ branch]` で個別 branch 削除 (then は削除不可、else は最後の場合のみ削除可)。

### 6.3 Swimlane 選択時

```
┌─ Swimlane "Frontend" (L3) ─────────────────┐
│ Name: [Frontend]                          │
│ ─ Nodes (read-only) ─                      │
│   • Action: ユーザーがログイン... (L5)     │
│   • Action: ボタン押下 (L7)                │
│   • If: 認証成功? (L8)                     │
│ [↑ 上へ] [↓ 下へ] [✕ swimlane 解除]        │
└────────────────────────────────────────────┘
```

`✕ swimlane 解除` は swimlane キーワードのみ削除 (内部 node はそのまま、外側 swimlane に merge)。

### 6.4 Note 選択時 (Class v0.6.1 と同じ pattern)

position 切替 + textarea + delete。

### 6.5 No selection 時 (Tail-add)

```
Kind: [Action ▾]
  → Text textarea + [+]
Kind: [If decision ▾]
  → Condition + then label + else label + [+] (空 if/else/endif スケルトン挿入)
Kind: [While loop ▾]
  → Condition + label + [+] (空 while/endwhile)
Kind: [Repeat loop ▾]
  → Condition (repeat while 部分) + label + [+] (repeat ... repeat while)
Kind: [Fork ▾]
  → Branch count (default 2) + [+] (fork ... fork again × N-1 ... end fork)
Kind: [Swimlane ▾]
  → Name + [+] (空 swimlane block)
Kind: [Start/Stop/End ▾]
  → kind selector + [+]
Kind: [Note ▾]
  → Target action selector + position + textarea + [+]
```

---

## 7. Overlay 設計

### 7.1 PlantUML Activity SVG の構造

PlantUML が graphviz 経由で auto-layout するため、Activity SVG は **`<g class="entity">` ベースではなく座標ベースの polygon / ellipse / rect の集合**。

| node kind | SVG primitive |
|---|---|
| start | `<ellipse>` 黒塗り (rx≒rx≒10) |
| stop | `<ellipse>` ボーダー + 内側 `<ellipse>` 黒塗り (donut) |
| end | `<polygon>` 5 点 (X 形) または `<line>` × 2 |
| action | `<polygon>` 角丸長方形 (8 点 polygon、楕円弧 path) もしくは `<rect>` rounded + `<text>` |
| decision (if/while ヘッダ) | `<polygon>` 4 点 diamond |
| merge (endif/endwhile) | `<polygon>` 4 点 diamond (decision と同じ shape、重なり位置で判別) |
| fork bar | `<rect>` 細長 + 黒塗り (高さ ≦ 10) |
| swimlane境界 | `<line>` 縦長 + `<text>` ラベル |
| transition (arrow) | `<path>` (graphviz 経由の Bezier) |

### 7.2 Overlay matching 戦略

PlantUML SVG には `data-source-line` 属性が付かない (graphviz 経由のため)。**document order + shape signature** でマッチング:

1. SVG 全体を walk して shapes を kind 別に分類:
   - `<ellipse>` 単独 (rx>rx and stroke=none) → start
   - `<ellipse>` 入れ子 → stop / end
   - `<polygon>` 4 点 → decision / merge
   - `<polygon>` 8 点 + 角丸 path / `<rect>` rx>0 → action
   - `<rect>` 高さ < 10 + fill=#000 → fork bar
2. parsed.nodes を tree-flatten (depth-first) して順序付き node リスト L にする
3. SVG shape を kind-matched 順序で L と zip

複雑度高い。**フォールバック**: マッチング失敗時は overlay rect 生成スキップ + console.warn。Property panel リストから navigation で選択可能 (Class v0.6.1 のパターン踏襲)。

### 7.3 multi-line action label

PlantUML は `<text>` 1 つに `<tspan>` を複数並べて render (`:line1\nline2;` 形式)。`extractMultiLineTextBBoxes(g, { mode: 'tspan-per-line' })` を使用。

実機 SVG の検証は Phase C のチェックポイント (overlay 機能未動作なら hotfix or scope 縮小)。

---

## 8. テスト戦略

### 8.1 Unit (推定 +60 tests, 全体 ~474 tests)

| ファイル | 追加 tests | 内容 |
|---|---|---|
| `tests/activity-parser.test.js` (新規) | ~30 | 全 node kind / 制御構造 ネスト / swimlane / note / legacy parse normalization |
| `tests/activity-updater.test.js` (新規) | ~20 | formatter / add/update/delete each kind / canonical emit |
| `tests/activity-overlay.test.js` (新規) | ~10 | shape signature 分類 / 順序対応 |

### 8.2 E2E (推定 +7 tests)

`tests/e2e/activity.spec.js` (1 ファイル):

| UC | 業務状況 | 軸 | 主要操作 |
|---|---|---|---|
| 1 | start → action × 3 → stop | α | 直線フロー DSL emit |
| 2 | if/else with 2 branches | α | if/else/endif canonical |
| 3 | nested if (depth 2) | α | 入れ子整合性 |
| 4 | while loop with body | α | while/endwhile |
| 5 | fork with 3 branches | α | fork/fork again × 2 / end fork |
| 6 | swimlane with action | γ | swimlane 内 action 追加 |
| 7 | overlay click action → property panel edit | γ | overlay-driven 編集 |

### 8.3 Visual sweep (Evaluator)

10-cell matrix (各 UC × α/γ + nested + multi-line action) を Evaluator に dispatch。**観点 A/B/C/J 適用**。

### 8.4 Regression 防止

- v0.6.1 までの全 421 unit + 14 E2E が GREEN を維持

---

## 9. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| **再帰 parser の bug** | 制御構造ネストでパースが破綻 | recursive descent + 各 endXxx で stack pop verification、未閉 block を warn |
| **Legacy 記法 → 新記法 normalize の歪み** | 元 DSL 復元できない | normalize は parse 専用 (元 lines を内部保持しない)、user に説明 |
| **graphviz 経由の SVG 構造不安定** | Overlay click 不動作 | shape signature ベースのフォールバック + 順序対応失敗時は overlay skip & warn |
| **multi-line action `<tspan>` per-line bbox** | extractMultiLineTextBBoxes が想定と違う | Phase C で実機検証、想定外なら mode 切替 + 統合 test |
| **swimlane の境界が SVG では `<line>` (entity 化されない)** | swimlane click 選択が困難 | swimlane label `<text>` をクリック領域として overlay rect 生成、line は touch-area 補助 |
| **fork branches の order 安定性** | branches[] の順序が SVG と不一致 | parsed.nodes tree の DFS 順 = PlantUML emit 順 = SVG order の前提を test fixture で固定 |
| **note attachment の対象 action 解決** | note を action に紐付ける semantics が不安定 | parse 時 "直前の action ノード" に attach (PlantUML 仕様準拠)、attached 不能の note は dangling として meta.unattachedNotes に記録 |
| **Phase A の 10 commits が大きい** | 途中で context 散乱 | 1 commit = 1 機能で粒度を小さく刻む。各 commit で `node tests/run-tests.js` GREEN ゲート |

---

## 10. v0.7.1+ への明示繰越

以下は v0.7.0 に含めない:

- **detach / kill** — Tier2
- **rake** (subactivity ref) — Tier2
- **connector** (`(A)` 接続点) — Tier2
- **partition reuse** (同 swimlane 非連続区間出現) — Tier2
- **note on link** — Tier2
- **drag-to-reorder** action — v0.8.0+
- **swimlane color** (`|#color|name|`) — v0.7.1
- **legacy emit** — v0.7.0 では parse-only、emit を legacy に切替えるオプションは出さない

---

## 11. 開始手順

1. `feat/activity-v0.7.0` branch (`feat/class-v0.6.1` 派生済)
2. `docs/adr/ADR-109-activity-canonical-form.md` commit
3. writing-plans skill で `docs/superpowers/plans/2026-04-27-activity-v0.7.0.md` 策定
4. Phase A 実施: parser
5. Phase B 実施: updater + property panel + buildOverlay
6. Phase C 実施: E2E 7 UC + Evaluator visual sweep
7. Phase D 実施: README + CHANGELOG + PR
8. PR 作成 → user 承認後 master merge (CLAUDE.md 規約)
