'use strict';
// BLK-builder-20260907-0823-1: design 1a の右ペイン。
// From ⇄ To の 1 クリック入替と、よく使う矢印の分節ボタン。
var fs = require('fs');
var path = require('path');

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

var P = (global.window && global.window.MA && global.window.MA.properties) || null;

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : <<async>> Response',
  '@enduml',
].join('\n');

describe('BLK-builder-0823 From ⇄ To の入替', function() {
  test('両端が入れ替わり、矢印と本文はそのまま残る', function() {
    var out = seq.swapMessageEnds(BASE, 4).split('\n');
    expect(out[3]).toBe('System -> User : Request');
  });

  test('stereotype 付きの本文も壊さない', function() {
    var out = seq.swapMessageEnds(BASE, 5).split('\n');
    expect(out[4]).toBe('User --> System : <<async>> Response');
  });

  test('2 回入れ替えると元に戻る', function() {
    expect(seq.swapMessageEnds(seq.swapMessageEnds(BASE, 4), 4)).toBe(BASE);
  });

  test('本文の無いメッセージでも : が生えない', function() {
    var src = BASE.replace('User -> System : Request', 'User -> System');
    expect(seq.swapMessageEnds(src, 4).split('\n')[3]).toBe('System -> User');
  });

  test('メッセージでない行・範囲外の行では DSL が 1 バイトも変わらない', function() {
    expect(seq.swapMessageEnds(BASE, 2)).toBe(BASE);
    expect(seq.swapMessageEnds(BASE, 0)).toBe(BASE);
    expect(seq.swapMessageEnds(BASE, 99)).toBe(BASE);
  });

  test('字下げは保つ (alt の中のメッセージ)', function() {
    var src = '@startuml\nalt ok\n  User -> System : Do\nend\n@enduml';
    expect(seq.swapMessageEnds(src, 3).split('\n')[2]).toBe('  System -> User : Do');
  });
});

describe('BLK-builder-0823 分節に出す矢印', function() {
  test('design 1a の 4 種を出す', function() {
    expect(seq.quickArrows().join(' ')).toBe('-> --> ->> ->x');
  });

  test('分節の 4 種はすべて選択肢 (ARROWS) にも入っている', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'sequence.js'), 'utf-8');
    var m = src.match(/var ARROWS = \[([^\]]*)\];/);
    var all = m[1].split(',').map(function(x) { return x.trim().replace(/^'|'$/g, ''); });
    seq.quickArrows().forEach(function(a) { expect(all.indexOf(a) >= 0).toBe(true); });
  });

  test('->x (ロストメッセージ) を矢印として読み書きできる', function() {
    var src = BASE.replace('User -> System : Request', 'User ->x System : Request');
    var parsed = seq.parseSequence(src);
    var hit = parsed.relations.filter(function(x) { return x.line === 4; })[0];
    expect(hit.arrow).toBe('->x');
    expect(hit.from).toBe('User');
    expect(hit.to).toBe('System');
    expect(seq.updateMessage(src, 4, 'arrow', '->').split('\n')[3]).toBe('User -> System : Request');
  });

  test('->x への切替が他の行を変えない', function() {
    var out = seq.updateMessage(BASE, 4, 'arrow', '->x').split('\n');
    var a = BASE.split('\n');
    expect(out[3]).toBe('User ->x System : Request');
    expect(out[4]).toBe(a[4]);
    expect(out[1]).toBe(a[1]);
  });
});

describe('BLK-builder-0823 分節ボタンの HTML', function() {
  test('選ばれている 1 つだけが active になる', function() {
    var html = P.segmentedFieldHtml('Arrow', 'x-seg', [
      { value: '->', label: '->', selected: true },
      { value: '-->', label: '-->' },
    ]);
    expect((html.match(/class="prop-seg active"/g) || []).length).toBe(1);
    expect((html.match(/class="prop-seg"/g) || []).length).toBe(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('id="x-seg"');
  });

  test('value と title が属性として出る', function() {
    var html = P.segmentedFieldHtml('Arrow', 'x-seg', [
      { value: '->x', label: '->x', title: 'ロスト' },
    ]);
    expect(html).toContain('data-value="-&gt;x"');
    expect(html).toContain('title="ロスト"');
  });
});
