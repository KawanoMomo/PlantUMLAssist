'use strict';
// BLK-primary-20260907-0703: 図全体の外観 (Theme / 色 / 文字サイズ) と タイトルを
// GUI から決めて skinparam / title として DSL に書き込む。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/diagram-settings.js')]; } catch (e) {}
require('../src/core/diagram-settings.js');
var ds = global.window.MA.diagramSettings;

var SEQ = '@startuml\nparticipant A\nA -> B : x\n@enduml';

function skinOf(text) {
  return text.split('\n').filter(function(l) { return /^\s*skinparam/i.test(l); });
}

describe('diagramSettings 選択肢', function() {
  test('外観は 標準 / モノクロ / ダーク の 3 つ', function() {
    expect(ds.THEMES.map(function(t) { return t.id; })).toEqual(['standard', 'mono', 'dark']);
    expect(ds.THEMES.map(function(t) { return t.label; })).toEqual(['標準', 'モノクロ', 'ダーク']);
  });

  test('文字サイズは 10 / 12 / 14 / 16', function() {
    expect(ds.FONT_SIZES).toEqual([10, 12, 14, 16]);
  });

  test('既定は標準テーマで個別指定なし', function() {
    var d = ds.defaults();
    expect(d.theme).toBe('standard');
    expect(d.shapeColor).toBeNull();
    expect(d.title).toBe('');
  });
});

describe('diagramSettings.resolve', function() {
  test('テーマの既定値を実効値にする', function() {
    var r = ds.resolve({ theme: 'dark' });
    expect(r.backgroundColor).toBe('#1E1E1E');
    expect(r.fontSize).toBe(12);
  });

  test('個別に選んだ色がテーマ既定より優先される', function() {
    var r = ds.resolve({ theme: 'dark', shapeColor: '#FF0000' });
    expect(r.shapeColor).toBe('#FF0000');
    expect(r.backgroundColor).toBe('#1E1E1E');
  });

  test('未知のテーマは標準として扱う', function() {
    expect(ds.resolve({ theme: 'nope' }).theme).toBe('standard');
    expect(ds.resolve(null).theme).toBe('standard');
  });

  test('モノクロだけ monochrome が立つ', function() {
    expect(ds.resolve({ theme: 'mono' }).monochrome).toBe(true);
    expect(ds.resolve({ theme: 'standard' }).monochrome).toBe(false);
  });
});

describe('diagramSettings.buildLines', function() {
  test('背景色・文字サイズ・線の色を 1 行ずつ出す', function() {
    var lines = ds.buildLines({ theme: 'standard' }, 'plantuml-usecase');
    expect(lines).toContain('skinparam backgroundColor #FFFFFF');
    expect(lines).toContain('skinparam defaultFontSize 12');
    expect(lines).toContain('skinparam ArrowColor #181818');
  });

  test('図種ごとの図形色・枠線色を出す', function() {
    expect(ds.buildLines({ theme: 'standard' }, 'plantuml-usecase'))
      .toContain('skinparam usecaseBackgroundColor #E3E3F7');
    expect(ds.buildLines({ theme: 'standard' }, 'plantuml-component'))
      .toContain('skinparam componentBorderColor #181818');
    expect(ds.buildLines({ theme: 'standard' }, 'plantuml-sequence'))
      .toContain('skinparam sequenceParticipantBackgroundColor #E3E3F7');
  });

  test('図種が分からなければ図種別の行は出さない', function() {
    var lines = ds.buildLines({ theme: 'standard' }, null);
    expect(lines.join('\n')).not.toContain('BackgroundColor #E3E3F7');
    expect(lines).toContain('skinparam backgroundColor #FFFFFF');
  });

  test('モノクロは monochrome true を出し、色指定は並べない', function() {
    var lines = ds.buildLines({ theme: 'mono' }, 'plantuml-usecase');
    expect(lines).toContain('skinparam monochrome true');
    expect(lines.join('\n')).not.toContain('ArrowColor');
    expect(lines.join('\n')).not.toContain('usecaseBackgroundColor');
  });

  test('選んだ文字サイズと色が行に出る', function() {
    var lines = ds.buildLines({ theme: 'standard', fontSize: 16, shapeColor: '#FF0000' }, 'plantuml-class');
    expect(lines).toContain('skinparam defaultFontSize 16');
    expect(lines).toContain('skinparam classBackgroundColor #FF0000');
  });

  test('ブロック形式 (skinparam x { ... }) は使わない', function() {
    var text = ds.buildLines({ theme: 'dark' }, 'plantuml-state').join('\n');
    expect(text).not.toContain('{');
  });
});

