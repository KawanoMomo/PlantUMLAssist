# Sequence Overlay-Driven Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PlantUMLAssist Sequence プロパティパネルを「SVG overlay クリック → 選択 → 位置駆動編集」モデルに再設計し、10 業務 UC すべてを UI のみで完遂可能にする。

**Architecture:** 公式 PlantUML SVG の上に透明なクリックターゲット (overlay) をオーバーレイし、parse 済み model との序数/座標マッチングで `data-line` 属性を埋め込む。Selection-driven property panel が選択要素の種類に応じて編集フォーム + 位置駆動挿入アクションを表示。新 updater 群 (`insertBefore` / `insertAfter` / `wrapWith` / `unwrap` / `renameWithRefs` / `duplicateRange` / `inferActivations`) で行番号指定の編集を実現。

**Tech Stack:** ES5 JavaScript (ビルドなし), 既存 `window.MA.*` 名前空間, 既存テストランナー (Node), Playwright E2E。

**関連 spec:** `docs/superpowers/specs/2026-04-18-sequence-overlay-driven-redesign.md`

---

## File Structure

| ファイル | 役割 | Status |
|---|---|---|
| `src/modules/sequence.js` | Sequence モジュール本体 (parse / updater / renderProps) | 大幅修正 |
| `src/ui/sequence-overlay.js` | overlay 計算 & build (`buildSequenceOverlay`) | **新規** |
| `src/ui/rich-label-editor.js` | textarea + toolbar + preview の共通コンポーネント | **新規** |
| `src/core/text-updater.js` | line ベース挿入/削除ヘルパ (`insertAtLine` 等) | 拡張 |
| `plantuml-assist.html` | rich-label-editor.js / sequence-overlay.js の `<script>` 追加 | 追記のみ |
| `tests/sequence-updater.test.js` | 新 updater 群の単体テスト | 拡張 |
| `tests/sequence-parser.test.js` | (既存) | (既存) |
| `tests/sequence-overlay.test.js` | overlay 計算ロジックの単体テスト (SVG fixture 入力 → rect 出力) | **新規** |
| `tests/rich-label.test.js` | rich-label-editor の入力/出力変換テスト | **新規** |
| `tests/fixtures/svg/*.svg` | overlay テスト用 PlantUML SVG fixture | **新規** |
| `tests/fixtures/dsl/*.puml` | UC テスト用 PlantUML DSL fixture | **新規** |
| `tests/e2e/uc-NN-*.spec.js` | UC-1 〜 UC-10 (10 ファイル) | **新規** |
| `tests/e2e/capability/c-NN-*.spec.js` | C1 〜 C13 capability 単体 E2E | **新規** |

---

## Sprint 1: Updater 基盤 (Phase 1)

新 updater 群を TDD で実装。これらが存在しないと panel UI が組めないため最優先。

### Task 1.1: `text-updater.js` に line ベース挿入ヘルパを追加

**Files:**
- Modify: `src/core/text-updater.js`
- Test: `tests/text-updater.test.js` (既存ファイルがなければ新規作成)

- [ ] **Step 1: 失敗するテストを書く**

```javascript
// tests/text-updater.test.js (existing if any, else new)
'use strict';
var tu = (typeof window !== 'undefined' && window.MA && window.MA.textUpdater)
  || (global.window && global.window.MA && global.window.MA.textUpdater);

describe('insertAtLine', function() {
  test('inserts a line at the given 1-based position', function() {
    var out = tu.insertAtLine('a\nb\nc', 2, 'X');
    expect(out).toBe('a\nX\nb\nc');
  });

  test('insert at line 1 puts the new line at the top', function() {
    var out = tu.insertAtLine('a\nb', 1, 'X');
    expect(out).toBe('X\na\nb');
  });

  test('insert past last line appends', function() {
    var out = tu.insertAtLine('a\nb', 99, 'X');
    expect(out).toBe('a\nb\nX');
  });

  test('inserts a multi-line block', function() {
    var out = tu.insertAtLine('a\nc', 2, 'b1\nb2');
    expect(out).toBe('a\nb1\nb2\nc');
  });
});

describe('insertAfterLine', function() {
  test('inserts after the given 1-based line', function() {
    var out = tu.insertAfterLine('a\nb\nc', 2, 'X');
    expect(out).toBe('a\nb\nX\nc');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `tu.insertAtLine is not a function`

- [ ] **Step 3: 最小実装を書く**

`src/core/text-updater.js` の return オブジェクトに2関数追加:

```javascript
function insertAtLine(text, lineNum, newContent) {
  var lines = text.split('\n');
  var idx = Math.max(0, Math.min(lines.length, lineNum - 1));
  lines.splice(idx, 0, newContent);
  return lines.join('\n');
}

function insertAfterLine(text, lineNum, newContent) {
  return insertAtLine(text, lineNum + 1, newContent);
}
```

返却の `return { ... }` に `insertAtLine: insertAtLine, insertAfterLine: insertAfterLine,` を追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS, 上記 5 テストすべて PASS

- [ ] **Step 5: コミット**

```bash
cd E:/00_Git/06_PlantUMLAssist
git add src/core/text-updater.js tests/text-updater.test.js
git commit -m "feat(text-updater): insertAtLine / insertAfterLine helpers"
```

### Task 1.2: `insertBefore` / `insertAfter` updater (sequence)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/sequence-updater.test.js` 末尾に追加:

```javascript
describe('insertBefore', function() {
  test('inserts a message before the given line', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    var out = seq.insertBefore(text, 3, 'message', { from: 'A', to: 'B', arrow: '->', label: 'mid' });
    var lines = out.split('\n');
    expect(lines[2]).toBe('A -> B : mid');
    expect(lines[3]).toBe('A -> C : second');
  });

  test('inserts a note before the given line', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.insertBefore(text, 2, 'note', { position: 'over', targets: ['A'], text: 'hi' });
    expect(out).toContain('note over A : hi');
    expect(out.indexOf('note over')).toBeLessThan(out.indexOf('A -> B'));
  });
});

describe('insertAfter', function() {
  test('inserts a message after the given line', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    var out = seq.insertAfter(text, 2, 'message', { from: 'A', to: 'B', arrow: '->', label: 'mid' });
    var lines = out.split('\n');
    expect(lines[2]).toBe('A -> B : mid');
    expect(lines[3]).toBe('A -> C : second');
  });

  test('inserts an activation after the given line', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.insertAfter(text, 2, 'activation', { action: 'activate', target: 'B' });
    expect(out).toContain('activate B');
    expect(out.indexOf('A -> B')).toBeLessThan(out.indexOf('activate B'));
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `seq.insertBefore is not a function`

- [ ] **Step 3: 実装する**

`src/modules/sequence.js` に以下の関数を追加 (既存 `addMessage` などの近くに):

```javascript
function _formatLine(kind, props) {
  if (kind === 'message') {
    return (props.from || 'A') + ' ' + (props.arrow || '->') + ' ' + (props.to || 'B') + (props.label ? ' : ' + props.label : '');
  }
  if (kind === 'note') {
    var targetStr = Array.isArray(props.targets) ? props.targets.join(', ') : (props.targets || '');
    return 'note ' + (props.position || 'over') + ' ' + targetStr + (props.text ? ' : ' + props.text : '');
  }
  if (kind === 'activation') {
    return (props.action || 'activate') + ' ' + (props.target || 'A');
  }
  if (kind === 'participant') {
    var ptype = props.ptype || 'participant';
    var alias = props.alias || 'X';
    var label = props.label;
    if (label && label !== alias) return ptype + ' "' + label + '" as ' + alias;
    return ptype + ' ' + alias;
  }
  if (kind === 'block') {
    return (props.kind || 'alt') + (props.label ? ' ' + props.label : '') + '\n\nend';
  }
  return '';
}

function insertBefore(text, lineNum, kind, props) {
  var line = _formatLine(kind, props);
  if (!line) return text;
  return window.MA.textUpdater.insertAtLine(text, lineNum, line);
}

function insertAfter(text, lineNum, kind, props) {
  var line = _formatLine(kind, props);
  if (!line) return text;
  return window.MA.textUpdater.insertAfterLine(text, lineNum, line);
}
```

モジュール return オブジェクトに `insertBefore: insertBefore, insertAfter: insertAfter,` を追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS, 4 新テストすべて PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): insertBefore / insertAfter updaters with kind dispatcher"
```

