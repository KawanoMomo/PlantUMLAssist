# Tier1 Overlay-Driven Design (v0.5.0)

- **作成日**: 2026-04-26
- **対象**: PlantUMLAssist v0.5.0 — UseCase + Component を overlay-driven 化
- **base ブランチ**: `feat/tier1-component` (v0.4.0)
- **次ブランチ**: `feat/tier1-overlay-driven`
- **親 spec**: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md`
- **姉妹 spec**: `docs/superpowers/specs/2026-04-18-sequence-overlay-driven-redesign.md` (sequence の先行事例)
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

---

## 1. 背景と動機

v0.4.0 までで Tier1 の Sequence / UseCase / Component が form-based で完成。**overlay-driven (= SVG クリック → 編集) は sequence のみ**。UseCase/Component は property panel の DSL 行クリックでしか要素を選択できない。

加えて v0.4.0 リリース直前に「sequence-only な機能が UseCase/Component に漏れる」リークを 5 commit 連続で修正 (`b9cac82`, `817fac3`, `1cfd07a`, `dc4e25b`, `2ea528b`)。**根本原因は app.js のハードコード比較** (`currentModule === modules['plantuml-sequence']`) が散在していること。新図形を増やすたびに同じパターンが再発する構造。

v0.5.0 は次の 3 目的を **同じ sprint 内で達成** する:

1. **モジュール capability 契約** を導入し、漏れの構造的防止
2. **`core/overlay-builder.js` + `core/selection-router.js` を抽出** (Rule of Three: sequence + UseCase + Component の 3 実証)
3. **UseCase + Component に overlay-driven UI を載せる** (SVG クリック選択 + multi-select connect + 観点 A/B/C/J 適用)

---

## 2. 適用範囲 (in / out)

### v0.5.0 で達成する (in)

- `currentModule.capabilities` フラグ契約 (`overlaySelection` / `hoverInsert` / `participantDrag` / `showInsertForm` / `multiSelectConnect`)
- `src/app.js` のハードコード比較を `moduleHas('cap')` に全廃
- `src/core/overlay-builder.js` 新設 (図形非依存な SVG/DOM プリミティブ)
- `src/core/selection-router.js` 新設 (click / shift+click / multi-toggle / 空白クリック解除 / highlight 適用)
- `src/modules/usecase.js` に `buildOverlay` 実装
- `src/modules/component.js` に `buildOverlay` 実装
- UseCase + Component で **multi-select connect** (2 figure 選択 → property panel に Connect 操作)
- relation を click 選択可能にする (UseCase/Component とも、kind 切替 + label 編集 + swap + delete)
- 観点 A (全要素選択可能) / B (再クリックで toggle, shift+click multi) / C (選択中は挿入ガイド抑制) / J (id 基準 dedup) を全適用
- Visual Verification (Playwright + Evaluator) — UC ベース 12-cell α/γ matrix の overlay-only γ セル追加

### v0.5.0 では やらない (out → v0.6.0+ へ繰越)

- **drag-to-connect** (SVG 上で線を drag して relation 作成) — Class diagram で関係 4 種類の選択 UX が必須化する v0.6.0 で本格設計、その時の知見を UseCase/Component に逆輸入
- **package 範囲選択 → wrap** (既存要素を範囲選択で package で囲む) — v0.6.0
- **要素を別 package へ drag 移動** — v0.6.0
- **sequence の multi-select connect** — sequence は既に form-based で困っていない。capability `multiSelectConnect: false` で意図的に非対応。v0.6.0 以降で UX 一貫性のために開く判断を再検討

---

## 3. Sprint 構造 (3-Phase)

```
Phase 0: capability 契約導入 (推定 2 commits)
   └─ src/app.js のハードコード比較を全廃
   └─ DiagramModule v2 に capabilities フラグ追加 (sequence 既存機能を契約化)
   └─ regression: sequence 全機能維持

