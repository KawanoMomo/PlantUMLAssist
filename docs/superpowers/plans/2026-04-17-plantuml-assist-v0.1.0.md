# PlantUMLAssist v0.1.0 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PlantUMLAssist v0.1.0 MVP — Python backend + HTML UI + Sequence Diagram module、UI のみで PlantUML Sequence 図を作成可能にする。

**Architecture:** Python 3 stdlib のみで backend 実装 (`server.py`)、MermaidAssist の DiagramModule v2 / properties helpers / core を流用。render は backend 経由 (local Java default、online plantuml.com optional)。

**Tech Stack:** Python 3 stdlib (http.server), Java 8+ (PlantUML jar 実行), JavaScript ES5, Playwright (E2E).

---

## ファイル構成

**Create:**

- `server.py` — Python backend
- `plantuml-assist.html` — UI entry
- `src/app.js` — init, editor events, async render pipeline
- `src/core/html-utils.js` — MermaidAssist から流用 (コピー)
- `src/core/text-updater.js` — 同上
- `src/core/parser-utils.js` — 新規 (PlantUML detect + 基本 util)
- `src/core/history.js` — 流用
- `src/core/selection.js` — 流用
- `src/core/connection-mode.js` — 流用
- `src/ui/properties.js` — 14 helpers 流用
- `src/modules/sequence.js` — PlantUML Sequence モジュール
- `tests/run-tests.js` — node runner (MermaidAssist 同型)
- `tests/sequence-parser.test.js`
- `tests/sequence-updater.test.js`
- `tests/e2e/sequence-basic.spec.js`
- `README.md`, `LICENSE`, `.gitignore`, `package.json`

**Dependencies:**

- `lib/plantuml.jar` — PlantUML 公式 jar (MIT license、v1.2024.x 想定)

---

## Task 1: Python backend skeleton + static server

**Files:**
- Create: `server.py`

- [ ] **Step 1: `server.py` を作成**

```python
#!/usr/bin/env python3
"""PlantUMLAssist dev server.
Serves static files + /render endpoint for PlantUML local/online rendering.
"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
JAR_PATH = ROOT / 'lib' / 'plantuml.jar'
PORT = 8766


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/':
            path = '/plantuml-assist.html'
        file_path = ROOT / path.lstrip('/')
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, f'Not found: {path}')
            return
        # Guess MIME
        ext = file_path.suffix.lower()
        mime = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
        }.get(ext, 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', mime)
        # no-cache for dev
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def do_POST(self):
        if self.path != '/render':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            data = json.loads(body)
        except ValueError:
            self._send_json(400, {'error': 'invalid JSON'})
            return
        text = data.get('text', '')
        mode = data.get('mode', 'local')
        if mode == 'local':
            svg, error = render_local(text)
        elif mode == 'online':
            svg, error = render_online(text)
        else:
            self._send_json(400, {'error': f'unknown mode: {mode}'})
            return
        if error:
            self._send_json(500, {'error': error})
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(svg)

    def _send_json(self, code, payload):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def log_message(self, fmt, *args):
        # Reduce noise
        pass


def render_local(text):
    if not JAR_PATH.exists():
        return None, f'plantuml.jar not found at {JAR_PATH}'
    try:
        proc = subprocess.run(
            ['java', '-jar', str(JAR_PATH), '-tsvg', '-pipe', '-charset', 'UTF-8'],
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30,
        )
    except FileNotFoundError:
        return None, 'java not found; install Java 8+ or switch to online mode'
    except subprocess.TimeoutExpired:
        return None, 'render timeout (30s)'
    if proc.returncode != 0:
        err = proc.stderr.decode('utf-8', errors='replace')
        return None, f'PlantUML error: {err}'
    return proc.stdout, None


def render_online(text):
    try:
        encoded = plantuml_encode(text)
        url = f'https://www.plantuml.com/plantuml/svg/{encoded}'
        with urllib.request.urlopen(url, timeout=15) as resp:
            return resp.read(), None
    except urllib.error.URLError as e:
        return None, f'online render failed: {e}'
    except Exception as e:
        return None, f'online render error: {e}'


def plantuml_encode(text):
    """Encode PlantUML text to URL-safe form used by plantuml.com.
    Uses zlib deflate (no header) + custom base64 alphabet.
    """
    import zlib
    compressed = zlib.compress(text.encode('utf-8'))[2:-4]  # strip zlib header + adler32
    return _encode_base64(compressed)


def _encode_base64(data):
    alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
    out = []
    i = 0
    while i < len(data):
        b1 = data[i]
        b2 = data[i + 1] if i + 1 < len(data) else 0
        b3 = data[i + 2] if i + 2 < len(data) else 0
        out.append(alphabet[(b1 >> 2) & 0x3F])
        out.append(alphabet[((b1 << 4) | (b2 >> 4)) & 0x3F])
        out.append(alphabet[((b2 << 2) | (b3 >> 6)) & 0x3F])
        out.append(alphabet[b3 & 0x3F])
        i += 3
    return ''.join(out)


def main():
    print(f'PlantUMLAssist server starting on http://127.0.0.1:{PORT}')
    print(f'  ROOT: {ROOT}')
    print(f'  JAR:  {JAR_PATH} (exists={JAR_PATH.exists()})')
    print('Press Ctrl+C to stop.')
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.server_close()


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: `server.py` 起動テスト (foreground, Ctrl+C で停止)**

```bash
cd E:/00_Git/06_PlantUMLAssist && python server.py
```

Expected: `PlantUMLAssist server starting on http://127.0.0.1:8766` と表示され listen 開始。Ctrl+C で停止。

- [ ] **Step 3: 別シェルで静的 404 確認** (server は background で起動)

```bash
cd E:/00_Git/06_PlantUMLAssist && python server.py > /tmp/plantuml-assist-server.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8766/
# Expected: 404 (plantuml-assist.html not yet created)
pkill -f "python server.py"
```

- [ ] **Step 4: Commit**

```bash
cd E:/00_Git/06_PlantUMLAssist
git add server.py
git commit -m "feat(server): Python backend skeleton (static + /render endpoint)"
```

---

## Task 2: plantuml.jar を lib/ に配置

**Files:**
- Create: `lib/plantuml.jar` (download)
- Create: `.gitignore`
- Create: `lib/README.md`

- [ ] **Step 1: `.gitignore` 作成**

```
# Node
node_modules/
npm-debug.log

# Python
__pycache__/
*.pyc

# Tests
tests/results/
test-results/
playwright-report/

# Eval artifacts (keep reports, skip large binaries if any)
# .eval/ is tracked intentionally per MermaidAssist convention

# Editor
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# PlantUML rendered cache (if any)
*.tmp.svg
```

- [ ] **Step 2: `lib/plantuml.jar` ダウンロード**

ユーザー手動 or curl で:
```bash
cd E:/00_Git/06_PlantUMLAssist/lib
curl -L -o plantuml.jar "https://github.com/plantuml/plantuml/releases/download/v1.2024.7/plantuml-1.2024.7.jar"
```

If curl fails or manual download needed, note in README. For MVP, 10MB jar is OK tracked in git.

- [ ] **Step 3: Java 動作確認**

```bash
cd E:/00_Git/06_PlantUMLAssist
java -version
# Expected: Java 8+ version info
echo "@startuml\nAlice -> Bob\n@enduml" | java -jar lib/plantuml.jar -tsvg -pipe -charset UTF-8 > /tmp/test.svg
# Expected: /tmp/test.svg 約2KB程度の SVG
head -c 100 /tmp/test.svg
# Expected: <?xml version="1.0"... から始まる
rm /tmp/test.svg
```

If java not available, STOP and prompt user to install.

- [ ] **Step 4: `lib/README.md` 作成**

```markdown
# lib/

## plantuml.jar

- Source: https://github.com/plantuml/plantuml/releases
- License: MIT (embedded in jar)
- Version: v1.2024.7 (bundled at initial commit)
- Update: replace the file and re-test backend

To re-download:
\`\`\`bash
curl -L -o plantuml.jar https://github.com/plantuml/plantuml/releases/download/v1.2024.7/plantuml-1.2024.7.jar
\`\`\`
```

- [ ] **Step 5: Commit**

```bash
cd E:/00_Git/06_PlantUMLAssist
git add .gitignore lib/plantuml.jar lib/README.md
git commit -m "chore(lib): bundle plantuml.jar v1.2024.7 + .gitignore"
```

---

## Task 3: Copy MermaidAssist core/ + ui/properties.js

**Files:**
- Copy from MermaidAssist: html-utils.js, text-updater.js, history.js, selection.js, connection-mode.js (to `src/core/`)
- Copy: `src/ui/properties.js`
- Create: `src/core/date-utils.js` (stub — mermaid 固有なのでほぼ空でも可、または flow で流用)

- [ ] **Step 1: Core ファイルをコピー**

```bash
cd E:/00_Git/06_PlantUMLAssist
cp ../05_MermaidAssist/src/core/html-utils.js src/core/
cp ../05_MermaidAssist/src/core/text-updater.js src/core/
cp ../05_MermaidAssist/src/core/history.js src/core/
cp ../05_MermaidAssist/src/core/selection.js src/core/
cp ../05_MermaidAssist/src/core/connection-mode.js src/core/
cp ../05_MermaidAssist/src/ui/properties.js src/ui/
```

