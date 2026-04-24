# UseCase Diagram Design Spec (v0.3.0 form-based MVP)

- **作成日**: 2026-04-25
- **ステータス**: 草稿
- **対象バージョン**: v0.3.0 (Tier1 第 2 図形 — UseCase MVP)
- **親 spec**: `2026-04-24-plantuml-tier1-complete-master.md`
- **位置づけ**: 案β実装順 (易→難) の最初。Sequence (実装済) → **UseCase (本 spec)** → Component → Class → Activity → State
- **関連 plan**: 後続で `docs/superpowers/plans/YYYY-MM-DD-usecase-v0.3.0.md` を策定
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

## 1. ゴールとスコープ

### 1.1 ゴール

PlantUML UseCase Diagram を form-based UI で編集できる v0.3.0 リリース。要求分析を中心とする実業務シナリオ (UC-1〜UC-6) を UI のみで完遂可能にする。

overlay-driven 化 (SVG 要素クリック → 選択 → 編集) は v0.5.0 で別 spec として扱う。本 spec の責務は MVP まで。

### 1.2 スコープ

**含む (v0.3.0)**:

- DSL 要素: actor, usecase, package境界, association, generalization, include, extend
- ステレオタイプの parse (表示のみ)
- form-based 末尾追加 + 選択行編集 + renameWithRefs
- Title 設定
- 6 業務 UC × 2 評価軸 (α 技術 + γ 業務) のすべての PASS

**含まない (v0.5.0 以降に明示繰越)**:

- overlay-driven SVG 要素クリック選択
- drag-to-connect (要素間ドラッグで relation 作成)
- package 範囲選択 → wrap (既存要素を package で囲む)
- C5 (package 所属移動) を drag で

**含まない (v1.0 以降に明示繰越)**:

- skinparam 系統 (色指定、フォント等)
- cloud / database / collections のような Sequence 由来 actor 派生
- 内部クラス的 nested usecase (PlantUML には概念なし)

### 1.3 前提

- master spec の Section 4.1 で定義された Sprint 0 共通基盤 (`core/dsl-utils.js`, `core/regex-parts.js`, `core/line-resolver.js`, `core/formatter-interface.js`) を利用
- 既存 ADR-101〜104 を継承、本 spec で ADR-105 を新設
- `direct-manipulation-ux-checklist.md` 観点 D/E/F/G/H/I/K は v0.3.0 で適用、A/B/C/J は v0.5.0 (overlay 化時) で適用

## 2. 業務 UC × 評価軸マトリクス

UC は 6 件。各 UC を **α 観点 (DSL 要素網羅・技術正当性)** と **γ 観点 (業務シナリオ完遂・UX)** の 2 軸で独立評価する。両観点とも PASS で初めて UC 完了とみなす。

| UC | 業務状況 (γ) | やりたいこと | α 観点 評価項目 | γ 観点 評価項目 |
|---|---|---|---|---|
| **UC-1** | 新規 | 空白からシステム要求の初期洗い出し | actor / usecase / association が DSL に canonical 形式で生成、SVG に反映、preview に console error 0 | 空白から actor → usecase → association を property panel のみで 3 操作以内に追加できる、迷う遷移なし |
| **UC-2** | 仕様変更 | 既存 UC から共通機能を切り出して include で再利用 | usecase 新規追加 + `A ..> B : <<include>>` が canonical 形式で emit、parser が relation.kind='include' で再 parse 可能 | 「共通機能切り出し → 両 UC から include」が UI で 1 シーケンス完了、ステレオタイプの選択肢が「include / extend / 通常」で明示 |
| **UC-3** | 不具合対応 | 正常系 UC に extend で例外フロー追加 | extend 関係が `A ..> B : <<extend>>` で canonical emit、include と区別保存 (relation.kind 識別) | overlay なし (form-based MVP) でも正常系 → 例外 UC 追加が UI 完遂、include と extend を選択ミスしないラベル設計 |
| **UC-4** | レビュー指摘 | サブシステム境界が不明瞭との指摘で package 導入 | `package "Label" {` … `}` 行が DSL に正しく挿入、parser が parentPackageId を要素に付与、ネスト 2 段まで対応 | 「サブシステム境界を明示」業務が UI 完遂、既存要素の package 所属関係が DSL 上で表現される (v0.3.0 は手動移動可) |
| **UC-5** | 横展開 | 姉妹システムへ外部連携を足す (二次 actor 追加) | 二次 actor 追加 + association / generalization が canonical emit、generalization は `<\|--` で正しい方向 | 「既存図に外部連携追加」業務が UI 完遂、association と generalization の選択ミス時に事後変更可能 (Capability C4) |
| **UC-6** | polish | 要求 ID 命名規則見直し (renameWithRefs) | renameWithRefs が actor/usecase id 両方で動作、`\b<id>\b` 境界で誤置換せず、コメント行と quoted label 内を保護 | 「要求 ID 一括見直し」業務が 1 操作で完遂、関連 relation の from/to が確実に追従、ロールバックは Undo |

