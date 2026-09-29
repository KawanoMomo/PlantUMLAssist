'use strict';
// BLK-migrator-20260929-1051: 宣言だけのコンポーネント図 (interface 宣言 + [部品] / card・queue だけ) が
// Class / Sequence と判定され、右パネルだけ component に替わっても図種欄・左レール・ズームの帯は Class / Sequence の
// ままだった。図種の取り違えは実物で 3 枚を超えたので、当て方を直す:
//   - 描いた後の図種は PlantUML が SVG に残した data-diagram-type が決める (svg-kind.reconcile)。
//     DSL の語は DESCRIPTION の中の component / usecase の見分けにだけ使う (svg-kind.descriptionKind)
//   - 描く前の DSL の読みも、DESCRIPTION の実物 (ロリポップ・card / queue・usecase + 汎化) を class / sequence にしない
//   - server.py の本文判定 (dsl_kind) は画面と同じ当て方 (detect_diagram_kind) にする
//   - migrator のコーパス全枚を同梱の plantuml.jar で描いた図種 (tests/fixtures/corpus-svg-kinds.json) に対して、
//     開いた図種が SVG の図種の仲間であり、前から合っていた図は同じ図種のまま開くことを機械で確かめる
var fs = require('fs');
var path = require('path');
var os = require('os');
var execFileSync = require('child_process').execFileSync;
var jsdom = require('jsdom');

var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = ['html-utils', 'dsl-utils', 'regex-parts', 'parser-utils', 'file-open', 'svg-kind'];
MODS.forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
var PU = global.window.MA.parserUtils;
var SK = global.window.MA.svgKind;
var FO = global.window.MA.fileOpen;

var projectRoot = path.resolve(__dirname, '..');