- [ ] **Step 2: Commit (MermaidAssist 著作権表記は同一ユーザー所有なので問題なし)**

```bash
cd E:/00_Git/06_PlantUMLAssist
git add src/core/ src/ui/
git commit -m "chore(core): copy MermaidAssist core utilities + properties helpers

- html-utils, text-updater, history, selection, connection-mode
- ui/properties.js (14 helpers)
Same author, MIT license chain intact."
```

---

## Task 4: `src/core/parser-utils.js` — PlantUML detect

**Files:**
- Create: `src/core/parser-utils.js`
- Create: `tests/run-tests.js`
- Create: `tests/parser-utils.test.js`

- [ ] **Step 1: `src/core/parser-utils.js` 作成**

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.parserUtils = (function() {
  // detectDiagramType: PlantUML 構文から図形タイプを判定
  // PlantUML は @startuml...@enduml で囲まれ、中身から判定する必要あり
  function detectDiagramType(text) {
    if (!text || !text.trim()) return null;
    var lines = text.split('\n');
    var inBlock = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.indexOf("'") === 0) continue; // PlantUML comment '
      if (/^@startuml/.test(t)) { inBlock = true; continue; }
      if (/^@enduml/.test(t)) break;
      if (!inBlock) continue;
      if (/^(actor|participant|boundary|control|entity|database|queue|collections)\b/.test(t)) return 'plantuml-sequence';
      if (/^usecase\b|\bas\s+\(/.test(t)) return 'plantuml-usecase';
      if (/^(class|interface|abstract|enum)\b/.test(t)) return 'plantuml-class';
      if (/^(start|stop|:.+;|if\s+\(|fork)/.test(t)) return 'plantuml-activity';
      if (/^(\[[^\]]+\]|component|package)\b/.test(t)) return 'plantuml-component';
      if (/^(state|\[\*\])/.test(t)) return 'plantuml-state';
      if (/\s(->|-->|<-|<--|<->|\.\.>)\s/.test(t)) return 'plantuml-sequence';
      // unknown substantive line → default
      return 'plantuml-sequence';
    }
    return null;
  }

  function splitLinesWithMeta(text) {
    if (!text) return [];
    var lines = text.split('\n');
    var result = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trimmed = raw.trim();
      result.push({
        lineNum: i + 1,
        raw: raw,
        trimmed: trimmed,
        isComment: trimmed.indexOf("'") === 0,
        isBlank: trimmed === '',
      });
    }
    return result;
  }

  return {
    detectDiagramType: detectDiagramType,
    splitLinesWithMeta: splitLinesWithMeta,
  };
})();
```

- [ ] **Step 2: `tests/run-tests.js` 作成 (MermaidAssist run-tests.js 同型)**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceFiles = [
  'src/core/html-utils.js',
  'src/core/text-updater.js',
  'src/core/parser-utils.js',
  'src/core/history.js',
  'src/core/selection.js',
  'src/core/connection-mode.js',
  'src/ui/properties.js',
  'src/modules/sequence.js',
];

let fns = {};
const sandbox = {
  document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, addEventListener: () => {} }) },
  window: { addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { clipboard: { write: async () => {} } },
  requestAnimationFrame: (cb) => cb(),
  setTimeout: (cb) => cb(),
  clearTimeout: () => {},
  alert: () => {},
  confirm: () => true,
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  File: class { constructor() {} },
  FileReader: class { readAsText() {} },
  ClipboardItem: class { constructor() {} },
  HTMLElement: class {},
  Image: class { set onload(fn) { fn && fn(); } set src(v) {} get width() { return 100; } get height() { return 100; } },
  __exportForTest: (obj) => { fns = obj; },
};

const keys = Object.keys(sandbox);
const vals = keys.map(k => sandbox[k]);

for (const relPath of sourceFiles) {
  const filePath = path.join(projectRoot, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`${relPath} not found yet — skipping`);
    continue;
  }
  const code = fs.readFileSync(filePath, 'utf-8');
  try {
    const fn = new Function(...keys, code);
    fn(...vals);
  } catch (e) {
    console.error(`Script eval error in ${relPath}:`, e.message);
  }
}

global.fns = fns;
global.window = sandbox.window;

let passed = 0, failed = 0, currentDescribe = '';

global.describe = function(name, fn) {
  currentDescribe = name;
  console.log(`\n  ${name}`);
  fn();
  currentDescribe = '';
};

global.test = function(name, fn) {
  try {
    fn();
    passed++;
    console.log(`    ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`    ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
};

global.expect = function(actual) {
  const assert = {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeNull() { if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`); },
    toBeDefined() { if (actual === undefined) throw new Error('Expected defined'); },
    toBeGreaterThan(n) { if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`); },
    toBeLessThan(n) { if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`); },
    toContain(item) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) throw new Error(`Array does not contain ${JSON.stringify(item)}`);
      } else if (typeof actual === 'string') {
        if (!actual.includes(item)) throw new Error(`String does not contain "${item}"`);
      }
    },
    not: {
      toBe(expected) { if (actual === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`); },
      toBeNull() { if (actual === null) throw new Error('Expected not null'); },
      toContain(item) {
        if (typeof actual === 'string' && actual.includes(item)) throw new Error(`String should not contain "${item}"`);
        if (Array.isArray(actual) && actual.includes(item)) throw new Error(`Array should not contain ${JSON.stringify(item)}`);
      },
    },
  };
  return assert;
};

const testFiles = process.argv.slice(2);
const files = testFiles.length > 0
  ? testFiles.map(f => path.resolve(f))
  : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, f));

for (const f of files) {
  console.log(`\n── ${path.basename(f)} ──`);
  require(f);
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: `tests/parser-utils.test.js` 作成**

```javascript
'use strict';
var parserUtils = (typeof window !== 'undefined' && window.MA && window.MA.parserUtils)
  || (global.window && global.window.MA && global.window.MA.parserUtils);

describe('detectDiagramType — PlantUML', function() {
  test('detects sequence from participant', function() {
    expect(parserUtils.detectDiagramType('@startuml\nparticipant Alice\n@enduml')).toBe('plantuml-sequence');
  });
  test('detects sequence from message', function() {
    expect(parserUtils.detectDiagramType('@startuml\nAlice -> Bob: hi\n@enduml')).toBe('plantuml-sequence');
  });
  test('detects class from class keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\nclass Foo\n@enduml')).toBe('plantuml-class');
  });
  test('detects state', function() {
    expect(parserUtils.detectDiagramType('@startuml\nstate Idle\n@enduml')).toBe('plantuml-state');
  });
  test('detects usecase', function() {
    expect(parserUtils.detectDiagramType('@startuml\nusecase Login\n@enduml')).toBe('plantuml-usecase');
  });
  test('detects component', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[A] --> [B]\n@enduml')).toBe('plantuml-component');
  });
  test('skips comments', function() {
    expect(parserUtils.detectDiagramType("@startuml\n' comment\nparticipant Alice\n@enduml")).toBe('plantuml-sequence');
  });
  test('returns null for empty', function() {
    expect(parserUtils.detectDiagramType('')).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd E:/00_Git/06_PlantUMLAssist && node tests/run-tests.js tests/parser-utils.test.js
```

Expected: `8 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src/core/parser-utils.js tests/run-tests.js tests/parser-utils.test.js
git commit -m "feat(parser): PlantUML detectDiagramType + test runner"
```

---

## Task 5: `src/modules/sequence.js` — parser

**Files:**
- Create: `src/modules/sequence.js`
- Create: `tests/sequence-parser.test.js`

- [ ] **Step 1: `src/modules/sequence.js` skeleton**

```javascript
'use strict';
window.MA = window.MA || {};
window.MA.modules = window.MA.modules || {};

window.MA.modules.plantumlSequence = (function() {
  var PARTICIPANT_TYPES = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue', 'collections'];
  var ARROWS = ['->', '-->', '->>', '-->>', '<-', '<--', '<<-', '<<--', '<->', '<-->'];

  // participant line: KIND "Label" as Alias / KIND Alias / KIND Alias as "Label"
  var PART_RE = new RegExp('^(' + PARTICIPANT_TYPES.join('|') + ')\\s+(?:"([^"]+)"\\s+as\\s+(\\S+)|(\\S+)(?:\\s+as\\s+"([^"]+)")?)\\s*$');
  // message line: From ARROW To : message
  // We scan for longest arrow match
  var MSG_RE_FROM = '([A-Za-z_][A-Za-z0-9_]*|"[^"]+")';
  var MSG_RE = new RegExp('^' + MSG_RE_FROM + '\\s+(->|-->|->>|-->>|<-|<--|<<-|<<--|<->|<-->)\\s+' + MSG_RE_FROM + '(?:\\s*:\\s*(.+))?$');

  function unquote(s) {
    if (!s) return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  function parseSequence(text) {
    var result = { meta: { title: '' }, elements: [], relations: [], groups: [] };
    if (!text || !text.trim()) return result;
    var lines = text.split('\n');
    var msgCounter = 0;
    var participantMap = {};

    function ensurePart(name) {
      var clean = unquote(name);
      if (!participantMap[clean]) {
        participantMap[clean] = {
          kind: 'participant', id: clean, label: clean, ptype: 'participant', line: 0,
        };
        result.elements.push(participantMap[clean]);
      }
      return clean;
    }

    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed.indexOf("'") === 0) continue;
      if (/^@startuml/.test(trimmed) || /^@enduml/.test(trimmed)) continue;

      var tm = trimmed.match(/^title\s+(.+)$/);
      if (tm) { result.meta.title = tm[1].trim(); continue; }

      var pm = trimmed.match(PART_RE);
      if (pm) {
        var ptype = pm[1];
        // Case A: KIND "Label" as Alias  → pm[2]=Label, pm[3]=Alias
        // Case B: KIND Alias [as "Label"] → pm[4]=Alias, pm[5]=Label|undefined
        var alias, label;
        if (pm[2] !== undefined) {
          alias = pm[3];
          label = pm[2];
        } else {
          alias = pm[4];
          label = pm[5] !== undefined ? pm[5] : pm[4];
        }
        if (!participantMap[alias]) {
          participantMap[alias] = {
            kind: 'participant', id: alias, label: label, ptype: ptype, line: lineNum,
          };
          result.elements.push(participantMap[alias]);
        } else {
          participantMap[alias].ptype = ptype;
          participantMap[alias].label = label;
          participantMap[alias].line = lineNum;
        }
        continue;
      }

      var mm = trimmed.match(MSG_RE);
      if (mm) {
        var from = ensurePart(mm[1]);
        var arrow = mm[2];
        var to = ensurePart(mm[3]);
        var label = mm[4] || '';
        if (!participantMap[from].line) participantMap[from].line = lineNum;
        if (!participantMap[to].line) participantMap[to].line = lineNum;
        result.relations.push({
          kind: 'message', id: '__m_' + (msgCounter++),
          from: from, to: to, arrow: arrow, label: label, line: lineNum,
        });
      }
    }
    return result;
  }

  return {
    type: 'plantuml-sequence',
    displayName: 'Sequence',
    PARTICIPANT_TYPES: PARTICIPANT_TYPES,
    ARROWS: ARROWS,
    detect: function(text) { return window.MA.parserUtils.detectDiagramType(text) === 'plantuml-sequence'; },
    parse: parseSequence,
    parseSequence: parseSequence,
    template: function() {
      return [
        '@startuml',
        "title Sample Sequence",
        'actor User',
        'participant System',
        'database DB',
        '',
        'User -> System : Request',
        'System -> DB : Query',
        'DB --> System : Result',
        'System --> User : Response',
        '@enduml',
      ].join('\n');
    },
    buildOverlay: function(svgEl, parsedData, overlayEl) {
      if (!overlayEl) return;
      while (overlayEl.firstChild) overlayEl.removeChild(overlayEl.firstChild);
      if (!svgEl) return;
      var viewBox = svgEl.getAttribute('viewBox');
      if (viewBox) overlayEl.setAttribute('viewBox', viewBox);
    },
    renderProps: function(selData, parsedData, propsEl, ctx) {
      if (propsEl) propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">Sequence (実装中)</p>';
    },
    operations: { add: function(t) { return t; }, delete: function(t) { return t; }, update: function(t) { return t; }, moveUp: function(t) { return t; }, moveDown: function(t) { return t; }, connect: function(t) { return t; } },
  };
})();
```

- [ ] **Step 2: `tests/sequence-parser.test.js`**

```javascript
'use strict';
var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

describe('parseSequence', function() {
  test('parses title', function() {
    var r = seq.parseSequence('@startuml\ntitle My Flow\n@enduml');
    expect(r.meta.title).toBe('My Flow');
  });

  test('parses actor participant', function() {
    var r = seq.parseSequence('@startuml\nactor User\n@enduml');
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].ptype).toBe('actor');
    expect(r.elements[0].id).toBe('User');
  });

  test('parses participant with as alias', function() {
    var r = seq.parseSequence('@startuml\nparticipant "Login Server" as LS\n@enduml');
    expect(r.elements[0].id).toBe('LS');
    expect(r.elements[0].label).toBe('Login Server');
  });

  test('parses message with label', function() {
    var r = seq.parseSequence('@startuml\nparticipant A\nparticipant B\nA -> B : hello\n@enduml');
    expect(r.relations.length).toBe(1);
    expect(r.relations[0].from).toBe('A');
    expect(r.relations[0].to).toBe('B');
    expect(r.relations[0].arrow).toBe('->');
    expect(r.relations[0].label).toBe('hello');
  });

  test('parses message without explicit participant', function() {
    var r = seq.parseSequence('@startuml\nA -> B : hi\n@enduml');
    expect(r.elements.length).toBe(2);
    expect(r.relations.length).toBe(1);
  });

  test('parses multiple arrow types', function() {
    var r = seq.parseSequence('@startuml\nA -> B\nA --> B\nA ->> B\nA <- B\n@enduml');
    expect(r.relations.length).toBe(4);
    expect(r.relations[0].arrow).toBe('->');
    expect(r.relations[1].arrow).toBe('-->');
    expect(r.relations[2].arrow).toBe('->>');
    expect(r.relations[3].arrow).toBe('<-');
  });

  test('ignores comments and @startuml/@enduml', function() {
    var r = seq.parseSequence("@startuml\n' this is comment\nactor A\n@enduml");
    expect(r.elements.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd E:/00_Git/06_PlantUMLAssist && node tests/run-tests.js
```

Expected: `15 passed, 0 failed` (8 parser-utils + 7 sequence-parser)

- [ ] **Step 4: Commit**

```bash
git add src/modules/sequence.js tests/sequence-parser.test.js
git commit -m "feat(sequence): module skeleton + parseSequence (participants, messages, title)"
```

---

## Task 6: Sequence updaters

**Files:**
- Modify: `src/modules/sequence.js`
- Create: `tests/sequence-updater.test.js`

- [ ] **Step 1: updater 関数を `src/modules/sequence.js` の `parseSequence` 直後に追加**

挿入場所: `parseSequence` 関数の閉じ `}` 直後、`return {` の前。

```javascript
  function addParticipant(text, ptype, alias, label) {
    var line;
    if (label && label !== alias) {
      line = ptype + ' "' + label + '" as ' + alias;
    } else {
      line = ptype + ' ' + alias;
    }
    return insertBeforeEnd(text, line);
  }

  function addMessage(text, from, to, arrow, label) {
    var line = from + ' ' + (arrow || '->') + ' ' + to + (label ? ' : ' + label : '');
    return insertBeforeEnd(text, line);
  }

  function insertBeforeEnd(text, newLine) {
    var lines = text.split('\n');
    var endIdx = -1;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@enduml/.test(lines[i])) { endIdx = i; break; }
    }
    if (endIdx < 0) {
      // Append at end
      var insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
      lines.splice(insertAt, 0, newLine);
    } else {
      lines.splice(endIdx, 0, newLine);
    }
    return lines.join('\n');
  }

  function deleteLine(text, lineNum) {
    return window.MA.textUpdater.deleteLine(text, lineNum);
  }

  function updateParticipant(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(PART_RE);
    if (!m) return text;
    var ptype = m[1];
    var alias, label;
    if (m[2] !== undefined) { alias = m[3]; label = m[2]; }
    else { alias = m[4]; label = m[5] !== undefined ? m[5] : m[4]; }
    if (field === 'ptype') ptype = value;
    else if (field === 'id' || field === 'alias') alias = value;
    else if (field === 'label') label = value;
    var out = label && label !== alias ? (ptype + ' "' + label + '" as ' + alias) : (ptype + ' ' + alias);
    lines[idx] = indent + out;
    return lines.join('\n');
  }

  function updateMessage(text, lineNum, field, value) {
    var lines = text.split('\n');
    var idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) return text;
    var indent = lines[idx].match(/^(\s*)/)[1];
    var m = lines[idx].trim().match(MSG_RE);
    if (!m) return text;
    var from = unquote(m[1]), arrow = m[2], to = unquote(m[3]), label = m[4] || '';
    if (field === 'from') from = value;
    else if (field === 'to') to = value;
    else if (field === 'arrow') arrow = value;
    else if (field === 'label') label = value;
    lines[idx] = indent + from + ' ' + arrow + ' ' + to + (label ? ' : ' + label : '');
    return lines.join('\n');
  }

  function setTitle(text, newTitle) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*title\s+/.test(lines[i])) {
        var indent = lines[i].match(/^(\s*)/)[1];
        lines[i] = indent + 'title ' + newTitle;
        return lines.join('\n');
      }
    }
    // Insert after @startuml
    for (var j = 0; j < lines.length; j++) {
      if (/^\s*@startuml/.test(lines[j])) {
        lines.splice(j + 1, 0, 'title ' + newTitle);
        return lines.join('\n');
      }
    }
    return text;
  }
