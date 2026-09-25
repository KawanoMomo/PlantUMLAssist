'use strict';
// BLK-human-20260925-1500: 描画エンジンの推奨版を PlantUML 1.2026.8 に上げる。
// 1.2026.3〜.6 は並行領域 (`--` / `||`) を持つ複合状態で最初の領域しか描かず、利用者の図の一部が黙って消えていた。
// 1.2026.7 からは SVG の形が変わる:
//   - シーケンス図は teoz の描き方だけになり、参加者・メッセージの <g class> と data-* が無い。残るのはライフラインの
//     `<g><title>表示名 (ASCII 以外は '.')</title><rect 透明/><line 点線/></g>` だけ
//   - 状態図の複合状態は、中の状態・遷移・fork の棒を包む <g class="entity" data-qualified-name> になる
//   - 色を短く書く (エラー画の赤は #F00)
// 当て方: シーケンスはライフラインを列の錨にし、線の端に接して描かれたかたまりを参加者にする。状態は中に名前付きの
// <g> を持つ entity を複合状態 (入れ物) と見る。推奨版は lib/PLANTUML_VERSION の 1 か所に置き、取得・設定欄が読む。
// fixtures/svg/v1-2026-8-*.svg は同名の fixtures/dsl/*.puml を PlantUML 1.2026.8 で描いたもの。
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/note-edit.js', '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js', '../src/core/dsl-updater.js', '../src/core/text-updater.js',
  '../src/core/parser-utils.js', '../src/core/line-resolver.js', '../src/core/overlay-builder.js',
  '../src/core/selection-router.js', '../src/core/sequence-participant-zone.js', '../src/core/sequence-autonumber.js',
  '../src/core/sequence-activation-insert.js', '../src/core/state-svg-map.js', '../src/core/state-transition.js',
  '../src/core/render-error.js', '../src/core/app-bridge.js',
  '../src/modules/sequence.js', '../src/modules/state.js', '../src/ui/sequence-overlay.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { try { require(m); } catch (e) {} });

var window = global.window;
var document = global.document;
var SEQ = window.MA.modules.plantumlSequence;
var ST = window.MA.modules.plantumlState;
var SO = window.MA.sequenceOverlay;
var SM = window.MA.stateSvgMap;
var RE = window.MA.renderError;
var AB = window.MA.appBridge;
var ROOT = path.join(__dirname, '..');
var FIX = path.join(__dirname, 'fixtures');


function svgOf(name) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-' + name + '.svg'), 'utf8');
  return div.querySelector('svg');
}
function dslOf(name) {
  return fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
}
function seqOverlay(name) {
  var dsl = dslOf(name);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  SO.buildSequenceOverlay(svgOf(name), SEQ.parseSequence(dsl), overlayEl, dsl);
  return overlayEl;
}
// data-front: メッセージが横切るライフラインを手前に出す補助の枠 (選択対象ではない) は数えない。
function rects(overlayEl, type, id) {
  return Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="' + type + '"]' + (id ? '[data-id="' + id + '"]' : '')))
    .filter(function(r) { return !r.hasAttribute('data-front'); });
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}