### 2.1 評価レポート出力形式 (Evaluator が `.eval/sprint-X/report.md` に出す)

```
| UC | α 観点 (DSL 技術) | γ 観点 (業務完遂) |
|----|-------------------|--------------------|
| UC-1 | PASS              | PASS               |
| UC-2 | PASS              | PASS               |
| UC-3 | PASS              | PASS               |
| UC-4 | PASS              | PASS               |
| UC-5 | PASS              | PASS               |
| UC-6 | PASS              | PASS               |
```

12 セル全 PASS で v0.3.0 受入基準を満たす。1 セルでも FAIL の場合、対応 UC は再実装。

## 3. UI Capability (UC から導出)

| # | Capability | 由来 UC | 実装手段 (v0.3.0 form-based) |
|---|---|---|---|
| C1 | 末尾追加: kind selector (actor / usecase / package / relation) + per-kind フォーム | UC-1, 2, 3, 4, 5 | property panel の「末尾に追加」セクション (Sequence と同型) |
| C2 | 選択行の編集 (label / id / kind 変更) | UC-1, 2, 3, 5 | DSL エディタで行クリック → property panel に該当行のフォーム表示 |
| C3 | 選択行の削除 | UC-4 (見直し), UC-6 | 削除ボタン (確認ダイアログあり) |
| C4 | 関係種別の変更 (association ↔ generalization ↔ include ↔ extend) | UC-2, UC-3, UC-5 | property panel の「Kind」select で切替、確定ボタンで DSL を update |
| C5 | renameWithRefs: actor/usecase id 変更が relation の from/to を更新 | UC-6 | property panel の「Rename」フォーム (旧 id / 新 id) |
| C6 | package 行の追加 (開始 + 終了の対) | UC-4 | 末尾追加から「package」を選択。範囲指定 wrap は v0.5.0 へ繰越 |
| C7 | move up / down (DSL 行順序の入れ替え) | (UC 横断) | property panel の ↑↓ ボタン |
| C8 | title 設定 | (品質) | property panel 上部の Title フィールド |

**v0.3.0 で意図的にスコープ外** (= v0.5.0 へ繰越):

- overlay-driven SVG 要素クリック選択
- drag-to-connect
- package 範囲選択 → wrap
- 要素を別 package へ drag で移動

## 4. データモデル

### 4.1 parser 出力形式

```javascript
{
  meta: {
    title: '',
    startUmlLine: null,  // PlantUML SVG offset 解決用 (Sequence と同パターン)
  },
  elements: [
    // actor
    {
      kind: 'actor',
      id: 'User',           // alias (PlantUML identifier)
      label: 'User',        // 表示ラベル (省略時は id と同じ)
      stereotype: null,     // <<...>> があれば文字列、なければ null
      line: 3,
      parentPackageId: null,  // 所属する package の id、トップレベルなら null
    },
    // usecase
    {
      kind: 'usecase',
      id: 'L1',
      label: 'Login',
      stereotype: null,
      line: 5,
      parentPackageId: 'authPkg',
    },
  ],
  relations: [
    // association
    {
      id: '__r_0',
      kind: 'association',  // 'association' | 'generalization' | 'include' | 'extend'
      from: 'User',
      to: 'L1',
      arrow: '-->',         // emit 時の canonical arrow (kind と整合)
      label: '',            // 関係に付くラベル (空可)
      line: 7,
    },
    // include / extend は label にステレオタイプ文字列を保持
    {
      id: '__r_2',
      kind: 'include',
      from: 'L1',
      to: 'Validate',
      arrow: '..>',
      label: '<<include>>',
      line: 9,
    },
  ],
  groups: [
    // package境界 (Sequence の alt/loop と同列、parentId でネスト)
    {
      kind: 'package',
      id: 'authPkg',         // 自動生成 id (例: '__pkg_0')、parser が付与
      label: 'Authentication',
      startLine: 4,
      endLine: 11,
      parentId: null,        // ネストする package があれば親 id
    },
  ],
}
```

