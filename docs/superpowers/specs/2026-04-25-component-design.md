# Component Diagram + S1.5 Design Spec (v0.4.0)

- **作成日**: 2026-04-25
- **ステータス**: 草稿
- **対象バージョン**: v0.4.0 (Tier1 第 3 図形 — Component MVP + S1.5 共通基盤抽出)
- **親 spec**: `2026-04-24-plantuml-tier1-complete-master.md`
- **位置づけ**: 案β実装順 (易→難) の 3 番目。Sequence (実装済) → UseCase (実装済 v0.3.0) → **Component (本 spec)** → Class → Activity → State
- **関連 plan**: 後続で `docs/superpowers/plans/YYYY-MM-DD-component-v0.4.0.md` を策定
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

## 1. ゴールとスコープ

### 1.1 ゴール

v0.4.0 リリースで以下を達成:

- **Phase A (S1.5)**: sequence.js + usecase.js から共通の **props-renderer** + **dsl-updater** ヘルパーを抽出し、両モジュールを refactor で動作不変にする (regression ゼロ)
- **Phase B (Component MVP)**: 新モジュール `src/modules/component.js` を新 core helper を使って実装、form-based MVP で 6 業務 UC × 2 評価軸 = 12 セル PASS

overlay-driven 化は v0.5.0 で別 spec として扱う (本 spec の責務は MVP まで)。

### 1.2 含む (v0.4.0)

**S1.5 抽出 (Phase A)**

- 新設: `src/core/props-renderer.js` (no-selection / single-selection panel layout dispatcher)
- 新設: `src/core/dsl-updater.js` (`insertBeforeEnd`, `insertBefore`, `insertAfter`, `moveLineUp/Down`, `renameWithRefs` の汎用実装)
- 既存 `src/modules/sequence.js` / `src/modules/usecase.js` を新 core helper に delegate するよう refactor (動作不変)
- 抽出対象は **2 モジュールで実証済**のもののみ (Rule of Three 準拠)

**Component MVP (Phase B)**

- DSL: component / interface / `[NAME]` 短縮 / port / package 境界 / association `--` / 依存 `..>` / lollipop `-()` `)-`
- ステレオタイプ parse 対応 (表示のみ)
- 6 業務 UC × α/γ 評価軸 = 12 セル PASS
- form-based property panel (Title + tail-add + selection-edit)

### 1.3 含まない (v0.5.0 以降に明示繰越)

- **`core/overlay-builder.js` / `core/selection-router.js` の抽出**
  - 理由: sequence.js のみが overlay 実装を持ち、usecase / component (v0.4.0) は form-based MVP。sole-source 抽出は Rule of Three 違反、API 設計が後で破綻するリスク高
  - v0.5.0 で UseCase + Component の overlay 化が決まった時点で 3 モジュール実証ベースで抽出
- Component の overlay-driven SVG クリック選択
- drag-to-connect (lollipop / port 描画ドラッグ作成)
- package 範囲選択 → wrap

### 1.4 含まない (v1.0 以降)

- skinparam (色指定、フォント等)
- cloud / database / artifact 等の Component 派生ノード種別 (Tier2)
- nested component (component 内の sub-component) — package 経由で表現

### 1.5 前提

- master spec の Sprint 0 共通基盤 (`core/dsl-utils.js`, `core/regex-parts.js`, `core/line-resolver.js`, `core/formatter-interface.js`) を継続利用
- ADR-101〜105 を継承、本 spec で ADR-106 を新設
- `direct-manipulation-ux-checklist.md` 観点 D / E / F / G / H / I / K は v0.4.0 で適用、A / B / C / J は v0.5.0 (overlay 化時)

## 2. 業務 UC × 評価軸マトリクス

UC は 6 件。各 UC を **α 観点 (DSL 要素網羅・技術正当性)** と **γ 観点 (業務シナリオ完遂・UX)** の 2 軸で独立評価。両観点 PASS で UC 完了。

