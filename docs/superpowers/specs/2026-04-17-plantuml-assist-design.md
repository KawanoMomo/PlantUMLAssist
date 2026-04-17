# PlantUMLAssist Design Spec

- **作成日**: 2026-04-17
- **ステータス**: 承認済
- **対象バージョン**: v0.1.0 (MVP Tier1 完備)
- **類似プロジェクト**: `05_MermaidAssist`

## ゴール

PlantUML 記法を GUI で編集できる開発者向けツール。MermaidAssist の設計パターンを踏襲しつつ、PlantUML 固有の Java 依存をバックエンドで吸収する。組み込みエンジニア業務 (UML 設計書、IEC 61508 Safety Case 等) を想定。

## スコープ

### Tier1 (v0.1.0 〜 v1.0.0, UML 主要 6 図形)

1. **Sequence Diagram** — メッセージシーケンス設計
2. **Use Case Diagram** — ユースケース分析
3. **Class Diagram** — OO 設計
4. **Activity Diagram** — 処理フロー
5. **Component Diagram** — システムブロック
6. **State Diagram** — ステートマシン

### 対象外 (Tier2+ 候補、本仕様範囲外)

- Deployment / ER / Gantt / Mindmap / WBS / JSON / YAML / Salt (GUI) / Timing / Network (nwdiag) / Block / Chronology

## アーキテクチャ

### 全体構成

```
06_PlantUMLAssist/
├── plantuml-assist.html       # UI エントリポイント
├── src/
│   ├── core/                  # MermaidAssist から流用
│   │   ├── date-utils.js
│   │   ├── html-utils.js
│   │   ├── text-updater.js
│   │   ├── parser-utils.js    # detectDiagramType を PlantUML 用に
│   │   ├── history.js
│   │   ├── selection.js
│   │   └── connection-mode.js
│   ├── ui/
│   │   └── properties.js      # 14 helpers 流用
│   ├── modules/
│   │   ├── sequence.js
│   │   ├── usecase.js
│   │   ├── class.js
│   │   ├── activity.js
│   │   ├── component.js
│   │   └── state.js
│   └── app.js                 # init + editor events + render pipeline (非同期)
├── server.py                  # Python 3 backend (~150 行)
├── lib/
│   └── plantuml.jar           # 同梱 (MIT license)
├── tests/
│   ├── run-tests.js
│   ├── *-parser.test.js
│   ├── *-updater.test.js
│   └── e2e/*.spec.js
├── docs/
│   ├── adr/                   # プロジェクト ADR (ADR-101+ から開始、MermaidAssist と番号衝突回避)
│   ├── ecn/
│   └── superpowers/
├── README.md
└── LICENSE (MIT)
```

### server.py 役割

Python 3 標準ライブラリのみで実装 (Flask 等の追加依存なし)。

**エンドポイント:**

- `GET /` → `plantuml-assist.html` 配信
- `GET /<path>` → 静的ファイル (src, lib)
- `POST /render` → リクエストボディ `{text, mode}` → SVG 返却

**render モード:**

- **local** (デフォルト):
  ```python
  proc = subprocess.run(['java', '-jar', 'lib/plantuml.jar', '-tsvg', '-pipe'],
                        input=text.encode('utf-8'),
                        capture_output=True, timeout=30)
  return proc.stdout  # SVG
  ```
- **online**:
  ```python
  encoded = plantuml_encode(text)  # deflate + base64 (PlantUML 仕様)
  resp = urllib.request.urlopen(f'https://www.plantuml.com/plantuml/svg/{encoded}')
  return resp.read()
  ```

**エラーハンドリング:**

- `java not found` → `{error: "Java 未インストール", suggestion: "online モードに切替"}` 返却、UI 側で自動切替確認
- `jar not found` → 同上
- subprocess timeout (30s) → `{error: "Render timeout"}`
- PlantUML syntax error (stderr 出力含む) → UI にエラー表示

### フロント側 render パイプライン

MermaidAssist と違い非同期。`scheduleRefresh()` 内で:

1. Editor の text を取得
2. `POST /render` へ送信
3. レスポンス SVG を `#preview-svg` に `innerHTML` 挿入
4. `buildOverlay` 実行 (オーバーレイ層に overlay 要素生成)
5. エラー時は `<p class="render-error">` 表示

**設定 UI:**

- ツールバーに `<select id="render-mode">` (local / online)
- 変更時 `localStorage.setItem('plantuml-render-mode', value)` 保存
- 初期値は `local`

### モジュール設計

MermaidAssist DiagramModule v2 インターフェースを完全踏襲。`type` のみ PlantUML 用に:

```javascript
window.MA.modules.plantumlSequence = {
  type: 'plantuml-sequence',
  displayName: 'Sequence',
  detect: function(text) { ... },       // @startuml + participants の検出
  parse: function(text) { ... },
  template: function() { return '@startuml\nAlice -> Bob: Hello\n@enduml'; },
  buildOverlay: ...,
  renderProps: ...,
  operations: { add, delete, update, moveUp, moveDown, connect },
};
```

**type 衝突回避**: MermaidAssist と同じ figure name (Sequence, Class, State) があるため、`plantuml-` prefix を `type` に付与。HTML の `<option value="plantuml-sequence">` も同様。

### PlantUML syntax detection

`src/core/parser-utils.js` の `detectDiagramType`:

