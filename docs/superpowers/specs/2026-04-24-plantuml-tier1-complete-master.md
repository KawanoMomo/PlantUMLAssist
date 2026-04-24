# PlantUMLAssist Tier1 完備 マスタースペック

- **作成日**: 2026-04-24
- **ステータス**: 草稿
- **対象バージョン**: v0.3.0 〜 v1.0.0 (Tier1 全 6 図形完備)
- **先行 spec**: `2026-04-17-plantuml-assist-design.md` (v0.1.0 基礎設計)
- **姉妹 spec**: `2026-04-18-sequence-overlay-driven-redesign.md`, `2026-04-19-sequence-direct-manipulation.md`
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`
- **position**: 各図形 (UseCase / Component / Class / Activity / State) の詳細 spec の親。子 spec はこの方針に従って別途策定する。

## 1. ゴールとスコープ

### 1.1 ゴール

v0.2.0-beta 時点で Sequence Diagram のみが実装済。本マスタースペックは残り 5 図形を順次実装し、Tier1 全 6 図形を UI のみで完遂可能なレベルに仕上げるまでのロードマップ、共通基盤抽出方針、UX 基準、受け入れ基準を規定する。

### 1.2 スコープ

**対象図形 (Tier1 残り 5 図形)**

1. **Use Case Diagram** — ユースケース分析
2. **Component Diagram** — システムブロック
3. **Class Diagram** — OO 設計
4. **Activity Diagram** — 処理フロー (新記法 primary)
5. **State Diagram** — ステートマシン

**対象外 (本スペック範囲外)**

- Tier2+ 図形 (Deployment / ER / Gantt / Mindmap / WBS / JSON / YAML / Salt / Timing / Network / Block / Chronology)
- Sequence Diagram の追加改修 (別スプリントで扱う)
- MermaidAssist 側への逆流用 (別プロジェクト)

### 1.3 前提 / 継承事項

- `2026-04-17-plantuml-assist-design.md` の全体アーキテクチャ (Python backend, DiagramModule v2, render pipeline) を継承
- ADR-101〜104 を継承、図形別 spec で必要に応じて ADR-105+ を追加
- `direct-manipulation-ux-checklist.md` の観点 A〜K を全図形で適用
- CLAUDE.md Visual Verification Gate (ADR-014) を全 PR で遵守

## 2. 実装ロードマップ

### 2.1 スプリント計画

| Version | 主要スプリント | 目的 |
|---|---|---|
| v0.2.x | (完了) | Sequence MVP + overlay redesign + direct manipulation |
| **v0.3.0** | **S0 (軽量共通抽出) + UseCase MVP** | 純粋関数レベルの共通基盤抽出、UseCase は form ベース MVP |
| **v0.4.0** | **Component MVP + S1.5 (本丸共通抽出)** | UseCase と sequence.js を比較して overlay/selection/props/updater の本丸を抽出、Component は新 API で実装 |
| **v0.5.0** | **UseCase/Component の overlay-driven 化** | MVP で先送りした UX 層を揃える |
| **v0.6.0** | **Class MVP + overlay-driven** | 初期から overlay 駆動で実装 (本丸共通基盤使用) |
| **v0.7.0** | **Activity MVP + overlay-driven** | 新記法 primary、legacy parse-only |
| **v1.0.0** | **State MVP + overlay-driven + Tier1 完備テスト** | 階層状態機械 1 段ネスト、Visual Sweep 全図形 |

### 2.2 実装順の根拠 (案β: 易→難)

- **UseCase**: Sequence に最も近い構造 (要素 + 関係) → 共通基盤抽出の最初の実証対象
- **Component**: 階層ネスト (package内) の導入 → Class/State の前哨戦
- **Class**: クラス本体内のネスト (属性/メソッド) → 最大の DSL parser 複雑度
- **Activity**: 制御構造の深い入れ子 (if/while/fork) → DSL 木構造の難所
- **State**: 階層状態機械 (composite state) → 最後の大物、04_StableState 的な領域

### 2.3 マイルストーン

- **v0.4.0 達成時**: 共通基盤抽出が完了し、以降の図形実装コストが定量化できる状態
- **v0.6.0 達成時**: Tier1 の半分 (Sequence + UseCase + Component + Class) が overlay-driven で揃う
- **v1.0.0 達成時**: Tier1 全 6 図形が UC すべて UI で完遂

## 3. 図形別 DSL coverage (v1.0 必須セット)

各図形の v1.0 必須 DSL 要素。Tier2 候補 (generics の深いネスト、network diagram 等) は除外。

### 3.1 Sequence Diagram (既実装 / 参考)

`participant`, `actor`, `boundary`, `control`, `entity`, `database`, `queue`, `collections`, message (10 arrow types), `note left of / right of / over`, group (`alt`/`opt`/`loop`/`par`/`break`/`critical`/`group` + `else` + `end`), `activate`/`deactivate`/`create`/`destroy`, `autonumber`, `title`.

### 3.2 Use Case Diagram (v0.3.0)

- **要素**: `actor`, `usecase`, `:NAME: as ALIAS` alias 構文, `rectangle` / `package` 境界
- **関係**: 関連 `--`, 汎化 `<|--`, include `.>` + `<<include>>`, extend `.>` + `<<extend>>`
- **スタイル**: ステレオタイプ `<<actor>>` など (表示のみ、parse)
- **除外**: 色指定、skinparam (Tier2)

### 3.3 Component Diagram (v0.4.0)

- **要素**: `component`, `interface`, `[NAME]` 省略記法, `port`, `package` / `folder` / `frame` / `node` のネスト境界
- **関係**: 接続 `--`, 依存 `..>`, provides/requires (lollipop: `component -() interface` / `interface )- component`)
- **ネスト**: package 内 component の多段ネスト (v1.0 は 2 段まで)
- **除外**: cloud/database ノード種別 (Tier2)

### 3.4 Class Diagram (v0.6.0)

- **要素種**: `class`, `interface`, `abstract class`, `enum`
- **メンバー**: 属性 (`+/-/#/~` visibility + 型)、メソッド (シグネチャ + return type)、static/abstract 修飾子
- **関係**: 6 種 — 関連 `--`, 集約 `o--`, コンポジション `*--`, 継承 `<|--`, 実装 `<|..`, 依存 `..>`
- **拡張**: ステレオタイプ `<<Entity>>`, `<<interface>>`, generics `ClassName<T>`, `Map<K,V>`
- **ネスト**: `package` 内 class, `namespace` (v1.0 は 2 段まで)
- **除外**: 内部クラス (クラス内 class 定義)、note on class (Tier2)