Phase A: core 抽出 (推定 8 commits)
   └─ src/core/overlay-builder.js (sequence-overlay.js から汎用化)
   └─ src/core/selection-router.js (click/shift+click/multi-toggle 汎用化)
   └─ sequence.js を refactor して core を delegate
   └─ regression: sequence の overlay/selection 維持

Phase B: UseCase + Component overlay 化 (推定 16 commits)
   └─ usecase.buildOverlay 実装 + relation 選択
   └─ component.buildOverlay 実装 + port 階層選択
   └─ 2-element selection → Connect panel layout (props-renderer 拡張)
   └─ E2E: overlay UC × 2 図形
   └─ Evaluator visual sweep

Phase C: ドキュメント & PR (推定 2 commits)
   └─ README + CHANGELOG v0.5.0
   └─ PR description draft
```

推定合計: ~28 commits, 1 sprint。

---

## 4. capability 契約 (Phase 0 詳細)

### 4.1 各 module が宣言する capabilities

```javascript
// 各 DiagramModule v2 に追加
capabilities: {
  overlaySelection:    bool,  // SVG click で figure 選択 + buildOverlay 呼出
  hoverInsert:         bool,  // mousemove で「+ ここに挿入」guide 表示
  participantDrag:     bool,  // SVG 上の figure を drag で並び替え
  showInsertForm:      bool,  // 行間クリックで挿入 popup
  multiSelectConnect:  bool,  // 2 figure 選択時に Connect 操作
}
```

### 4.2 module ごとの初期値

| module | overlaySel | hoverInsert | participantDrag | showInsertForm | multiSelConnect |
|---|:---:|:---:|:---:|:---:|:---:|
| **sequence** (Phase 0 で契約化) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **usecase** (Phase B で起動) | ✅ | ❌ | ❌ | ❌ | ✅ |
| **component** (Phase B で起動) | ✅ | ❌ | ❌ | ❌ | ✅ |

### 4.3 app.js 側の helper

```javascript
function moduleHas(cap) {
  return !!(currentModule && currentModule.capabilities && currentModule.capabilities[cap]);
}