| UC | 業務状況 (γ) | やりたいこと | α 観点 評価項目 | γ 観点 評価項目 |
|---|---|---|---|---|
| **UC-1** | 新規 (システムブロック構成の初期描画) | 空白から component / interface / 接続を起こす | component / interface が canonical 形式 (`component "L" as X`) で生成、`[NAME]` 受理 | 空白から component → interface → 接続を 3 操作以内で完遂、迷わず操作可能 |
| **UC-2** | 仕様変更 (新規 component を package 内に追加) | 既存 package の中に新 component を入れる | package 内 component が `parentPackageId` 付きで parse、emit 順序が保たれる | 既存図に新 component 追加が UI で完遂、package 所属の表現が DSL 上で明示 |
| **UC-3** | 不具合対応 (モジュール間依存 `..>` の追記) | 「不具合の影響波及」を依存矢印で記述 | dependency `A ..> B` で emit、association `A -- B` と区別保存 (relation.kind 識別) | 関係種別 selector で association vs dependency が選択可能、ミス時に事後変更可能 |
| **UC-4** | レビュー指摘 (lollipop で interface を明示) | provides/requires interface を後付けで追加 | provides は `component -() interface`、requires は `interface )- component` で canonical emit、parser が両方向受理 | レビュー指摘で「provides/requires interface」を 1 操作で追加可能 |
| **UC-5** | 横展開 (ports 追加で詳細ブロック化) | 既存 component に port を後付け | port 行が emit され、parser が `kind: 'port'`, `parentComponentId` で保存 | 既存 component を選択 → port 追加ボタンで完遂 |
| **UC-6** | polish (component / interface id 命名見直し) | 一括 rename + 参照追従 | renameWithRefs が component / interface 両方で動作、quoted label 内保護、コメント保護 | 1 操作で id 一括変更、Undo で復元可能 |

### 2.1 評価レポート出力形式 (Evaluator が `.eval/sprint-2/report.md` に出す)

```
| UC | α 観点 (DSL 技術) | γ 観点 (業務完遂) |
|----|-------------------|--------------------|
| UC-1 | PASS | PASS |
| UC-2 | PASS | PASS |
| UC-3 | PASS | PASS |
| UC-4 | PASS | PASS |
| UC-5 | PASS | PASS |
| UC-6 | PASS | PASS |
```

12 セル全 PASS で v0.4.0 受入基準を満たす。

## 3. UI Capability (UC から導出)

| # | Capability | 由来 UC | 実装手段 (v0.4.0 form-based) |
|---|---|---|---|
| C1 | 末尾追加: kind selector (component / interface / port / package / relation) | UC-1, 2, 3, 4, 5 | property panel tail-add (UseCase と同型) |
| C2 | 選択行の編集 (label / id / kind 変更) | UC-1, 2, 3, 4 | DSL エディタ行クリック → property panel |
| C3 | 選択行の削除 | UC-6 | 削除ボタン (確認ダイアログ) |
| C4 | 関係種別の変更 (association ↔ dependency ↔ provides ↔ requires) | UC-3, UC-4 | property panel kind select |
| C5 | renameWithRefs (component / interface id 変更が relation 参照を更新) | UC-6 | property panel rename ボタン |
| C6 | package 行の追加 + port 後付け追加 | UC-2, UC-5 | tail-add から「package」/「port」選択 |
| C7 | move up / down (DSL 行順序入れ替え) | (UC 横断) | property panel ↑↓ |
| C8 | title 設定 | (品質) | property panel 上部 |

**v0.4.0 で意図的にスコープ外** (= v0.5.0 へ繰越):

- overlay-driven SVG クリック選択
- drag-to-connect (lollipop / port 描画間ドラッグ)
- package 範囲選択 → wrap
- 要素を別 package へ drag で移動

## 4. データモデル

### 4.1 parser 出力形式