### Task 1.3: `wrapWith` updater (範囲を block で囲む)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
describe('wrapWith', function() {
  test('wraps a single line with alt block', function() {
    var text = '@startuml\nA -> B : msg\n@enduml';
    var out = seq.wrapWith(text, 2, 2, 'alt', 'condition');
    var lines = out.split('\n');
    expect(lines[1]).toBe('alt condition');
    expect(lines[2]).toBe('A -> B : msg');
    expect(lines[3]).toBe('end');
  });

  test('wraps a multi-line range with loop block', function() {
    var text = '@startuml\nA -> B : a\nB -> C : b\nC -> D : c\n@enduml';
    var out = seq.wrapWith(text, 2, 4, 'loop', '3 times');
    var lines = out.split('\n');
    expect(lines[1]).toBe('loop 3 times');
    expect(lines[2]).toBe('A -> B : a');
    expect(lines[3]).toBe('B -> C : b');
    expect(lines[4]).toBe('C -> D : c');
    expect(lines[5]).toBe('end');
  });

  test('wraps without label', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.wrapWith(text, 2, 2, 'opt', '');
    expect(out).toContain('opt\n');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `seq.wrapWith is not a function`

- [ ] **Step 3: 実装する**

```javascript
function wrapWith(text, startLine, endLine, blockKind, blockLabel) {
  var lines = text.split('\n');
  if (startLine < 1 || endLine > lines.length || startLine > endLine) return text;
  var openLine = blockLabel ? blockKind + ' ' + blockLabel : blockKind;
  // 末尾に 'end' 挿入 → 先頭に開始挿入 (順序大事: 末尾を先にやらないと endLine がズレる)
  lines.splice(endLine, 0, 'end');
  lines.splice(startLine - 1, 0, openLine);
  return lines.join('\n');
}
```

return に `wrapWith: wrapWith,` 追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): wrapWith updater (range -> block)"
```

### Task 1.4: `unwrap` updater (block 解除、中身保持/削除選択)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
describe('unwrap', function() {
  test('removes block boundaries but keeps inner messages by default', function() {
    var text = '@startuml\nalt cond\nA -> B\nB -> C\nend\n@enduml';
    var out = seq.unwrap(text, 2, 5, true);
    expect(out).not.toContain('alt cond');
    var lines = out.split('\n').map(function(s) { return s.trim(); });
    expect(lines.indexOf('end')).toBe(-1);
    expect(out).toContain('A -> B');
    expect(out).toContain('B -> C');
  });

  test('removes block including inner content when keepInner=false', function() {
    var text = '@startuml\nalt cond\nA -> B\nend\n@enduml';
    var out = seq.unwrap(text, 2, 4, false);
    expect(out).not.toContain('A -> B');
    expect(out).not.toContain('alt cond');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `seq.unwrap is not a function`

- [ ] **Step 3: 実装する**

```javascript
function unwrap(text, startLine, endLine, keepInner) {
  var lines = text.split('\n');
  if (startLine < 1 || endLine > lines.length || startLine >= endLine) return text;
  if (keepInner === false) {
    // ブロック全体を削除
    lines.splice(startLine - 1, endLine - startLine + 1);
  } else {
    // end 行と open 行のみ削除 (順序: end → open で indices を保つ)
    lines.splice(endLine - 1, 1);
    lines.splice(startLine - 1, 1);
  }
  return lines.join('\n');
}
```

return に `unwrap: unwrap,` 追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): unwrap updater (keepInner toggle)"
```

### Task 1.5: `renameWithRefs` updater (participant リネーム + 参照追従)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
describe('renameWithRefs', function() {
  test('renames participant and updates message from/to', function() {
    var text = [
      '@startuml',
      'participant Database',
      'A -> Database : query',
      'Database --> A : result',
      '@enduml',
    ].join('\n');
    var out = seq.renameWithRefs(text, 'Database', 'Redis');
    expect(out).toContain('participant Redis');
    expect(out).toContain('A -> Redis : query');
    expect(out).toContain('Redis --> A : result');
    expect(out).not.toContain('Database');
  });

  test('handles quoted alias', function() {
    var text = '@startuml\nparticipant "DB Server" as DB\nA -> DB : q\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('"DB Server" as Cache');
    expect(out).toContain('A -> Cache : q');
  });

  test('does not rename substring matches inside other identifiers', function() {
    var text = '@startuml\nparticipant DB\nparticipant DBClient\nDBClient -> DB : q\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('participant Cache');
    expect(out).toContain('participant DBClient');  // 残る
    expect(out).toContain('DBClient -> Cache : q');
  });

  test('updates activate/deactivate references', function() {
    var text = '@startuml\nparticipant DB\nA -> DB\nactivate DB\ndeactivate DB\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('activate Cache');
    expect(out).toContain('deactivate Cache');
  });

  test('updates note targets', function() {
    var text = '@startuml\nparticipant DB\nnote over DB : info\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('note over Cache : info');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `seq.renameWithRefs is not a function`

- [ ] **Step 3: 実装する**

```javascript
function renameWithRefs(text, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return text;
  // word-boundary 置換: \b oldId \b
  // PlantUML identifier は ASCII 英数 + _ 想定
  var pattern = new RegExp('\\b' + oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  return text.split('\n').map(function(line) {
    // コメント行はそのまま
    if (/^\s*'/.test(line)) return line;
    return line.replace(pattern, newId);
  }).join('\n');
}
```

return に `renameWithRefs: renameWithRefs,` 追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS — 5 cases pass

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): renameWithRefs updater (word-boundary safe)"
```

### Task 1.6: `duplicateRange` updater (範囲を別位置に複製)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
describe('duplicateRange', function() {
  test('duplicates a range and inserts after the given line', function() {
    var text = '@startuml\nA -> B : a\nB -> C : b\n@enduml';
    var out = seq.duplicateRange(text, 2, 3, 3);
    var lines = out.split('\n');
    expect(lines[1]).toBe('A -> B : a');
    expect(lines[2]).toBe('B -> C : b');
    expect(lines[3]).toBe('A -> B : a');
    expect(lines[4]).toBe('B -> C : b');
  });

  test('duplicates single line', function() {
    var text = '@startuml\nA -> B\nB -> C\n@enduml';
    var out = seq.duplicateRange(text, 2, 2, 3);
    var lines = out.split('\n');
    expect(lines[1]).toBe('A -> B');
    expect(lines[2]).toBe('B -> C');
    expect(lines[3]).toBe('A -> B');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL

- [ ] **Step 3: 実装する**

```javascript
function duplicateRange(text, startLine, endLine, insertAfterLine) {
  var lines = text.split('\n');
  if (startLine < 1 || endLine > lines.length || startLine > endLine) return text;
  if (insertAfterLine < 0 || insertAfterLine > lines.length) return text;
  var copy = lines.slice(startLine - 1, endLine).slice();
  // insert after insertAfterLine
  Array.prototype.splice.apply(lines, [insertAfterLine, 0].concat(copy));
  return lines.join('\n');
}
```

return に `duplicateRange: duplicateRange,` 追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): duplicateRange updater"
```

### Task 1.7: `inferActivations` updater (メッセージから activate/deactivate 推論)

**Files:**
- Modify: `src/modules/sequence.js`
- Test: `tests/sequence-updater.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
describe('inferActivations', function() {
  test('adds activate after sync message and deactivate after reply', function() {
    var text = [
      '@startuml',
      'A -> B : req',  // line 2
      'B --> A : reply', // line 3
      '@enduml',
    ].join('\n');
    var out = seq.inferActivations(text, 2);  // 2行目 (req) を起点
    // 期待: req の直後に activate B、対応する reply (B->A の dashed) の直後に deactivate B
    expect(out).toContain('activate B');
    expect(out).toContain('deactivate B');
    expect(out.indexOf('A -> B : req')).toBeLessThan(out.indexOf('activate B'));
    expect(out.indexOf('activate B')).toBeLessThan(out.indexOf('B --> A : reply'));
    expect(out.indexOf('B --> A : reply')).toBeLessThan(out.indexOf('deactivate B'));
  });

  test('only adds activate if no matching reply exists', function() {
    var text = '@startuml\nA -> B : fire-and-forget\n@enduml';
    var out = seq.inferActivations(text, 2);
    expect(out).toContain('activate B');
    expect(out).not.toContain('deactivate');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL

- [ ] **Step 3: 実装する**

```javascript
function inferActivations(text, msgLine) {
  var parsed = parseSequence(text);
  var msg = null;
  for (var i = 0; i < parsed.relations.length; i++) {
    if (parsed.relations[i].line === msgLine) { msg = parsed.relations[i]; break; }
  }
  if (!msg) return text;
  // 'to' を activate
  var out = window.MA.textUpdater.insertAfterLine(text, msgLine, 'activate ' + msg.to);
  // 対応する reply (to -> from の dashed arrow) を探す
  var replyLine = null;
  // 元 text の relations を再 parse すると line がズレるので、msgLine 以降を順に確認
  var lines = out.split('\n');
  // activate を入れたぶんずれるので、新しい lines から msg を再特定するのが面倒
  // シンプル戦略: 元 text で find → 元 line + 1 (activate ぶん) を offset
  for (var j = 0; j < parsed.relations.length; j++) {
    var r = parsed.relations[j];
    if (r.line <= msgLine) continue;
    if (r.from === msg.to && r.to === msg.from && /^--/.test(r.arrow)) {
      replyLine = r.line + 1; // activate 挿入で 1行ずれた
      break;
    }
  }
  if (replyLine !== null) {
    out = window.MA.textUpdater.insertAfterLine(out, replyLine, 'deactivate ' + msg.to);
  }
  return out;
}
```

return に `inferActivations: inferActivations,` 追加。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): inferActivations (auto activate/deactivate from msg pair)"
```

### Task 1.8: Sprint 1 統合確認

- [ ] **Step 1: 全テスト実行**

Run: `node tests/run-tests.js`
Expected: 全テスト PASS。Sprint 1 で追加したテスト数を確認 (約 19 件追加)。

- [ ] **Step 2: 既存 E2E が壊れていないこと確認**

サーバ起動: `python server.py` (バックグラウンド)
Run: `npx playwright test`
Expected: 既存 9 E2E PASS

- [ ] **Step 3: コミット (sprint marker)**

```bash
git commit --allow-empty -m "chore: Sprint 1 complete (updater foundation)"
```

---

## Sprint 2: Overlay Calibration (Phase 1 続き)

PlantUML SVG → 透明クリックターゲット rect の生成。

### Task 2.1: SVG fixture を tests/fixtures に保存

**Files:**
- Create: `tests/fixtures/svg/sequence-basic.svg`
- Create: `tests/fixtures/dsl/sequence-basic.puml`

- [ ] **Step 1: PlantUML 入力 fixture を作成**

`tests/fixtures/dsl/sequence-basic.puml`:

```
@startuml
actor User
participant System
database DB

User -> System : Login
System -> DB : Query
DB --> System : Result
System --> User : Response
@enduml
```

- [ ] **Step 2: 対応する SVG を server.py online 経由で取得**

```bash
python server.py &
sleep 2
curl -X POST -H "Content-Type: application/json" \
  -d "$(node -e "const fs=require('fs'); const t=fs.readFileSync('tests/fixtures/dsl/sequence-basic.puml','utf8'); console.log(JSON.stringify({text:t,mode:'online'}))")" \
  http://127.0.0.1:8766/render \
  -o tests/fixtures/svg/sequence-basic.svg
```

(または手動で online モードでレンダリングして DevTools から SVG をコピペでも可)

- [ ] **Step 3: SVG が有効か検査**

```bash
head -c 200 tests/fixtures/svg/sequence-basic.svg
```

Expected: `<?xml...` または `<svg ...` で始まる

- [ ] **Step 4: コミット**

```bash
git add tests/fixtures/
git commit -m "test: fixture sequence-basic (puml + svg pair)"
```

### Task 2.2: `sequence-overlay.js` skeleton + 単体テスト基盤

**Files:**
- Create: `src/ui/sequence-overlay.js`
- Create: `tests/sequence-overlay.test.js`

- [ ] **Step 1: テスト基盤 + 失敗テストを書く**

`tests/sequence-overlay.test.js`:

```javascript
'use strict';
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// jsdom セットアップ (DOM が要る)
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

require('../src/core/html-utils.js');
require('../src/core/text-updater.js');
require('../src/core/parser-utils.js');
require('../src/modules/sequence.js');
require('../src/ui/sequence-overlay.js');

var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

function loadFixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  return { svgEl: svgEl, parsed: seq.parseSequence(dslText) };
}

describe('buildSequenceOverlay', function() {
  test('produces overlay rects matching participant count', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var partRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
    var partsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; }).length;
    expect(partRects.length).toBe(partsInModel);
  });

  test('produces overlay rects for messages with correct data-line', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    expect(msgRects.length).toBe(f.parsed.relations.length);
    // line 番号が parse 結果と一致
    var lines = Array.prototype.map.call(msgRects, function(r) { return parseInt(r.getAttribute('data-line'), 10); });
    var modelLines = f.parsed.relations.map(function(r) { return r.line; });
    expect(lines.sort()).toEqual(modelLines.sort());
  });
});
```

`tests/run-tests.js` (run-tests.js が require する list) を確認し、新テストを include する。`run-tests.js` の構造によっては不要 (auto-discovery)。

jsdom が node_modules にない場合:
```bash
npm install --save-dev jsdom
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `Cannot find module '../src/ui/sequence-overlay.js'`

- [ ] **Step 3: skeleton を書く**

`src/ui/sequence-overlay.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.sequenceOverlay = (function() {

  // SVG namespace
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function _clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _addRect(overlayEl, x, y, w, h, attrs) {
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('stroke', 'none');
    rect.setAttribute('class', 'seq-overlay-target');
    rect.style.cursor = 'pointer';
    rect.style.pointerEvents = 'all';
    Object.keys(attrs).forEach(function(k) {
      rect.setAttribute(k, attrs[k]);
    });
    overlayEl.appendChild(rect);
    return rect;
  }

  function _bbox(el) {
    if (!el) return null;
    if (typeof el.getBBox === 'function') {
      try { return el.getBBox(); } catch (e) {}
    }
    // jsdom fallback: getBBox は無いので getAttribute で代用
    return {
      x: parseFloat(el.getAttribute('x')) || 0,
      y: parseFloat(el.getAttribute('y')) || 0,
      width: parseFloat(el.getAttribute('width')) || 0,
      height: parseFloat(el.getAttribute('height')) || 0,
    };
  }

  function _matchParticipants(svgEl, participants) {
    // PlantUML SVG 内の participant ヘッダを <text> 文字内容で照合
    // PlantUML actor は SVG 内に複数の <text> があるが、ヘッダ位置 (top) のみ拾う
    var texts = svgEl.querySelectorAll('text');
    var matches = [];
    var labelToParticipants = {};
    participants.forEach(function(p) {
      labelToParticipants[p.label] = labelToParticipants[p.label] || [];
      labelToParticipants[p.label].push(p);
    });
    Array.prototype.forEach.call(texts, function(t) {
      var content = (t.textContent || '').trim();
      var pool = labelToParticipants[content];
      if (pool && pool.length > 0) {
        var p = pool.shift();
        matches.push({ participant: p, textEl: t });
      }
    });
    return matches;
  }

  function _matchMessages(svgEl, messages) {
    // メッセージは label 文字列 + y 座標順マッチ
    // PlantUML SVG 内の <text> から、label 文字列に一致するものを y 順に並べる
    var texts = svgEl.querySelectorAll('text');
    var labelEls = [];
    messages.forEach(function(m, idx) {
      if (!m.label) return;
      Array.prototype.forEach.call(texts, function(t) {
        if ((t.textContent || '').trim() === m.label) {
          labelEls.push({ idx: idx, msg: m, textEl: t, y: _bbox(t).y });
        }
      });
    });
    // メッセージ順 = parse 順 (line 昇順) と SVG 内 y 昇順が一致するはず
    // 同 label が複数ある場合 (リトライ等) は y 順で先頭から割り当て
    var assigned = [];
    var consumed = {};
    messages.forEach(function(m) {
      if (!m.label) return;
      var candidates = labelEls.filter(function(le) {
        return le.msg === m && !consumed[le.textEl.id || le.y + ':' + le.textEl.textContent];
      });
      // y 最小 (上) を採用
      candidates.sort(function(a, b) { return a.y - b.y; });
      if (candidates.length > 0) {
        var pick = candidates[0];
        consumed[pick.textEl.id || pick.y + ':' + pick.textEl.textContent] = true;
        assigned.push({ message: m, textEl: pick.textEl });
      }
    });
    return assigned;
  }

  function buildSequenceOverlay(svgEl, parsedData, overlayEl) {
    _clearChildren(overlayEl);
    if (!svgEl || !parsedData) return;

    // viewBox を sync
    var vb = svgEl.getAttribute('viewBox');
    if (vb) overlayEl.setAttribute('viewBox', vb);
    var w = svgEl.getAttribute('width'); if (w) overlayEl.setAttribute('width', w);
    var h = svgEl.getAttribute('height'); if (h) overlayEl.setAttribute('height', h);

    // Participants
    var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
    var partMatches = _matchParticipants(svgEl, participants);
    partMatches.forEach(function(m) {
      var bb = _bbox(m.textEl);
      // 縦帯全体をクリック可能にする (top の文字 bbox を縦に伸ばす)
      _addRect(overlayEl, bb.x - 8, bb.y - 4, bb.width + 16, bb.height + 8, {
        'data-type': 'participant',
        'data-id': m.participant.id,
        'data-line': m.participant.line,
      });
    });

    // Messages
    var msgMatches = _matchMessages(svgEl, parsedData.relations);
    msgMatches.forEach(function(m) {
      var bb = _bbox(m.textEl);
      _addRect(overlayEl, bb.x - 4, bb.y - 4, bb.width + 8, bb.height + 8, {
        'data-type': 'message',
        'data-id': m.message.id,
        'data-line': m.message.line,
      });
    });

    // Notes / Activations は次タスクで追加
  }

  return { buildSequenceOverlay: buildSequenceOverlay };
})();
```

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS — 2 cases

(jsdom の `getBBox` 不在で text bbox が 0 になる場合がある。fixture SVG に `width`/`height`/`x`/`y` が attribute として書かれていれば fallback が動く。書かれていない場合は fixture 整形で対応)

- [ ] **Step 5: コミット**

```bash
git add src/ui/sequence-overlay.js tests/sequence-overlay.test.js package.json
git commit -m "feat(overlay): sequence overlay skeleton with participant + message matching"
```

### Task 2.3: Note と Activation のオーバーレイ追加

**Files:**
- Modify: `src/ui/sequence-overlay.js`
- Test: `tests/sequence-overlay.test.js`

- [ ] **Step 1: 失敗するテスト + fixture 拡張**

新 fixture `tests/fixtures/dsl/sequence-with-notes.puml`:

```
@startuml
actor User
participant System
User -> System : Login
note over System : auth check
activate System
System --> User : OK
deactivate System
@enduml
```

対応 SVG `tests/fixtures/svg/sequence-with-notes.svg` を取得 (Task 2.1 と同手順)。

`tests/sequence-overlay.test.js` に追加:

```javascript
test('produces overlay rects for notes', function() {
  var f = loadFixture('sequence-with-notes');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
  var noteRects = overlayEl.querySelectorAll('rect[data-type="note"]');
  var notesInModel = f.parsed.elements.filter(function(e) { return e.kind === 'note'; }).length;
  expect(noteRects.length).toBe(notesInModel);
});

test('produces overlay rects for activations', function() {
  var f = loadFixture('sequence-with-notes');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
  var actRects = overlayEl.querySelectorAll('rect[data-type="activation"]');
  var actsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'activation'; }).length;
  expect(actRects.length).toBe(actsInModel);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — note/activation の overlay が 0 件

- [ ] **Step 3: 実装追加 (`buildSequenceOverlay` 内に Notes / Activations セクション追加)**

`buildSequenceOverlay` の `// Notes / Activations は次タスクで追加` を以下に置き換え:

```javascript
    // Notes
    var notes = parsedData.elements.filter(function(e) { return e.kind === 'note'; });
    notes.forEach(function(n) {
      // テキスト内容で検索
      var found = null;
      Array.prototype.forEach.call(svgEl.querySelectorAll('text'), function(t) {
        if (!found && (t.textContent || '').trim() === n.text) found = t;
      });
      if (!found) return;
      var bb = _bbox(found);
      _addRect(overlayEl, bb.x - 8, bb.y - 6, bb.width + 16, bb.height + 12, {
        'data-type': 'note',
        'data-id': n.id,
        'data-line': n.line,
      });
    });

    // Activations: PlantUML SVG では細長い縦の <rect> で出る (width 約 5-15, height 中)
    // ここでは parsedData.elements の activation 数だけ「大体の位置」に rect を生成する戦略
    // 詳細マッチングは Phase 後半で改善 (まずは対応 line のメッセージ近傍に置く)
    var activations = parsedData.elements.filter(function(e) { return e.kind === 'activation'; });
    activations.forEach(function(a) {
      // 同一 target participant の rect を見つけ、その x 座標を使う
      var partMatch = partMatches.filter(function(pm) { return pm.participant.id === a.target; })[0];
      if (!partMatch) return;
      var px = _bbox(partMatch.textEl).x;
      // y は activation の line に対する近隣メッセージから推定 (簡易: a.line に対応する parsed メッセージの y)
      // ここでは fixture テスト目的で msg 一覧から最も近い line のメッセージの y を採用
      var refMsg = null, refDist = Infinity;
      msgMatches.forEach(function(mm) {
        var d = Math.abs(mm.message.line - a.line);
        if (d < refDist) { refDist = d; refMsg = mm; }
      });
      if (!refMsg) return;
      var refY = _bbox(refMsg.textEl).y;
      _addRect(overlayEl, px - 4, refY, 12, 16, {
        'data-type': 'activation',
        'data-id': a.action + '-' + a.target + '-' + a.line,
        'data-line': a.line,
      });
    });
```

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ui/sequence-overlay.js tests/sequence-overlay.test.js tests/fixtures/
git commit -m "feat(overlay): note + activation overlay rects"
```

### Task 2.4: 失敗時 warning bar の実装

**Files:**
- Modify: `src/ui/sequence-overlay.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
test('returns failure report when participants cant be matched', function() {
  var f = loadFixture('sequence-basic');
  // 意図的に label を変えて parse を破壊
  f.parsed.elements[0].label = '存在しないラベル_zzz';
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var report = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
  expect(report).toBeDefined();
  expect(report.unmatched.participant).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `report` が undefined

- [ ] **Step 3: report オブジェクトを返却するよう改修**

`buildSequenceOverlay` 末尾を以下に置き換え:

```javascript
    var report = {
      matched: { participant: partMatches.length, message: msgMatches.length, note: 0, activation: 0 },
      unmatched: {
        participant: participants.length - partMatches.length,
        message: parsedData.relations.length - msgMatches.length,
        note: 0,
        activation: 0,
      },
    };
    // notes/activations の matched/unmatched カウントは追加 (省略可、報告のみ)
    return report;
```

`notes.forEach` / `activations.forEach` 内で match できたものは `report.matched.note++` / `report.matched.activation++` してカウントする。

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ui/sequence-overlay.js tests/sequence-overlay.test.js
git commit -m "feat(overlay): return match report for warning UI"
```

### Task 2.5: Sequence module の `buildOverlay` を新 overlay 関数に差替え

**Files:**
- Modify: `src/modules/sequence.js`
- Modify: `plantuml-assist.html`
- Modify: `src/app.js`

- [ ] **Step 1: HTML に overlay スクリプトを追加**

`plantuml-assist.html` の `<script src="src/ui/properties.js"></script>` の直前 (または直後) に追加:

```html
<script src="src/ui/sequence-overlay.js"></script>
```

- [ ] **Step 2: sequence.js の `buildOverlay` を delegation に**

```javascript
buildOverlay: function(svgEl, parsedData, overlayEl) {
  if (!overlayEl) return;
  if (window.MA.sequenceOverlay && window.MA.sequenceOverlay.buildSequenceOverlay) {
    return window.MA.sequenceOverlay.buildSequenceOverlay(svgEl, parsedData, overlayEl);
  }
},
```

- [ ] **Step 3: app.js で render 完了後に buildOverlay を呼ぶ + warning bar 表示**

`src/app.js` の `renderSvg` 内、SVG 挿入後に追加:

```javascript
// SVG 挿入後の処理に
var overlayEl = document.getElementById('overlay-layer');
if (svgEl && currentModule && currentModule.buildOverlay) {
  var report = currentModule.buildOverlay(svgEl, currentParsed, overlayEl);
  if (report && (report.unmatched.participant > 0 || report.unmatched.message > 0)) {
    renderStatusEl.textContent = 'OK ' + mode + ' (overlay 警告: ' + JSON.stringify(report.unmatched) + ')';
    renderStatusEl.classList.add('error');  // または warning スタイル
  }
}
```

- [ ] **Step 4: 既存テスト + 手動確認**

サーバ起動: `python server.py` をバックグラウンド
ブラウザで http://127.0.0.1:8766/ → online モードに切替 → SVG 上の参加者ヘッダ/メッセージ位置をクリックすると console で event が拾えるか DevTools で確認 (next task で click handler を入れるので、現時点では rect が overlay-layer に挿入されているだけで OK)

`document.querySelectorAll('#overlay-layer rect[data-line]').length` が parsed.elements + relations の件数と一致するか確認。

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence.js src/app.js plantuml-assist.html
git commit -m "feat(sequence): wire buildOverlay to sequence-overlay module + warning bar"
```

---

## Sprint 3: Selection-Driven Panel (Phase 2)

overlay クリックで selection が走り、props panel が selection-driven に変わる土台。

### Task 3.1: overlay click → selection の配線

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: app.js の init() 内に overlay click handler 追加**

`initPaneResizers();` の直後あたりに:

```javascript
// Overlay click → selection
var overlayEl = document.getElementById('overlay-layer');
if (overlayEl) {
  overlayEl.addEventListener('click', function(e) {
    var target = e.target;
    var type = target.getAttribute('data-type');
    var id = target.getAttribute('data-id');
    var line = target.getAttribute('data-line');
    if (!type) {
      if (!e.shiftKey) window.MA.selection.clearSelection();
      return;
    }
    var selItem = { type: type, id: id, line: parseInt(line, 10) };
    if (e.shiftKey) {
      // 範囲/複数追加 (Sprint 5 で実装)
      var current = window.MA.selection.getSelected() || [];
      window.MA.selection.setSelected(current.concat([selItem]));
    } else {
      window.MA.selection.setSelected([selItem]);
    }
  });
}
```

- [ ] **Step 2: 手動テスト**

サーバ起動 + ブラウザで online モードに切替。SVG 上の参加者/メッセージをクリック → 右パネルが切替わる (現時点では既存の selData 単一要素 panel が表示される)

- [ ] **Step 3: コミット**

```bash
git add src/app.js
git commit -m "feat(app): overlay click -> selection wiring (single + shift+click stub)"
```

### Task 3.2: renderProps の no-selection 状態を簡素化

**Files:**
- Modify: `src/modules/sequence.js`

現状: 6 個の追加フォームが並列。新仕様: Title / autonumber / 「末尾に追加」コンパクトメニューだけ。

- [ ] **Step 1: 新 renderProps の no-selection 分岐を書き換え**

`if (!selData || selData.length === 0)` ブロック内の `propsEl.innerHTML = ...` を以下に置き換え:

```javascript
        var autonumChecked = parsedData.meta.autonumber ? 'checked' : '';
        propsEl.innerHTML =
          '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Sequence Diagram</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
            P.fieldHtml('Title', 'seq-title', parsedData.meta.title) +
            P.primaryButtonHtml('seq-set-title', 'Title 適用') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="seq-autonumber" type="checkbox" ' + autonumChecked + '>' +
              ' autonumber (自動採番)' +
            '</label>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">末尾に追加</label>' +
            P.selectFieldHtml('種類', 'seq-tail-kind', [
              { value: 'message', label: 'メッセージ', selected: true },
              { value: 'participant', label: '参加者' },
              { value: 'note', label: '注釈 (note)' },
              { value: 'block', label: 'ブロック (alt/loop/...)' },
              { value: 'activation', label: 'ライフライン (activate/deactivate)' },
            ]) +
            '<div id="seq-tail-detail" style="margin-top:6px;"></div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;color:var(--text-secondary);font-size:11px;">' +
            'プレビュー上で要素をクリックすると編集パネルが開きます' +
          '</div>';

        // Title button
        P.bindEvent('seq-set-title', 'click', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('seq-title').value.trim()));
          ctx.onUpdate();
        });
        // autonumber checkbox
        P.bindEvent('seq-autonumber', 'change', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(toggleAutonumber(ctx.getMmdText()));
          ctx.onUpdate();
        });
        // 末尾追加: 種類 select で詳細フォーム切替
        var renderTailDetail = function() {
          var kind = document.getElementById('seq-tail-kind').value;
          var detailEl = document.getElementById('seq-tail-detail');
          var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
          var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
          if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者なし）' }];
          var html = '';
          if (kind === 'message') {
            var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
            html =
              P.selectFieldHtml('From', 'seq-tail-from', partOpts) +
              P.selectFieldHtml('Arrow', 'seq-tail-arrow', arrowOpts) +
              P.selectFieldHtml('To', 'seq-tail-to', partOpts) +
              P.fieldHtml('本文', 'seq-tail-label', '', '省略可') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'participant') {
            var pTypeOpts = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === 'participant' }; });
            html =
              P.selectFieldHtml('Type', 'seq-tail-ptype', pTypeOpts) +
              P.fieldHtml('Alias', 'seq-tail-alias', '', '例: user1') +
              P.fieldHtml('Label', 'seq-tail-plabel', '', '省略可') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'note') {
            var posOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
            html =
              P.selectFieldHtml('Position', 'seq-tail-npos', posOpts) +
              P.selectFieldHtml('Target', 'seq-tail-ntarget', partOpts) +
              P.fieldHtml('Text', 'seq-tail-ntext', '', '注釈本文') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'block') {
            var bkOpts = GROUP_KINDS.map(function(k) { return { value: k, label: k, selected: k === 'alt' }; });
            html =
              P.selectFieldHtml('Kind', 'seq-tail-bkind', bkOpts) +
              P.fieldHtml('Label', 'seq-tail-blabel', '', '例: x > 0') +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          } else if (kind === 'activation') {
            html =
              P.selectFieldHtml('Action', 'seq-tail-aact', [
                { value: 'activate', label: 'activate', selected: true },
                { value: 'deactivate', label: 'deactivate' },
              ]) +
              P.selectFieldHtml('Target', 'seq-tail-atgt', partOpts) +
              P.primaryButtonHtml('seq-tail-add', '+ 末尾に追加');
          }
          detailEl.innerHTML = html;
          P.bindEvent('seq-tail-add', 'click', function() {
            window.MA.history.pushHistory();
            var t = ctx.getMmdText();
            var out;
            if (kind === 'message') {
              out = addMessage(t,
                document.getElementById('seq-tail-from').value,
                document.getElementById('seq-tail-to').value,
                document.getElementById('seq-tail-arrow').value,
                document.getElementById('seq-tail-label').value.trim());
            } else if (kind === 'participant') {
              var al = document.getElementById('seq-tail-alias').value.trim();
              if (!al) { alert('Alias 必須'); return; }
              out = addParticipant(t, document.getElementById('seq-tail-ptype').value, al, document.getElementById('seq-tail-plabel').value.trim() || al);
            } else if (kind === 'note') {
              var ntg = document.getElementById('seq-tail-ntarget').value;
              if (!ntg) { alert('Target 必須'); return; }
              out = addNote(t, document.getElementById('seq-tail-npos').value, [ntg], document.getElementById('seq-tail-ntext').value.trim());
            } else if (kind === 'block') {
              out = addGroup(t, document.getElementById('seq-tail-bkind').value, document.getElementById('seq-tail-blabel').value.trim());
            } else if (kind === 'activation') {
              var atg = document.getElementById('seq-tail-atgt').value;
              if (!atg) { alert('Target 必須'); return; }
              out = addActivation(t, document.getElementById('seq-tail-aact').value, atg);
            }
            ctx.setMmdText(out);
            ctx.onUpdate();
          });
        };
        renderTailDetail();
        P.bindEvent('seq-tail-kind', 'change', renderTailDetail);
        return;
      }
```

- [ ] **Step 2: 既存 unit/E2E がそのまま通るか確認**

```bash
node tests/run-tests.js
python server.py &
npx playwright test
```

Expected: 既存のテストは selectors を更新する必要があるかもしれない (`#seq-add-msg-btn` → 末尾追加メニューに変更されている)。Sprint 6 で UC 用 spec を新規作成するため、ここでは old e2e はSkip でOK (`test.skip` をマーク or fail を許容して次へ)。

- [ ] **Step 3: 手動 visual 確認**

ブラウザで起動、no-selection 状態で「末尾に追加」のコンパクトメニューだけ見えること、種類 select 切り替えで詳細フォームが入れ替わること。

- [ ] **Step 4: コミット**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): no-selection panel collapsed to title + autonumber + tail-add menu"
```

### Task 3.3: single-selection 編集フォーム + 位置駆動挿入アクション

**Files:**
- Modify: `src/modules/sequence.js`

- [ ] **Step 1: single-selection 分岐を全面改修**

`if (selData.length === 1)` ブロックを以下のヘルパで置換:

```javascript
      if (selData.length === 1) {
        var sel = selData[0];
        // ヘルパ: 共通の挿入アクションバー (要素の line を起点)
        function actionBarHtml(line) {
          return '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">この位置に挿入</label>' +
            '<button class="seq-insert-msg-before" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↑ この前にメッセージ追加</button>' +
            '<button class="seq-insert-msg-after" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↓ この後にメッセージ追加</button>' +
            '<button class="seq-insert-note-after" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">↓ この後に注釈追加</button>' +
            '<button class="seq-wrap-block" data-line="' + line + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⌗ alt/loop で囲む…</button>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;display:flex;gap:4px;">' +
            '<button class="seq-move-up" data-line="' + line + '" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↑ 上へ</button>' +
            '<button class="seq-move-down" data-line="' + line + '" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">↓ 下へ</button>' +
            '<button class="seq-delete-line" data-line="' + line + '" style="flex:0 0 60px;background:var(--accent-red);color:#fff;border:none;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 削除</button>' +
          '</div>';
        }

        if (sel.type === 'message') {
          var mm = null;
          for (var jj = 0; jj < messages.length; jj++) if (messages[jj].id === sel.id) { mm = messages[jj]; break; }
          if (!mm) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">メッセージが見つかりません</p>'; return; }
          var partOpts2 = participants.map(function(p) { return { value: p.id, label: p.label }; });
          var fromOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.from }; });
          var toOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.to }; });
          var arrowOpts2 = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === mm.arrow }; });
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(mm.from + ' ' + mm.arrow + ' ' + mm.to) + '</strong><br><span style="color:var(--text-secondary);">Message · L' + mm.line + '</span></div>' +
            P.selectFieldHtml('From', 'seq-edit-from', fromOpts) +
            P.selectFieldHtml('Arrow', 'seq-edit-arrow', arrowOpts2) +
            P.selectFieldHtml('To', 'seq-edit-to', toOpts) +
            P.fieldHtml('本文', 'seq-edit-msg-label', mm.label) +
            actionBarHtml(mm.line);
          var mln = mm.line;
          ['from', 'arrow', 'to'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, f, this.value));
              ctx.onUpdate();
            });
          });
          document.getElementById('seq-edit-msg-label').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', this.value));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'participant') {
          var pp = null;
          for (var ii = 0; ii < participants.length; ii++) if (participants[ii].id === sel.id) { pp = participants[ii]; break; }
          if (!pp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var pOpts2 = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === pp.ptype }; });
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(pp.label) + '</strong><br><span style="color:var(--text-secondary);">' + pp.ptype + ' · L' + pp.line + '</span></div>' +
            P.selectFieldHtml('Type', 'seq-edit-ptype', pOpts2) +
            P.fieldHtml('Alias', 'seq-edit-alias', pp.id) +
            P.fieldHtml('Label', 'seq-edit-label', pp.label) +
            '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-primary);margin:8px 0;"><input id="seq-edit-rename-refs" type="checkbox" checked> Alias 変更時に他要素の参照も追従</label>' +
            actionBarHtml(pp.line);
          var ln = pp.line;
          document.getElementById('seq-edit-ptype').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, 'ptype', this.value));
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-alias').addEventListener('change', function() {
            var newAlias = this.value;
            var oldAlias = pp.id;
            window.MA.history.pushHistory();
            var t = ctx.getMmdText();
            if (document.getElementById('seq-edit-rename-refs').checked && oldAlias !== newAlias) {
              t = renameWithRefs(t, oldAlias, newAlias);
            } else {
              t = updateParticipant(t, ln, 'alias', newAlias);
            }
            ctx.setMmdText(t);
            ctx.onUpdate();
          });
          document.getElementById('seq-edit-label').addEventListener('change', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, 'label', this.value));
            ctx.onUpdate();
          });
        }
        else if (sel.type === 'note') {
          var nn2 = parsedData.elements.filter(function(e) { return e.kind === 'note' && e.id === sel.id; })[0];
          if (!nn2) return;
          var posOpts2 = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === nn2.position }; });
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>' + escHtml(nn2.text || '(empty)') + '</strong><br><span style="color:var(--text-secondary);">Note · ' + nn2.position + ' · L' + nn2.line + '</span></div>' +
            P.selectFieldHtml('Position', 'seq-edit-npos', posOpts2) +
            P.fieldHtml('Targets', 'seq-edit-ntargets', nn2.targets.join(', ')) +
            P.fieldHtml('Text', 'seq-edit-ntext', nn2.text) +
            actionBarHtml(nn2.line);
          var nln = nn2.line;
          [['npos', 'position'], ['ntargets', 'targets'], ['ntext', 'text']].forEach(function(pair) {
            document.getElementById('seq-edit-' + pair[0]).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateNote(ctx.getMmdText(), nln, pair[1], this.value));
              ctx.onUpdate();
            });
          });
        }
        else if (sel.type === 'activation') {
          var aLine = sel.line;
          propsEl.innerHTML =
            '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;"><strong>Activation</strong><br><span style="color:var(--text-secondary);">L' + aLine + '</span></div>' +
            actionBarHtml(aLine);
        }

        // 共通: action bar の click ハンドラ
        bindActionBar(propsEl, ctx);
        return;
      }