// 置換対象 (Phase 0 で 4 箇所一括):
//   if (currentModule === modules['plantuml-sequence']) → if (moduleHas('overlaySelection'))
//   hover mousemove guard                                → if (!moduleHas('hoverInsert')) return
//   participant drag mousedown                          → if (!moduleHas('participantDrag')) return
//   showInsertForm click                                 → if (!moduleHas('showInsertForm')) return
```

### 4.4 review checklist (新規 capability 追加時)

- [ ] capability 名が「機能の有無」を表現している (実装詳細でない)
- [ ] 全 module で値を**明示宣言**している (undefined を許さない)
- [ ] app.js 側の使用箇所がすべて `moduleHas('cap')` 経由
- [ ] 新 module 追加時の checklist に「capability の値を全フラグで宣言」が含まれる

---

## 5. core/overlay-builder.js (Phase A)

### 5.1 設計原則

> **`core/overlay-builder.js` には「図形セマンティクスを持たない SVG/DOM プリミティブ」だけを置く。**
> **「この図形のこの要素はこういう風に hit する」というルールは module 側に残す。**

### 5.2 公開 API

```javascript
window.MA.overlayBuilder = {
  // ── 純粋プリミティブ ──
  addRect(overlayEl, x, y, w, h, attrs),       // 透明 hit-area rect
  addLine(overlayEl, x1, y1, x2, y2, attrs),   // 線形 hit-area
  addLabel(overlayEl, x, y, text, attrs),      // テキスト要素
  extractBBox(g, opts),                         // text → line → path → rect の順で bbox
  extractEdgeBBox(pathEl, padding),             // 細い line/path に padding した hit-area
  syncDimensions(svgEl, overlayEl),             // overlay-layer を SVG の viewBox/width/height と sync

  // ── マッチング戦略 ──
  matchByDataSourceLine(svgEl, items, selector, offset),
  matchByOrder(svgEl, items, selector),
  pickBestOffset(svgEl, items, selector, candidates),  // 候補 offset {0,1,startUmlLine} で最大マッチ

  // ── ヒット判定 ──
  hitTestTopmost(overlayEl, x, y),  // 重なる rect から最前面 (= 最後に追加された) を返す
                                     // composite/package の「子優先」を実現

  // ── dedup / 整合確認 ──
  dedupById(rects),                          // 同一 data-id の重複 rect を 1 つにまとめる (観点 J)
  warnIfMismatch(kind, modelCount, matched), // model と SVG matched 数の divergence を console.warn
};
```

### 5.3 sequence-overlay.js からの抽出方針

`sequence-overlay.js` (369 行) のうち:

- **core に移す**: `_addRect`, `_clearChildren`, `_gBBox` (汎用部分のみ), `_pickBestOffset`, `_warnIfMismatch`, `setSelectedHighlight`
- **sequence 側に残す**: `buildSequenceOverlay` の本体 (participant の head/tail/lifeline 3 重対応、note の placeholder fallback、group の bare-rect 推定など、sequence 固有のレイアウト知識)

抽出後の sequence 側 `buildOverlay`:

```javascript
buildOverlay(svgEl, parsedData, overlayEl) {
  var OB = window.MA.overlayBuilder;
  OB.syncDimensions(svgEl, overlayEl);
  // sequence 固有の matching: participant は head + tail の 2 selector 必要
  var partHead = OB.pickBestOffset(svgEl, parsedData.participants, 'g.participant-head', [...]);
  // ... (各要素を own logic で追加)
}
```

### 5.4 将来図形の予測拡張 (v0.6.0+ 繰越に明記)

| 追加タイミング | core に追加が必要そうな API | 理由 |
|---|---|---|
| Class (v0.6.0) | `extractMultiLineTextBBoxes(textEl)` | class box 内の attribute/method 行を個別選択 |
| Activity (v0.7.0) | `addPolygon`, `extractDiamondBBox` | 矩形以外の hit-area (decision diamond) |
| State (v1.0.0) | `hitTestTopmost` の z-order を「ネスト深さ降順」で resolve | composite state の子優先 |

**Rule of Three を保ちつつ前進する仕組み**: 新図形を追加する際、core に新 API を足すなら「3 番目のモジュールでも使える形か」を必ず spec に書いてから実装。1 図形の都合で hack 的に拡張するのは禁止。

---

## 6. core/selection-router.js (Phase A)

### 6.1 公開 API

```javascript
window.MA.selectionRouter = {
  bind(overlayEl, callbacks),     // overlay-layer に click handler を bind
  applyHighlight(overlayEl, sel), // selection 状態に対応する rect に .selected class
  onSelectionChange(callback),    // selection.init の callback wrapper
};
```

### 6.2 click 処理ルール (観点 A/B/C 適用)

```javascript
overlayEl.addEventListener('click', function(e) {
  var target = e.target;
  var type = target.getAttribute('data-type');
  var id = target.getAttribute('data-id');
  var line = parseInt(target.getAttribute('data-line'), 10);

  // 空白クリック: 選択解除
  if (!type || !id) {
    window.MA.selection.clearSelection();
    return;
  }

  var item = { type: type, id: id, line: line };

  if (e.shiftKey) {
    // Shift+click: multi-toggle (観点 B)
    if (selection.contains(item)) selection.remove(item);
    else selection.add(item);
  } else {
    // 通常 click: 同一なら toggle 解除、別物なら単一選択 (観点 B)
    if (selection.isOnly(item)) selection.clearSelection();
    else selection.setSelected([item]);
  }
});
```

### 6.3 highlight 適用 (観点 J: id 基準 dedup)

```javascript
applyHighlight(overlayEl, selData) {
  var all = overlayEl.querySelectorAll('rect.selectable');
  Array.prototype.forEach.call(all, function(r) { r.classList.remove('selected'); });
  if (!selData) return;
  selData.forEach(function(s) {
    // id 基準で全 rect を highlight (head + tail + lifeline などの重複表現にも対応)
    var rects = overlayEl.querySelectorAll('rect[data-type="' + s.type + '"][data-id="' + s.id + '"]');
    Array.prototype.forEach.call(rects, function(r) { r.classList.add('selected'); });
  });
}
```

---

## 7. UseCase + Component overlay 実装 (Phase B)

### 7.1 selectable element 一覧

| module | element | data-type | property panel に出るアクション |
|---|---|---|---|
| UseCase | actor | `actor` | label/id 編集, delete, rename-with-refs |
| UseCase | usecase | `usecase` | label/id 編集, delete, rename-with-refs |
| UseCase | package | `package` | label 編集, delete (中身保持) |
| UseCase | relation (edge) | `relation` | kind 切替, label 編集, swap, delete |
| Component | component | `component` | label/id 編集, delete, rename, port 追加 |
| Component | interface | `interface` | label/id 編集, delete, rename |
| Component | port | `port` | id/label 編集, delete |
| Component | package | `package` | label 編集, delete |
| Component | relation (edge) | `relation` | kind 切替, label 編集, swap, delete |

### 7.2 UseCase の buildOverlay 概要

```javascript
buildOverlay(svgEl, parsedData, overlayEl) {
  var OB = window.MA.overlayBuilder;
  OB.syncDimensions(svgEl, overlayEl);

  // actor: <g class="actor"> + 内側の text/path
  var actorMatches = OB.pickBestOffset(svgEl, parsedData.actors, 'g.actor', [...]);
  actorMatches.forEach(function(m) {
    var bb = OB.extractBBox(m.groupEl);
    OB.addRect(overlayEl, bb.x, bb.y, bb.width, bb.height, {
      'data-type': 'actor', 'data-id': m.item.id, 'data-line': m.item.line
    });
  });

  // usecase: <g class="usecase"> (ellipse + text)
  // package: <g class="cluster"> (フレーム矩形)
  // relation: <g class="link"> または path[id^="link_"]
  //   → extractEdgeBBox で padding 付き hit-area
  //   → data-relation-kind 属性で kind 種別保持

  return { matched: {...}, unmatched: {...} };
}
```

### 7.3 Component の buildOverlay (port 階層選択)

```javascript
// component と port は親子関係: port を click したときは port が選択され (parent component でない)、
// port 外側の component 領域を click したときは component が選択される。
// → port rect を component rect の後に addRect (z-order が後勝ち = 最前面)
// → hitTestTopmost が「port が手前」と認識する。