### 4.2 model 構築の責務

- `parentPackageId` は parser が **package 開始/終了行を見て自動付与**。元の DSL 順序を保持しつつ、要素が含まれる最深 package を割り当てる。
- relation の `kind` は arrow 種別と stereotype ラベル組み合わせから判定:
  - `-->` / `--` → association (label にステレオタイプ無し)
  - `<|--` / `--|>` → generalization
  - `..>` / `<..` + label `<<include>>` → include
  - `..>` / `<..` + label `<<extend>>` → extend
  - `..>` で stereotype 無し → association (dotted) として扱う

### 4.3 model の不変条件

- `elements[i].id` は actor/usecase 内で一意 (同一スコープで重複定義は parser が後勝ちで上書き、warning なし)
- `relations[i].from` と `to` は `elements[i].id` のいずれかと一致 (整合性は emit 時に updater が保証)
- `groups[i].startLine < groups[i].endLine` 必須
- `groups[i].parentId` は別 group の id または null

## 5. DSL coverage (parse / emit)

### 5.1 parser (寛容に多変種を受理)

| 要素 | 受理する記法 |
|---|---|
| actor | `actor X` / `actor "Label" as X` / `actor X as "Label"` / `:X:` / `:Label: as X` |
| usecase | `usecase X` / `usecase "Label" as X` / `usecase X as "Label"` / `(Label)` / `(Label) as X` / `(X)` |
| package | `package "Label" {` / `package L {` / `rectangle L {` (rectangle は package と同等扱い) |
| association | `A --> B` / `A -- B` / `A <-- B` / `A - B` (label `: text` 任意) |
| generalization | `A <\|-- B` / `A --\|> B` (canonical 方向は parent <\|-- child) |
| include | `A ..> B : <<include>>` / `A .> B : <<include>>` (`.>` も dotted として受理) |
| extend | `A ..> B : <<extend>>` / `A <.. B : <<extend>>` (逆向きも受理) |
| ステレオタイプ | `<<text>>` を要素・関係どちらでも parse、表示用に保持 |
| コメント | `'` 始まりの行は skip (`window.MA.dslUtils.isPlantumlComment` 利用) |

### 5.2 updater emit (canonical, キーワード優先 — ADR-105)

| 要素 | canonical 形式 | 例 |
|---|---|---|
| actor | label==id 時: `actor X`、label!=id 時: `actor "Label" as X` | `actor User`、`actor "Power User" as PU` |
| usecase | label==id 時: `usecase X`、label!=id 時: `usecase "Label" as X` | `usecase L1`、`usecase "Login Flow" as L1` |
| package | `package "Label" {` … `}` (label==id でも quote 統一) | `package "Authentication" {` |
| association | `A --> B` (label 任意で `: text`) | `User --> L1 : initiates` |
| generalization | `A <\|-- B` (parent <\|-- child) | `Person <\|-- Admin` |
| include | `A ..> B : <<include>>` | `Login ..> Validate : <<include>>` |
| extend | `A ..> B : <<extend>>` | `Login ..> CancelLogin : <<extend>>` |

短縮記法 (`:X:` / `(L)`) は parser で受理するが、emit はキーワード形式に正規化する。これは ADR-105 で決定済み（理由: Sequence の fmtParticipant と一貫、grep しやすさ、renameWithRefs での誤マッチ回避）。