describe('推奨版は lib/PLANTUML_VERSION の 1 か所', function() {
  var ver = fs.readFileSync(path.join(ROOT, 'lib', 'PLANTUML_VERSION'), 'utf8').trim();
  test('推奨版は 1.2026.8 (並行領域を描ける 1.2026.7 以上)', function() {
    expect(ver).toBe('1.2026.8');
  });
  test('fetch-plantuml.ps1 / .sh は版を持たず、PLANTUML_VERSION を読む', function() {
    var ps1 = fs.readFileSync(path.join(ROOT, 'lib', 'fetch-plantuml.ps1'), 'utf8');
    var sh = fs.readFileSync(path.join(ROOT, 'lib', 'fetch-plantuml.sh'), 'utf8');
    expect(/Join-Path \$here 'PLANTUML_VERSION'/.test(ps1)).toBe(true);
    expect(/\/PLANTUML_VERSION"/.test(sh)).toBe(true);
    expect(/'\d+\.\d{4}\.\d+'/.test(ps1)).toBe(false);
    expect(/:-\d+\.\d{4}\.\d+/.test(sh)).toBe(false);
  });
  test('アプリ版の同梱物にも PLANTUML_VERSION が入る (「公式から取得」が読む)', function() {
    var spec = fs.readFileSync(path.join(ROOT, 'packaging', 'PlantUMLAssist.spec'), 'utf8');
    expect(spec).toContain("(at('lib/PLANTUML_VERSION'), 'lib')");
  });
  test('server は推奨版と、jar のマニフェストから読んだ版を /env で返し、1.2026.7 未満を古いと言う', function() {
    var tmp = path.join(ROOT, 'test-results', 'blk-human-20260925-1500');
    fs.mkdirSync(tmp, { recursive: true });
    var out = childProcess.execFileSync('python', ['-c', [
      'import sys, json, zipfile, os',
      'sys.path.insert(0, sys.argv[1])',
      'import server',
      'res = {}',
      'res["rec"] = server.recommended_jar_version()',
      'for v in ("1.2026.3", "1.2026.8"):',
      '    p = os.path.join(sys.argv[2], "pu-" + v + ".jar")',
      '    with zipfile.ZipFile(p, "w") as z:',
      '        z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\\r\\nImplementation-Version: " + v + "\\r\\n")',
      '    res[v] = server.jar_version(p)',
      'bad = os.path.join(sys.argv[2], "not-a-jar.jar")',
      'open(bad, "wb").write(b"hello")',
      'res["bad"] = server.jar_version(bad)',
      'res["lt"] = [server.version_less("1.2026.3", "1.2026.7"), server.version_less("1.2026.8", "1.2026.7"), server.version_less("1.2026.10", "1.2026.7")]',
      'print(json.dumps(res))',
    ].join('\n'), ROOT, tmp], { encoding: 'utf8' });
    var r = JSON.parse(out);
    expect(r.rec).toBe('1.2026.8');
    expect(r['1.2026.3']).toBe('1.2026.3');
    expect(r['1.2026.8']).toBe('1.2026.8');
    expect(r.bad).toBe(null);
    expect(r.lt).toEqual([true, false, false]);
  });
});

describe('設定欄の版の表示 (appBridge.engineVersion / jarStatus)', function() {
  test('使用中と推奨を「使用中: 版 / 推奨: 版」で並べ、同じなら取得し直しは要らない', function() {
    var j = AB.jarStatus({ jar: true, jarPath: 'C:/x/plantuml.jar', jarVersion: '1.2026.8', jarRecommended: '1.2026.8' });
    expect(j.versionText).toBe('使用中: 1.2026.8 / 推奨: 1.2026.8');
    expect(j.differs).toBe(false);
    expect(j.versionWarn).toBe('');
  });
  test('並行領域を描けない古い版は、違うことと取得し直す旨を言う', function() {
    var j = AB.jarStatus({ jar: true, jarVersion: '1.2026.3', jarRecommended: '1.2026.8', jarOutdated: true });
    expect(j.versionText).toBe('使用中: 1.2026.3 / 推奨: 1.2026.8');
    expect(j.differs).toBe(true);
    expect(j.versionWarn).toBe('並行領域が描かれない不具合があります。取得し直してください');
  });
  test('新しすぎる版は違うとだけ言う (不具合の注意は出さない)。版が読めなければ何も出さない', function() {
    var j = AB.jarStatus({ jar: true, jarVersion: '1.2026.9', jarRecommended: '1.2026.8', jarOutdated: false });
    expect(j.differs).toBe(true);
    expect(j.versionWarn).toBe('');
    expect(AB.jarStatus({ jar: true, jarVersion: '' }).versionText).toBe('');
    expect(AB.jarStatus({ jar: false }).versionText).toBe(undefined);
  });
});

describe('1.2026.8 のエラー画 (赤は #F00) も描画エラーと見分ける', function() {
  var svg = fs.readFileSync(path.join(FIX, 'svg', 'plantuml-syntax-package-1.2026.8.svg'), 'utf8');
  test('画面側', function() {
    var r = RE.detect(svg);
    expect(r.isError).toBe(true);
    expect(r.line).toBe(2);
    expect(r.version).toBe('1.2026.8');
    expect(r.message).toContain('Syntax Error?');
  });
  test('server 側 (422 の元)', function() {
    var out = childProcess.execFileSync('python', ['-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); import server; '
      + 'print(json.dumps(server.detect_render_error(open(sys.argv[2], "rb").read())))',
    ROOT, path.join(FIX, 'svg', 'plantuml-syntax-package-1.2026.8.svg')], { encoding: 'utf8' });
    var r = JSON.parse(out);
    expect(r.line).toBe(2);
    expect(r.version).toBe('1.2026.8');
    expect(r.source).toBe('+package uid as "Hello" <<Frame>> {');
    expect(r.assumed).toBe('sequence');
  });
});

describe('シーケンス図: class の無い SVG でライフラインを列の錨にして参加者を当てる', function() {
  test('actor〜queue: 図形と名前のかたまりが頭と尻の 2 枠、日本語名 (伏せ字) でも列の順で本人', function() {
    var o = seqOverlay('seq-actors');
    ['User', 'UI', 'UDS', 'DTC', 'EE', 'Sensors', 'MQ'].forEach(function(id) {
      expect(rects(o, 'participant', id).length).toBe(2);
      expect(rects(o, 'lifeline', id).length).toBe(1);
    });
    // actor の頭は棒人間 (y 10〜68) と名前 (〜84) の両方を覆う
    var head = rects(o, 'participant', 'User')[0];
    expect(covers(head, 34, 18)).toBe(true);
    expect(covers(head, 30, 80)).toBe(true);
    // 遅延 (...) で分かれたライフラインは上端から下端まで 1 枠
    var ll = rects(o, 'lifeline', 'User')[0];
    expect(num(ll, 'y')).toBeLessThanOrEqual(88);
    expect(num(ll, 'y') + num(ll, 'height')).toBeGreaterThanOrEqual(254);
    expect(rects(o, 'message').length).toBe(4);
  });
  test('create した参加者: 途中に描かれた頭が枠になり、線の枠は頭の下から', function() {
    var o = seqOverlay('seq-create');
    var inst = rects(o, 'participant', 'Inst');
    expect(inst.length).toBe(2);
    var head = inst.filter(function(r) { return num(r, 'y') < 150; })[0];
    expect(head).toBeTruthy();
    expect(covers(head, 247, 127)).toBe(true);
    var ll = rects(o, 'lifeline', 'Inst')[0];
    expect(num(ll, 'y')).toBeGreaterThanOrEqual(142);
  });
  test('表示名が複数行の参加者: 3 行とも本人の頭の枠に入る', function() {
    var o = seqOverlay('seq-multiline');
    var ec2 = rects(o, 'participant', 'EC2');
    expect(ec2.length).toBe(2);
    expect(covers(ec2[0], 58, 25)).toBe(true);
    expect(covers(ec2[0], 58, 62)).toBe(true);
    expect(rects(o, 'participant', 'RDS').length).toBe(2);
  });
  test('box: 囲みの見出しの文字は参加者のかたまりに入れない', function() {
    var o = seqOverlay('seq-box');
    var tester = rects(o, 'participant', 'Tester')[0];
    expect(num(tester, 'y')).toBeGreaterThan(24);
    expect(rects(o, 'box').length).toBe(2);
  });
  test('開いた矢じり (->>)・×印 (->x)・自分宛て・両向きも、それぞれ 1 本のメッセージとして当たる', function() {
    var o = seqOverlay('seq-arrows');
    expect(rects(o, 'message').map(function(r) { return r.getAttribute('data-line'); })).toEqual(['2', '3', '4', '5', '6', '7', '8']);
  });
  test('点線の戻りメッセージ (-->) もメッセージとして当たる', function() {
    var o = seqOverlay('seq-autonumber');
    expect(rects(o, 'message').map(function(r) { return r.getAttribute('data-line'); })).toEqual(['5', '6', '7', '8']);
  });
});

describe('状態図: 中に状態を包む g.entity は複合状態 (入れ物)', function() {
  function stateOverlay(name) {
    var dsl = dslOf(name);
    var parsed = ST.parse(dsl);
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var svgEl = svgOf(name);
    ST.buildOverlay(svgEl, parsed, overlayEl);
    return { overlayEl: overlayEl, svgEl: svgEl, parsed: parsed };
  }
  test('複合状態の枠は自分の外枠だけ (中の状態は別の枠)', function() {
    var f = stateOverlay('state-composite');
    var comp = f.overlayEl.querySelectorAll('rect[data-type="state"][data-id="State3"]');
    expect(comp.length).toBe(1);
    expect(comp[0].getAttribute('data-composite')).toBe('1');
    var outer = f.svgEl.querySelector('g[data-qualified-name="State3"] > rect');
    expect(Math.abs(num(comp[0], 'y') - num(outer, 'y')) < 1).toBe(true);
    expect(Math.abs(num(comp[0], 'height') - num(outer, 'height')) < 1).toBe(true);
    expect(f.overlayEl.querySelectorAll('rect[data-type="state"][data-id="State3.Sub1"]').length
      + f.overlayEl.querySelectorAll('rect[data-type="state"][data-id="Sub1"]').length).toBe(1);
  });
  test('smetana の並んだ複合状態も、それぞれ自分の外枠で当たる', function() {
    var got = SM.collect(svgOf('state-smetana'), ST.parse(dslOf('state-smetana')));
    var a = got.frames.filter(function(x) { return x.id === 'A'; })[0];
    var b = got.frames.filter(function(x) { return x.id === 'B'; })[0];
    expect(a.composite).toBe(true);
    expect(b.composite).toBe(true);
    // 2 つの外枠は重ならない (1 つ目の枠が 2 つ目にまたがらない)
    var apart = a.box.x + a.box.width <= b.box.x + 1 || b.box.x + b.box.width <= a.box.x + 1
      || a.box.y + a.box.height <= b.box.y + 1 || b.box.y + b.box.height <= a.box.y + 1;
    expect(apart).toBe(true);
  });
  test('fork / join の棒 (#555) も名前の付いた状態として当たる', function() {
    var got = SM.collect(svgOf('state-pseudo'), ST.parse(dslOf('state-pseudo')));
    var ids = got.frames.filter(function(x) { return x.type === 'state'; }).map(function(x) { return x.id; });
    ['fork1', 'join2', 'choice1', 'end3'].forEach(function(id) { expect(ids).toContain(id); });
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