// SVG 上の component box: <g class="component">
// SVG 上の port: <g class="port">
// PlantUML は port を component box の縁に小さい矩形として描画
```

### 7.4 relation 選択 UI

Property panel が relation 選択時に出すフォーム:

```
┌─ Relation 編集 ───────────────┐
│ Kind: [association ▾]          │
│ From: User    ⇄ swap           │
│ To:   Login                    │
│ Label: [           ]           │
│ [Update] [Delete]              │
└──────────────────────────────┘
```

kind 切替で DSL の矢印記号が canonical 形式で書き換わる:
- UseCase: `-->`(assoc) / `<|--`(general) / `..>` + `<<include>>` / `..>` + `<<extend>>`
- Component: `--`(assoc) / `..>`(dep) / `-()`(provides) / `)-`(requires)

### 7.5 multi-select connect (Phase B 主目玉)

`core/props-renderer.js` の dispatcher に **新 case** `onMultiSelectConnect(elements)` 追加:

```javascript
// dispatch ロジック
if (selData.length === 2 && currentModule.capabilities.multiSelectConnect) {
  return dispatchers.onMultiSelectConnect(selData);
}
```

UseCase/Component の `onMultiSelectConnect`:

```html
<div class="connect-panel">
  <h3>Connect 2 elements</h3>
  <select id="connect-from">A / B</select>
  <button id="connect-swap">⇄</button>
  <select id="connect-to">B / A</select>
  <select id="connect-kind">association/.../...</select>
  <input id="connect-label" placeholder="ラベル (任意)">
  <button id="connect-create">+ Connect</button>