## 6. 共通基盤の活用 (Sprint 0 成果)

| 共通モジュール | UseCase での利用箇所 |
|---|---|
| `core/dsl-utils.js` | `unquote` (label parse)、`quote` (label emit)、`escapeForRegex` (renameWithRefs)、`isPlantumlComment` (parser skip) |
| `core/regex-parts.js` | `IDENTIFIER` / `QUOTED_NAME` / `IDENTIFIER_OR_QUOTED` で actor/usecase/package の name 部 regex 構築、`isStartUml` / `isEndUml` (parseUseCase の境界判定) |
| `core/line-resolver.js` | v0.3.0 では未使用 (form-based、overlay なし)。v0.5.0 で overlay 化時に活用予定。 |
| `core/formatter-interface.js` | `fmtActor` / `fmtUsecase` / `fmtPackage` / `fmtRelation` の契約準拠。モジュール初期化時に `assertFormatterContract(fn, 'fmtXxx')` で self-check |

新規ファイル: `src/modules/usecase.js` (推定 600-800 行)

## 7. ADR 新規

### ADR-105: UseCase canonical DSL form

- **Status**: Accepted
- **Decision**: UseCase Diagram の DSL emit はキーワード優先形式 (`actor X` / `usecase L as X` / `package "Label" {`) を canonical とする。短縮記法 (`:X:` / `(L)` / `rectangle`) は parser で受理するが emit には用いない。
- **Rationale**:
  1. Sequence の `fmtParticipant` (キーワード優先 `participant "Name" as Alias`) と一貫
  2. grep / 静的解析で `usecase\b` キーワードが安定して引っかかる
  3. `renameWithRefs` で `\b<id>\b` パターン置換時、キーワード形式が周辺文字との曖昧性が低く誤マッチを抑える
  4. ラウンドトリップで正規化される副作用を許容 (Sequence が `actor User` ↔ `participant User as User` 同様)
- **Consequences**:
  - parser はテストで両形式を fixture 化して受理を保証
  - 既存の PlantUML 公式サンプル (短縮記法多用) を読み込むと canonical 化されることをユーザーに README で明示

## 8. テスト戦略

### 8.1 Unit Tests

- `tests/usecase-parser.test.js` (推定 15-20 tests):
  - 各受理記法のパース (5.1 表の各行に対応)
  - parentPackageId の自動付与
  - relation.kind の判定
  - ステレオタイプの保持
  - コメント行の skip
- `tests/usecase-updater.test.js` (推定 15-20 tests):
  - 各 fmtXxx の canonical emit
  - addActor / addUsecase / addPackage / addRelation
  - updateActor / updateUsecase / updateRelation (kind 変更含む)
  - deleteLine (relation 削除時の整合性)
  - renameWithRefs (actor / usecase 両方、quoted label 保護、コメント行保護)
  - moveLineUp / moveLineDown
  - setTitle

### 8.2 E2E Tests (Playwright)

UC 1 件 = 1 spec ファイル、命名は `tests/e2e/usecase-uc-NN-<業務軸>-<観点>.spec.js`:

- `usecase-uc-01-new-system.spec.js` — UC-1 (α + γ アサーションを別 describe block に分離)
- `usecase-uc-02-spec-change-include.spec.js` — UC-2
- `usecase-uc-03-bug-fix-extend.spec.js` — UC-3
- `usecase-uc-04-review-package.spec.js` — UC-4
- `usecase-uc-05-deployment-actor.spec.js` — UC-5
- `usecase-uc-06-polish-rename.spec.js` — UC-6

各 spec ファイル内構造:

```js
describe('UC-N <業務軸>', function() {
  describe('α: DSL technical', function() {
    test('emits canonical form', ...);
    test('parser round-trip preserves data', ...);
  });
  describe('γ: workflow completion', function() {
    test('user can complete the scenario via UI only', ...);
    test('no console error during workflow', ...);
  });
});
```

### 8.3 Visual Sweep (evaluator)

`.eval/sprint-1/report.md` に上記 12 セルマトリクスを出力。各 UC のビフォア/アフタースクリーンショット必須。CLAUDE.md ADR-014 準拠。