```javascript
function detectDiagramType(text) {
  if (!text || !text.trim()) return null;
  // Skip @startuml header, look for first diagram-defining line
  var lines = text.split('\n');
  var inBlock = false;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t || t.indexOf("'") === 0) continue;  // PlantUML comment is '
    if (/^@startuml/.test(t)) { inBlock = true; continue; }
    if (/^@enduml/.test(t)) break;
    if (!inBlock) continue;

    // Heuristic detection based on first substantive line
    if (/^(actor|participant|boundary|control|entity|database|queue|collections)\b/.test(t)) return 'plantuml-sequence';
    if (/\s(->|-->|<-|<--|<->)\s/.test(t)) return 'plantuml-sequence';  // fallback for direct messages
    if (/^(usecase|:.+:\s*->\s*\()/.test(t)) return 'plantuml-usecase';
    if (/^(class|interface|abstract|enum)\b/.test(t)) return 'plantuml-class';
    if (/^(start|:.+;|if\s+\(|fork)/.test(t)) return 'plantuml-activity';
    if (/^(\[.+\]|component|interface|package)/.test(t)) return 'plantuml-component';
    if (/^(state|\[\*\]\s*-->)/.test(t)) return 'plantuml-state';
    return 'plantuml-sequence';  // default fallback
  }
  return null;
}
```

**課題**: PlantUML は図形タイプが構文から暗黙に決まるケース多数 (例: `@startuml\nAlice -> Bob\n@enduml` は Sequence)。誤判定時は手動 `<select>` で切替可能にする。

## データモデル (例: Sequence)

```js
{
  meta: { title: '' },
  elements: [
    { kind: 'participant', id: 'Alice', type: 'actor', line: 2 },
    { kind: 'participant', id: 'Bob', type: 'participant', line: 3 },
  ],
  relations: [
    { id: '__m_0', kind: 'message', from: 'Alice', to: 'Bob', arrow: '->', label: 'Hello', line: 5 },
  ],
  groups: [],  // for note, group, alt, loop
}
```

各モジュールは自身の意味論で適切なモデルを定義 (MermaidAssist パターン同様)。

## 流用する ADR / 新規 ADR

### 流用 (MermaidAssist から)

| ADR | 適用 | 備考 |
|---|---|---|
| ADR-011 (JS外部分割) | ✓ | 同一パターン |
| ADR-012 (DiagramModule v2) | ✓ | type に plantuml- prefix |
| ADR-013 (Connection Mode) | ✓ | 汎用 pattern |
| ADR-014 (Visual Verification Gate) | ✓ | evaluator で同様 sweep |
| ADR-015 (Vertical relation form) | ✓ | UI 統一 |
| ADR-016 (system-tester) | ✓ | 同一プロセス |
| ADR-018 (registry merge) | ✓ | 教訓踏まえ初期から merge 方式 |
| workspace ADR-011 (Tab-to-indent) | ✓ | DSL エディタ必須 |

### 新規 (PlantUMLAssist 固有)

| ADR-NNN | タイトル | カテゴリ |
|---|---|---|
| ADR-101 | Python バックエンド選定 | アーキテクチャ |
| ADR-102 | Java 非同期 render pipeline | インターフェース |
| ADR-103 | Local / Online render モード切替 | 配布・運用 |
| ADR-104 | PlantUML type detection heuristic | インターフェース |

ADR-101 番から開始してワークスペース共通 ADR-001〜010 + MermaidAssist ADR-011〜019 との番号衝突を回避。

## テスト戦略

MermaidAssist と同一フレーム:

- **Unit tests** (Node runner): 各モジュールの parse/updater、~15-20 tests/module
- **E2E** (Playwright): 各図形の switch + render + add/update/delete、~8-10 tests/module
- **Visual sweep** (evaluator): 実機 SVG 確認、console error 0 (ADR-014)
- **Local + Online 両モード** で E2E 実行 (Java 環境差の検出)

### render pipeline 固有テスト

- Java 未インストール環境でエラー表示確認
- Jar 欠損時のフォールバック確認
- Timeout 時のユーザー通知確認
- Online モードでの deflate+base64 encoding 精度 (既知 PlantUML 入力と参考 URL との一致)

## リリースロードマップ

| Version | 機能 |
|---|---|
| v0.1.0 | Backend + Sequence Diagram 最小実装 |
| v0.2.0 | Use Case |
| v0.3.0 | Class |
| v0.4.0 | Activity |
| v0.5.0 | Component |
| v1.0.0 | State + Tier1 完備 |
| v1.x | Tier2 以降、Mermaid 同様の Phase 方式 |

## 配布

- **GitHub public repo** (MermaidAssist と並列)
- **同梱 jar**: PlantUML 公式から最新版 (MIT license) を取得、`lib/plantuml.jar`
- **Java 必須**: README に `java -version` で確認する旨明記、未インストール時は online モードへの誘導
- **server.py 起動**: `python server.py` で `http://127.0.0.1:8766` を listen (MermaidAssist の 8765 と重複回避)

## 想定リスク

| リスク | 影響 | 対応 |
|---|---|---|
| PlantUML jar サイズ (~10MB) | リポジトリ重くなる | Git LFS 検討、または jar は同梱せず README でダウンロード手順案内 |
| Java バージョン互換 | render error | Java 8+ を README で明記、version check を server.py 起動時に実施 |
| Syntax detection 誤判定 | 誤った UI 表示 | 手動切替可、初期実装は保守的判定 + 誤判定時 fallback = Sequence |
| plantuml.com レート制限 | Online 利用不可 | 429 受信時 local へ自動切替提案 |
| subprocess timeout | UX 低下 | 30s timeout + spinner 表示 |

## 完了基準 (v0.1.0)

- Backend `python server.py` 起動成功
- Sequence Diagram 基本操作 (participant/message 追加/削除/更新) UI から完遂
- Unit tests 全 PASS + E2E 全 PASS
- Visual sweep PASS (console error 0)
- README.md + LICENSE + Git 公開