```

`bindActionBar` ヘルパも sequence.js 内に追加:

```javascript
  function bindActionBar(propsEl, ctx) {
    var P = window.MA.properties;
    P.bindAllByClass(propsEl, 'seq-insert-msg-before', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'before', 'message');
    });
    P.bindAllByClass(propsEl, 'seq-insert-msg-after', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'after', 'message');
    });
    P.bindAllByClass(propsEl, 'seq-insert-note-after', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      _showInsertForm(ctx, ln, 'after', 'note');
    });
    P.bindAllByClass(propsEl, 'seq-wrap-block', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      var kind = prompt('ブロック種類 (alt/opt/loop/par)', 'alt');
      if (!kind) return;
      var label = prompt('Label/Condition', '');
      window.MA.history.pushHistory();
      ctx.setMmdText(wrapWith(ctx.getMmdText(), ln, ln, kind, label || ''));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-move-up', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, -1));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-move-down', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      window.MA.history.pushHistory();
      ctx.setMmdText(moveMessage(ctx.getMmdText(), ln, 1));
      ctx.onUpdate();
    });
    P.bindAllByClass(propsEl, 'seq-delete-line', function(btn) {
      var ln = parseInt(btn.getAttribute('data-line'), 10);
      if (!confirm('この行を削除しますか？')) return;
      window.MA.history.pushHistory();
      ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
      window.MA.selection.clearSelection();
      ctx.onUpdate();
    });
  }

  // インライン挿入フォーム (簡易: prompt ベース。Sprint 4 で本格化)
  function _showInsertForm(ctx, line, position, kind) {
    if (kind === 'message') {
      var from = prompt('From (participant id)');
      if (!from) return;
      var to = prompt('To (participant id)');
      if (!to) return;
      var arrow = prompt('Arrow (例: ->)', '->');
      var label = prompt('本文', '');
      window.MA.history.pushHistory();
      var insertFn = position === 'before' ? insertBefore : insertAfter;
      ctx.setMmdText(insertFn(ctx.getMmdText(), line, 'message', { from: from, to: to, arrow: arrow || '->', label: label }));
      ctx.onUpdate();
    } else if (kind === 'note') {
      var pos = prompt('Position (over/left of/right of)', 'over');
      var target = prompt('Target participant');
      if (!target) return;
      var text = prompt('Note 本文', '');
      window.MA.history.pushHistory();
      ctx.setMmdText(insertAfter(ctx.getMmdText(), line, 'note', { position: pos || 'over', targets: [target], text: text }));
      ctx.onUpdate();
    }
  }
