'use strict';
// BLK-builder-20260907-1243-1b / design 5d Activity「その他パレット」の色指定。
// `#色:本文;` をアクションとして読み、色だけを付け外しできることを担保する。

var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/activity-insert.js',
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ac = global.window.MA.modules.plantumlActivity;

function actionsOf(text) {
  return ac.parse(text).nodes.filter(function(n) { return n.kind === 'action'; });
}

describe('activity: 色つきアクションを読む', () => {
  test('#色:本文; がアクションとして読め、色と本文が分かれる', () => {
    const acts = actionsOf('@startuml\nstart\n#LightBlue:保存する;\nstop\n@enduml');
    expect(acts.length).toBe(1);
    expect(acts[0].text).toBe('保存する');
    expect(acts[0].color).toBe('#LightBlue');
  });

  test('色の無いアクションの color は null (従来どおり)', () => {
    const acts = actionsOf('@startuml\nstart\n:保存する;\nstop\n@enduml');
    expect(acts.length).toBe(1);
    expect(acts[0].text).toBe('保存する');
    expect(acts[0].color).toBe(null);
  });

  test('複数行のアクションでも先頭行の色を持つ', () => {
    const acts = actionsOf('@startuml\nstart\n#Pink:1 行目\n2 行目;\nstop\n@enduml');
    expect(acts.length).toBe(1);
    expect(acts[0].text).toBe('1 行目\n2 行目');
    expect(acts[0].color).toBe('#Pink');
    expect(acts[0].line).toBe(3);
    expect(acts[0].endLine).toBe(4);
  });

  test('#RRGGBB 形式も読む', () => {
    expect(actionsOf('@startuml\n#AABBCC:塗る;\n@enduml')[0].color).toBe('#AABBCC');
  });

  test('グラデーション指定 (#色/#色) も 1 つの色として読む', () => {
    expect(actionsOf('@startuml\n#red/green:塗る;\n@enduml')[0].color).toBe('#red/green');
  });

  test('色つきでも 図の他の要素と同じ数だけ数えられる', () => {
    const parsed = ac.parse('@startuml\nstart\n#Yellow:A;\n:B;\nstop\n@enduml');
    expect(parsed.nodes.filter((n) => n.kind === 'action').length).toBe(2);
  });
});

describe('activity.setActionColor / actionColorAt', () => {
  test('色の無い行に色を付ける', () => {
    const out = ac.setActionColor('@startuml\n:保存する;\n@enduml', 2, 2, '#LightBlue');
    expect(out).toBe('@startuml\n:保存する; <<#LightBlue>>\n@enduml');
  });

  test('# を省いて渡しても # を補う', () => {
    const out = ac.setActionColor('@startuml\n:保存する;\n@enduml', 2, 2, 'Pink');
    expect(out).toBe('@startuml\n:保存する; <<#Pink>>\n@enduml');
  });

  test('付いている色を別の色に差し替える', () => {
    const out = ac.setActionColor('@startuml\n#Pink:保存する;\n@enduml', 2, 2, '#Yellow');
    expect(out).toBe('@startuml\n:保存する; <<#Yellow>>\n@enduml');
  });

  test('空を渡すと色を外す', () => {
    const out = ac.setActionColor('@startuml\n:保存する; <<#Pink>>\n@enduml', 2, 2, '');
    expect(out).toBe('@startuml\n:保存する;\n@enduml');
  });

  test('字下げは保つ', () => {
    const out = ac.setActionColor('@startuml\nif (a?) then (yes)\n  :保存する;\nendif\n@enduml', 3, 3, '#Pink');
    expect(out).toBe('@startuml\nif (a?) then (yes)\n  :保存する; <<#Pink>>\nendif\n@enduml');
  });

  test('アクション行でなければ何も変えない', () => {
    const src = '@startuml\nif (a?) then (yes)\nendif\n@enduml';
    expect(ac.setActionColor(src, 2, 2, '#Pink')).toBe(src);
    expect(ac.setActionColor(src, 99, 99, '#Pink')).toBe(src);
  });

  test('actionColorAt は行の色を返し、無ければ null', () => {
    const src = '@startuml\n#Pink:A;\n:B;\n@enduml';
    expect(ac.actionColorAt(src, 2, 2)).toBe('#Pink');
    expect(ac.actionColorAt(src, 3, 3)).toBe(null);
  });
});

describe('activity.updateAction は色を落とさない', () => {
  test('本文だけ書き換えても色が残る', () => {
    const out = ac.updateAction('@startuml\n#Pink:古い;\n@enduml', 2, 2, '新しい');
    expect(out).toBe('@startuml\n:新しい; <<#Pink>>\n@enduml');
  });

  test('複数行に増やしても先頭行の色が残る', () => {
    const out = ac.updateAction('@startuml\n#Pink:古い;\n@enduml', 2, 2, 'A\nB');
    expect(out).toBe('@startuml\n:A\nB; <<#Pink>>\n@enduml');
  });

  test('色の無い行は従来どおり', () => {
    expect(ac.updateAction('@startuml\n:古い;\n@enduml', 2, 2, '新しい'))
      .toBe('@startuml\n:新しい;\n@enduml');
  });
});

describe('activity.fmtAction', () => {
  test('色を渡すと前に付く / 渡さなければ従来どおり', () => {
    expect(ac.fmtAction('保存する', '#Pink')).toBe(':保存する; <<#Pink>>');
    expect(ac.fmtAction('保存する')).toBe(':保存する;');
  });
});

describe('BLK-builder-20260907-1243-1c: 警告の出ない後置き `<<#色>>`', () => {
  test('後置きの色を読む', () => {
    const acts = actionsOf('@startuml\nstart\n:保存する; <<#LightBlue>>\nstop\n@enduml');
    expect(acts.length).toBe(1);
    expect(acts[0].text).toBe('保存する');
    expect(acts[0].color).toBe('#LightBlue');
  });

  test('複数行のアクションでは閉じる行の後ころに付く', () => {
    const acts = actionsOf('@startuml\nstart\n:1 行目\n2 行目; <<#Pink>>\nstop\n@enduml');
    expect(acts.length).toBe(1);
    expect(acts[0].text).toBe('1 行目\n2 行目');
    expect(acts[0].color).toBe('#Pink');
    expect(acts[0].endLine).toBe(4);
  });

  test('複数行のアクションに色を付けると閉じる行に入る', () => {
    const out = ac.setActionColor('@startuml\n:A\nB;\n@enduml', 2, 3, '#Pink');
    expect(out).toBe('@startuml\n:A\nB; <<#Pink>>\n@enduml');
  });

  test('古い前置きの行に色を付け直すと、後置きに揃う', () => {
    const out = ac.setActionColor('@startuml\n#Pink:A;\n@enduml', 2, 2, '#Yellow');
    expect(out).toBe('@startuml\n:A; <<#Yellow>>\n@enduml');
  });

  test('後置きの色を外せる', () => {
    const out = ac.setActionColor('@startuml\n:A; <<#Yellow>>\n@enduml', 2, 2, '');
    expect(out).toBe('@startuml\n:A;\n@enduml');
  });

  test('後置きの色は本文の書き換えでも残る', () => {
    const out = ac.updateAction('@startuml\n:古い; <<#Pink>>\n@enduml', 2, 2, '新しい');
    expect(out).toBe('@startuml\n:新しい; <<#Pink>>\n@enduml');
  });

  test('閉じていない行には付けない', () => {
    const src = '@startuml\n:A\n@enduml';
    expect(ac.setActionColor(src, 2, 2, '#Pink')).toBe(src);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