### 3.5 Activity Diagram (v0.7.0)

- **表記法**: **新記法のみ emit**、legacy (`:foo;\n(*) --> :foo;` 形式) は **parse-only** (正規化して新記法に変換可能)
- **要素**: `start`, `stop`, `end`, action `:text;`, `if (cond) then (branch) ... else (branch) ... endif`, `while (cond) ... endwhile`, `repeat` / `repeat while`, `fork` / `fork again` / `end fork`
- **レーン**: `|swimlane name|` (partition)
- **ノート**: `note right` / `note left`
- **除外**: detach/kill, rake, connector (Tier2)

### 3.6 State Diagram (v1.0.0)

- **要素**: simple state `state NAME`, initial `[*]`, final `[*]`, transition `-->`
- **トリガー**: guard `[cond]`, action `/action` (transition ラベル内)
- **階層**: composite state (1 段ネスト) `state NAME { ... }`
- **特殊 state**: history `[H]` / deep history `[H*]`, choice (ダイヤ)
- **ノート**: `note right of` / `note left of`
- **除外**: 2 段以上のネスト、concurrent region (fork within state) は Tier2

## 4. 共通基盤抽出方針

### 4.1 S0 軽量抽出 (UseCase 着手前、v0.3.0 の Sprint 0)

目的: **自明に共通な純粋関数**のみ抽出。regression リスクを最小化。