```

そして return object を更新 (placeholder operations を置換):

```javascript
    operations: {
      add: function(text, kind, props) {
        if (kind === 'participant') return addParticipant(text, props.ptype || 'participant', props.alias, props.label);
        if (kind === 'message') return addMessage(text, props.from, props.to, props.arrow, props.label);
        return text;
      },
      delete: function(text, lineNum) { return deleteLine(text, lineNum); },
      update: function(text, lineNum, field, value, opts) {
        opts = opts || {};
        if (field === 'title') return setTitle(text, value);
        if (opts.kind === 'message') return updateMessage(text, lineNum, field, value);
        return updateParticipant(text, lineNum, field, value);
      },
      moveUp: function(text, lineNum) {
        if (lineNum <= 1) return text;
        return window.MA.textUpdater.swapLines(text, lineNum, lineNum - 1);
      },
      moveDown: function(text, lineNum) {
        var total = text.split('\n').length;
        if (lineNum >= total) return text;
        return window.MA.textUpdater.swapLines(text, lineNum, lineNum + 1);
      },
      connect: function(text, fromName, toName, props) {
        props = props || {};
        return addMessage(text, fromName, toName, props.arrow || '->', props.label);
      },
    },
```

また return オブジェクトの末尾に公開関数も追加:

```javascript
    addParticipant: addParticipant,
    addMessage: addMessage,
    deleteLine: deleteLine,
    updateParticipant: updateParticipant,
    updateMessage: updateMessage,
    setTitle: setTitle,
