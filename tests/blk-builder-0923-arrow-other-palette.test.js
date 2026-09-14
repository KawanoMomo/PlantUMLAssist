'use strict';
// BLK-builder-20260907-0923-4 / design 2d「矢印のその他パレット」。
//
// 仕様: よく使う 4 種は常時表示、残りは「その他の矢印…」に入れる。各項目は
// 「何が起きるか」を先に書き、記法は右に小さく置く。パレットには
//   両方向 <-> / 図の外から [-> / 図の外へ ->] / 手前で止まる ->o /
//   片羽根 ->\ / 線の色 -[#red]>
// が並ぶ。
//
// ここでは DSL 面 (読み書き) と、パレットを組み立てる公開値・HTML を検証する。

var fs = require('fs');
var path = require('path');

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);
var P = (typeof window !== 'undefined' && window.MA && window.MA.properties)
  || (global.window && global.window.MA && global.window.MA.properties);

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

var HALF = '->' + String.fromCharCode(92);   // ->\

describe('design 2d パレットの品揃え', function() {
  test('design が挙げる 6 種がすべてパレットにある', function() {
    var keys = seq.otherArrows().map(function(s) { return s.notation || s.arrow; });
    ['<->', '[->', '->]', '->o', HALF, '-[#red]>'].forEach(function(k) {
      expect(keys.indexOf(k) >= 0).toBe(true);
    });
  });

  test('常時表示の 4 種はパレットに重複して出さない', function() {
    var keys = seq.otherArrows().map(function(s) { return s.notation || s.arrow; });
    seq.quickArrows().forEach(function(a) { expect(keys.indexOf(a)).toBe(-1); });
  });

  test('各項目は「何が起きるか」の説明を持つ (記法だけの項目が無い)', function() {
    seq.otherArrows().forEach(function(s) {
      expect(typeof s.desc).toBe('string');
      expect(s.desc.length > 0).toBe(true);
      expect(s.desc).not.toBe(s.arrow);
    });
  });
});

describe('design 2d 新しい矢印を DSL として読み書きできる', function() {
  ['->o', HALF, '-[#red]>'].forEach(function(arrow) {
    test('`' + arrow + '` の行を message として読める', function() {
      var src = BASE.replace('User -> System : Request', 'User ' + arrow + ' System : Request');
      var hit = seq.parseSequence(src).relations.filter(function(x) { return x.line === 4; })[0];
      expect(!!hit).toBe(true);
      expect(hit.arrow).toBe(arrow);
      expect(hit.from).toBe('User');
      expect(hit.to).toBe('System');
      expect(hit.label).toBe('Request');
    });

    test('`' + arrow + '` へ切り替えても他の行は 1 バイトも変わらない', function() {
      var out = seq.applyArrowSpec(BASE, 4, arrow);
      var before = BASE.split('\n'), after = out.split('\n');
      expect(after[3]).toBe('User ' + arrow + ' System : Request');
      [0, 1, 2, 4, 5].forEach(function(i) { expect(after[i]).toBe(before[i]); });
    });
  });
});