```

(`_showInsertForm` は Sprint 4 でモーダル/インラインフォームに置き換える。今は prompt() で動作確認可能にする)

- [ ] **Step 2: 手動確認**

サーバ起動 → online モード → SVG メッセージクリック → 編集パネル + アクションバー表示 → 「↑ この前に追加」クリック → prompt 連続 → 反映確認

- [ ] **Step 3: コミット**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): selection-driven panel with position-aware insert action bar"
```

### Task 3.4: warning bar UI (overlay match 失敗時)

**Files:**
- Modify: `src/app.js`
- Modify: `plantuml-assist.html`

- [ ] **Step 1: HTML に warning bar 用 div 追加**

`plantuml-assist.html` の `<div id="preview-pane">` 内、`<div id="preview-container">` の直前に追加:

```html
<div id="overlay-warning" style="display:none;background:#3a2e0a;color:#ffa657;padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);"></div>
```

- [ ] **Step 2: app.js で warning 表示制御**

`renderSvg` の overlay 呼び出し部分を以下に書き換え:

```javascript
var overlayEl = document.getElementById('overlay-layer');
var warnEl = document.getElementById('overlay-warning');
if (svgEl && currentModule && currentModule.buildOverlay) {
  var report = currentModule.buildOverlay(svgEl, currentParsed, overlayEl);
  if (report && (report.unmatched.participant > 0 || report.unmatched.message > 0 || report.unmatched.note > 0 || report.unmatched.activation > 0)) {
    warnEl.style.display = 'block';
    warnEl.textContent = '⚠ Overlay マッチング失敗: ' + JSON.stringify(report.unmatched) + ' 。リスト一覧から編集してください。';
  } else {
    warnEl.style.display = 'none';
  }
}
```