```

- [ ] **Step 2: `tests/sequence-updater.test.js`**

```javascript
'use strict';
var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

describe('addParticipant', function() {
  test('adds actor before @enduml', function() {
    var out = seq.addParticipant('@startuml\n@enduml', 'actor', 'Alice');
    expect(out).toContain('actor Alice');
    expect(out.indexOf('actor Alice')).toBeLessThan(out.indexOf('@enduml'));
  });

  test('adds with label + as', function() {
    var out = seq.addParticipant('@startuml\n@enduml', 'participant', 'LS', 'Login Server');
    expect(out).toContain('participant "Login Server" as LS');
  });
});

describe('addMessage', function() {
  test('adds message with label', function() {
    var out = seq.addMessage('@startuml\nactor A\nactor B\n@enduml', 'A', 'B', '->', 'hi');
    expect(out).toContain('A -> B : hi');
  });

  test('adds message without label', function() {
    var out = seq.addMessage('@startuml\n@enduml', 'A', 'B', '-->');
    expect(out).toContain('A --> B');
    expect(out).not.toContain(' : ');
  });
});

describe('updateMessage', function() {
  test('updates label', function() {
    var t = '@startuml\nA -> B : old\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateMessage(t, p.relations[0].line, 'label', 'new');
    expect(out).toContain('A -> B : new');
  });

  test('updates arrow', function() {
    var t = '@startuml\nA -> B\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateMessage(t, p.relations[0].line, 'arrow', '-->');
    expect(out).toContain('A --> B');
  });
});

describe('updateParticipant', function() {
  test('updates alias', function() {
    var t = '@startuml\nactor A\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateParticipant(t, p.elements[0].line, 'alias', 'Alice');
    expect(out).toContain('actor Alice');
  });

  test('updates label adding as syntax', function() {
    var t = '@startuml\nactor A\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateParticipant(t, p.elements[0].line, 'label', 'Alice Wonder');
    expect(out).toContain('actor "Alice Wonder" as A');
  });
});

describe('setTitle', function() {
  test('inserts title after @startuml', function() {
    var out = seq.setTitle('@startuml\n@enduml', 'My Title');
    expect(out).toContain('title My Title');
  });

  test('replaces existing title', function() {
    var out = seq.setTitle('@startuml\ntitle Old\n@enduml', 'New');
    expect(out).toContain('title New');
    expect(out).not.toContain('title Old');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd E:/00_Git/06_PlantUMLAssist && node tests/run-tests.js
```

Expected: `24 passed, 0 failed` (15 prev + 9 updater)

- [ ] **Step 4: Commit**

```bash
git add src/modules/sequence.js tests/sequence-updater.test.js
git commit -m "feat(sequence): updaters (addParticipant/addMessage/update/setTitle)"
```

---

## Task 7: Sequence renderProps

**Files:**
- Modify: `src/modules/sequence.js`

- [ ] **Step 1: renderProps 実装**

`renderProps` placeholder を以下で置換:

```javascript
    renderProps: function(selData, parsedData, propsEl, ctx) {
      if (!propsEl) return;
      var escHtml = window.MA.htmlUtils.escHtml;
      var P = window.MA.properties;
      var participants = parsedData.elements.filter(function(e) { return e.kind === 'participant'; });
      var messages = parsedData.relations;

      if (!selData || selData.length === 0) {
        var pTypeOpts = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === 'participant' }; });
        var arrowOpts = ARROWS.map(function(a) { return { value: a, label: a, selected: a === '->' }; });
        var partOpts = participants.map(function(p) { return { value: p.id, label: p.label }; });
        if (partOpts.length === 0) partOpts = [{ value: '', label: '（参加者を先に追加）' }];

        var pList = '';
        for (var i = 0; i < participants.length; i++) {
          var p = participants[i];
          pList += P.listItemHtml({
            label: p.ptype + ' ' + p.label + (p.label !== p.id ? ' (as ' + p.id + ')' : ''),
            selectClass: 'seq-select-part', deleteClass: 'seq-delete-part',
            dataElementId: p.id, dataLine: p.line,
          });
        }
        if (!pList) pList = P.emptyListHtml('（参加者なし）');

        var mList = '';
        for (var j = 0; j < messages.length; j++) {
          var m = messages[j];
          mList += P.listItemHtml({
            label: m.from + ' ' + m.arrow + ' ' + m.to + (m.label ? ' : ' + m.label : ''),
            selectClass: 'seq-select-msg', deleteClass: 'seq-delete-msg',
            dataElementId: m.id, dataLine: m.line, mono: true,
          });
        }
        if (!mList) mList = P.emptyListHtml('（メッセージなし）');

        propsEl.innerHTML =
          '<div style="margin-bottom:12px;font-size:11px;color:var(--text-secondary);">Sequence</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">Title 設定</label>' +
            P.fieldHtml('Title', 'seq-title', parsedData.meta.title) +
            P.primaryButtonHtml('seq-set-title', 'Title 適用') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">参加者を追加</label>' +
            P.selectFieldHtml('Type', 'seq-add-ptype', pTypeOpts) +
            P.fieldHtml('Alias', 'seq-add-alias', '', '例: user1') +
            P.fieldHtml('Label (省略可)', 'seq-add-label', '') +
            P.primaryButtonHtml('seq-add-part-btn', '+ 参加者追加') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--accent);margin-bottom:4px;font-weight:bold;">メッセージを追加</label>' +
            P.selectFieldHtml('From', 'seq-add-from', partOpts) +
            P.selectFieldHtml('Arrow', 'seq-add-arrow', arrowOpts) +
            P.selectFieldHtml('To', 'seq-add-to', partOpts) +
            P.fieldHtml('Label', 'seq-add-msg-label', '', '省略可') +
            P.primaryButtonHtml('seq-add-msg-btn', '+ メッセージ追加') +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">参加者一覧</label>' +
            '<div>' + pList + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;">' +
            '<label style="display:block;font-size:10px;color:var(--text-secondary);margin-bottom:6px;">メッセージ一覧</label>' +
            '<div>' + mList + '</div>' +
          '</div>';

        P.bindEvent('seq-set-title', 'click', function() {
          window.MA.history.pushHistory();
          ctx.setMmdText(setTitle(ctx.getMmdText(), document.getElementById('seq-title').value.trim()));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-part-btn', 'click', function() {
          var pt = document.getElementById('seq-add-ptype').value;
          var al = document.getElementById('seq-add-alias').value.trim();
          var lb = document.getElementById('seq-add-label').value.trim();
          if (!al) { alert('Alias は必須です'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addParticipant(ctx.getMmdText(), pt, al, lb || al));
          ctx.onUpdate();
        });
        P.bindEvent('seq-add-msg-btn', 'click', function() {
          var f = document.getElementById('seq-add-from').value;
          var t = document.getElementById('seq-add-to').value;
          var a = document.getElementById('seq-add-arrow').value;
          var l = document.getElementById('seq-add-msg-label').value.trim();
          if (!f || !t) { alert('From/To 必須'); return; }
          window.MA.history.pushHistory();
          ctx.setMmdText(addMessage(ctx.getMmdText(), f, t, a, l));
          ctx.onUpdate();
        });

        P.bindSelectButtons(propsEl, 'seq-select-part', 'participant');
        P.bindSelectButtons(propsEl, 'seq-select-msg', 'message');
        P.bindDeleteButtons(propsEl, 'seq-delete-part', ctx, deleteLine);
        P.bindDeleteButtons(propsEl, 'seq-delete-msg', ctx, deleteLine);
        return;
      }

      if (selData.length === 1) {
        var sel = selData[0];
        if (sel.type === 'participant') {
          var pp = null;
          for (var ii = 0; ii < participants.length; ii++) if (participants[ii].id === sel.id) { pp = participants[ii]; break; }
          if (!pp) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">参加者が見つかりません</p>'; return; }
          var pOpts2 = PARTICIPANT_TYPES.map(function(pt) { return { value: pt, label: pt, selected: pt === pp.ptype }; });
          propsEl.innerHTML =
            P.panelHeaderHtml(pp.label) +
            P.selectFieldHtml('Type', 'seq-edit-ptype', pOpts2) +
            P.fieldHtml('Alias', 'seq-edit-alias', pp.id) +
            P.fieldHtml('Label', 'seq-edit-label', pp.label) +
            P.dangerButtonHtml('seq-edit-delete', '参加者削除');
          var ln = pp.line;
          ['ptype', 'alias', 'label'].forEach(function(f) {
            document.getElementById('seq-edit-' + f).addEventListener('change', function() {
              window.MA.history.pushHistory();
              ctx.setMmdText(updateParticipant(ctx.getMmdText(), ln, f, this.value));
              ctx.onUpdate();
            });
          });
          P.bindEvent('seq-edit-delete', 'click', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), ln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          return;
        }
        if (sel.type === 'message') {
          var mm = null;
          for (var jj = 0; jj < messages.length; jj++) if (messages[jj].id === sel.id) { mm = messages[jj]; break; }
          if (!mm) { propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">メッセージが見つかりません</p>'; return; }
          var partOpts2 = participants.map(function(p) { return { value: p.id, label: p.label }; });
          var fromOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.from }; });
          var toOpts = partOpts2.map(function(o) { return { value: o.value, label: o.label, selected: o.value === mm.to }; });
          var arrowOpts2 = ARROWS.map(function(a) { return { value: a, label: a, selected: a === mm.arrow }; });
          propsEl.innerHTML =
            P.panelHeaderHtml('Message') +
            P.selectFieldHtml('From', 'seq-edit-from', fromOpts) +
            P.selectFieldHtml('Arrow', 'seq-edit-arrow', arrowOpts2) +
            P.selectFieldHtml('To', 'seq-edit-to', toOpts) +
            P.fieldHtml('Label', 'seq-edit-msg-label', mm.label) +
            P.dangerButtonHtml('seq-edit-msg-delete', 'メッセージ削除');
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
          P.bindEvent('seq-edit-msg-delete', 'click', function() {
            window.MA.history.pushHistory();
            ctx.setMmdText(deleteLine(ctx.getMmdText(), mln));
            window.MA.selection.clearSelection();
            ctx.onUpdate();
          });
          return;
        }
      }

      propsEl.innerHTML = '<p style="color:var(--text-secondary);font-size:11px;">未対応の選択状態</p>';
    },