describe('design 2d 図の外とのやり取り', function() {
  test('「図の外から入ってくる」は `[-> System` の形で書く (空白を入れない)', function() {
    var out = seq.applyArrowSpec(BASE, 4, '[->');
    expect(out.split('\n')[3]).toBe('[-> System : Request');
  });

  test('「図の外へ出ていく」は `User ->]` の形で書く', function() {
    var out = seq.applyArrowSpec(BASE, 4, '->]');
    expect(out.split('\n')[3]).toBe('User ->] : Request');
  });

  test('`[-> System : Request` を message として読める', function() {
    var src = BASE.replace('User -> System : Request', '[-> System : Request');
    var hit = seq.parseSequence(src).relations.filter(function(x) { return x.line === 4; })[0];
    expect(!!hit).toBe(true);
    expect(hit.from).toBe('[');
    expect(hit.to).toBe('System');
    expect(hit.arrow).toBe('->');
  });

  test('`[` / `]` は参加者一覧に混ざらない', function() {
    var src = BASE.replace('User -> System : Request', '[-> System : Request')
                  .replace('System --> User : Response', 'System -->] : Response');
    var ids = seq.parseSequence(src).elements
      .filter(function(e) { return e.kind === 'participant'; })
      .map(function(e) { return e.id; });
    expect(ids.indexOf('[')).toBe(-1);
    expect(ids.indexOf(']')).toBe(-1);
    expect(ids.indexOf('System') >= 0).toBe(true);
  });

  test('⇄ は図の外の側を向きに合わせて入れ替える', function() {
    var src = BASE.replace('User -> System : Request', '[-> System : Request');
    var out = seq.swapMessageEnds(src, 4);
    expect(out.split('\n')[3]).toBe('System ->] : Request');
  });

  test('図の外から通常の矢印に戻すと、図の中の参加者が相手になる', function() {
    var src = BASE.replace('User -> System : Request', '[-> System : Request');
    var out = seq.applyArrowSpec(src, 4, '<->');
    expect(out.split('\n')[3]).toBe('User <-> System : Request');
  });

  test('activeArrowKey は図の外を記法どおりの行に対応づける', function() {
    expect(seq.activeArrowKey('[', 'System', '->')).toBe('[->');
    expect(seq.activeArrowKey('User', ']', '->')).toBe('->]');
    expect(seq.activeArrowKey('User', 'System', '->o')).toBe('->o');
  });
});

describe('design 2d パレットの HTML', function() {
  function html(current) {
    return P.arrowPickerHtml('矢印の種類 / Arrow', 'x-arrow',
      [{ value: '->', label: '同期', sub: '->' }, { value: '-->', label: '応答・戻り', sub: '-->' }],
      [{ value: '<->', desc: '両方向のやり取り' }, { value: '[->', desc: '図の外から入ってくる' }],
      current);
  }

  test('「その他の矢印…」の開閉ボタンを持つ', function() {
    expect(html('->')).toContain('その他の矢印…');
    expect(html('->')).toContain('id="x-arrow-more-btn"');
  });

  test('常時表示の側は説明が主・記法が従で出る', function() {
    var h = html('->');
    expect(h).toContain('同期');
    expect(h).toContain('応答・戻り');
  });

  test('パレットの各行は説明と記法の両方を出す', function() {
    var h = html('->');
    expect(h).toContain('両方向のやり取り');
    expect(h).toContain('&lt;-&gt;');
    expect(h).toContain('図の外から入ってくる');
  });

  test('現在値が常時表示の 4 種なら、パレットは閉じている', function() {
    expect(html('->')).toContain('id="x-arrow-more" hidden');
  });

  test('現在値がパレット側なら、パレットは開いた状態で出る', function() {
    var h = html('[->');
    expect(h).toContain('id="x-arrow-more" ');
    expect(h).not.toContain('id="x-arrow-more" hidden');
    expect(h).toContain('aria-expanded="true"');
  });

  test('現在値は hidden input が持つ (送信側が .value で読める)', function() {
    expect(html('->o')).toContain('<input type="hidden" id="x-arrow" value="-&gt;o">');
  });
});

describe('design 2d 右ペインが素のプルダウンを持たない', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'sequence.js'), 'utf-8');

  test('「Arrow (その他)」の select は無くなり、パレットに置き換わっている', function() {
    expect(src).not.toContain("'Arrow (その他)'");
    expect(src).toContain("P.arrowPickerHtml('矢印の種類 / Arrow', 'seq-edit-arrow'");
  });

  test('末尾追加フォームも同じパレットを使う', function() {
    expect(src).toContain("P.arrowPickerHtml('矢印の種類 / Arrow', 'seq-tail-arrow'");
  });
});