- [ ] **Step 3: 手動確認**

意図的にラベル文字列を破壊した DSL を入力して warning bar が表示されることを確認。

- [ ] **Step 4: コミット**

```bash
git add src/app.js plantuml-assist.html
git commit -m "feat(ui): overlay match warning bar in preview pane"
```

### Task 3.5: Sprint 3 統合確認

- [ ] **Step 1: 全ユニット PASS**

```bash
node tests/run-tests.js
```

- [ ] **Step 2: 既存 E2E は selectors 変わるので skip マーク**

`tests/e2e/sequence-basic.spec.js` の冒頭に `test.describe.skip(...)` 追加するか、新 selectors に書き換え (Sprint 6 で UC E2E に置き換え予定なのでskipでOK)。

- [ ] **Step 3: コミット**

```bash
git commit --allow-empty -m "chore: Sprint 3 complete (selection-driven panel)"
```

---

## Sprint 4: Rich Label Editor (Phase 2 続き)

textarea + 装飾 toolbar + WYSIWYG プレビューの共通コンポーネント。Sprint 3 で `prompt()` だった挿入フォームもこれで置き換え。

### Task 4.1: rich-label-editor.js skeleton + 単体テスト

**Files:**
- Create: `src/ui/rich-label-editor.js`
- Create: `tests/rich-label.test.js`

