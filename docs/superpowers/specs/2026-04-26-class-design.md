# Class Diagram Design (v0.6.0)

- **作成日**: 2026-04-26
- **対象**: PlantUMLAssist v0.6.0 — Tier1 ロードマップの 4 番目の図形 (Class diagram、最初から overlay-driven)
- **base ブランチ**: master (PR #4 + #5 + #6 マージ済を前提)
- **次ブランチ**: `feat/tier1-class`
- **親 spec**: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md`
- **適用 skill**: `dsl-editor-spec-checklist`, `use-case-driven-ui-spec`

---

## 1. 背景と動機

v0.5.0 までで Sequence / UseCase / Component の 3 図形が overlay-driven 化済 (`core/overlay-builder.js` + `core/selection-router.js` + capability 契約)。Tier1 master § 4.1 によれば v0.6.0 は **Class diagram** で、初期から overlay-driven で実装する。

Class diagram は OO 設計で最頻出。class 本体内に attribute / method がネストする「リスト構造」で、parser 複雑度は Tier1 中最大。master spec § 7 でも fragility リスクが明示されている。

v0.6.0 のゴール:

1. **4 element kinds** (class / interface / abstract class / enum) の overlay-driven 化
2. **6 relation kinds** (assoc / aggregation / composition / inheritance / implementation / dependency) の click 選択 + multi-select connect
3. **Members** (attribute / method, visibility ±#~, static, abstract) の編集 (panel-based、SVG 上の member 個別クリックは v0.6.1 へ繰越)
4. **Extensions**: stereotype (`<<X>>`), generics (`Foo<T>`, `Map<K,V>`)
5. **Nesting**: package + namespace
6. ADR-107 で canonical DSL form を確定

---

## 2. 適用範囲 (in / out)

### v0.6.0 で達成する (in)

- 4 element kinds: class / interface / abstract class / enum (member 構造含む)
- 6 relation kinds: association `--` / aggregation `o--` / composition `*--` / inheritance `<|--` / implementation `<|..` / dependency `..>`
- Member parsing/editing: visibility (+/-/#/~), static, abstract (method only), 型表記
- Extensions: stereotype `<<X>>`, generics `Foo<T>` (含 nested `Map<K,V>`)
- Nesting: `package "Label" {}` + `namespace foo {}`
- Property panel ベースの member リスト UI (Q1=B 案)
- Multi-select connect (Component と同じ Shift+click → Connect form 流儀)
- Overlay click 選択 (class box 全体、relation edge)
- ADR-107: Class canonical DSL form
- 観点 A / B / C / J 適用
- E2E: 8 業務 UC (master spec § 9)
- Evaluator visual sweep (24-cell α/γ-form/γ-overlay matrix)

### v0.6.0 では やらない (out → v0.6.1+ へ繰越)

- **Member 個別 SVG クリック選択** — `extractMultiLineTextBBoxes` API は v0.7.0 (Activity の swim lane 内 action) と統合設計
- **クラス内クラス (内部クラス)** — Tier2
- **Note on class** (`note left of NAME`) — Tier2
- **Drag-to-connect** — v0.7.0 以降の段階導入
- **Package 範囲選択 → wrap** — v0.7.0 以降

---

## 3. Sprint 構造 (4-Phase, ~40 commits)

```
Phase 0: ADR + ブランチ + テンプレート (~2 commits)
   └─ ADR-107: Class canonical DSL form (keyword-first)
   └─ feat/tier1-class branch (派生元: master)

Phase A: Parser (~14 commits)
   └─ 4 element kinds (class/interface/abstract/enum)
   └─ Members (attribute/method, visibility, static/abstract)
   └─ 6 relations
   └─ Stereotype + generics
   └─ Nesting (package + namespace)

Phase B: Updater + UI (~16 commits)
   └─ add/update/delete/move/rename ops (ADR-107 canonical emit)
   └─ Property panel: 4 element kind 編集 + member リスト UI
   └─ Multi-select connect (capabilities.multiSelectConnect = true)
   └─ buildOverlay (entity ベース、UseCase/Component と同パターン)
   └─ HTML / parser-utils / module 登録

Phase C: E2E + Visual sweep (~6 commits)
   └─ Class UC × 8 件 spec files
   └─ Evaluator dispatch + 必要なら hotfix

Phase D: Docs + PR (~2 commits)
   └─ README + CHANGELOG v0.6.0
   └─ PR description draft + Playwright スクショ更新
```

推定合計: ~40 commits, 1 sprint。

---

## 4. データモデル

```javascript
// elements (Class module の parse() が返す elements 配列)
{
  kind: 'class' | 'interface' | 'abstract' | 'enum',
  id: string,
  label: string,
  stereotype: string | null,    // '<<Entity>>' → 'Entity'
  generics: string[] | null,    // ['T'] for Foo<T>, ['K', 'V'] for Map<K, V>
  members: [
    {
      kind: 'attribute' | 'method' | 'enum-value',
      visibility: '+' | '-' | '#' | '~' | null,
      static: bool,
      abstract: bool,    // method only (attribute では常に false)
      name: string,
      type: string,      // attribute: 型 / method: return type / enum-value: 空
      params: string | null,  // method only: '(a: int, b: str)' raw text
      line: number,      // member 行の DSL 行番号
    }
  ],
  line: number,         // class declaration 行番号
  endLine: number,      // 閉じ } 行番号 (block form の場合)
  parentPackageId: string | null,
}

// relations (6 kinds)
{
  id: '__r_N',
  kind: 'association' | 'aggregation' | 'composition'
       | 'inheritance' | 'implementation' | 'dependency',
  from: string, to: string,
  label: string | null,
  line: number,
}

// groups (package + namespace)
{
  kind: 'package' | 'namespace',
  id: '__pkg_N',
  label: string,
  startLine: number,
  endLine: number,
  parentId: string | null,  // ネスト用
}
```

---

## 5. ADR-107 — Class Canonical DSL Form (要点)

PlantUML Class は表記揺れが多い。canonical 形式を確定:

| バリエーション | canonical |
|---|---|
| `class Foo` / `class Foo {}` (空 body) | `class Foo` (空時は `{}` 省略) |
| `class Foo {\n  +id : int\n}` | block 形式維持 |
| `interface I` / `class I <<interface>>` | `interface I` (専用キーワード優先) |
| `abstract class Foo` / `abstract Foo` | `abstract class Foo` (2 トークン強制) |
| `enum Color { RED }` (値リスト) | `enum Color { RED }` (block 必須) |
| `Foo --|> Bar` / `Bar <|-- Foo` | `Bar <|-- Foo` (parent <|-- child 順、UseCase generalization と一致) |
| `Foo *-- Bar` (composition: 親 = 全体) | `Foo *-- Bar` (`*` 側が全体側) |
| `Foo o-- Bar` (aggregation) | `Foo o-- Bar` (`o` 側が全体側) |
| `Foo<T>` (generics) | `Foo<T>` (`<` 直後は ID で開始、空白なし) |
| `class "Long Name" as F` (label) | `class "Long Name" as F` (label != id 時のみ) |
| Member: `+ id : int` / `+id:int` (空白揺れ) | `+ id : int` (visibility, 空白, name, ` : `, type) |
| Method: `+ login() : void` / `+login():void` | `+ login() : void` (return type は ` : ` 区切り) |
| stereotype + generics 並び | `class Foo<T> <<Entity>>` (ID → generics → stereotype) |

ADR-107 として `docs/adr/ADR-107-class-canonical-form.md` に正式記載。

---

## 6. Property Panel UI (Q1=B 案)

Class / interface / abstract / enum を SVG クリックで選択 → property panel に表示:

```
┌─ Class Foo (L3) ────────────────┐
│ ID:    [Foo                ]    │
│ Label: [                   ]    │
│ Stereotype: [<<Entity>>    ]    │
│ Generics:   [T,K,V          ]   │
│ ─ Attributes ─                  │
│   ⊕ + name : String     [✕]     │
│   ⊕ - id   : int        [✕]     │
│   [+ Attribute 追加]            │
│ ─ Methods ─                     │
│   ⊕ + login() : void    [✕]     │
│   ⊕ - validate() : bool [✕]     │
│   [+ Method 追加]               │
│ [↑ 上へ] [↓ 下へ] [✕ 削除]      │
└────────────────────────────────┘
```

各 member 行は inline edit (visibility selector + name + type)、削除ボタン。member 追加は専用 form を expand。

`enum` 選択時は member 構造が異なるため、別 layout:

```
┌─ Enum Color (L8) ───────────────┐
│ ID:    [Color              ]    │
│ Stereotype: [             ]     │
│ ─ Values ─                      │
│   • RED   [✕]                   │
│   • GREEN [✕]                   │
│   • BLUE  [✕]                   │
│   [+ Value 追加]                │
│ [↑ 上へ] [↓ 下へ] [✕ 削除]      │
└────────────────────────────────┘
```

`abstract class` は class と同じ layout に `□ abstract` checkbox を追加。Method 行に `□ static` / `□ abstract` checkbox。

Multi-select connect (Component と同じパターン):

```
┌─ Class - Connect 2 elements ────┐
│ From: Foo  ⇄ swap  To: Bar      │
│ Kind: [Inheritance (<\|--)  ▾]  │
│   ┗ Association (--)            │
│   ┗ Aggregation (o--)           │
│   ┗ Composition (*--)           │
│   ┗ Inheritance (<\|--)         │
│   ┗ Implementation (<\|..)      │
│   ┗ Dependency (..>)            │
│ Label: [             ]          │
│ [+ Connect]                     │
└────────────────────────────────┘
```

`inheritance` / `implementation` は方向が固定 (`from = child, to = parent`)。kind 切替時に自動 swap (Component の lollipop と同じ仕組み)。

---

## 7. テスト戦略

### 7.1 Unit (推定 +51 tests, 全体 ~360 tests)

| ファイル | tests | 内容 |
|---|---|---|
| `tests/class-parser.test.js` | ~25 | 4 element kinds / 6 relation kinds / member parsing (visibility/static/abstract) / stereotype / generics (含 nested `Map<K,V>`) / package + namespace nesting |
| `tests/class-updater.test.js` | ~20 | add/update/delete each element kind / member 追加・編集・削除 / rename refs / line ops / canonical emit |
| `tests/class-overlay.test.js` | ~6 | buildOverlay (entity selector + relation 6 kind data-relation-kind 付与) |

### 7.2 E2E (推定 +32 tests, 全体 ~112 tests)

業務 UC × 8 件 (master spec § 9):

| UC | 業務状況 | 主要操作 |
|---|---|---|
| UC-1 | 新規 OO 設計 (Order システム) | class + attributes + methods 追加、association |
| UC-2 | インターフェース定義 → 実装クラス追加 | interface → class with `<\|..` |
| UC-3 | 抽象基底クラス + 派生クラス | abstract → 継承 `<\|--` |
| UC-4 | 列挙型 + 状態フィールド | enum + class with enum 型 attribute |
| UC-5 | コンポジション/集約の表現 | `*--` / `o--` で構造化 |
| UC-6 | ステレオタイプで分類 | `<<Entity>>` 等で意味付け |
| UC-7 | ジェネリクスで型ライブラリ | `Container<T>`, `Map<K, V>` |
| UC-8 | リファクタリング (rename + 参照追従) | renameWithRefs across all 6 relation kinds |

各 UC で α (DSL technical) / γ-form / γ-overlay の 3 軸 → 24-cell α/γ matrix + 8 個別 E2E spec。

### 7.3 Visual sweep (Evaluator)

24-cell matrix を Evaluator に dispatch。**観点 A/B/C/J 適用、観点 J は特に重要** (class box は重複表現が多い: 全体 rect + visibility marker + member text の dedup が必須)。

### 7.4 Regression 防止

- Phase A 完了時点で `npm run test:all` GREEN (parser 追加で sequence/usecase/component に影響なし)
- Phase B 完了時点で同上 (updater + UI 追加で既存 module に影響なし)
- Phase C 完了時点で全 E2E pass (Class 含む)

---

## 8. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| **Generics parser fragility** | `Map<K, V>` の `<` が継承記号 `<\|--` と衝突、`Foo<Bar>` の `<` も同様 | parser で先に relation regex を試し (継承は `<\|--` 単独トークン、必ずスペース挟む)、ID parse 時のみ `<...>` を generics として解釈。test fixture で nested generics + 継承が混在するパターンを必ず含める |
| **Member 行の修飾子組合せ爆発** | 12 通り (`+/-/#/~` × static yes/no × abstract yes/no for methods) | 修飾子を独立フラグとして parse。組合せテストは parametrized で 12 ケース全網羅 |
| **PlantUML enum SVG が他と異なる構造** | overlay の entity matching が壊れる | 実機 enum SVG を fixture 化、selector が `g.entity[data-qualified-name]` で動くか先に確認 (動かなければ enum 専用 selector 追加) |
| **member 編集 panel の DOM 量増加** | 大きなクラス (50+ members) で UI もたつく | renderProps 内で member は document fragment 経由で一括 append。DOM 操作 ~200回/render を許容上限とする |
| **abstract class 2-token キーワード** | `abstract class Foo` の 2 トークンを正しく parse | parser 冒頭で `abstract` トークンを peek、続いて `class` なら abstract フラグ付きで進む |
| **stereotype と generics の混在順序揺れ** | `class Foo<T> <<Entity>>` vs `class Foo <<Entity>><T>` | canonical form では「ID → 任意の generics → 任意の stereotype」順で固定。parser は両順序を受理、emit は canonical のみ |
| **enum 値リストの DSL 形式** | `RED, GREEN, BLUE` か `RED;\nGREEN;\nBLUE;` か | block 内に 1 値 1 行 (改行区切り、末尾 `;` 任意) を canonical とする。`,` 区切りも parser で受理 |
| **detectDiagramType の Component との衝突** | Component diagram も `interface` キーワードを持つ | detectDiagramType の priority を見直し、`abstract\|enum` キーワードや 6 種の relation のいずれかが出現したら Class、それ以外で `class` キーワードが Component の relation/lollipop と共存しなければ Class、を判定。Component は lollipop / port を強い指標とする |
| **Phase A の 14 commits が大きい** | 途中で別タスクが入ると context が破壊される | 1 commit = 1 機能 (1 element kind / 1 relation kind / 1 拡張) で粒度を細かく刻む。各 commit で `npm run test:unit` GREEN ゲート |

---

## 9. v0.6.1+ への明示繰越

以下は v0.6.0 に含めない:

- **Member 個別 SVG クリック選択** (`extractMultiLineTextBBoxes` API、Activity v0.7.0 と統合設計)
- **クラス内クラス (内部クラス)** — Tier2
- **Note on class** — Tier2
- **Drag-to-connect** — v0.7.0 以降の段階導入
- **Package / namespace 範囲選択 → wrap** — v0.7.0 以降
- **Sequence の multi-select connect** (v0.5.0 から繰越済)

---

## 10. 開始手順

v0.6.0 スプリント着手時:

1. `feat/tier1-class` ブランチ作成 (master 派生済)
2. `docs/adr/ADR-107-class-canonical-form.md` commit
3. writing-plans skill で `docs/superpowers/plans/2026-04-26-class-v0.6.0.md` 策定
4. Phase A 実施: parser
5. Phase B 実施: updater + property panel + buildOverlay + multi-select connect
6. Phase C 実施: E2E 8 UC + Evaluator visual sweep
7. Phase D 実施: README + CHANGELOG + PR
8. PR 作成 → user 承認後 master merge (CLAUDE.md 規約)