### 8.4 render mode 両系統

local (Java daemon) / online (plantuml.com) 両方で UC-1 のスモークテストのみ実施 (UseCase は Sequence と違って relation の SVG レンダリングが PlantUML 公式に依存度高い)。

## 9. 受入基準 (v0.3.0)

### 9.1 機能完了基準

- 全 6 UC × 2 観点 = 12 評価セルが PASS
- DSL coverage 表 (5.1) の全変種が parse 可、5.2 の canonical 形式で emit
- Tab-to-indent (workspace ADR-011) が UseCase でも動作
- Undo/Redo が drag/select/edit すべてに対応 (`direct-manipulation-ux-checklist.md` 観点 E)

### 9.2 品質基準

- Unit tests: 全 PASS (推定 30-40 tests)
- E2E tests: 全 PASS (6 spec ファイル × 2 観点 = 12 describe block 以上)
- Visual sweep: console error 0、12 セルマトリクス全 PASS
- ESLint warning 0
- 観点 D / E / F / G / H / I / K の 7 観点が `direct-manipulation-ux-checklist.md` に照らして適合 (A / B / C / J は v0.5.0)

### 9.3 ドキュメント基準

- README.md に UseCase サンプルセクションを追加 (DSL 例 + 各種 relation の説明)
- DSL coverage 表 (本 spec Section 5) を README に転記または link
- ADR-105 を `docs/adr/` に commit
- CHANGELOG に v0.3.0 のリリースノート

## 10. 想定リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| PlantUML 公式の relation arrow バリエーションが多く parser fragile | 既存の業務 .puml ファイル読み込み失敗 | 5.1 表を fixture 化、PlantUML 公式サンプルから 5 例以上をテストに含める |
| `..>` (dotted) の意味がコンテキスト依存 (include/extend ステレオタイプ無いと association として扱う) | relation.kind 判定誤り | label の `<<include>>` / `<<extend>>` 検出を厳格化、無ければ association として保存 |
| package のネストで parentPackageId 計算が破綻 | 要素の所属関係狂い | parser 内で package stack を保持、要素遭遇時に stack top を parentPackageId に割り当て (Sequence の groupStack と同パターン) |
| 短縮記法 `(...)` が message label `(...)` と衝突 | parse 誤判定 | UseCase の `(...)` は行頭または ` as ` 直前のみ受理、relation 部の `(...)` は受理しない |
| renameWithRefs で usecase id を rename したが label に同じ文字列があり誤置換 | DSL 破壊 | quoted label 内をセンチネル置換で保護 (Sequence の renameWithRefs と同パターン) |
| v0.3.0 form-based MVP で「直感的じゃない」フィードバックが出る | UX 評判低下 | README で「v0.5.0 で overlay 化予定」を明示、Sequence v0.1.0 → overlay redesign の歩みと同じ段階適用を周知 |

## 11. v0.5.0 への明示繰越

以下は v0.3.0 に含めない。v0.5.0 で別 spec / plan として扱う:

- overlay-driven SVG 要素クリック選択 (`direct-manipulation-ux-checklist.md` 観点 A / B / C 適用)
- drag-to-connect (要素間ドラッグで relation 作成)
- package 範囲選択 → wrap (既存要素を package で囲む)
- 要素を別 package へ drag で移動 (Capability C5 の overlay 版)
- 観点 J (座標系整合) — overlay 化時に必須

## 12. 開始手順

v0.3.0 スプリント着手時:

1. **新ブランチ作成**: `feat/tier1-usecase` (本 spec branch `docs/tier1-usecase-spec` または master からの分岐)
2. **writing-plans skill で実装計画策定**: `docs/superpowers/plans/2026-04-25-usecase-v0.3.0.md`
3. **ADR-105 commit** (本 spec の Section 7 内容を `docs/adr/ADR-105-usecase-canonical-form.md` として独立 commit)
4. **TDD 実装**: parser → updater → property panel UI → E2E
5. **Evaluator 検証**: 12 セル × 2 観点マトリクスでスクリーンショット証拠付き
6. **PR 作成**: 親 master spec + Sprint 0 が先に master へマージ済を前提
