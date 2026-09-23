'use strict';
// BLK-human-20260917-0901: 手元の .puml を開く。拡張子・文字コード・改行・未対応記法・
// 報告用の骨格 (図の中身を 1 文字も含まない) を守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
try { delete require.cache[require.resolve('../src/core/file-open.js')]; } catch (e) {}
require('../src/core/file-open.js');
var FO = global.window.MA.fileOpen;
var TD = require('util').TextDecoder;
function dec(label, fatal) { return new TD(label, { fatal: !!fatal }); }

describe('開ける拡張子 (BLK-human-20260917-0901)', function() {
  test('.puml / .plantuml / .uml / .txt だけを開く', function() {
    expect(FO.isOpenable('a.puml')).toBe(true);
    expect(FO.isOpenable('B.PlantUML')).toBe(true);
    expect(FO.isOpenable('c.uml')).toBe(true);
    expect(FO.isOpenable('d.txt')).toBe(true);
    expect(FO.isOpenable('e.png')).toBe(false);
    expect(FO.isOpenable('noext')).toBe(false);
    var p = FO.partition([{ name: 'a.puml' }, { name: 'x.svg' }, { name: 'b.txt' }]);
    expect(p.ok.length).toBe(2);
    expect(p.skipped).toEqual(['x.svg']);
  });
  test('タブ名は拡張子とフォルダを落とす', function() {
    expect(FO.baseName('C:\\work\\GPIO制御.puml')).toBe('GPIO制御');
    expect(FO.baseName('dir/seq.plantuml')).toBe('seq');
  });
});

describe('文字コードと改行を壊さない', function() {
  test('UTF-8 BOM + CRLF を覚えて戻す', function() {
    var src = '@startuml\r\nA -> B : こんにちは\r\n@enduml\r\n';
    var bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(src, 'utf-8')]);
    var r = FO.decode(new Uint8Array(bytes), dec);
    expect(r.encoding).toBe('utf-8');
    expect(r.bom).toBe(true);
    expect(r.eol).toBe('crlf');
    expect(r.text).toBe('@startuml\nA -> B : こんにちは\n@enduml\n');
    expect(FO.restoreText(r.text, r)).toBe(src);
    var body = FO.writeBody('C:/x.puml', r.text, r);
    expect(body).toEqual({ path: 'C:/x.puml', text: src, encoding: 'utf-8', bom: true });
  });
  test('Shift_JIS は UTF-8 として読めないので Shift_JIS で読む', function() {
    // 「状態」の Shift_JIS: 8F F3 91 D4
    var bytes = new Uint8Array([0x40, 0x73, 0x74, 0x61, 0x72, 0x74, 0x75, 0x6D, 0x6C, 0x0A, 0x8F, 0xF3, 0x91, 0xD4, 0x0A]);
    var r = FO.decode(bytes, dec);
    expect(r.encoding).toBe('shift_jis');
    expect(r.bom).toBe(false);
    expect(r.eol).toBe('lf');
    expect(r.text).toBe('@startuml\n状態\n');
    expect(FO.writeBody('p', r.text, r).encoding).toBe('shift_jis');
  });
  test('LF のファイルは LF のまま', function() {
    var r = FO.decode(new Uint8Array(Buffer.from('a\nb\n')), dec);
    expect(r.eol).toBe('lf');
    expect(FO.restoreText('a\nb\n', r)).toBe('a\nb\n');
  });
});

describe('未対応記法の一覧', function() {
  test('シーケンス図の読める行は並べず、読めない行だけを行番号つきで並べる', function() {
    var t = ['@startuml', 'participant "制御部" as Ctrl #LightBlue', 'actor User', 'User -> Ctrl : 開始', 'alt 成功',
      'Ctrl --> User : OK', 'else', 'end', 'note over Ctrl, User', '  メモ本文', 'end note', 'mystery_syntax 秘密', '@enduml'].join('\n');
    var rows = FO.unsupported(t, 'plantuml-sequence');
    expect(rows.map(function(r) { return r.line; })).toEqual([12]);
  });
  test('クラスの { } の中身と activity の複数行 Action は未対応に数えない', function() {
    var c = ['@startuml', 'class Foo {', '  +bar(): int', '  -baz', '}', 'Foo <|-- Qux', '@enduml'].join('\n');
    expect(FO.unsupported(c, 'plantuml-class')).toEqual([]);
    var a = ['@startuml', 'start', ':一行目', '二行目;', 'if (x?) then (yes)', 'endif', 'stop', '@enduml'].join('\n');
    expect(FO.unsupported(a, 'plantuml-activity')).toEqual([]);
  });
  test('図種が分からない図には一覧を出さない', function() {
    expect(FO.unsupported('whatever\nfoo', null)).toEqual([]);
  });
});