</div>
```

操作フロー:
1. figure A click → single selection
2. figure B **Shift+click** → multi selection `[A, B]`
3. property panel が Connect layout に切替
4. kind / label 入力 → `[+ Connect]` で `addRelation(text, kind, A.id, B.id, label)` 呼出
5. push history → re-render → 新 relation が overlay に出現 + selection が新 relation に移動

### 7.6 観点 A/B/C/J の遵守

- **A**: actor / usecase / package / relation すべて click で反応 (relation は edge bbox padding 付き)
- **B**: 同一 figure 再クリックで toggle 解除、Shift+click で multi
- **C**: 選択中は (Sequence で抑制した) hover 挿入ガイドが出ない (UseCase/Component は元から `hoverInsert: false` だが、選択中 = 編集モードであることを property panel UX で表現)
- **J**: id-based dedup — 例えば package 境界が「枠 + ラベル」で 2 rect 描画される場合も `data-id` で dedup して click が一意に解決

---

## 8. テスト戦略

### 8.1 Unit (推定 +30 tests, 全体 ~297 tests)

| ファイル | tests | 内容 |
|---|---|---|
| `tests/overlay-builder.test.js` | ~10 | addRect / extractBBox / extractEdgeBBox / pickBestOffset / hitTestTopmost / dedupById |
| `tests/selection-router.test.js` | ~8 | toggle / shift+click multi / 空白クリック解除 / applyHighlight |
| `tests/usecase-overlay.test.js` | ~6 | buildOverlay が actor/usecase/package/relation の rect 4 種を作る、relation の data-relation-kind が canonical kind |
| `tests/component-overlay.test.js` | ~6 | buildOverlay + port 階層選択 + lollipop edge bbox + relation 4 kinds |

### 8.2 E2E (推定 +20 tests, 全体 ~97 tests)

新規追加:
- `tests/e2e/usecase-overlay.spec.js` (~5): SVG クリック選択 / multi-select connect / 観点 A/B/C/J の挙動
- `tests/e2e/component-overlay.spec.js` (~5): 同上 + port 階層選択
- 既存 `tests/e2e/usecase-uc-0{1..6}-*.spec.js` の **γ ブロックに「overlay-only 完遂」セルを追加** (form-only と overlay-only の 2 軸で評価)
- 既存 `tests/e2e/component-uc-0{1..6}-*.spec.js` 同様

### 8.3 Visual Verification (Evaluator)

- 12-cell α/γ matrix を **18-cell** に拡張 (UC × 3 軸: α DSL / γ-form / γ-overlay)
- Evaluator は overlay-only セルで「SVG クリック → property panel 編集 → DSL 反映」を実機操作で検証
- 観点 J 検証: id-based dedup が機能している (重複 rect でクリック先がブレない、同一 figure を別位置から click しても同 selection)

### 8.4 Regression 防止

- Phase 0 完了時点で `npm run test:all` GREEN (capability 契約導入で sequence が壊れていないことを確認)
- Phase A 完了時点で同上 (core 抽出で sequence が壊れていないことを確認)
- Phase B 完了時点で sequence の overlay/selection が一切 regression していないことを確認

---

## 9. データモデル変更 (差分)

既存の `parse()` が返す `{meta, elements, relations, groups}` に変更なし。**buildOverlay の追加と data-* 属性のセマンティクス拡張のみ**。

新規 data-* 属性 (overlay-layer の rect):
- `data-type`: `actor` | `usecase` | `component` | `interface` | `port` | `package` | `relation` | (sequence 既存: `participant` | `message` | `note` | `activation` | `group`)
- `data-id`: parser が割り当てる element.id (relation は relations 配列の line 番号でも可)
- `data-line`: DSL 上の行番号 (1-based)
- `data-relation-kind` (relation のみ): `association` | `dependency` | `provides` | `requires` | `generalization` | `include` | `extend` | (sequence 既存: arrow type)

---

## 10. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| PlantUML 公式 SVG 構造の図形ごとのバラつき (UseCase の actor は `<g class="actor">` か `<g class="actorBody">` か等) | overlay rect が figure に対応せず click 不能 | Phase B 着手時に **実機 SVG fixture を取得** して selector 候補を spec に列挙してから実装。`pickBestOffset` で複数 selector 候補を試す逃げ道を持つ |
| port の階層選択が `hitTestTopmost` の z-order だけでは解決できない | port click で component が選択されてしまう | 実装時 `addRect` の呼出順を厳密に「親 → 子」順に強制。spec の Phase B task で「port を component より後に追加」を明記 |
| relation の edge bbox が斜め線で hit area が大きすぎ / 小さすぎ | クリック判定が直感に反する | `extractEdgeBBox(path, padding)` の padding 値を 8px で開始、Visual Sweep で観察して調整。spec に「padding は経験的に決める、initial 8px」と明記 |
| multi-select connect で「3 つ以上選択中」の状態が UX 上中途半端 | property panel が空白になる | 3+ 選択時は panel に「Connect は 2 element まで。Shift+click で解除可」とメッセージ表示。E2E で確認 |
| Phase 0 → A → B の途中で sequence regression が発生 | 既存ユーザー機能が壊れる | 各 phase 完了時に `npm run test:all` を必須ゲートにする (writing-plans で task の終了条件に組み込む) |
| Evaluator round 1 で UC-X が新たに失敗 | sprint 期間延長 | v0.4.0 の Evaluator round 1 (UC-5 port) のように、sprint 内で hotfix → round 2 で再評価する運用を踏襲 |

---

## 11. v0.6.0+ への明示繰越

以下は v0.5.0 に含めない:

- **drag-to-connect** — Class diagram 実装 (v0.6.0) の関係 4 種類選択 UX と統合設計
- **package 範囲選択 → wrap** — v0.6.0 (Class)
- **要素を別 package へ drag 移動** — v0.6.0
- **sequence の multi-select connect** — capability `multiSelectConnect` の対象拡大は v0.6.0 で UX 一貫性を再評価
- **`extractMultiLineTextBBoxes`** API — Class diagram の attribute/method 個別選択用 (v0.6.0 で core に追加)
- **`addPolygon` / `extractDiamondBBox`** API — Activity diagram の decision 用 (v0.7.0)
- **`hitTestTopmost` の階層深さ resolve** — State diagram の composite state 子優先 (v1.0.0)

---

## 12. 開始手順

v0.5.0 スプリント着手時:

1. **新ブランチ確認**: `feat/tier1-overlay-driven` (`feat/tier1-component` から派生済)
2. **writing-plans skill で実装計画策定**: `docs/superpowers/plans/2026-04-26-tier1-overlay-driven-v0.5.0.md`
3. **Phase 0 実施**: capability 契約導入 + app.js ハードコード比較を `moduleHas('cap')` 化
4. **Phase A 実施**: `core/overlay-builder.js` + `core/selection-router.js` 抽出 → sequence delegate refactor
5. **Phase B 実施**: usecase.buildOverlay → component.buildOverlay → multi-select connect → E2E
6. **Phase C 実施**: README + CHANGELOG v0.5.0 + PR 草案
7. **Evaluator 検証**: 18-cell α/γ-form/γ-overlay matrix で証拠付き PASS
8. **PR 作成**: master へのマージは user 承認後 (CLAUDE.md 規約)