```javascript
{
  meta: { title: '', startUmlLine: null },
  elements: [
    // component
    {
      kind: 'component',
      id: 'WebApp',
      label: 'Web App',
      stereotype: null,
      line: 3,
      parentPackageId: null,
    },
    // interface
    {
      kind: 'interface',
      id: 'IAuth',
      label: 'IAuth',
      stereotype: null,
      line: 4,
      parentPackageId: 'pkg_0',
    },
    // port (parentComponentId で所属 component を保持)
    {
      kind: 'port',
      id: 'p1',
      label: 'p1',
      parentComponentId: 'WebApp',
      line: 5,
      parentPackageId: null,
    },
  ],
  relations: [
    { id: '__r_0', kind: 'association', from: 'A', to: 'B', arrow: '--',  label: '', line: 7 },
    { id: '__r_1', kind: 'dependency',  from: 'A', to: 'B', arrow: '..>', label: '', line: 8 },
    { id: '__r_2', kind: 'provides',    from: 'WebApp', to: 'IAuth',     arrow: '-()', label: '', line: 9 },
    { id: '__r_3', kind: 'requires',    from: 'IAuth',  to: 'WebApp',    arrow: ')-',  label: '', line: 10 },
  ],
  groups: [
    { kind: 'package', id: 'pkg_0', label: 'Backend', startLine: 4, endLine: 11, parentId: null },
  ],
}
```

### 4.2 model 構築の責務

- `parentPackageId` は parser が package 開始/終了行を見て自動付与 (UseCase と同パターン)
- `parentComponentId` (port のみ) は parser が直前の component 行を参照して付与
- relation の `kind` 判定:
  - `--` / `--` (両端に方向矢印なし) → association
  - `..>` / `<..` (方向矢印あり) → dependency
  - `-()` (component → interface) → provides (lollipop)
  - `)-` (interface → component) → requires (lollipop)
- folder / frame / node / rectangle keyword は全て `kind: 'package'` に正規化

### 4.3 model の不変条件

- `elements[i].id` は component / interface / port 内で一意
- relation の `from` / `to` は elements の id と一致
- `groups[i].startLine < groups[i].endLine` 必須
- port の `parentComponentId` は親 component が elements 内に存在する必要

## 5. DSL coverage (parse / emit)

### 5.1 parser (寛容に多変種を受理)

| 要素 | 受理する記法 |
|---|---|
| component | `component X` / `component "Label" as X` / `component X as "Label"` / `[X]` / `[X] as A` / `[Label] as X` |
| interface | `interface X` / `interface "Label" as X` / `() X` / `() X as I1` / `()` 単独 (anonymous は無視) |
| port | `port X` / `port "Label" as X` (component 行直後に配置) |
| package境界 | `package "L" {` / `folder "L" {` / `frame "L" {` / `node "L" {` / `rectangle "L" {` (全て package に正規化) |
| association | `A -- B` (label `: text` 任意) |
| dependency | `A ..> B` / `A <.. B` / `A .> B` (`<..` は方向反転して保存) |
| provides (lollipop) | `A -() B` / `B ()- A` (両方向受理) |
| requires (lollipop) | `A )- B` / `B -( A` (両方向受理) |
| ステレオタイプ | `<<text>>` を要素・関係どちらでも parse、表示用に保持 |
| コメント | `'` 始まりの行は skip |

### 5.2 updater emit (canonical, ADR-106 keyword-first)

| 要素 | canonical 形式 | 例 |
|---|---|---|
| component | label==id 時: `component X`、label!=id 時: `component "Label" as X` | `component WebApp` / `component "Web App" as WebApp` |
| interface | label==id 時: `interface X`、label!=id 時: `interface "Label" as X` | `interface IAuth` / `interface "Authentication" as IAuth` |
| port | `port X` (component 行の直後に配置) | `port p1` |
| package | `package "Label" {` ... `}` (label 常に quote、folder/frame/node/rectangle は package に正規化) | `package "Backend" {` |
| association | `A -- B` (label 任意で `: text`) | `WebApp -- DB : data` |
| dependency | `A ..> B` (label 任意) | `WebApp ..> Logger` |
| provides (lollipop) | `component -() interface` | `WebApp -() IAuth` |
| requires (lollipop) | `interface )- component` | `IAuth )- WebApp` |