| 新設モジュール | 役割 | 出所 |
|---|---|---|
| `core/dsl-utils.js` | `unquote(s)`, `quote(s)`, `escape(s)`, PlantUML コメント判定 (`'` 始まり) 等 | `sequence.js` から抽出 |
| `core/regex-parts.js` | PlantUML 共通 regex 部品 — identifier, quoted-name, arrow-token、`@startuml`/`@enduml` 判定 | `sequence.js` の定数から抽出 |
| `core/line-resolver.js` | SVG 要素の `data-source-line` / `data-line` から model 要素への解決関数 | `sequence.js` の overlay helper から抽出 |
| `core/formatter-interface.js` | `fmtMessage`/`fmtNote`/`fmtParticipant` 等が準拠する形式契約 (JSDoc でインターフェース記述) | 新規記述 |

**S0 の厳格な除外対象 (ここに入れない)**: overlay builder, selection router, props renderer, DSL updater (insertBefore/wrapWith 等)。これらは UseCase 実装後の S1.5 で抽出する。

**S0 の完了基準**:
- sequence.js が上記 4 モジュールを import して動作 (既存 unit + e2e PASS)
- sequence.js の行数が 1,311 → 1,150 前後に減少 (純粋関数の物理移動のみ)
- 新モジュール個別に unit tests を追加 (各 5-10 tests)

### 4.2 S1 UseCase 実装 (v0.3.0 本編)

- S0 抽出した core を利用し、UseCase モジュール (`src/modules/usecase.js`) を実装
- **overlay / selection / props / updater は sequence.js のパターンを模倣した二重実装**を許容
- form ベース MVP (overlay-driven は v0.5.0 に後送)
- UseCase の UC 数: 5-6 件で十分 (詳細は子 spec で定義)

### 4.3 S1.5 本丸抽出 (v0.4.0 の Sprint 冒頭)

目的: UseCase 実装完了時点で sequence.js と usecase.js を並べ、**実証ベースで共通 API を確定**する。

| 新設モジュール | 役割 | 抽出ソース |
|---|---|---|
| `core/overlay-builder.js` | SVG 要素上に透明 rect 等を重ねる汎用 builder。`data-id`, `data-type`, `data-line` 属性を一貫性ある形で付与 | sequence.js `buildOverlay` + usecase.js 相当部 |
| `core/selection-router.js` | click / shift-click / toggle / range-select の汎用ハンドラ。`direct-manipulation-ux-checklist.md` 観点 A〜C を実装レベルで強制 | sequence.js `selection` 連携部 + usecase.js 相当部 |
| `core/props-renderer.js` | selection 状態 → panel レイアウト (no-selection / single / multi / range) の汎用ルータ | sequence.js `renderProps` の構造抽出 |
| `core/dsl-updater.js` | `insertBefore`, `insertAfter`, `wrapWith`, `unwrap`, `renameWithRefs` の汎用オペレータ | sequence.js `operations` の一般化 |

**S1.5 の完了基準**:
- Component 実装 (v0.4.0 本編) がこれら 4 モジュールだけで overlay-driven UX を構成できる
- sequence.js / usecase.js を新 API で再実装して差分 PASS (機能 regression なし)
- 純増行数より純減行数が大きい (重複排除を定量確認)

### 4.4 抽出を見送るケース

S1.5 でも抽出しないと判定すべきケースを事前定義:

- Class/Activity/State 固有の構造 (属性リスト、制御構造木、composite state 階層) は各モジュール内に留める
- 2 モジュール間でしか使われない helper は core に上げない (Rule of Three: 3 モジュールで重複したら抽出)

## 5. UX 要件 (`direct-manipulation-ux-checklist.md` 適用)

### 5.1 適用マトリクス (v1.0 時点で全セル ✅ 必須)