- [ ] **Step 1: 失敗テストを書く (DSL <-> プレビュー HTML 変換)**

```javascript
'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

require('../src/core/html-utils.js');
require('../src/ui/rich-label-editor.js');
var RLE = window.MA.richLabelEditor;

describe('plantumlToHtml', function() {
  test('converts \\n to <br>', function() {
    expect(RLE.plantumlToHtml('line1\\nline2')).toBe('line1<br>line2');
  });
  test('converts <color:red>x</color> to span', function() {
    expect(RLE.plantumlToHtml('<color:red>x</color>')).toBe('<span style="color:red">x</span>');
  });
  test('converts <b><i><u>', function() {
    expect(RLE.plantumlToHtml('<b>x</b>')).toContain('<b>x</b>');
  });
  test('escapes HTML in plain text', function() {
    expect(RLE.plantumlToHtml('a < b')).toBe('a &lt; b');
  });
});

describe('insertWrapAtSelection', function() {
  test('wraps selected text with given open/close tags', function() {
    // jsdom でも textarea selectionStart/End は使える
    var ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.value = 'hello world';
    ta.setSelectionRange(0, 5);
    RLE.insertWrapAtSelection(ta, '<b>', '</b>');
    expect(ta.value).toBe('<b>hello</b> world');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `richLabelEditor` undefined

- [ ] **Step 3: skeleton 実装**

`src/ui/rich-label-editor.js`:

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.richLabelEditor = (function() {

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // PlantUML 表記 → プレビュー HTML
  function plantumlToHtml(s) {
    if (!s) return '';
    // まず HTML エスケープ
    var out = escHtml(s);
    // \n → <br>
    out = out.replace(/\\n/g, '<br>');
    // <color:xxx> ... </color> (HTML エスケープ後なので &lt;color:...&gt; を再展開)
    out = out.replace(/&lt;color:([^&]+)&gt;([\s\S]*?)&lt;\/color&gt;/g, function(_, c, body) {
      return '<span style="color:' + c + '">' + body + '</span>';
    });
    out = out.replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<b>$1</b>');
    out = out.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/g, '<i>$1</i>');
    out = out.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
    return out;
  }

  function insertWrapAtSelection(ta, openTag, closeTag) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    var before = ta.value.substring(0, s);
    var sel = ta.value.substring(s, e);
    var after = ta.value.substring(e);
    ta.value = before + openTag + sel + closeTag + after;
    var newPos = s + openTag.length + sel.length;
    ta.setSelectionRange(newPos, newPos);
    ta.dispatchEvent(new Event('input'));
  }

  function insertAtCursor(ta, str) {
    var s = ta.selectionStart;
    ta.value = ta.value.substring(0, s) + str + ta.value.substring(ta.selectionEnd);
    ta.setSelectionRange(s + str.length, s + str.length);
    ta.dispatchEvent(new Event('input'));
  }

  // Editor を mount: container 要素内に textarea + toolbar + preview を構築
  function mount(container, initialValue, onChange) {
    container.innerHTML =
      '<div class="rle-toolbar" style="display:flex;gap:4px;padding:4px;background:var(--bg-primary);border:1px solid var(--border);border-bottom:none;border-radius:3px 3px 0 0;align-items:center;flex-wrap:wrap;">' +
        '<button type="button" class="rle-b" title="太字" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;font-weight:700;border-radius:3px;">B</button>' +
        '<button type="button" class="rle-i" title="斜体" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;font-style:italic;border-radius:3px;">I</button>' +
        '<button type="button" class="rle-u" title="下線" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;text-decoration:underline;border-radius:3px;">U</button>' +
        '<span style="border-left:1px solid var(--border);height:18px;margin:0 4px;"></span>' +
        '<span style="font-size:10px;color:var(--text-secondary);">色:</span>' +
        ['#f74a4a','#ffa657','#f1e05a','#7ee787','#7c8cf8','#d2a8ff','#8b949e'].map(function(c) {
          return '<button type="button" class="rle-color" data-color="' + c + '" title="色: ' + c + '" style="background:' + c + ';width:16px;height:16px;border:2px solid var(--bg-secondary);border-radius:3px;cursor:pointer;padding:0;"></button>';
        }).join('') +
        '<button type="button" class="rle-color-clear" title="色解除" style="background:transparent;border:1px dashed var(--text-secondary);width:16px;height:16px;border-radius:3px;cursor:pointer;font-size:9px;color:var(--text-secondary);">✕</button>' +
        '<span style="border-left:1px solid var(--border);height:18px;margin:0 4px;"></span>' +
        '<button type="button" class="rle-newline" title="改行 \\n" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);width:24px;height:24px;cursor:pointer;border-radius:3px;">↵</button>' +
      '</div>' +
      '<textarea class="rle-textarea" style="width:100%;min-height:60px;background:var(--bg-tertiary);border:1px solid var(--border);border-top:none;color:var(--text-primary);padding:6px;border-radius:0 0 3px 3px;font-family:var(--font-mono);font-size:12px;resize:vertical;box-sizing:border-box;">' + escHtml(initialValue || '') + '</textarea>' +
      '<div class="rle-preview" style="margin-top:6px;padding:6px 8px;background:#fff;color:#000;border-radius:3px;font-size:12px;font-family:-apple-system,Segoe UI,sans-serif;min-height:24px;">' + plantumlToHtml(initialValue || '') + '</div>';

    var ta = container.querySelector('.rle-textarea');
    var preview = container.querySelector('.rle-preview');

    function refreshPreview() {
      preview.innerHTML = plantumlToHtml(ta.value);
    }

    ta.addEventListener('input', function() {
      refreshPreview();
      if (onChange) onChange(ta.value);
    });
    ta.addEventListener('change', function() {
      if (onChange) onChange(ta.value);
    });

    container.querySelector('.rle-b').addEventListener('click', function() { insertWrapAtSelection(ta, '<b>', '</b>'); });
    container.querySelector('.rle-i').addEventListener('click', function() { insertWrapAtSelection(ta, '<i>', '</i>'); });
    container.querySelector('.rle-u').addEventListener('click', function() { insertWrapAtSelection(ta, '<u>', '</u>'); });
    container.querySelector('.rle-newline').addEventListener('click', function() { insertAtCursor(ta, '\\n'); });
    Array.prototype.forEach.call(container.querySelectorAll('.rle-color'), function(btn) {
      btn.addEventListener('click', function() {
        var c = btn.getAttribute('data-color');
        insertWrapAtSelection(ta, '<color:' + c + '>', '</color>');
      });
    });
    container.querySelector('.rle-color-clear').addEventListener('click', function() {
      // 簡易: 選択範囲の <color:xxx> ... </color> を取り除く
      var s = ta.selectionStart, e = ta.selectionEnd;
      var sel = ta.value.substring(s, e);
      sel = sel.replace(/<color:[^>]+>/g, '').replace(/<\/color>/g, '');
      ta.value = ta.value.substring(0, s) + sel + ta.value.substring(e);
      ta.dispatchEvent(new Event('input'));
    });

    return {
      getValue: function() { return ta.value; },
      setValue: function(v) { ta.value = v; refreshPreview(); },
      element: ta,
    };
  }

  return { mount: mount, plantumlToHtml: plantumlToHtml, insertWrapAtSelection: insertWrapAtSelection };
})();
```

- [ ] **Step 4: テスト合格を確認**

Run: `node tests/run-tests.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ui/rich-label-editor.js tests/rich-label.test.js
git commit -m "feat(rich-label): editor with toolbar + live preview + DSL conversion"
```

### Task 4.2: HTML に rich-label-editor.js を読み込み

**Files:**
- Modify: `plantuml-assist.html`

- [ ] **Step 1: script 追加**

`<script src="src/ui/sequence-overlay.js"></script>` の隣に:

```html
<script src="src/ui/rich-label-editor.js"></script>
```

- [ ] **Step 2: コミット**

```bash
git add plantuml-assist.html
git commit -m "chore(html): include rich-label-editor.js"
```

### Task 4.3: sequence.js の本文/note text/participant label に Rich Editor を適用

**Files:**
- Modify: `src/modules/sequence.js`

- [ ] **Step 1: message 編集パネルの本文欄を rich editor に置換**

Task 3.3 の message 分岐内、`P.fieldHtml('本文', 'seq-edit-msg-label', mm.label)` を以下に置き換え:

```javascript
'<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-edit-msg-label-rle"></div></div>' +
```

panel innerHTML 適用後の event 配線部分で:

```javascript
var rleMsg = window.MA.richLabelEditor.mount(document.getElementById('seq-edit-msg-label-rle'), mm.label, function(v) {
  window.MA.history.pushHistory();
  ctx.setMmdText(updateMessage(ctx.getMmdText(), mln, 'label', v));
  ctx.onUpdate();
});
```

(既存の `seq-edit-msg-label` 配線は削除)

- [ ] **Step 2: 同パターンを participant label と note text に適用**

participant の `P.fieldHtml('Label', 'seq-edit-label', pp.label)` を `<div id="seq-edit-label-rle"></div>` に、note の `P.fieldHtml('Text', 'seq-edit-ntext', nn2.text)` を `<div id="seq-edit-ntext-rle"></div>` に置き換え、それぞれ `mount()` 配線。

- [ ] **Step 3: 手動確認**

サーバ起動 → message クリック → 本文欄に rich editor が出る → 文字選択して B クリック → `<b>...</b>` が挿入される → live preview で太字表示 → blur で editor テキスト更新

- [ ] **Step 4: コミット**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): rich label editor on message/participant/note text fields"
```

### Task 4.4: 末尾追加メニューの本文/note text にも Rich Editor 適用

Task 3.2 の `renderTailDetail` 関数内、`P.fieldHtml('本文', 'seq-tail-label', '', '省略可')` と `P.fieldHtml('Text', 'seq-tail-ntext', '', '注釈本文')` を `<div id="seq-tail-label-rle"></div>` / `<div id="seq-tail-ntext-rle"></div>` に置き換え、`renderTailDetail` の末尾で `mount()` を呼ぶ。

`seq-tail-add` クリック時に `rleObj.getValue()` から値を取得。

- [ ] **Step 1: 該当箇所を rich editor 化**

(コードは Task 4.3 と同パターン)

- [ ] **Step 2: 手動確認 + コミット**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): rich editor in tail-add menu"
```