短縮記法 (`[X]` / `() X` / folder/frame/node/rectangle) は parser で受理するが、emit は keyword 形式に正規化 (ADR-106)。

## 6. S1.5 共通基盤抽出 (Phase A 詳細)

### 6.1 `src/core/props-renderer.js`

sequence.js と usecase.js が両方持つ「selection 状態 → panel layout 決定」ロジックの汎用化。各 figure module は dispatcher callback を提供する。

```javascript
window.MA = window.MA || {};
window.MA.propsRenderer = (function() {
  function renderByDispatch(selData, parsedData, propsEl, dispatchers) {
    if (!propsEl) return;
    if (!selData || selData.length === 0) {
      if (dispatchers.onNoSelection) dispatchers.onNoSelection(parsedData, propsEl);
      return;
    }
    var sel = selData[0];
    // dispatcher 選択ロジック: relation > group > element
    var relation = (parsedData.relations || []).find(function(r) { return r.id === sel.id; });
    if (relation && dispatchers.onRelation) {
      dispatchers.onRelation(relation, parsedData, propsEl);
      return;
    }
    var group = (parsedData.groups || []).find(function(g) { return g.id === sel.id; });
    if (group && dispatchers.onGroup) {
      dispatchers.onGroup(group, parsedData, propsEl);
      return;
    }
    var element = (parsedData.elements || []).find(function(e) {
      return e.id === sel.id && e.kind === sel.type;
    });
    if (element && dispatchers.onElement) {
      dispatchers.onElement(element, parsedData, propsEl);
      return;
    }
    // fallback
    if (dispatchers.onUnknown) dispatchers.onUnknown(sel, parsedData, propsEl);
  }
  return { renderByDispatch: renderByDispatch };
})();
```

### 6.2 `src/core/dsl-updater.js`

sequence.js と usecase.js が両方持つ「DSL 行操作」の汎用関数。

```javascript
window.MA = window.MA || {};
window.MA.dslUpdater = (function() {
  var RP = window.MA.regexParts;
  var DU = window.MA.dslUtils;

  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (RP.isEndUml(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
  }

  function moveLineUp(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx <= 0 || idx >= lines.length) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx - 1]; lines[idx - 1] = tmp;
    return lines.join('\n');
  }

  function moveLineDown(text, lineNum) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length - 1) return text;
    var tmp = lines[idx]; lines[idx] = lines[idx + 1]; lines[idx + 1] = tmp;
    return lines.join('\n');
  }

  function renameWithRefs(text, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return text;
    var escaped = DU.escapeForRegex(oldId);
    var pattern = new RegExp('\\b' + escaped + '\\b', 'g');
    return text.split('\n').map(function(line) {
      if (DU.isPlantumlComment(line)) return line;
      var quoted = [];
      var stripped = line.replace(/"[^"]*"/g, function(m) {
        quoted.push(m);
        return '' + (quoted.length - 1) + '';
      });
      var replaced = stripped.replace(pattern, newId);
      return replaced.replace(/(\d+)/g, function(_, idx) {
        return quoted[parseInt(idx, 10)];
      });
    }).join('\n');
  }

  return {
    insertBeforeEnd: insertBeforeEnd,
    moveLineUp: moveLineUp,
    moveLineDown: moveLineDown,
    renameWithRefs: renameWithRefs,
    // insertAtLine / insertAfterLine / deleteLine は既存 textUpdater を継続利用 (move しない)
  };
})();
```

### 6.3 sequence.js の refactor

- ローカル `insertBeforeEnd` を削除 → `window.MA.dslUpdater.insertBeforeEnd` に置換
- `renameWithRefs` を削除 → `window.MA.dslUpdater.renameWithRefs` に置換
- `moveMessage` は **そのまま残す** (Sequence 固有の「グループ境界をスキップする」セマンティクスがあるため、汎用 moveLineUp/Down とは別物)

### 6.4 usecase.js の refactor