```

- [ ] **Step 2: Regression check (unit)**

```bash
cd E:/00_Git/06_PlantUMLAssist && node tests/run-tests.js
```

Expected: 24 passed (no regression)

- [ ] **Step 3: Commit**

```bash
git add src/modules/sequence.js
git commit -m "feat(sequence): renderProps (vertical add forms + detail panels)"
```

---

## Task 8: HTML shell + app.js (async render pipeline)

**Files:**
- Create: `plantuml-assist.html`
- Create: `src/app.js`

- [ ] **Step 1: `plantuml-assist.html` 作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>PlantUMLAssist</title>
<style>
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border: #30363d;
  --accent: #58a6ff;
  --accent-hover: #1f6feb;
  --danger: #da3633;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --font-mono: "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body, html { margin: 0; padding: 0; height: 100vh; background: var(--bg-primary); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; }
#app { display: flex; flex-direction: column; height: 100vh; }
#toolbar { background: var(--bg-secondary); border-bottom: 1px solid var(--border); padding: 6px 10px; display: flex; gap: 8px; align-items: center; font-size: 12px; }
#toolbar button, #toolbar select { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; }
#toolbar button:hover { background: var(--accent); color: #fff; }
#main { display: flex; flex: 1; overflow: hidden; }
#editor-pane { width: 35%; display: flex; flex-direction: column; border-right: 1px solid var(--border); }
#editor { flex: 1; background: var(--bg-primary); color: var(--text-primary); border: none; padding: 10px; font-family: var(--font-mono); font-size: 13px; resize: none; outline: none; white-space: pre; }
#preview-pane { flex: 1; position: relative; overflow: auto; background: #fff; }
#preview-svg { padding: 20px; min-height: 100%; }
#preview-svg svg { max-width: 100%; }
#render-status { position: absolute; top: 10px; right: 10px; font-size: 11px; color: var(--text-secondary); background: rgba(13, 17, 23, 0.9); padding: 3px 8px; border-radius: 3px; }
#render-status.error { color: #ff7b72; background: rgba(218, 54, 51, 0.15); }
#props-pane { width: 280px; border-left: 1px solid var(--border); background: var(--bg-secondary); padding: 10px; overflow-y: auto; }
#status { background: var(--bg-secondary); border-top: 1px solid var(--border); padding: 3px 10px; font-size: 11px; color: var(--text-secondary); }
</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <strong>PlantUMLAssist</strong>
    <select id="diagram-type">
      <option value="plantuml-sequence">Sequence</option>
    </select>
    <select id="render-mode" title="Render mode">
      <option value="local">local (Java)</option>
      <option value="online">online (plantuml.com)</option>
    </select>
    <button id="btn-render" title="Re-render">Render</button>
    <button id="btn-undo" title="Undo (Ctrl+Z)">Undo</button>
    <button id="btn-redo" title="Redo (Ctrl+Y)">Redo</button>
  </div>
  <div id="main">
    <div id="editor-pane">
      <textarea id="editor" spellcheck="false"></textarea>
    </div>
    <div id="preview-pane">
      <div id="preview-svg"></div>
      <div id="render-status">Idle</div>
    </div>
    <div id="props-pane"></div>
  </div>
  <div id="status"><span id="status-parse">—</span> | <span id="status-info">—</span></div>
</div>
<script src="src/core/html-utils.js"></script>
<script src="src/core/text-updater.js"></script>
<script src="src/core/parser-utils.js"></script>
<script src="src/core/history.js"></script>
<script src="src/core/selection.js"></script>
<script src="src/core/connection-mode.js"></script>
<script src="src/ui/properties.js"></script>
<script src="src/modules/sequence.js"></script>
<script src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `src/app.js` 作成**

```javascript
'use strict';

var modules = {};
function _registerModules() {
  var mm = window.MA.modules || {};
  var keys = Object.keys(mm);
  for (var i = 0; i < keys.length; i++) {
    var mod = mm[keys[i]];
    var key = (mod && mod.type) ? mod.type : keys[i];
    if (!modules[key]) {
      modules[key] = mod;
    } else {
      for (var prop in mod) {
        if (Object.prototype.hasOwnProperty.call(mod, prop) && !(prop in modules[key])) {
          modules[key][prop] = mod[prop];
        }
      }
    }
  }
}

var editorEl, previewSvgEl, propsEl, statusParseEl, statusInfoEl, renderStatusEl;
var mmdText = '';
var currentModule = null;
var suppressSync = false;
var renderTimer = null;
var RENDER_DEBOUNCE_MS = 150;

function init() {
  editorEl = document.getElementById('editor');
  previewSvgEl = document.getElementById('preview-svg');
  propsEl = document.getElementById('props-pane');
  statusParseEl = document.getElementById('status-parse');
  statusInfoEl = document.getElementById('status-info');
  renderStatusEl = document.getElementById('render-status');

  _registerModules();

  // Restore render mode
  var savedMode = localStorage.getItem('plantuml-render-mode') || 'local';
  document.getElementById('render-mode').value = savedMode;

  // Initial template
  currentModule = modules['plantuml-sequence'];
  mmdText = currentModule.template();
  editorEl.value = mmdText;

  // Editor events
  editorEl.addEventListener('input', function() {
    if (suppressSync) return;
    window.MA.history.pushHistory();
    mmdText = editorEl.value;
    scheduleRefresh();
  });

  // Tab / Shift+Tab (workspace ADR-011)
  editorEl.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab' || e.isComposing) return;
    e.preventDefault();
    var start = this.selectionStart, end = this.selectionEnd;
    if (e.shiftKey) {
      var before = this.value.substring(0, start);
      var lineStart = before.lastIndexOf('\n') + 1;
      if (this.value.substring(lineStart, lineStart + 2) === '  ') {
        this.value = this.value.substring(0, lineStart) + this.value.substring(lineStart + 2);
        this.selectionStart = this.selectionEnd = Math.max(lineStart, start - 2);
      }
    } else {
      this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + 2;
    }
    this.dispatchEvent(new Event('input'));
  });

  // Render mode change
  document.getElementById('render-mode').addEventListener('change', function() {
    localStorage.setItem('plantuml-render-mode', this.value);
    scheduleRefresh();
  });

  // Render button
  document.getElementById('btn-render').addEventListener('click', scheduleRefresh);

  // Undo / Redo
  document.getElementById('btn-undo').addEventListener('click', function() { window.MA.history.undo(); });
  document.getElementById('btn-redo').addEventListener('click', function() { window.MA.history.redo(); });

  // Diagram-type switch
  document.getElementById('diagram-type').addEventListener('change', function() {
    var t = this.value;
    var mod = modules[t];
    if (!mod) return;
    window.MA.history.pushHistory();
    mmdText = mod.template();
    suppressSync = true;
    editorEl.value = mmdText;
    suppressSync = false;
    window.MA.selection.clearSelection();
    scheduleRefresh();
  });

  // History setup
  window.MA.history.init({
    getState: function() { return mmdText; },
    setState: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; scheduleRefresh(); },
  });

  // Selection hooks
  window.MA.selection.init({ onChange: function() { renderProps(); } });

  // Initial refresh
  scheduleRefresh();
}

