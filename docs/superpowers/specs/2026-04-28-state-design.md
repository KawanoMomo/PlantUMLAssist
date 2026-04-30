# State Diagram Design (v1.0.0)

- **作成日**: 2026-04-28
- **対象**: PlantUMLAssist v1.0.0 — Tier1 ロードマップの 6 番目 (最後) の図形
- **base ブランチ**: `feat/activity-v0.7.1` (PR #10 が master に merge されたら master 派生へ rebase)
- **次ブランチ**: `feat/state-v1.0.0`
- **親 spec**: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md` § 3.6
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

---

## 1. 背景と動機

v0.7.1 までで Sequence / UseCase / Component / Class / Activity の 5 図形が overlay-driven で完成。Tier1 ロードマップ最後の v1.0.0 は **State Diagram** で、Tier1 完成図 (= 6 figures) のマイルストーン。

**実機 PlantUML SVG 事前検証** (v0.7.0 の轍を踏まないため):

| State 構成要素 | SVG 表現 |
|---|---|
| Simple state `state X` | `<g class="entity" data-qualified-name="X">` + 内側 rect (rx=12.5 fill=#F1F1F1) |
| Composite container `state X { ... }` | 単独 `<rect fill="none" rx=12.5>` (entity 無し)、子は `data-qualified-name="X.Child"` |
| Initial `[*] -->` | `<g class="start_entity" data-qualified-name="...start...">` + filled ellipse |
| Final `--> [*]` | `<g class="end_entity">` + 同心 ellipse pair |
| Choice `state X <<choice>>` | `<polygon points="...">` 5-point closed diamond |
| History `state X <<history>>` | bordered ellipse `fill="#F1F1F1" rx=11` + text "H" |
| Deep history `state X <<historyDeep>>` | 同上 + text "H*" |
| Note `note right of X` | `<g class="entity" data-qualified-name="GMN_">` + `<path>` 折り角矩形 |
| Transition `A --> B : label` | `<line>` + `<polygon>` 5pt arrow head |

**Class diagram の overlay-builder.matchByDataSourceLine() を再利用可能** — Activity と違い entity ベースで matching できるため、設計コスト低。

v1.0.0 のゴール:

1. **要素**: simple state, composite state (1-level), pseudo-states ([*], history, choice)
2. **transition**: `A --> B` + optional `: trigger [guard] / action`
3. **note**: right/left × 1-line/multi-line × state target
4. **overlay-driven** (Class パターン流用、entity-based)
5. **hoverInsert + showInsertForm** (途中挿入を最初から組み込む)
6. ADR-110: State canonical DSL form

---

## 2. 適用範囲 (in / out)

### v1.0.0 で達成する (in)

- 6 element kinds: simple-state / composite-state / initial / final / choice / history (deep history 含む)
- Transitions: arrow `-->` + label `: trigger [guard] / action`
- Composite state nesting (1 段のみ)
- Pseudo-state `[*]` (initial when on LHS, final when on RHS、暗黙判定)
- Notes: `note (left|right) of NAME` 1 行 + 複数行
- Property panel (state / transition / note / no-selection)
- Tail-add (state, transition, note, pseudo-state)
- **hoverInsert** + **showInsertForm** (途中で state / transition を挿入)
- Overlay click 選択 (entity / start_entity / end_entity / 単独 rect (composite) / choice polygon / history ellipse)
- ADR-110: State canonical DSL form
- E2E: 6 業務 UC (Tier1 master § 9 の State 用に新規策定)

### v1.0.0 では やらない (out → Tier2)

- **2 段以上のネスト** (Tier2)
- **concurrent region** (`||` で fork する composite) — Tier2
- **entry/exit actions** (`state X { entry / e1\n exit / e2 }`) — Tier2
- **internal transition** (`state X { trigger / action }` without target) — Tier2
- **forking transition** (1 source → multiple targets via fork bar) — Tier2

---

## 3. Sprint 構造 (4-Phase, ~18 commits)

```
Phase 0: ADR + ブランチ + 設計 commit (~2 commits)
   └─ ADR-110: State canonical DSL form
   └─ feat/state-v1.0.0 + spec/plan commit

Phase A: Parser (~6 commits)
   └─ state simple + composite (recursive)
   └─ stereotype 解析 (<<choice>>, <<history>>, <<historyDeep>>)
   └─ transitions with optional labels (trigger, guard, action 分解)
   └─ pseudo-state [*] (initial/final 判定 by position)
   └─ note (1-line + multi-line)
   └─ detectDiagramType: plantuml-state

Phase B: Updater + UI (~8 commits)
   └─ formatters (canonical emit, ADR-110 準拠)
   └─ add ops (addState / addTransition / addNote / addPseudoState)
   └─ update ops (updateState / updateTransition / updateNote)
   └─ delete ops (deleteNode / cascade transitions targeting deleted state)
   └─ buildOverlay (entity-based + composite single-rect detection)
   └─ renderProps no-selection (tail-add 4 kinds)
   └─ renderProps state edit + transition edit + note edit
   └─ resolveInsertLine + showInsertForm + addStateAtLine + capabilities

Phase C: E2E (~1 commit)
   └─ state.spec.js (6 UC × α/γ axes ≈ 8 tests)

Phase D: Docs + PR (~1 commit)
   └─ README + CHANGELOG v1.0.0
   └─ Tier1 完成セクション (Sequence/UseCase/Component/Class/Activity/State 全 6 図形)
```

推定: ~18 commits, 1 sprint。

---

## 4. データモデル

```javascript
// parse() 戻り値
{
  meta: { title, startUmlLine },
  states: [
    {
      kind: 'state' | 'choice' | 'history' | 'historyDeep',
      id: string,             // qualified name (composite 内部は 'Parent.Child' 形式)
      label: string,
      stereotype: string | null,  // 'choice' / 'history' / 'historyDeep' / null
      parentId: string | null,    // 親 composite state の id
      line: number,
      endLine: number,            // composite の場合は閉じ } 行、それ以外 line と同じ
    }
  ],
  transitions: [
    {
      id: '__t_N',
      from: string | '[*]',       // '[*]' なら initial pseudo
      to: string | '[*]',         // '[*]' なら final pseudo
      label: string | null,       // 'trigger [guard] / action' raw text
      trigger: string | null,     // 分解結果
      guard: string | null,
      action: string | null,
      line: number,
    }
  ],
  notes: [
    {
      kind: 'note',
      id: '__n_N',
      position: 'left' | 'right',
      targetId: string,
      text: string,
      line: number,
      endLine: number,
    }
  ],
}
```

注: pseudo-state `[*]` は専用 state エントリを作らず、transitions 内で `from = '[*]'` / `to = '[*]'` として表現。これにより同一 composite 内で複数の initial を扱える。

---

## 5. ADR-110 — State Canonical DSL Form (要点)

| バリエーション | canonical |
|---|---|
| `state NAME` / `state NAME {}` (空 body) | `state NAME` (空時 `{}` 省略) |
| `state NAME { state Inner }` | block 形式維持 |
| `state X <<choice>>` | `state X <<choice>>` (`<<>>` 内 small-letter のみ canonical) |
| `[*] --> A` / `A --> [*]` | そのまま |
| `A --> B` (label なし) | `A --> B` |
| `A --> B : trigger` | `A --> B : trigger` |
| `A --> B : trigger [guard]` | `A --> B : trigger [guard]` |
| `A --> B : trigger [guard] / action` | `A --> B : trigger [guard] / action` (空白固定) |
| `note right of A : text` (1 行) | `note right of A : text` |
| 複数行 note | `note right of A`<br/>`text`<br/>`end note` |
| Stereotype 大文字小文字揺れ (`<<History>>`, `<<HistoryDeep>>`) | 全部小文字 |

ADR-110 として `docs/adr/ADR-110-state-canonical-form.md` に記載。

---

## 6. Property Panel UI

### 6.1 State 選択時 (simple)

```
┌─ State A (L3) ────────────────────────┐
│ ID:     [A           ]                │
│ Label:  [           ]                 │
│ Stereotype: [        ▾]  none/choice/ │
│              history/historyDeep      │
│ Parent: (root)  ← read-only           │
│ ─ Outgoing transitions ─               │
│   • A → B : trigger (L5)  [edit][✕]   │
│ ─ Incoming transitions ─               │
│   • [*] → A (L4)          [edit][✕]   │
│ ─ Notes ─                              │
│   ▸ right "my note" (L7)  [edit][✕]   │
│ [+ Note]                               │
│ [↑ 上へ] [↓ 下へ] [✕ 削除 (cascade)]   │
└────────────────────────────────────────┘
```

State 削除時は incoming/outgoing transitions も cascade 削除 (Class の deleteClassWithNotes パターン流用)。

### 6.2 Composite state 選択時

```
┌─ Composite State X (L8) ──────────────┐
│ ID: [X]                                │
│ Label: [...]                           │
│ ─ Inner states (read-only navigable) ─ │
│   ▸ Inner1 (L10) [select →]           │
│   ▸ Inner2 (L12) [select →]           │
│ [+ Inner state (composite に追加)]    │
│ [✕ Composite ごと削除]                 │
└────────────────────────────────────────┘
```

### 6.3 Transition 選択時

```
┌─ Transition A → B (L5) ───────────────┐
│ From: [A ▾]   ⇄ swap                   │
│ To:   [B ▾]                            │
│ Trigger: [click]                       │
│ Guard:   [enabled]                     │
│ Action:  [save()]                      │
│ Label preview: click [enabled] / save()│
│ [更新] [✕ 削除]                         │
└────────────────────────────────────────┘
```

### 6.4 Note 選択時

Class v0.6.1 と同じパターン (position selector + textarea + delete)。

### 6.5 No selection (tail-add)

Kind selector: state / transition / note / pseudo-state。各 kind ごとに小さい form。

---

## 7. Overlay 設計

### 7.1 Entity matching (Class パターン流用)

```javascript
function buildOverlay(svgEl, parsedData, overlayEl) {
  // 1. Simple states + child of composite: <g class="entity" data-qualified-name>
  var ents = svgEl.querySelectorAll('g.entity');
  var byName = {};
  ents.forEach(function(g) {
    var qn = g.getAttribute('data-qualified-name');
    if (qn) byName[qn] = g;
  });
  parsedData.states.forEach(function(st) {
    var g = byName[st.id];
    if (g) {
      var bb = OB.extractBBox(g);
      OB.addRect(overlayEl, ..., { 'data-type': 'state', 'data-id': st.id, ... });
    }
  });

  // 2. Initial pseudo-state: <g class="start_entity">
  var starts = svgEl.querySelectorAll('g.start_entity');
  // → mapped to "first transition with from='[*]'" 等

  // 3. Final pseudo-state: <g class="end_entity">

  // 4. Composite container: 単独 <rect fill="none" rx="12.5"> (g.entity の外側)
  // → composite state 用 overlay

  // 5. Choice: <polygon> 5-point closed diamond (内部に entity 無し)
  // → state with stereotype='choice'

  // 6. Note: <g class="entity" data-qualified-name="GMN_">  (Class パターン同様)
}
```

### 7.2 Composite container detection

Composite は `<g class="entity">` で wrap されない単独 `<rect fill="none" rx="12.5">`。

```javascript
function _detectCompositeRects(svgEl) {
  var rects = svgEl.querySelectorAll('rect[rx="12.5"]');
  var composites = [];
  Array.prototype.forEach.call(rects, function(r) {
    if (r.getAttribute('fill') === 'none' && !_hasAncestorClass(r, 'entity')) {
      composites.push(r);
    }
  });
  return composites;
}
```

順序対応: parsedData.states.filter(s => s.endLine > s.line) を docOrder の composite rects と zip。

---

## 8. Hover-insert (途中挿入) — v0.7.1 パターン流用

```javascript
function resolveInsertLine(overlayEl, y) {
  // Same logic as activity: find nearest state rect by Y, return {line, position}
  var rects = overlayEl.querySelectorAll('rect[data-type="state"]');
  ...
}

function showInsertForm(ctx, line, position, kind) {
  // Open st-modal with: kind selector (state | transition) + form
  // - state: id input → addStateAtLine
  // - transition: from/to selector + label → addTransitionAtLine
}
```

`defaultInsertKind: 'state'`。

---

## 9. テスト戦略

### 9.1 Unit (推定 +50 tests, 全体 ~537 tests)

| ファイル | 追加 tests | 内容 |
|---|---|---|
| `tests/state-parser.test.js` | ~20 | simple + composite + stereotype + transitions + label 分解 + notes |
| `tests/state-updater.test.js` | ~20 | formatter + add/update/delete + cascade transition delete |
| `tests/state-overlay.test.js` | ~10 | entity-based matching + composite rect detection + pseudo-state mapping |

### 9.2 E2E (推定 +8 tests)

`tests/e2e/state.spec.js`:

| UC | 軸 | 内容 |
|---|---|---|
| UC-1 | α | tail-add で simple state 追加 |
| UC-2 | α | composite state with inner state DSL emit |
| UC-3 | α | transition with full label (trigger [guard] / action) |
| UC-4 | α | choice / history pseudo-states |
| UC-5 | γ | overlay click state → property panel edit |
| UC-6 | γ | overlay click transition → label edit |
| UC-7 | γ | hover preview → insert state via modal |
| UC-8 | γ | console error 0 |

---

## 10. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| **Composite state の overlay matching 不安定** | composite click 不可 | `<rect fill="none">` 単独検出ロジック、順序対応失敗時は warn + skip。代替に property panel から composite list 経由 navigation |
| **Pseudo-state `[*]` の line 解決** | initial/final が transitions 内に分散、複数行に渡る | `from`/`to` が `[*]` の transition 単独で表現、専用 state entry 作らない |
| **Composite 内部の qualified name** | `Composite.Inner` で参照、parser/formatter で扱い揺れ | parse 時に qualified name そのまま id 化、buildOverlay で byName lookup |
| **Transition label の trigger/guard/action 分解** | parse fragility | label を 1 文字列で保持、表示時のみ regex で分解 (`/^([^\[\/]*)(?:\[([^\]]*)\])?\s*(?:\/(.*))?$/`)。emit は分解後 fields から再合成 |
| **History/Deep history 区別** | `<<history>>` vs `<<historyDeep>>` の case sensitivity | parser で全部小文字に正規化 |
| **Hover insert の挿入位置** | composite 内部に挿入する場合の indent 計算 | activity の addActionAtLine 同パターン (近接行の indent 継承) |

---

## 11. v1.x+ への明示繰越

- 2 段以上のネスト
- concurrent region
- entry/exit actions, internal transitions
- forking transition
- swimlane (state diagram には不要だが将来統合の余地あり)

---

## 12. Tier1 完成 (本 sprint で達成)

| 図形 | バージョン | 状態 |
|---|---|---|
| Sequence | v0.1〜v0.5 | ✅ |
| UseCase | v0.3 | ✅ |
| Component | v0.4 | ✅ |
| Class | v0.6.0 + v0.6.1 | ✅ |
| Activity | v0.7.0 + v0.7.1 | ✅ |
| **State** | **v1.0.0 (本 sprint)** | 🆕 |

v1.0.0 が PR merge された時点で **Tier1 ロードマップ完了**。