| 観点 | 対象 | Sequence | UseCase | Component | Class | Activity | State |
|---|---|---|---|---|---|---|---|
| A. 全要素選択可能 | 全図形 | ✅ | (v0.5) | (v0.5) | (v0.6) | (v0.7) | (v1.0) |
| B. 再クリック toggle | 全図形 | ✅ | (v0.5) | (v0.5) | (v0.6) | (v0.7) | (v1.0) |
| C. 選択中 = 編集モード | 全図形 | ✅ | (v0.5) | (v0.5) | (v0.6) | (v0.7) | (v1.0) |
| D. テキスト入力連続性 | 全図形 (debounce 150ms) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E. Undo/Redo 粒度 | 全図形 (drag も履歴) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F. レスポンシブネス | render pipeline (JVM daemon は既存) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G. Visual Verification | 全 PR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H. 摩擦排除 (micro-UX) | 全図形 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I. セキュリティ/ライセンス | server.py, lib | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J. 座標系整合 | overlay 実装箇所 | ✅ | (v0.5) | (v0.5) | (v0.6) | (v0.7) | (v1.0) |
| K. ブランチ/PR 運用 | 全スプリント | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 5.2 overlay-driven 化の段階適用ルール

- **MVP フェーズ (v0.3.0, v0.4.0 での UseCase/Component 初回実装)**: form ベースで可。観点 A/B/C/J の "要素選択" 系列が未達で OK
- **overlay 化フェーズ (v0.5.0)**: UseCase/Component を overlay-driven に揃える
- **以降 (v0.6.0+)**: 新規図形は**最初から** overlay-driven で実装 (v1.0 に向けて後戻りゼロ)

### 5.3 修正フロー UC の網羅 (`dsl-editor-spec-checklist` 適用)

各図形の子 spec では、以下の修正フローを UC に含めることを required:

1. **途中挿入** (既存要素間に新要素を入れる)
2. **順序並び替え** (drag or move-up/down)
3. **既存要素への注釈追加** (note / stereotype / comment)
4. **制御構造で既存を囲む** (Class なら package、Activity なら if-else、State なら composite state)

これらが欠けた spec は不合格として差戻。

## 6. テスト戦略

### 6.1 Unit Tests (Node runner)

- 各モジュール: parser / updater で 15-20 tests
- 共通 core モジュール: 各 5-10 tests (S0 / S1.5 抽出時に追加)
- 合計 v1.0 時点: 約 120-150 tests

### 6.2 E2E Tests (Playwright)

- 各図形: switch + render + add/update/delete + overlay selection で 8-10 tests
- 共通: render-mode 切替、エラーハンドリング、online 警告バナーで 5 tests
- 合計 v1.0 時点: 約 55-65 tests

### 6.3 Visual Sweep (evaluator エージェント)

- 全図形ローテーションで `.eval/sprint-*/` に証拠バンドル生成
- 各図形リリース時に console error = 0, visual regression = 0 を確認
- CLAUDE.md ADR-014 (Visual Verification Gate) 準拠

### 6.4 render モード両系統

- local (Java daemon) / online (plantuml.com) の両方で E2E 全件 PASS 必須
- CI 相当では local のみ、手動スポットで online 確認 (plantuml.com レート制限のため)

## 7. 想定リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| S0 抽出の過剰 (overlay/selection まで入れてしまう) | S1.5 で全部やり直し、コスト 2 倍 | S0 の範囲を純粋関数に厳格限定。レビュー時に overlay/selection/props/updater がゼロであることを確認 |
| S1.5 の本丸抽出が実証不足で fragile | Component 以降で API 破綻 | UseCase + sequence.js 2 実証体を必ず refactor して pass 確認、Component 実装時に 3 番目の検証 |
| Activity legacy と新記法の二重保守 | parser 肥大化 + バグ混入 | legacy は parse → 新記法に正規化、emit は新記法のみ。往復テスト必須 |
| State composite state ネスト段数インフレ | parser 複雑化、UX 劣化 | v1.0 は 1 段ネストまで、それ以上は Tier2 スコープ |
| Class 属性/メソッド DSL の parser fragility | UC-2〜UC-8 相当で破綻 | plantuml.jar 公式サンプルを fixture 化、e2e で固める。visibility/generics/stereotype は個別 unit tests 密度高め |
| overlay-driven 段階適用期間の UX 非一貫 | v0.3〜v0.5 でユーザー混乱 | README に「図形ごとに UX 水準が異なる移行期」を明示、リリース note でフェーズ告知 |
| 個人開発で途中挫折 | Tier1 完備が未達 | 案β の易→難 順で「途中完了でも Sequence + UseCase + Component の 3 図形は完成」となる部分完了価値を確保 |
| MermaidAssist との ADR 番号衝突 | 引き継ぎ時混乱 | 本プロジェクトは ADR-101+ 固定、MermaidAssist は ADR-011+ の境界維持 |