// 同じ本文の列を server.py の dsl_kind / detect_diagram_kind に読ませる。
function serverKinds(texts, fn) {
  var tmp = path.join(os.tmpdir(), 'pua-kind-' + process.pid + '-' + Date.now() + '.json');
  fs.writeFileSync(tmp, JSON.stringify(texts), 'utf8');
  try {
    var script = [
      'import importlib.util, json, sys',
      'spec = importlib.util.spec_from_file_location("puaserver", r"' + path.join(projectRoot, 'server.py') + '")',
      'srv = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(srv)',
      'texts = json.load(open(r"' + tmp + '", encoding="utf-8"))',
      'sys.stdout.write(json.dumps([srv.' + fn + '(t) for t in texts]))',
    ].join('\n');
    return JSON.parse(execFileSync('python', ['-c', script], { encoding: 'utf-8', cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 }));
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

function slug(t) { return t ? String(t).replace(/^plantuml-/, '') : ''; }

var LOLLIPOP = ['@startuml', 'interface "IDataStore" as IStore', '[StorageService] as Storage',
  'Storage - IStore', '@enduml'].join('\n');
var CARD_QUEUE = ['@startuml', 'card "C" as c', 'queue "Q" as q', 'c --> q', '@enduml'].join('\n');
var UC_GENERALIZE = ['@startuml', 'actor 整備士', 'usecase "故障診断" as Base', 'actor 上級整備士',
  '上級整備士 <|-- 整備士', '整備士 --> Base', '@enduml'].join('\n');
var UC_ACTOR_FIRST = ['@startuml', 'actor 開発者', 'actor CI', '(ビルド)', '開発者 --> (ビルド)', 'CI --> (ビルド)', '@enduml'].join('\n');
var SEQ_QUEUE = ['@startuml', 'participant App', 'queue Q', 'App -> Q : push', '@enduml'].join('\n');
var CLASS_IF = ['@startuml', 'interface IDrv', 'class Drv', 'IDrv <|.. Drv', '@enduml'].join('\n');

describe('BLK-migrator-20260929-1051 描く前の DSL の読み', function() {
  test('interface 宣言と [部品] 記法だけの図は component (class ではない)', function() {
    expect(PU.detectDiagramType(LOLLIPOP)).toBe('plantuml-component');
  });
  test('card と queue だけの図は component (sequence ではない)', function() {
    expect(PU.detectDiagramType(CARD_QUEUE)).toBe('plantuml-component');
  });
  test('usecase 宣言があれば actor 同士の汎化 (<|--) があっても usecase', function() {
    expect(PU.detectDiagramType(UC_GENERALIZE)).toBe('plantuml-usecase');
  });
  test('participant と queue のシーケンス図・interface と class のクラス図は今までどおり', function() {
    expect(PU.detectDiagramType(SEQ_QUEUE)).toBe('plantuml-sequence');
    expect(PU.detectDiagramType(CLASS_IF)).toBe('plantuml-class');
  });
});

describe('BLK-migrator-20260929-1051 描いた後は SVG の図種で決める', function() {
  test('DESCRIPTION の図を class / sequence のまま開かない', function() {
    expect(SK.reconcile('plantuml-class', 'DESCRIPTION', LOLLIPOP)).toBe('plantuml-component');
    expect(SK.reconcile('plantuml-sequence', 'DESCRIPTION', CARD_QUEUE)).toBe('plantuml-component');
  });
  test('DESCRIPTION の中の見分けは本文で: usecase / (名前) があれば usecase、actor だけなら component', function() {
    expect(SK.reconcile('plantuml-sequence', 'DESCRIPTION', '@startuml\nactor U\nU --> (Login)\n@enduml')).toBe('plantuml-usecase');
    // AWS・C4 の部品図も人物を actor で描く。actor と --> だけなら component。
    expect(SK.reconcile('plantuml-sequence', 'DESCRIPTION', '@startuml\nactor U\nU --> Srv\n@enduml')).toBe('plantuml-component');
    expect(SK.reconcile('plantuml-class', 'DESCRIPTION', UC_GENERALIZE)).toBe('plantuml-usecase');
    expect(SK.reconcile(null, 'DESCRIPTION', '@startuml\nPerson(u, "User")\nSystem(s, "Sys")\n@enduml')).toBe('plantuml-component');
  });
  test('合っている図種はそのまま (component と読んだ DESCRIPTION を usecase に替えない)', function() {
    expect(SK.reconcile('plantuml-component', 'DESCRIPTION', UC_ACTOR_FIRST)).toBe('plantuml-component');
    expect(SK.reconcile('plantuml-usecase', 'DESCRIPTION', LOLLIPOP)).toBe('plantuml-usecase');
  });
  test('本文を渡さない呼び方は今までどおり component', function() {
    expect(SK.reconcile('plantuml-class', 'DESCRIPTION')).toBe('plantuml-component');
  });
});

describe('BLK-migrator-20260929-1051 server.py の本文判定も同じ当て方', function() {
  test('再現の 2 枚と actor で始まるユースケース図を、画面と同じ図種に読む', function() {
    var texts = [LOLLIPOP, CARD_QUEUE, UC_GENERALIZE, UC_ACTOR_FIRST, SEQ_QUEUE, CLASS_IF];
    var got = serverKinds(texts, 'dsl_kind');
    expect(got).toEqual(['component', 'component', 'usecase', 'usecase', 'sequence', 'class']);
    expect(texts.map(function(t) { return slug(PU.detectDiagramType(t)); })).toEqual(got);
  });
});

// ── migrator のコーパス全枚 ─────────────────────────────────────────────
var CORPUS_DIR = process.env.PUA_CORPUS_DIR || 'E:\\01_Loop\\persona-data\\migrator';
var FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'corpus-svg-kinds.json'), 'utf8'));
var present = Object.keys(FIXTURE).filter(function(rel) {
  return fs.existsSync(path.join(CORPUS_DIR, rel));
});
function readCorpus(rel) {
  var bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS_DIR, rel)));
  return FO.decode(bytes, function(label, fatal) {
    return new (require('util').TextDecoder)(label, { fatal: !!fatal });
  }).text;
}

describe('BLK-migrator-20260929-1051 コーパス全枚: 開く図種は PlantUML の図種の仲間', function() {
  if (present.length === 0) {
    test('コーパスが無い環境では skip する', function() { expect(present.length).toBe(0); });
    return;
  }
  var texts = {};
  present.forEach(function(rel) { texts[rel] = readCorpus(rel); });

  test('描いた後の図種が SVG の図種の仲間になり、前から合っていた図は同じ図種のまま', function() {
    var bad = [];
    present.forEach(function(rel) {
      var f = FIXTURE[rel];
      var fam = SK.MAP[f.svg];
      if (!fam) return;
      var text = texts[rel];
      var fromDsl = PU.detectDiagramType(text);
      var opened = SK.reconcile(fromDsl, f.svg, text);
      if (fam.indexOf(opened) < 0) bad.push(rel + ': ' + f.svg + ' を ' + opened + ' で開く');
      else if (f.was && fam.indexOf(f.was) >= 0 && opened !== f.was) bad.push(rel + ': ' + f.was + ' だった図が ' + opened + ' で開く');
    });
    expect(bad).toEqual([]);
  });

  test('server.py の本文判定は画面の DSL の読みと全枚で一致する', function() {
    var rels = present.slice();
    var got = serverKinds(rels.map(function(r) { return texts[r]; }), 'detect_diagram_kind');
    var diff = [];
    rels.forEach(function(rel, i) {
      var js = slug(PU.detectDiagramType(texts[rel]));
      if (js !== got[i]) diff.push(rel + ': 画面 ' + (js || '-') + ' / server ' + (got[i] || '-'));
    });
    expect(diff).toEqual([]);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
MODS.forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
});