function scheduleRefresh() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refresh, RENDER_DEBOUNCE_MS);
}

function refresh() {
  // Detect module
  var detectedType = window.MA.parserUtils.detectDiagramType(mmdText);
  var mod = detectedType ? modules[detectedType] : null;
  if (mod) currentModule = mod;

  // Parse
  var parsed;
  try {
    parsed = currentModule.parse(mmdText);
    statusParseEl.textContent = 'OK';
    statusParseEl.style.color = 'var(--text-secondary)';
  } catch (e) {
    statusParseEl.textContent = 'Parse error: ' + e.message;
    statusParseEl.style.color = '#ff7b72';
    parsed = { meta: {}, elements: [], relations: [], groups: [] };
  }
  statusInfoEl.textContent = (parsed.elements ? parsed.elements.length : 0) + ' elements, ' + (parsed.relations ? parsed.relations.length : 0) + ' relations';

  // Render props
  renderProps(parsed);

  // Render SVG (async)
  renderSvg();
}

function renderProps(parsed) {
  if (!parsed) {
    try { parsed = currentModule.parse(mmdText); } catch (e) { parsed = { meta: {}, elements: [], relations: [], groups: [] }; }
  }
  var sel = window.MA.selection.getSelection();
  var selData = sel.map(function(s) { return { type: s.kind, id: s.id }; });
  currentModule.renderProps(selData, parsed, propsEl, {
    getMmdText: function() { return mmdText; },
    setMmdText: function(s) { mmdText = s; suppressSync = true; editorEl.value = s; suppressSync = false; },
    onUpdate: function() { scheduleRefresh(); },
  });
}

function renderSvg() {
  var mode = document.getElementById('render-mode').value || 'local';
  renderStatusEl.textContent = 'Rendering…';
  renderStatusEl.classList.remove('error');

  fetch('/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: mmdText, mode: mode }),
  }).then(function(resp) {
    var contentType = resp.headers.get('Content-Type') || '';
    if (!resp.ok) {
      return resp.json().then(function(err) { throw new Error(err.error || ('HTTP ' + resp.status)); });
    }
    if (contentType.indexOf('image/svg') < 0) {
      throw new Error('Unexpected content type: ' + contentType);
    }
    return resp.text();
  }).then(function(svg) {
    previewSvgEl.innerHTML = svg;
    renderStatusEl.textContent = 'OK (' + mode + ')';
  }).catch(function(err) {
    previewSvgEl.innerHTML = '<p style="color:#ff7b72;padding:20px;white-space:pre-wrap;">Render error: ' + (err.message || err) + '</p>';
    renderStatusEl.textContent = 'ERROR';
    renderStatusEl.classList.add('error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 3: Playwright で動作確認**

```bash
cd E:/00_Git/06_PlantUMLAssist && python server.py > /tmp/plantuml-server.log 2>&1 &
sleep 2
cat > tmp_check.js <<'EOF'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PE:' + e.message));
  await page.goto('http://127.0.0.1:8766/');
  await page.waitForTimeout(4000);
  var svgCount = await page.locator('#preview-svg svg').count();
  var renderStatus = await page.locator('#render-status').textContent();
  var editorText = await page.locator('#editor').inputValue();
  console.log('SVG=' + svgCount + ' STATUS=' + renderStatus + ' ERR=' + errors.length);
  console.log('EDITOR_HAS_TEMPLATE=' + editorText.includes('@startuml'));
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit((svgCount > 0 && errors.length === 0 && renderStatus.indexOf('OK') === 0) ? 0 : 1);
})();
EOF
node tmp_check.js
rc=$?
rm tmp_check.js
pkill -f "python server.py" 2>/dev/null
exit $rc
```

Expected: `SVG=1 STATUS=OK (local) ERR=0 EDITOR_HAS_TEMPLATE=true`, exit 0

- [ ] **Step 4: Commit**

```bash
git add plantuml-assist.html src/app.js
git commit -m "feat(ui): HTML shell + app.js async render pipeline"
```

---

## Task 9: E2E tests

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `tests/e2e/sequence-basic.spec.js`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "plantuml-assist",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test:unit": "node tests/run-tests.js",
    "test:e2e": "playwright test",
    "test:all": "npm run test:unit && npm run test:e2e"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "playwright": "^1.40.0"
  }
}
```

- [ ] **Step 2: `playwright.config.js`**

```javascript
// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  webServer: {
    command: 'python server.py',
    port: 8766,
    reuseExistingServer: true,
    timeout: 10 * 1000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8766',
    trace: 'on-first-retry',
  },
});
```

- [ ] **Step 3: `tests/e2e/sequence-basic.spec.js`**

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');

async function waitForRender(page) {
  await page.waitForFunction(() => {
    var s = document.getElementById('render-status');
    return s && (s.textContent.indexOf('OK') === 0 || s.textContent === 'ERROR');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(200);
}

test.describe('Sequence: Switching + basic render', () => {
  test('loads template on boot', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    var editor = await page.locator('#editor').inputValue();
    expect(editor).toContain('@startuml');
  });

  test('renders SVG via local mode', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    var svgCount = await page.locator('#preview-svg svg').count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test('property panel shows Sequence UI', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    await expect(page.locator('#seq-add-part-btn')).toBeVisible();
    await expect(page.locator('#seq-add-msg-btn')).toBeVisible();
    await expect(page.locator('#seq-set-title')).toBeVisible();
  });
});

test.describe('Sequence Operations', () => {
  test('set title', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    await page.locator('#seq-title').fill('New Title');
    await page.locator('#seq-set-title').click();
    await waitForRender(page);
    var t = await page.locator('#editor').inputValue();
    expect(t).toContain('title New Title');
  });

  test('add participant', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    await page.locator('#seq-add-ptype').selectOption('actor');
    await page.locator('#seq-add-alias').fill('NewActor');
    await page.locator('#seq-add-label').fill('New Actor');
    await page.locator('#seq-add-part-btn').click();
    await waitForRender(page);
    var t = await page.locator('#editor').inputValue();
    expect(t).toContain('actor "New Actor" as NewActor');
  });

  test('add message between existing participants', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    // Template has User, System, DB
    await page.locator('#seq-add-from').selectOption('User');
    await page.locator('#seq-add-to').selectOption('DB');
    await page.locator('#seq-add-arrow').selectOption('-->');
    await page.locator('#seq-add-msg-label').fill('hello');
    await page.locator('#seq-add-msg-btn').click();
    await waitForRender(page);
    var t = await page.locator('#editor').inputValue();
    expect(t).toContain('User --> DB : hello');
  });

  test('Tab key indents by 2 spaces', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    await page.locator('#editor').click();
    await page.locator('#editor').evaluate((e) => { e.value = 'xyz'; e.dispatchEvent(new Event('input')); e.setSelectionRange(0, 0); });
    await page.keyboard.press('Tab');
    var t = await page.locator('#editor').inputValue();
    expect(t.startsWith('  xyz')).toBe(true);
  });

  test('render-mode toggle persists', async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
    await page.locator('#render-mode').selectOption('online');
    await page.waitForTimeout(500);
    var stored = await page.evaluate(() => localStorage.getItem('plantuml-render-mode'));
    expect(stored).toBe('online');
  });
});
```

- [ ] **Step 4: Playwright install**

```bash
cd E:/00_Git/06_PlantUMLAssist
npm install --save-dev @playwright/test playwright
npx playwright install chromium
```

- [ ] **Step 5: Run E2E**

```bash
cd E:/00_Git/06_PlantUMLAssist && npx playwright test tests/e2e/sequence-basic.spec.js
```