- ローカル `insertBeforeEnd` を削除 → core delegate
- `renameWithRefs` を削除 → core delegate
- `moveLineUp` / `moveLineDown` を削除 → core delegate
- `renderProps` を `window.MA.propsRenderer.renderByDispatch` に書き換え (dispatcher callback 形式へ)

### 6.5 Phase A 完了基準

- 既存 sequence.js / usecase.js の **unit + e2e tests 全 PASS** (regression ゼロ)
- props-renderer / dsl-updater の新 unit tests pass (それぞれ ~5-10 tests)
- `wc -l` で sequence.js / usecase.js の行数減少を記録 (約 -50 to -80 行ずつ)

## 7. ADR 新規

### ADR-106: Component canonical DSL form

- **Status**: Accepted
- **Decision**: Component Diagram の DSL emit はキーワード優先形式とする。
  - component: `component X` / `component "Label" as X`
  - interface: `interface X` / `interface "Label" as X`
  - port: `port X`
  - package境界: `package "Label" {` (folder / frame / node / rectangle は parser で受理、emit で package に正規化)
  - lollipop: provides は `component -() interface`、requires は `interface )- component` を canonical 方向
- **Rationale**:
  1. ADR-105 (UseCase) と一貫した keyword-first 思想
  2. grep / 静的解析で `component\b` / `interface\b` キーワードが安定して引っかかる
  3. lollipop 方向統一で renameWithRefs の word-boundary 置換が誤マッチしにくい
  4. ラウンドトリップで正規化される副作用は許容 (UseCase / Sequence と同様)
- **Consequences**:
  - parser test fixtures は両形式 (短縮 + キーワード) を fixture 化
  - PlantUML 公式サンプルの読込で短縮記法が canonical 化されることを README で明示

## 8. テスト戦略

### 8.1 Unit Tests

**S1.5 抽出後の core**
- `tests/dsl-updater.test.js` (~10 tests): insertBeforeEnd / moveLineUp / moveLineDown / renameWithRefs
- `tests/props-renderer.test.js` (~5 tests): dispatcher が selection 状態に応じて正しい callback を呼ぶ

**Component**
- `tests/component-parser.test.js` (~20 tests): 各 DSL 変種の parse、parentPackageId / parentComponentId、relation kind 判定、ステレオタイプ
- `tests/component-updater.test.js` (~20 tests): formatters、add/update/delete、move、setTitle、renameWithRefs (delegate 確認)

**Regression**
- 既存 sequence + usecase の全 unit tests 引き続き PASS (refactor 後も `npm run test:unit` で全 GREEN)

### 8.2 E2E Tests (Playwright)

- `tests/e2e/component-uc-01-new-system.spec.js` ~ `component-uc-06-polish-rename.spec.js` (6 ファイル)
- 各 spec ファイル内: `test.describe('α: DSL technical', ...)` + `test.describe('γ: workflow completion', ...)`
- 推定 25 tests (UC-1: 5, UC-2: 4, UC-3: 4, UC-4: 4, UC-5: 4, UC-6: 4)

### 8.3 Visual Sweep (evaluator)

`.eval/sprint-2/report.md` に 12-cell α/γ matrix。各 UC のスクリーンショット必須。CLAUDE.md ADR-014 準拠。

### 8.4 render mode 両系統

local (Java daemon) / online (plantuml.com) 両方で UC-1 のスモークテストのみ。

## 9. 受入基準 (v0.4.0)

### 9.1 機能完了基準

**Phase A**
- 既存 sequence.js / usecase.js の全 unit + e2e tests PASS (regression ゼロ)
- 新 core モジュール `props-renderer.js` / `dsl-updater.js` の unit tests PASS

**Phase B**
- 全 6 UC × 2 観点 = 12 評価セルが PASS
- DSL coverage 表 (5.1) の全変種 parse 可、5.2 canonical emit
- Tab-to-indent (workspace ADR-011) で Component DSL エディタ動作
- Undo/Redo が drag/select/edit すべてに対応 (`direct-manipulation-ux-checklist.md` 観点 E)

### 9.2 品質基準