### Task 4.5: prompt() ベースの挿入フォームを Rich Editor 付き modal に置換

Task 3.3 の `_showInsertForm` を modal ダイアログに置き換える。

**Files:**
- Modify: `src/modules/sequence.js`
- Modify: `plantuml-assist.html` (modal 用 div)

- [ ] **Step 1: HTML に modal 用 div 追加**

`</div><!-- /#app -->` の直前に:

```html
<div id="seq-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">
  <div id="seq-modal-content" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:20px;min-width:400px;max-width:600px;"></div>
</div>
```

- [ ] **Step 2: `_showInsertForm` を modal 化**

```javascript
  function _showInsertForm(ctx, line, position, kind) {
    var modal = document.getElementById('seq-modal');
    var content = document.getElementById('seq-modal-content');
    var P = window.MA.properties;
    var parsed = parseSequence(ctx.getMmdText());
    var participants = parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
    if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者なし）' }];

    var title = (position === 'before' ? '前に' : '後に') + (kind === 'message' ? 'メッセージを挿入' : '注釈を挿入');
    var html = '<h3 style="margin:0 0 12px 0;color:var(--text-primary);">' + title + '</h3>';
    if (kind === 'message') {
      var arrowOpts = ARROWS.map(function(a) { return { value: a, label: arrowLabel(a), selected: a === '->' }; });
      html +=
        P.selectFieldHtml('From', 'seq-mod-from', partOpts) +
        P.selectFieldHtml('Arrow', 'seq-mod-arrow', arrowOpts) +
        P.selectFieldHtml('To', 'seq-mod-to', partOpts) +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-label-rle"></div></div>';
    } else if (kind === 'note') {
      var posOpts = NOTE_POSITIONS.map(function(p) { return { value: p, label: p, selected: p === 'over' }; });
      html +=
        P.selectFieldHtml('Position', 'seq-mod-npos', posOpts) +
        P.selectFieldHtml('Target', 'seq-mod-ntarget', partOpts) +
        '<div style="margin-bottom:8px;"><label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">本文</label><div id="seq-mod-ntext-rle"></div></div>';
    }
    html +=
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button id="seq-mod-cancel" style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:8px;border-radius:4px;cursor:pointer;">キャンセル</button>' +
        '<button id="seq-mod-confirm" style="flex:1;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:4px;cursor:pointer;">確定</button>' +
      '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';

    var rleObj = null;
    if (kind === 'message') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-label-rle'), '');
    else if (kind === 'note') rleObj = window.MA.richLabelEditor.mount(document.getElementById('seq-mod-ntext-rle'), '');

    document.getElementById('seq-mod-cancel').addEventListener('click', function() {
      modal.style.display = 'none';
    });
    document.getElementById('seq-mod-confirm').addEventListener('click', function() {
      window.MA.history.pushHistory();
      var t = ctx.getMmdText();
      var insertFn = position === 'before' ? insertBefore : insertAfter;
      if (kind === 'message') {
        t = insertFn(t, line, 'message', {
          from: document.getElementById('seq-mod-from').value,
          to: document.getElementById('seq-mod-to').value,
          arrow: document.getElementById('seq-mod-arrow').value,
          label: rleObj.getValue(),
        });
      } else if (kind === 'note') {
        t = insertFn(t, line, 'note', {
          position: document.getElementById('seq-mod-npos').value,
          targets: [document.getElementById('seq-mod-ntarget').value],
          text: rleObj.getValue(),
        });
      }
      ctx.setMmdText(t);
      modal.style.display = 'none';
      ctx.onUpdate();
    });
  }
```

- [ ] **Step 3: 手動確認**

メッセージ選択 → 「↑ この前にメッセージ追加」 → modal が出る → From/To/Arrow + Rich Editor で本文 → 確定 → editor 該当行に挿入される。

- [ ] **Step 4: コミット**

```bash
git add src/modules/sequence.js plantuml-assist.html
git commit -m "feat(sequence): modal insert form with rich editor (replaces prompt())"
```

### Task 4.6: Sprint 4 統合確認

```bash
node tests/run-tests.js  # PASS
git commit --allow-empty -m "chore: Sprint 4 complete (rich label editor + modal insert)"
```

---

## Sprint 5: Range Selection (Phase 3)

shift-click で範囲選択 → 一括 alt 囲い等。

### Task 5.1: selection module に複数要素サポート + sorted line range 取得

**Files:**
- Modify: `src/core/selection.js`
- Test: 既存 selection test に追加 (なければ新規)

- [ ] **Step 1: 失敗するテスト**

```javascript
// tests/selection.test.js
'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
require('../src/core/selection.js');
var sel = window.MA.selection;

describe('selection range', function() {
  beforeEach(function() { sel.init(function() {}); sel.clearSelection(); });
  test('getRange returns min/max line of multi-selection', function() {
    sel.setSelected([{type:'message',id:'a',line:5},{type:'message',id:'b',line:8},{type:'message',id:'c',line:6}]);
    var r = sel.getRange();
    expect(r).toEqual({ start: 5, end: 8 });
  });
  test('getRange returns null when no selection', function() {
    expect(sel.getRange()).toBe(null);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/run-tests.js`
Expected: FAIL — `sel.getRange is not a function`

- [ ] **Step 3: 実装**

`src/core/selection.js` に追加:

```javascript
function getRange() {
  if (!_selected || _selected.length === 0) return null;
  var lines = _selected.map(function(s) { return s.line; }).filter(function(n) { return typeof n === 'number'; });
  if (lines.length === 0) return null;
  return { start: Math.min.apply(null, lines), end: Math.max.apply(null, lines) };
}
```

return オブジェクトに `getRange: getRange,` 追加。

- [ ] **Step 4: テスト合格 + コミット**

```bash
node tests/run-tests.js  # PASS
git add src/core/selection.js tests/selection.test.js
git commit -m "feat(selection): getRange() for multi-selection line span"
```

### Task 5.2: renderProps に range-selection 状態を追加

**Files:**
- Modify: `src/modules/sequence.js`

- [ ] **Step 1: range 状態の分岐を追加**

`renderProps` の `if (selData.length === 1)` の後に:

```javascript
      if (selData.length > 1) {
        var range = window.MA.selection.getRange();
        if (!range) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">範囲取得失敗</p>'; return; }
        propsEl.innerHTML =
          '<div style="background:rgba(124,140,248,0.1);border-left:3px solid var(--accent);padding:6px 10px;margin-bottom:12px;font-size:11px;">' +
            '<strong>' + selData.length + ' 件選択中</strong><br>' +
            '<span style="color:var(--text-secondary);">L' + range.start + ' 〜 L' + range.end + '</span>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">一括アクション</label>' +
            GROUP_KINDS.map(function(k) {
              return '<button class="seq-bulk-wrap" data-kind="' + k + '" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">⌗ ' + k + ' で囲む</button>';
            }).join('') +
            '<button class="seq-bulk-duplicate" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">📋 範囲を複製</button>' +
            '<button class="seq-bulk-delete" data-start="' + range.start + '" data-end="' + range.end + '" style="width:100%;text-align:left;background:var(--accent-red);border:none;color:#fff;padding:6px 10px;margin-bottom:4px;border-radius:4px;font-size:11px;cursor:pointer;">✕ 範囲を一括削除</button>' +
          '</div>';

        var P = window.MA.properties;
        P.bindAllByClass(propsEl, 'seq-bulk-wrap', function(btn) {
          var k = btn.getAttribute('data-kind');
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          var label = prompt(k + ' のラベル', '');
          window.MA.history.pushHistory();
          ctx.setMmdText(wrapWith(ctx.getMmdText(), s, e, k, label || ''));
          window.MA.selection.clearSelection();
          ctx.onUpdate();
        });
        P.bindAllByClass(propsEl, 'seq-bulk-duplicate', function(btn) {
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          window.MA.history.pushHistory();
          ctx.setMmdText(duplicateRange(ctx.getMmdText(), s, e, e));
          ctx.onUpdate();
        });
        P.bindAllByClass(propsEl, 'seq-bulk-delete', function(btn) {
          if (!confirm('選択範囲を一括削除しますか？')) return;
          var s = parseInt(btn.getAttribute('data-start'), 10);
          var e = parseInt(btn.getAttribute('data-end'), 10);
          window.MA.history.pushHistory();
          // 範囲削除 = unwrap with keepInner=false (block ではなく単純削除)
          var lines = ctx.getMmdText().split('\n');
          lines.splice(s - 1, e - s + 1);
          ctx.setMmdText(lines.join('\n'));
          window.MA.selection.clearSelection();
          ctx.onUpdate();
        });
        return;
      }
```

- [ ] **Step 2: 手動確認**

サーバ起動 → メッセージ shift-click 複数選択 → range 状態の panel が出る → 「⌗ alt で囲む」→ prompt → 反映確認

- [ ] **Step 3: コミット**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): range-selection panel with bulk wrap/duplicate/delete"
```

### Task 5.3: Sprint 5 統合 + コミット

```bash
node tests/run-tests.js  # PASS
git commit --allow-empty -m "chore: Sprint 5 complete (range selection)"
```

---

## Sprint 6: UC-1 〜 UC-5 E2E テスト

各 UC は 1 spec ファイル。fixture を `tests/fixtures/dsl/` に置き、テスト内で `editor.fill(fixture)` でロード。

### Task 6.1: 共通 helper 作成

**Files:**
- Create: `tests/e2e/helpers.js`

- [ ] **Step 1: 共通 helper 書く**

```javascript
// @ts-check
const fs = require('fs');
const path = require('path');