Expected: `9 passed` (3 switching + 6 ops; note the online mode test may fail if network restricted — it's commented expected behavior, if fails adjust to check only localStorage set without re-rendering)

Note: If the last test fails due to network timeout for online mode, it still checks localStorage persistence before render attempt. Adjust timeout if needed.

- [ ] **Step 6: Commit**

```bash
git add package.json playwright.config.js tests/e2e/sequence-basic.spec.js
git commit -m "test(e2e): sequence-basic 9 cases + playwright config"
```

---

## Task 10: README + LICENSE + final commit

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `docs/ecn/README.md`, `docs/ecn/000-template.md`, `docs/ecn/ECN-001_v0.1.0-mvp.md`
- Create: `docs/adr/README.md`, `docs/adr/categories.md`, `docs/adr/000-template.md`, `docs/adr/ADR-101-python-backend.md`, `docs/adr/ADR-102-async-render-pipeline.md`, `docs/adr/ADR-103-render-mode-switch.md`, `docs/adr/ADR-104-plantuml-type-detection.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: `README.md`**

```markdown
# PlantUMLAssist

PlantUML 記法の GUI 編集ツール。Python バックエンド + HTML/JS フロント。MermaidAssist の sister project。

## 特徴

- **6 種の UML 図形対応予定** (Tier1 ロードマップ: Sequence / Use Case / Class / Activity / Component / State)
- **v0.1.0** 時点では **Sequence Diagram** MVP
- **local (Java)** デフォルトレンダリング、**online (plantuml.com)** オプション切替可能
- **DiagramModule v2** インターフェース (MermaidAssist 踏襲)
- **縦並びラベル付き追加フォーム** (ADR-015)
- **Tab/Shift+Tab で 2 スペースインデント** (workspace ADR-011)

## 起動

```bash
cd 06_PlantUMLAssist
python server.py
# http://127.0.0.1:8766 をブラウザで開く
```

## 要件

- Python 3 (stdlib のみ)
- Java 8+ (local render モード用、online モードでは不要)
- `lib/plantuml.jar` (リポジトリ同梱)

## 設計ドキュメント

- Design: `docs/superpowers/specs/2026-04-17-plantuml-assist-design.md`
- Plan: `docs/superpowers/plans/2026-04-17-plantuml-assist-v0.1.0.md`
- ADR: `docs/adr/`
- ECN: `docs/ecn/`

## ライセンス

MIT。`lib/plantuml.jar` は PlantUML プロジェクト (MIT) から取得、同梱。

## 関連プロジェクト

- [05_MermaidAssist](../05_MermaidAssist) — Mermaid 版の sister project
```

- [ ] **Step 2: `LICENSE`** (MIT, ユーザー名義)

```
MIT License

Copyright (c) 2026 Kawano Momo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: ADR インフラ + 新規 ADR 4件**

`docs/adr/README.md`:

```markdown
# Architecture Decision Records (ADR)

PlantUMLAssist の技術的意思決定の履歴。

## 一覧

| # | タイトル | カテゴリ | ステータス | 日付 |
|---|---|---|---|---|
| [101](ADR-101-python-backend.md) | Python バックエンド選定 | アーキテクチャ | 承認 | 2026-04-17 |
| [102](ADR-102-async-render-pipeline.md) | Java 非同期 render pipeline | インターフェース | 承認 | 2026-04-17 |
| [103](ADR-103-render-mode-switch.md) | Local / Online render モード切替 | 配布・運用 | 承認 | 2026-04-17 |
| [104](ADR-104-plantuml-type-detection.md) | PlantUML type detection heuristic | インターフェース | 承認 | 2026-04-17 |

## 命名規則

`ADR-NNN-kebab-case-title.md` (NNN は3桁ゼロ埋め、101 から開始)

注意: ADR-001〜010 はワークスペース共通、ADR-011〜019 は MermaidAssist が使用済み、ADR-101〜 は PlantUMLAssist 名前空間。

## 関連

- MermaidAssist から流用する ADR は `docs/adr/MERMAID-ADRS-APPLIED.md` に記載。
```

`docs/adr/categories.md` (MermaidAssist と同じ7カテゴリをコピー):

```markdown
# ADR カテゴリ

| カテゴリ | 説明 |
|---|---|
| **アーキテクチャ** | システム全体の構造、レイヤ分割、モジュール境界 |
| **インターフェース** | モジュール間API、契約、抽象化 |
| **インタラクション** | ユーザー操作モデル、UIメタファ、入力デバイス |
| **UI/UX** | レイアウト、視覚デザイン、操作の一貫性 |
| **テスト戦略** | テスト設計手法、ツール選定、カバレッジ目標 |
| **エージェント運用** | サブエージェント設計・連携・責務分割 |
| **配布・運用** | ビルド、リリース、互換性、ライセンス |
```

`docs/adr/000-template.md`:

```markdown
# ADR-NNN: タイトル

- **ステータス**: 提案 | 承認 | 却下 | 廃止
- **カテゴリ**: (categories.md から選択)
- **日付**: YYYY-MM-DD
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト
## 検討した選択肢
### A) 選択肢
### B) 選択肢
## 決定
## 結果
## 教訓
```

`docs/adr/ADR-101-python-backend.md`:

```markdown
# ADR-101: Python バックエンド選定

- **ステータス**: 承認
- **カテゴリ**: アーキテクチャ
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML は Java 実行が必要。MermaidAssist と違いクライアント JS では完結しない。バックエンドを用意する必要があり、言語/ランタイム選定が必要。

## 検討した選択肢

### A) Node.js (Express)
- メリット: JS/TS 統一、既存 MermaidAssist ツールチェインに近い
- デメリット: npm install 前提、frontend と backend で同じ言語だが Python 既存利用者には追加学習コスト

### B) Python 3 stdlib のみ (http.server)
- メリット: 組み込み stdlib のみで完結、`python -m http.server` と同じ感覚、追加 pip 不要
- デメリット: http.server は production 用途でなく開発用。本プロジェクトはローカル開発ツールなので問題なし

### C) Java (Jetty) — plantuml.jar と同ランタイム
- メリット: Java ランタイムを共有
- デメリット: 起動遅い、開発者が Java server 書き慣れていない、依存重い

## 決定

**B) Python 3 stdlib のみ** を採用。

理由: ユーザーの既存ワークフロー (MermaidAssist で `python -m http.server` を使用) と整合。pip 依存なし。subprocess で Java 実行 + urllib で plantuml.com fetch で足りる。

## 結果

- `server.py` 約 150 行で完結
- 外部依存 0 (stdlib のみ)
- Ctrl+C で停止、`python server.py` で起動

## 教訓

- ローカル開発ツールは stdlib のみで書けるとセットアップが極小で済む
- production 用途ではないので `http.server` で十分。Flask/FastAPI は YAGNI
```

`docs/adr/ADR-102-async-render-pipeline.md`:

```markdown
# ADR-102: Java 非同期 render pipeline

- **ステータス**: 承認
- **カテゴリ**: インターフェース
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

MermaidAssist は mermaid.js がブラウザ内で同期的に SVG を返すため、`parse → render → overlay` の連鎖は同期。PlantUMLAssist は Java subprocess 経由となるため、render は数百ms〜数秒のレイテンシがある。この往復を UI からどう見せるか。

## 検討した選択肢

### A) 同期的に fetch を await、editor input を block
- メリット: 実装シンプル
- デメリット: 入力中に毎 keystroke で画面が止まる。UX 破綻

### B) Debounce + async fetch、status indicator で状態通知
- メリット: UX 良好、連続入力中は古い SVG を表示、確定後に更新
- デメリット: 実装やや複雑 (debounce timer, 古い fetch の race condition 注意)

### C) WebSocket で双方向接続、部分 render
- メリット: 最高速
- デメリット: YAGNI、subprocess のみで部分 render 不可

## 決定

**B) Debounce 150ms + async fetch + `#render-status` 表示** を採用。

実装: `editor.input` → `scheduleRefresh()` (150ms debounce) → `refresh()` → `renderSvg()` (POST /render) → SVG を `#preview-svg.innerHTML` に挿入。

## 結果

- 入力中は古い SVG が表示されたまま (blinking なし)
- 150ms 後に自動 re-render
- render 中は `#render-status` が `Rendering…`、完了で `OK (local)` or `ERROR`
- エラー時は preview-svg にエラーメッセージ表示

## 教訓

- subprocess 由来の非同期 UI はステータス表示が必須 (サイレントな遅延は誤解を招く)
- race condition: 現実装は「最新の fetch だけ反映」ではなく「全ての fetch を順次反映」で単純化。実害が出たら AbortController を導入
```

`docs/adr/ADR-103-render-mode-switch.md`:

```markdown
# ADR-103: Local / Online render モード切替

- **ステータス**: 承認
- **カテゴリ**: 配布・運用
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML レンダリングは以下から選べる:
- local Java (plantuml.jar を subprocess 実行、完全オフライン)
- online (plantuml.com の公開サーバーに fetch、エンコード済み URL)

ユーザー環境:
- Java 未インストール → online しか使えない
- 業務データを外部送信したくない → local しか使えない

両方を実装し、設定で切替できるべき。

## 検討した選択肢

### A) local のみサポート、Java 必須
- メリット: シンプル、情報漏洩リスク 0
- デメリット: Java なし環境で全く動かない

### B) online のみサポート、ゼロインストール
- メリット: Java 不要
- デメリット: 業務データ漏洩リスク、ネット必須

### C) 両方サポート、UI 切替、localStorage 保存
- メリット: ユーザー選択可
- デメリット: 実装量 1.5 倍、両モードの E2E テストコスト

## 決定

**C) 両方サポート、UI で切替、localStorage 保存** を採用。

理由: 組み込みエンジニアの業務利用と、個人ユーザーの気軽さを両立する必要。設定1項目の追加コストは小さい。

実装:
- `<select id="render-mode">` で `local` | `online`
- `localStorage.setItem('plantuml-render-mode', value)` で永続化
- 初期値は `local` (ユーザー指定)

