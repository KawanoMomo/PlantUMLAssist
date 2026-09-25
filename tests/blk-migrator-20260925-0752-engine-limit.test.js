'use strict';
// BLK-migrator-20260925-0752 (差し戻し 1 回目): `+package uid as "Hello" <<Frame>>` (PlantUML 公式 issue #2846 の語順) は、
// 公開版の PlantUML (1.2026.3〜1.2026.8) がどれも `Syntax Error? (Assumed diagram type: sequence)` で拒む (読めるのは未公開の snapshot だけ)。
// 帯では生の文言だけでなく「PlantUML {版} がこの行を読めません: N 行目 `その行`」と描画エンジン側の限界であることと行を示し、
// PlantUML が推測した図種が本文の図種と違うときはそのことも言う。DSL の `+` は外さない (正本を書き換えない)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
try { delete require.cache[require.resolve('../src/core/render-error.js')]; } catch (e) {}
require('../src/core/render-error.js');
var RE = global.window.MA.renderError;

var ROOT = path.join(__dirname, '..');
// 同梱の 1.2026.3 が本物の 4 行に返したエラー画 (そのまま保存したもの)。
var FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'svg', 'plantuml-syntax-package-1.2026.3.svg');
var SVG = fs.readFileSync(FIXTURE, 'utf8');
var EXPECTED = 'PlantUML 1.2026.3 がこの行を読めません: 2 行目 `+package uid as "Hello" <<Frame>> {` ' +
  '(Syntax Error? (Assumed diagram type: sequence))';

describe('BLK-migrator-20260925-0752: 描画エンジンが読めない行の帯', function() {
  test('エラー画から版・波線の付いた行・PlantUML が推測した図種を読む', function() {
    var r = RE.detect(SVG);
    expect(r.isError).toBe(true);
    expect(r.line).toBe(2);
    expect(r.version).toBe('1.2026.3');
    expect(r.source).toBe('+package uid as "Hello" <<Frame>> {');
    expect(r.assumed).toBe('sequence');
  });
  test('帯の 1 行は PlantUML の版・行番号・その行を先に言い、元の文言を括弧に残す', function() {
    expect(RE.describe(RE.detect(SVG))).toBe(EXPECTED);
  });
  test('本文の図種 (class) と PlantUML の推測 (sequence) が違えば、そのことと本文が保たれることを足す', function() {
    var note = RE.kindNote(RE.detect(SVG), 'plantuml-class');
    expect(note).toContain('シーケンス図 と推測しましたが、本文は クラス図 として開いています');
    expect(note).toContain('何もせず保存しても書き換わりません');
    expect(note).toContain('plantuml.jar');
  });
  test('推測と本文の図種が同じ (本物の書き間違い) なら足さない', function() {
    expect(RE.kindNote(RE.detect(SVG), 'plantuml-sequence')).toBe('');
    expect(RE.kindNote(RE.detect(SVG), null)).toBe('');
    expect(RE.kindNote({ isError: true, message: 'Syntax Error?' }, 'plantuml-class')).toBe('');
  });
  test('落ちた絵 (crash) は従来の文面のまま', function() {
    var crash = RE.detect(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'svg', 'plantuml-crash-1.2026.2.svg'), 'utf8'));
    expect(crash.crashed).toBe(true);
    expect(RE.describe(crash)).toBe(crash.message);
  });
  test('server.py の 422 の error も同じ文面で、版・行・推測した図種を payload に載せる', function() {
    var script = [
      'import importlib.util, json, sys',
      'spec = importlib.util.spec_from_file_location("puaserver", r"' + path.join(ROOT, 'server.py') + '")',
      'srv = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(srv)',
      'svg = open(r"' + FIXTURE + '", "rb").read()',
      'err = srv.detect_render_error(svg)',
      'sys.stdout.buffer.write(json.dumps({"err": err, "msg": srv.describe_render_error(err)}, ensure_ascii=False).encode("utf-8"))',
    ].join('\n');
    var out = JSON.parse(execFileSync('python', ['-c', script], { cwd: ROOT, encoding: 'utf8', timeout: 60000 }));
    expect(out.msg).toBe(EXPECTED);
    expect(out.err.version).toBe('1.2026.3');
    expect(out.err.assumed).toBe('sequence');
    expect(out.err.line).toBe(2);
  });
});