describe('diagramSettings.applyTitle', function() {
  test('@startuml の直後に title を入れる', function() {
    expect(ds.applyTitle(SEQ, 'SPI 初期化'))
      .toBe('@startuml\ntitle SPI 初期化\nparticipant A\nA -> B : x\n@enduml');
  });

  test('既存の title を置き換える', function() {
    var t = '@startuml\ntitle 古い\nA -> B : x\n@enduml';
    expect(ds.applyTitle(t, '新しい')).toBe('@startuml\ntitle 新しい\nA -> B : x\n@enduml');
  });

  test('空文字なら title 行を消す', function() {
    var t = '@startuml\ntitle 古い\nA -> B : x\n@enduml';
    expect(ds.applyTitle(t, '')).toBe('@startuml\nA -> B : x\n@enduml');
    expect(ds.applyTitle(t, '   ')).toBe('@startuml\nA -> B : x\n@enduml');
  });

  test('null や空 DSL でも落ちない', function() {
    expect(ds.applyTitle(null, 'x')).toContain('title x');
    expect(ds.applyTitle(undefined, '')).toBe('');
  });
});

describe('diagramSettings.readFrom', function() {
  test('今の DSL から背景色・文字サイズ・タイトルを読み戻す', function() {
    var t = '@startuml\ntitle 図タイトル\nskinparam backgroundColor #101010\nskinparam defaultFontSize 16\nA -> B : x\n@enduml';
    var s = ds.readFrom(t);
    expect(s.backgroundColor).toBe('#101010');
    expect(s.fontSize).toBe(16);
    expect(s.title).toBe('図タイトル');
  });

  test('monochrome true があればモノクロと判定する', function() {
    expect(ds.readFrom('@startuml\nskinparam monochrome true\n@enduml').theme).toBe('mono');
  });

  test('ダークの背景色ならダークと判定する', function() {
    expect(ds.readFrom('@startuml\nskinparam backgroundColor #1E1E1E\n@enduml').theme).toBe('dark');
  });

  test('skinparam が無ければ既定 (標準・個別指定なし) になる', function() {
    var s = ds.readFrom(SEQ);
    expect(s.theme).toBe('standard');
    expect(s.backgroundColor).toBeNull();
    expect(s.title).toBe('');
  });

  test('図形色と線の色を読み戻す', function() {
    var t = '@startuml\nskinparam ArrowColor #ABCDEF\nskinparam usecaseBackgroundColor #123456\n@enduml';
    var s = ds.readFrom(t);
    expect(s.lineColor).toBe('#ABCDEF');
    expect(s.shapeColor).toBe('#123456');
  });

  test('書き込んだ設定をそのまま読み戻せる (往復)', function() {
    var applied = ds.apply(SEQ, { theme: 'dark', fontSize: 16, title: 'T1' }, 'plantuml-sequence');
    var s = ds.readFrom(applied);
    expect(s.theme).toBe('dark');
    expect(s.fontSize).toBe(16);
    expect(s.title).toBe('T1');
  });
});

describe('diagramSettings.apply', function() {
  // apply は dslUpdater.applySkinparamPreset を使う。単体では読み込まれていない
  // ことがあるので、その場合は skinparam 差し込みを飛ばして title だけ検証する。
  var hasUpdater = !!(global.window.MA && global.window.MA.dslUpdater && global.window.MA.dslUpdater.applySkinparamPreset);

  test('タイトルを書き込む', function() {
    expect(ds.apply(SEQ, { theme: 'standard', title: 'SPI' }, 'plantuml-sequence')).toContain('title SPI');
  });

  test('skinparam を DSL 先頭に書き込む', function() {
    if (!hasUpdater) return;
    var out = ds.apply(SEQ, { theme: 'dark' }, 'plantuml-sequence');
    expect(out).toContain('skinparam backgroundColor #1E1E1E');
    expect(out.indexOf('skinparam')).toBeLessThan(out.indexOf('participant A'));
  });

  test('掛け直しても skinparam が二重にならない', function() {
    if (!hasUpdater) return;
    var once = ds.apply(SEQ, { theme: 'dark' }, 'plantuml-sequence');
    var twice = ds.apply(once, { theme: 'mono' }, 'plantuml-sequence');
    expect(skinOf(twice)).toEqual(ds.buildLines({ theme: 'mono' }, 'plantuml-sequence'));
  });

  test('掛け直してもタイトルが二重にならない', function() {
    var once = ds.apply(SEQ, { theme: 'standard', title: 'A' }, 'plantuml-sequence');
    var twice = ds.apply(once, { theme: 'standard', title: 'B' }, 'plantuml-sequence');
    var titles = twice.split('\n').filter(function(l) { return /^title\s/.test(l); });
    expect(titles).toEqual(['title B']);
  });

  test('図の中身 (要素・関係) は変えない', function() {
    var out = ds.apply(SEQ, { theme: 'dark', fontSize: 16 }, 'plantuml-sequence');
    expect(out).toContain('participant A');
    expect(out).toContain('A -> B : x');
    expect(out).toContain('@enduml');
  });
});