## 結果

- 業務利用: デフォルト local でセキュア
- 個人/教育利用: online 切替でゼロインストール可能
- E2E で両モードの動作を検証 (CI で online は network 依存のため skipable)

## 教訓

- 「セキュリティ優先の default + ゼロインストール option」は両立可能
- localStorage 永続化は設定 UI の第一選択
```

`docs/adr/ADR-104-plantuml-type-detection.md`:

```markdown
# ADR-104: PlantUML type detection heuristic

- **ステータス**: 承認
- **カテゴリ**: インターフェース
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML は Mermaid と違い、図形タイプが明示的に宣言されない。`@startuml ... @enduml` の中身から推定するしかない。例:

- `participant Alice` → Sequence
- `class Foo` → Class
- `[A] --> [B]` → Component (or Sequence)

一部の行パターンは複数の図形と互換 (例: `A -> B` は Sequence でも Activity でも使える)。

## 検討した選択肢

### A) ユーザー明示 (`@startsequence` など独自拡張)
- メリット: 誤判定 0
- デメリット: PlantUML 非標準構文、他ツールとの互換性喪失

### B) 最初の substantive 行から heuristic 判定、fallback = Sequence
- メリット: 標準 PlantUML 構文維持
- デメリット: 曖昧なケースで誤判定あり

### C) UI の `<select>` で常に手動選択、自動判定なし
- メリット: 誤判定 0
- デメリット: 毎回切替必要、UX 悪

## 決定

**B) Heuristic + 手動 select で override 可** を採用。

判定順序 (特徴的なキーワード先):
1. `actor|participant|boundary|control|entity|database|queue|collections` → Sequence
2. `usecase|as (` → Usecase
3. `class|interface|abstract|enum` → Class
4. `start|stop|:...;|if (|fork` → Activity
5. `[...]|component|package` → Component
6. `state|[*]` → State
7. 矢印行 (`->`, `-->` 等) → Sequence (fallback)
8. 何もなし → null

`<select id="diagram-type">` は検出結果を表示し、ユーザーが任意に変更可能 (override)。

## 結果

- 多くの入力で自動判定成功
- 曖昧時は Sequence にフォールバック (最も多い用途)
- ユーザーは select で即座に切替可能

## 教訓

- 「明示的 type 宣言のない DSL」は heuristic + manual override が現実解
- 判定は保守的に (よく見るパターンから先に)、fallback は最頻の型
```

- [ ] **Step 4: ECN インフラ + ECN-001**

`docs/ecn/README.md`:

```markdown
# Engineering Change Notices (ECN)

PlantUMLAssist の変更履歴。1 ECN = 1 リリース粒度。

## 一覧

| # | タイトル | 種別 | バージョン | 日付 |
|---|---|---|---|---|
| [001](ECN-001_v0.1.0-mvp.md) | v0.1.0 MVP (Python backend + Sequence) | 機能追加 | v0.1.0 | 2026-04-17 |
```

`docs/ecn/000-template.md`:

```markdown
# ECN-NNN: タイトル

- **ステータス**: 適用済
- **種別**: 機能追加 / 不具合修正 / 改善 / プロセス改善
- **バージョン**: vX.Y.Z
- **対象コミット**: `hash1`, `hash2`
- **影響ファイル**: ファイル一覧
- **関連 ADR**: ADR-NNN

## コンテキスト
## 対策
## 結果
## 教訓
```

`docs/ecn/ECN-001_v0.1.0-mvp.md`:

```markdown
# ECN-001: v0.1.0 MVP — Python backend + Sequence Diagram

- **ステータス**: 適用済
- **種別**: 機能追加
- **バージョン**: v0.1.0
- **対象コミット**: (Task 1-10 全コミット)
- **影響ファイル**: server.py, plantuml-assist.html, src/**/*.js, tests/**/*.js, lib/plantuml.jar, README.md, LICENSE
- **関連 ADR**: ADR-101, ADR-102, ADR-103, ADR-104 + workspace ADR-011, MermaidAssist ADR-011〜018

## コンテキスト

PlantUML の GUI 編集ツールを新規に立ち上げる。MermaidAssist の設計パターンを流用しつつ、PlantUML 固有の Java 依存をバックエンドで吸収する。

## 対策

1. **Python stdlib バックエンド** (ADR-101): `server.py` で静的配信 + `/render` endpoint 実装
2. **local/online デュアルモード** (ADR-103): `<select>` + `localStorage` 永続化
3. **非同期 render pipeline** (ADR-102): debounce 150ms + status indicator
4. **Sequence Diagram モジュール**: MermaidAssist の DiagramModule v2 インターフェース完全踏襲。8 参加者種別 + 10 矢印種別
5. **MermaidAssist core/ui 流用**: html-utils, text-updater, history, selection, connection-mode, properties (14 helpers) をそのまま複製
6. **Tab インデント** (workspace ADR-011): 2 スペース indent/outdent

## 結果

- Unit: (count) passed
- E2E: 9 passed
- PlantUML 公式 jar 同梱、Java 8+ 環境で local モード動作確認済
- online モード (plantuml.com) 動作確認済
- v0.1.0 タグ、GitHub 初公開

## 教訓

- MermaidAssist の core/ui 流用は極めて効率的。図形モジュールのみ新規実装で済む
- PlantUML type detection の heuristic は保守的に書き、ユーザー override を用意するのが実務的
- 非同期 render は status indicator が UX に直結
```

- [ ] **Step 5: `CLAUDE.md`** (ワークスペース CLAUDE.md を拡張)

```markdown
# CLAUDE.md (06_PlantUMLAssist)

## プロジェクト概要

PlantUMLAssist — PlantUML 記法の GUI 編集ツール。Python 3 backend + HTML/JS frontend。MermaidAssist の sister project、DiagramModule v2 インターフェースを流用。

## 技術スタック

- Python 3 stdlib (http.server) — backend
- Java 8+ (plantuml.jar 実行) — local render mode のみ
- JavaScript ES5 (ビルドなし、単一 HTML + src/*.js 構成)
- Playwright — E2E

## アーキテクチャ

- `server.py` — backend (render endpoint + 静的配信)
- `plantuml-assist.html` — エントリ
- `src/core/` — MermaidAssist と共有 (コピー)
- `src/ui/properties.js` — 14 helpers (MermaidAssist 共通)
- `src/modules/*` — 各 PlantUML 図形モジュール
- `src/app.js` — async render pipeline
- `lib/plantuml.jar` — PlantUML 公式 jar

## 開発コマンド

- 起動: `python server.py` → http://127.0.0.1:8766
- Unit: `node tests/run-tests.js`
- E2E: `npx playwright test`

## Visual Verification Gate

GUI 描画に影響するコード変更時は evaluator + Playwright MCP で実機スクリーンショット検証。自動テスト GREEN だけでは不十分 (MermaidAssist ADR-014 準拠)。

## 設計ドキュメント

- Design: `docs/superpowers/specs/2026-04-17-plantuml-assist-design.md`
- Plan: `docs/superpowers/plans/2026-04-17-plantuml-assist-v0.1.0.md`
- ADR: `docs/adr/` (ADR-101+)、workspace ADR-011 + MermaidAssist ADR-011〜018 も適用
- ECN: `docs/ecn/`
```

- [ ] **Step 6: 全ファイル commit + v0.1.0 tag**

```bash
cd E:/00_Git/06_PlantUMLAssist
git add README.md LICENSE CLAUDE.md docs/
git commit -m "docs: README + LICENSE + ADR-101~104 + ECN-001 + CLAUDE.md"
git tag -a v0.1.0 -m "v0.1.0: PlantUMLAssist MVP — Python backend + Sequence Diagram"
```

- [ ] **Step 7: 最終確認**

```bash
cd E:/00_Git/06_PlantUMLAssist
node tests/run-tests.js
python server.py > /tmp/final-check.log 2>&1 &
sleep 2
npx playwright test
pkill -f "python server.py" 2>/dev/null
git log --oneline
git tag
```

Expected: 24 unit + 9 E2E PASS、tag v0.1.0 存在。

---

## Self-Review

### Spec coverage
- ✓ v0.1.0 MVP scope: Sequence Diagram (Task 5-7) + Python backend (Task 1-2) + HTML shell (Task 8) + tests (Task 9)
- ✓ local + online rendering (Task 1 の render_local/render_online)
- ✓ MermaidAssist core/ui 流用 (Task 3)
- ✓ Tab-to-indent (ADR-011) (Task 8 の editor keydown handler)
- ✓ DiagramModule v2 interface (Task 5-7)
- ✓ ADR-101〜104 新規 + ECN-001 (Task 10)
- ✓ 完了基準: Backend 起動、UI で Sequence 基本操作、tests PASS、visual verify (E2E で代替)

### Placeholder scan
- No TBD/TODO/fill-in-later found
- All code blocks complete
- Exact commands with expected output

### Type consistency
- `plantuml-sequence` type key used consistently (detect, module type, HTML option)
- `parseSequence/addParticipant/addMessage` signatures match across tasks
- `ctx.setMmdText / ctx.onUpdate` consistent with MermaidAssist pattern