describe('報告用に複製: 図の中身を 1 文字も含まない', function() {
  var SECRET = ['秘密部品', 'CanDriverX', 'ReadRegister', '極秘メッセージ', 'confidential.puml', 'LightBlue', '伏せたいコメント', 'Zeta42'];
  var text = ['@startuml', "' 伏せたいコメント", 'participant "秘密部品" as CanDriverX #LightBlue',
    'CanDriverX ~~> ReadRegister : 極秘メッセージ', 'weird CanDriverX over Zeta42', 'state 秘密部品 { note ReadRegister }',
    '@enduml'].join('\n');
  test('骨格は記法の形だけを残す', function() {
    expect(FO.skeleton('participant "秘密部品" as CanDriverX #LightBlue')).toBe('participant \u25A2 as \u25A2 #色');
    expect(FO.skeleton('note over Alpha, Beta')).toBe('note over \u25A2, \u25A2');
    expect(FO.skeleton('Alpha -> Beta : 極秘')).toBe('\u25A2 -> \u25A2 : \u25A2');
  });
  test('報告文に参加者名・メッセージ・コメント・ファイル名・色名を含めない', function() {
    var rep = FO.report(text, 'plantuml-sequence');
    expect(rep).toContain('未対応');
    SECRET.forEach(function(s) { expect(rep.indexOf(s)).toBe(-1); });
    // 見出し以外の行は、記法の語・記号・伏せ字・「色」だけでできている
    rep.split('\n').slice(1).forEach(function(line) {
      var body = line.replace(/^L\d+: /, '');
      var rest = body.replace(/[a-z]+/g, function(w) { return /^(participant|state|note|over|as|weird)$/.test(w) ? '' : w; })
        .replace(/[\u25A2色#\s\-.<>|*+=\[\](){},;:\/\\^~!?@&%$']/g, '');
      expect(rest).toBe('');
      expect(body.indexOf('weird')).toBe(-1); // 行頭の未知の語も伏せる
    });
  });
});

describe('GUI と server の配線', function() {
  var html = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf-8');
  var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');
  var server = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf-8');
  test('日本語の入口が上部 (畳まれない所) にあり、複数選択できる', function() {
    expect(html).toContain('id="btn-open-file"');
    // BLK-human-20260923-1600 (design 9a): 札そのものはタブ列から外し、入口は上部バーの
    // Import ▾ に移した。入れる・出すが対で並ぶ方が探す場所が 1 つで済む。
    // #btn-open-file は DOM に残る (ドラッグ&ドロップ・空の画面・Ctrl+K が叩く先)。
    expect(html).toContain('aria-label="ファイルを開く(.puml)">開く</button>');
    expect(html).toContain('id="btn-import"');
    expect(html).toContain('id="imp-file"');
    expect(html).toContain('id="imp-clipboard"');
    expect(html).toContain('id="imp-folder"');
    // Import ▾ は Export ▾ の左に置く (入れる → 出すの順)。
    expect(html.indexOf('id="btn-import"')).toBeLessThan(html.indexOf('id="btn-export"'));
    expect(app).toContain("'📄 ファイルを開く(.puml)'");
    expect(/id="file-input"[^>]*multiple/.test(html)).toBe(true);
    expect(html).toContain('src/core/file-open.js');
  });
  test('一覧の頭・空の画面・ドロップ・未対応の一覧を app.js が組み立てる', function() {
    expect(app).toContain('folder-open-file');
    expect(app).toContain('open-empty-hint');
    expect(app).toContain("addEventListener('drop'");
    expect(app).toContain('btn-unsupported-copy');
  });
  test('server はネイティブの複数選択ダイアログと、元のファイルへの書き戻しを持つ', function() {
    expect(server).toContain("'/native-open'");
    expect(server).toContain("'/native-write'");
    expect(server).toContain('cp932');
  });
});