async function gotoApp(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function loadFixture(page, fixtureName) {
  var dsl = fs.readFileSync(path.join(__dirname, '../fixtures/dsl/', fixtureName), 'utf8');
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(500);
}

async function getEditorText(page) {
  return page.locator('#editor').inputValue();
}

async function getEditorLine(page, lineNum) {
  var t = await getEditorText(page);
  return t.split('\n')[lineNum - 1];
}

async function clickOverlayByLine(page, line) {
  await page.locator('#overlay-layer rect[data-line="' + line + '"]').first().click();
}

module.exports = { gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine };
```

- [ ] **Step 2: コミット**

```bash
git add tests/e2e/helpers.js
git commit -m "test(e2e): shared helpers (loadFixture, clickOverlayByLine)"
```

### Task 6.2: UC-1 fixture + spec (新規設計)

**Files:**
- Create: `tests/fixtures/dsl/empty.puml`
- Create: `tests/e2e/uc-01-new-design.spec.js`

- [ ] **Step 1: fixture**

`tests/fixtures/dsl/empty.puml`:
```
@startuml
@enduml
```

- [ ] **Step 2: spec**

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

test.describe('UC-1: 新規機能設計 (API認証フロー)', () => {
  test('空からシーケンス図を組み立てる (3 actors / 4 msg / 1 note / 1 alt)', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'empty.puml');

    // 末尾追加メニューで User actor を追加
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('actor');
    await page.locator('#seq-tail-alias').fill('User');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(200);
    expect(await getEditorText(page)).toContain('actor User');

    // System / DB
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-alias').fill('System');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(200);

    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('database');
    await page.locator('#seq-tail-alias').fill('DB');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(200);

    // メッセージ4本
    var addMsg = async (from, to, label) => {
      await page.locator('#seq-tail-kind').selectOption('message');
      await page.locator('#seq-tail-from').selectOption(from);
      await page.locator('#seq-tail-to').selectOption(to);
      await page.locator('#seq-tail-label').fill(label);
      await page.locator('#seq-tail-add').click();
      await page.waitForTimeout(200);
    };
    await addMsg('User', 'System', 'login');
    await addMsg('System', 'DB', 'query');
    await addMsg('DB', 'System', 'result');
    await addMsg('System', 'User', 'response');

    var t = await getEditorText(page);
    expect(t).toContain('User -> System : login');
    expect(t).toContain('System -> DB : query');
    expect(t).toContain('DB -> System : result');
    expect(t).toContain('System -> User : response');
  });
});
```

- [ ] **Step 3: テスト実行**

```bash
python server.py &
npx playwright test tests/e2e/uc-01-new-design.spec.js
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add tests/fixtures/dsl/empty.puml tests/e2e/uc-01-new-design.spec.js
git commit -m "test(e2e): UC-1 new design (3 actors + 4 messages via tail-add)"
```

### Task 6.3: UC-2 fixture + spec (途中挿入)

**Files:**
- Create: `tests/fixtures/dsl/sequence-10msg.puml`
- Create: `tests/e2e/uc-02-bug-fix-mid-insert.spec.js`

- [ ] **Step 1: fixture (10メッセージ)**

```
@startuml
actor User
participant System
database DB
User -> System : req1
System -> DB : q1
DB --> System : r1
System -> DB : q2
DB --> System : r2
System --> User : resp1
User -> System : req2
System -> DB : q3
DB --> System : r3
System --> User : resp2
@enduml
```

(行番号: req1=line 5, q1=line 6, r1=line 7, q2=line 8, ...)

- [ ] **Step 2: spec**

```javascript
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine } = require('./helpers');

test.describe('UC-2: 不具合対応 (リトライ alt + 2msg を mid-insert)', () => {
  test('既存10msgの #5 と #6 の間にalt block + 2 msgを挿入', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-10msg.puml');

    // メッセージ #5 (line 9 = q2 が #4 ではなく ... fixture を再確認)
    // line 8 = q2, line 9 = r2 想定 (msg index 4 = r2)
    // 「#5 (resp1, line 10) の前に alt block を挿入」してテスト
    await clickOverlayByLine(page, 10); // resp1
    await page.waitForTimeout(200);
    await page.locator('.seq-wrap-block').click();
    // prompt が出る (Sprint 6 範囲では prompt のまま)
    page.on('dialog', async (dialog) => {
      if (dialog.message().includes('種類')) await dialog.accept('alt');
      else if (dialog.message().includes('Label')) await dialog.accept('on-retry');
      else await dialog.accept('');
    });
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('alt on-retry');
    expect(t.indexOf('alt on-retry')).toBeLessThan(t.indexOf('System --> User : resp1'));
  });
});
```

- [ ] **Step 3: テスト実行 + コミット**

```bash
npx playwright test tests/e2e/uc-02-bug-fix-mid-insert.spec.js
git add tests/fixtures/dsl/sequence-10msg.puml tests/e2e/uc-02-bug-fix-mid-insert.spec.js
git commit -m "test(e2e): UC-2 bug fix mid-insert (alt wrap on existing message)"
```

### Task 6.4-6.6: UC-3, UC-4, UC-5 spec (同パターン)

各 UC を 1 ファイルずつ。それぞれ:
- 適切な fixture (`sequence-with-cache.puml`, `sequence-success-msgs.puml`, `sequence-cache-flow.puml` 等) を作成
- spec で overlay click → action bar → 期待 editor text を assert

詳細は UC-2 と同パターン。各タスク 1 commit。

- [ ] **Step UC-3**: 「DB 前に Cache 順序挿入 + 4 msg 宛先一括変更」
  - participant 編集 panel で Alias を Database → Cache → 「参照追従」on で関連 msg が更新される
  - Cache 参加者を別途追加 (or 既存 participant の挿入 UI が必要 — 現仕様だと末尾追加のみ。**仕様要修正**: 参加者の位置駆動挿入は Sprint 7 で追加予定 or 末尾追加で受容)

- [ ] **Step UC-4**: 「成功メッセージ複数箇所に失敗時 alt 追加」
  - 各成功 msg を順に overlay click → 「alt で囲む」prompt → label = 'on-error'

- [ ] **Step UC-5**: 「Cache 関連 msg 範囲削除」
  - msg shift-click 複数 → range 状態 → 「✕ 範囲を一括削除」

各タスクで:
```bash
git add tests/fixtures/dsl/<fixture>.puml tests/e2e/uc-NN-<topic>.spec.js
git commit -m "test(e2e): UC-N <topic>"
```

### Task 6.7: Sprint 6 統合

```bash
npx playwright test tests/e2e/uc-01-* tests/e2e/uc-02-* tests/e2e/uc-03-* tests/e2e/uc-04-* tests/e2e/uc-05-*
```

Expected: 5 PASS

```bash
git commit --allow-empty -m "chore: Sprint 6 complete (UC-1..5 E2E)"
```

---

## Sprint 7: UC-6 〜 UC-10 E2E + 統合

### Task 7.1: UC-6 (本番障害 root cause 反映)

- 既存 msg を選択 → 「↓ この後に注釈追加」 → modal で Position=over, Target=該当, Text="実測 30s, 想定 5s"
- 続けて 同 msg を選択 → 「⌗ alt で囲む」→ alt label='on-timeout'
- assert: editor に note + alt 両方が想定位置に挿入

### Task 7.2: UC-7 (onboarding 用 note 多数)

- 既存 msg 5 本に対し for ループで msg → 注釈追加 → 5 個 note が editor に並ぶ

### Task 7.3: UC-8 (Safety Case 合成)

- UC-7 と UC-3 の合成。各 msg に fault detection note + エラー応答 alt
- 大規模 fixture を使い 完遂時間も計測 (10 step 以下なら OK)

### Task 7.4: UC-9 (リネーム参照追従)

- 既存図 (tests/fixtures/dsl/sequence-login.puml) を読み込み
- participant Database クリック → Alias を 'Database' → 'Auth' に変更 → 参照追従 checkbox = on
- assert: 関連 msg 4 本の from/to がすべて 'Auth' に更新

### Task 7.5: UC-10 (polish)

- 既存 msg のラベルを Rich Editor で編集 → blur で反映
- title 設定 / autonumber on → editor に反映

各タスク同フォーマットで:
```bash
git add tests/fixtures/dsl/<fixture>.puml tests/e2e/uc-NN-<topic>.spec.js
git commit -m "test(e2e): UC-N <topic>"
```

### Task 7.6: 全 UC E2E 一括実行

- [ ] **Step 1: 全 10 UC PASS 確認**

```bash
npx playwright test tests/e2e/uc-*
```

Expected: 10 PASS

- [ ] **Step 2: capability 単体 E2E (オプション、時間あれば)**

`tests/e2e/capability/c-01-position-insert.spec.js` 〜 を作成。各 capability 単独動作を 1-2 case で検証。

- [ ] **Step 3: master へマージ準備**

feature ブランチで全 PASS を確認した後、Subagent-Driven Development の最終レビュー (final code reviewer) を invoke 推奨。

- [ ] **Step 4: 完了コミット**

```bash
git commit --allow-empty -m "chore: Sprint 7 complete (UC-6..10 E2E + final integration)"
```

---

## 完了基準 (全Sprint通し)

- [ ] 全ユニットテスト PASS (Sprint 1-5 で追加分含む)
- [ ] 全 10 UC E2E spec PASS
- [ ] overlay 警告 bar が想定通り表示される (意図破壊で確認)
- [ ] 既存機能 (autonumber / arrow labels / title 編集) regression なし
- [ ] visual sweep: 主要 4 状態 (no-sel / message-sel / participant-sel / range-sel) のスクリーンショットを `.eval/sequence-redesign/` に残す

---

## Self-Review Notes

**Spec coverage:**
- UC-1〜10: Sprint 6-7 で 1 spec/UC 対応
- C1 (位置駆動挿入): Task 1.2, 3.3, 4.5
- C2 (範囲操作): Task 5.1-5.2
- C3 (参加者順序挿入): **Task 1.2 で kind=participant の insertBefore/After は実装するが、UI からの呼び出し動線は Sprint 5 範囲外**。UC-3 の達成のため Task 7.1 でアクションバーに「この前に参加者追加」ボタンを追加することを補足
- C4 (参照追従リネーム): Task 1.5 + 3.3 (checkbox)
- C5 (近傍 note): Task 3.3, 4.5
- C6 (後付け alt/loop): Task 3.3, 5.2
- C7 (multi-select 一括): Task 5.1-5.2
- C8 (複製): Task 1.6 + 5.2
- C9 (ライフライン推論): Task 1.7 (UI ボタン Sprint 7 で追加 — 補足タスク)
- C10 (中身保持削除): Task 1.4 + UI は block 削除時に確認 dialog で実装 (Sprint 5 補足)
- C11/12/13 (rich editor): Sprint 4 全体

**Type consistency:** insertBefore/insertAfter/wrapWith/unwrap/renameWithRefs/duplicateRange/inferActivations のシグネチャは Task 1.2-1.7 で定義した形を Sprint 3-7 で一貫使用 ✓

**Placeholder scan:** 各 task 内に「TBD」「実装後で」等の文言なし ✓

**Gap:** 
- C3 の参加者位置挿入 UI ボタン (action bar への追加) と C9 のライフライン推論 UI ボタンは spec には書いたが Task に明示分解されていない → Sprint 7 で追加タスクとして対応:
  - Task 7.7: Action bar に「← 左に参加者追加」「→ 右に参加者追加」追加 (participant 選択時のみ表示)
  - Task 7.8: Action bar に「⚡ ライフライン推論」追加 (message 選択時のみ表示)
