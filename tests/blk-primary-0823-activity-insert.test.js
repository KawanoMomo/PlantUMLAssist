'use strict';
// BLK-primary-20260907-0823-design (design 4b「Activity — 途中に挿入」):
// 位置を選ぶと、そこに置ける要素だけがメニューに残り、if / while / fork は
// 開始と終了が対で入る。生の構文を打たずに分岐を足せることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/activity-insert.js')]; } catch (e) {}
require('../src/core/activity-insert.js');
var AI = global.window.MA.activityInsert;

var act = (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlActivity) || null;

// 新規 Activity 図の初期状態 (BLK 本文の「3 行しかない図」)
var MIN = ['@startuml', 'start', ':Hello world;', 'stop', '@enduml'].join('\n');

describe('BLK-primary-0823 挿入位置の一覧', function() {
  test('@startuml / @enduml は挿入位置に出さない', function() {
    var pts = AI.insertPoints(MIN);
    var texts = pts.map(function(p) { return p.text; });
    expect(texts.indexOf('@startuml')).toBe(-1);
    expect(texts.indexOf('@enduml')).toBe(-1);
  });

  test('本体の各行の後ろと、start の前が候補になる', function() {
    var pts = AI.insertPoints(MIN);
    expect(pts[0].position).toBe('before');
    expect(pts[0].text).toBe('start');
    var afters = pts.filter(function(p) { return p.position === 'after'; })
      .map(function(p) { return p.text; });
    expect(afters.join('|')).toBe('start|:Hello world;|stop');
  });

  test('空行は候補にしない', function() {
    var pts = AI.insertPoints('@startuml\nstart\n\n:A;\n@enduml');
    expect(pts.filter(function(p) { return p.text === ''; }).length).toBe(0);
  });

  test('pointAt は行番号から候補を引ける', function() {
    expect(AI.pointAt(MIN, 3).text).toBe(':Hello world;');
  });
});

describe('BLK-primary-0823 位置で絞ったメニュー', function() {
  test('フローの中では 10 種すべてが置ける', function() {
    expect(AI.inFlow(MIN, 3)).toBe(true);
    var ks = AI.allowedKinds(MIN, 3).map(function(k) { return k.kind; });
    expect(ks.join(' ')).toBe('action if while repeat fork note swimlane break detach kill');
  });

  test('start より前ではレーンだけ (start / stop は既にある)', function() {
    expect(AI.inFlow(MIN, 2)).toBe(false);
    var ks = AI.allowedKinds(MIN, 2).map(function(k) { return k.kind; });
    expect(ks.join(' ')).toBe('swimlane');
  });

  test('start の無い図では start が候補に出る', function() {
    var src = '@startuml\ntitle T\n@enduml';
    var ks = AI.allowedKinds(src, 2).map(function(k) { return k.kind; });
    expect(ks.indexOf('start') >= 0).toBe(true);
  });

  test('stop の後はフローの外', function() {
    expect(AI.inFlow(MIN, 4)).toBe(false);
    expect(AI.isAllowed(MIN, 4, 'if')).toBe(false);
    expect(AI.isAllowed(MIN, 3, 'if')).toBe(true);
  });

  test('置けない要素は isAllowed が false を返す', function() {
    expect(AI.isAllowed(MIN, 2, 'fork')).toBe(false);
    expect(AI.isAllowed(MIN, 2, 'swimlane')).toBe(true);
  });
});

describe('BLK-primary-0823 種類ごとの入力欄', function() {
  test('if は条件と then / else のラベルを聞く', function() {
    var ids = AI.fieldsFor('if').map(function(f) { return f.id; });
    expect(ids.join(' ')).toBe('cond thenLabel elseLabel');
  });

  test('fork は枝の数だけを聞く', function() {
    expect(AI.fieldsFor('fork').map(function(f) { return f.id; }).join(' ')).toBe('branchCount');
  });

  test('break / detach / kill は入力を要らない', function() {
    ['break', 'detach', 'kill'].forEach(function(k) {
      expect(AI.fieldsFor(k).length).toBe(0);
      expect(AI.isBareKind(k)).toBe(true);
      expect(AI.bareLineFor(k)).toBe(k);
    });
    expect(AI.isBareKind('if')).toBe(false);
    expect(AI.bareLineFor('if')).toBeNull();
  });
});

if (act) {
  describe('BLK-primary-0823 選んだ位置への書き込み', function() {
    test('if は開始・else・endif が対で入り、位置が守られる', function() {
      var out = act.addControlAtLine(MIN, 3, 'after', 'if',
        { cond: '受信成功?', thenLabel: 'yes', elseLabel: 'no' }).split('\n');
      expect(out[0]).toBe('@startuml');
      expect(out[1]).toBe('start');
      expect(out[2]).toBe(':Hello world;');
      expect(out[3]).toBe('if (受信成功?) then (yes)');
      expect(out[5]).toBe('else (no)');
      expect(out[7]).toBe('endif');
      expect(out[8]).toBe('stop');
    });

    test('while は endwhile まで入る', function() {
      var out = act.addControlAtLine(MIN, 3, 'after', 'while', { cond: '残りあり?', label: 'yes' });
      expect(out).toContain('while (残りあり?) is (yes)');
      expect(out).toContain('endwhile');
    });

    test('fork は枝の数だけ fork again が入る', function() {
      var out = act.addControlAtLine(MIN, 3, 'after', 'fork', { branchCount: 3 });
      expect((out.match(/fork again/g) || []).length).toBe(2);
      expect(out).toContain('end fork');
    });

    test('break は 1 行だけ、字下げを合わせて入る', function() {
      var src = '@startuml\nstart\nwhile (c) is (yes)\n  :A;\nendwhile\nstop\n@enduml';
      var out = act.insertBareAtLine(src, 4, 'after', 'break').split('\n');
      expect(out[4]).toBe('  break');
      expect(out[5]).toBe('endwhile');
    });

    test('空の word では DSL が 1 バイトも変わらない', function() {
      expect(act.insertBareAtLine(MIN, 3, 'after', null)).toBe(MIN);
    });
  });
}