## 8. 受け入れ基準 (v1.0)

### 8.1 機能完了基準

- Tier1 全 6 図形が UI から**単独で完遂可能** (各図形の全 UC で ✅)
- render モード local / online 両方で動作
- Tab-to-indent (workspace ADR-011)、Undo/Redo、コピペ、全図形で動作

### 8.2 品質基準

- **Unit tests**: 全 PASS (推定 120-150 tests)
- **E2E tests**: 全 PASS (推定 55-65 tests、local + online 両モード)
- **Visual sweep**: 全図形で console error = 0, visual regression = 0
- **`direct-manipulation-ux-checklist.md` 観点 A〜K**: 全図形適用確認 (chart 8 セル全て ✅)
- **ESLint / prettier**: warning 0 (既存プロジェクト規約に従う)

### 8.3 ドキュメント基準

- README 更新: 図形別サンプル、DSL coverage 一覧、render モード切替手順
- CHANGELOG: v0.3.0 〜 v1.0.0 の release notes 記載
- 各図形の spec が `docs/superpowers/specs/` に完備
- 各図形の plan が `docs/superpowers/plans/` に完備 (実装履歴として残す)
- ADR-105+ を必要に応じ追記

### 8.4 配布基準

- `lib/fetch-plantuml.sh` / `.ps1` が v1.0 時点で最新 plantuml.jar を取得できる
- `start.bat` ダブルクリックで v1.0 フル機能が立ち上がる
- GitHub public repo へ v1.0.0 tag を打ってリリース

## 9. 子 spec 策定ガイド

各図形の詳細 spec を策定する際、以下を必ず含める:

1. **業務 UC 一覧** (UseCase/Component: 5-6 件、Class/Activity/State: 8-10 件)
2. **UI Capability 一覧** (UC から導出、Sequence UC→Capability パターン踏襲)
3. **データモデル** (parser 出力形式)
4. **overlay-driven 仕様** (該当フェーズで) — 選択可能要素の列挙、data-attribute 契約
5. **DSL updater 仕様** — insertBefore/wrapWith/renameWithRefs 等の図形特有挙動
6. **ADR 新規分** (必要時)
7. **E2E シナリオ一覧** (UC をそのままテスト fixture として使う、use-case-driven-ui-spec skill 準拠)

子 spec テンプレート: 既存の `2026-04-18-sequence-overlay-driven-redesign.md` の章立てを流用可。

## 10. 開始手順

v0.3.0 スプリント着手時:

1. **新ブランチ作成**: `feat/tier1-usecase` (master 直接作業禁止)
2. **子 spec 策定**: `docs/superpowers/specs/YYYY-MM-DD-usecase-design.md`
3. **writing-plans skill で実装計画策定**: `docs/superpowers/plans/YYYY-MM-DD-usecase-v0.3.0.md`
4. **Sprint 0 実施**: S0 軽量共通抽出 → sequence.js regression 確認
5. **Sprint 1 実施**: UseCase 本体実装 (form ベース MVP)
6. **Evaluator 検証**: Visual Sweep + console error 0 確認
7. **PR 作成**: ブランチ stack で feat/tier1-component を先回り準備可

v0.4.0 以降も同様のサイクル。