- Unit tests: 全 PASS (推定 263 tests = Sprint 1 baseline 208 + Component parser 20 + updater 20 + props-renderer 5 + dsl-updater 10)
- E2E tests: 全 PASS (推定 25 component E2E + 既存 sequence/usecase E2E)
- Visual sweep: console error 0、12 セル全 PASS
- 観点 D / E / F / G / H / I / K の 7 観点が `direct-manipulation-ux-checklist.md` に照らし適合 (A / B / C / J は v0.5.0)

### 9.3 ドキュメント基準

- README に Component サンプルセクション追加 (DSL 例 + lollipop 説明)
- DSL coverage 表 (Section 5) を README に転記または link
- ADR-106 を `docs/adr/` に commit
- CHANGELOG に v0.4.0 リリースノート

## 10. 想定リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| S1.5 抽出で sequence.js / usecase.js に regression | 既存機能破壊 | refactor の前後で `npm run test:unit` + `npx playwright test` を必須実行、差分なしを確認 |
| props-renderer の dispatcher 設計が figure 固有要件を吸収しきれない | usecase / component で形が違う | dispatcher callback 形式 (onElement / onRelation / onGroup) で柔軟に extend 可能、固有 UI は callback 内で組み立て |
| dsl-updater の moveLineUp/Down が sequence.js の moveMessage と衝突 | move 動作のセマンティクス分離 | sequence.js の `moveMessage` は **残す** (グループ境界スキップ等の特殊ロジックを含む)、汎用 `dslUpdater.moveLineUp/Down` とは別物として扱う |
| lollipop `-()` `)-` の方向解釈ズレ | provides と requires の混同 | ADR-106 で canonical 方向明記、parser が両方向受理 (canonicalize on parse) |
| `[X]` 短縮記法と State の `[*]` の衝突 | parser-utils.detectDiagramType で誤判定 | `[*]` (= initial/final state) は state 優先、`[X]` (X != `*`) は component 優先。priority 順序で対処 |
| package vs folder vs frame vs node 混在で parser 複雑化 | 5 keyword の組合せで regex 肥大化 | 単一 alternation `(?:package|folder|frame|node|rectangle)` で受理、kind は `'package'` に正規化 |
| port の所属 component 推定で誤割当 | `parentComponentId` 不整合 | port は **直前 component の直後行のみ受理**、空白/コメント/他要素を挟む配置は受理しない仕様凍結 |
| 既存 ECN/ADR 番号衝突 | 文書整合性 | ADR-106 (Component) は ADR-105 (UseCase) の次。連番維持 |

## 11. v0.5.0 への明示繰越

以下は v0.4.0 に含めない。v0.5.0 で別 spec / plan として扱う:

- `core/overlay-builder.js` 抽出 (UseCase + Component overlay 化と同時、3 モジュール実証で確定)
- `core/selection-router.js` 抽出 (同上)
- Component の overlay-driven SVG クリック選択 (`direct-manipulation-ux-checklist.md` 観点 A / B / C 適用)
- drag-to-connect (lollipop / port 描画間ドラッグ作成)
- package 範囲選択 → wrap (既存要素を package で囲む)
- 要素を別 package へ drag で移動
- 観点 J (座標系整合) — overlay 化時必須

## 12. 開始手順

v0.4.0 スプリント着手時:

1. **新ブランチ作成**: `feat/tier1-component` (`feat/tier1-usecase` から派生して S1.5 + Component 両方を含む単一 PR を構成)
2. **writing-plans skill で実装計画策定**: `docs/superpowers/plans/2026-04-25-component-v0.4.0.md`
3. **ADR-106 commit**
4. **Phase A 実施**: S1.5 抽出 (props-renderer + dsl-updater) → sequence.js / usecase.js refactor → regression 確認
5. **Phase B 実施**: TDD 実装 (parser → updater → property panel UI → E2E)
6. **Evaluator 検証**: 12 セル × 2 観点マトリクスでスクリーンショット証拠付き
7. **PR 作成**: 親 master + Sprint 0 + Sprint 1 が先に master へマージ済を前提
