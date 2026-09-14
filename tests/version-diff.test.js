'use strict';
// BLK-reviewer-20260913-0306-wish: 保存の控え (`_versions/`) は既に溜まっているのに、
// 「いまの中身は直前の版から何が変わったか」を言う口が無く、消失事故のときは
// 「どのファイルが最新の正か」を過去 run の控えから推測するしかなかった。
// ここは判定そのもの (行差分と 4 つの見立て) だけを見る。ファイルを読むのは
// tools/audit.js の --versions。
var vd = require('../src/core/version-diff.js');

var FULL = ['@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
  'class Spi_Driver', 'class Can_Driver', 'class Gpio_Driver', '@enduml'].join('\n');
var TEMPLATE = ['@startuml', 'title Sample Sequence', 'actor User', 'participant System', '@enduml'].join('\n');

describe('versionDiff.parseVersionFile', () => {
  test('server の綴り {name}--{刻印}.puml を図名と刻印に割る', () => {
    expect(vd.parseVersionFile('plantuml-class--20260914-001252.puml'))
      .toEqual({ name: 'plantuml-class', stamp: '20260914-001252' });
  });

  test('同じ秒の 2 本目 (.1) も版として読む', () => {
    expect(vd.parseVersionFile('diagram1--20260913-031500.1.puml').stamp).toBe('20260913-031500.1');
  });

  test('図名自体に -- を含んでも、区切りは末尾側で割る', () => {
    expect(vd.parseVersionFile('spi--init--20260913-031500.puml').name).toBe('spi--init');
  });

  test('版でないファイルは拾わない', () => {
    expect(vd.parseVersionFile('plantuml-class.puml')).toBe(null);
    expect(vd.parseVersionFile('plantuml-class--メモ.puml')).toBe(null);
    expect(vd.parseVersionFile('plantuml-class--20260914-001252.txt')).toBe(null);
  });
});

describe('versionDiff.latestByName', () => {
  test('図ごとに、いちばん新しい版 1 本と控えの数を返す', () => {
    var got = vd.latestByName([
      'a--20260913-031500.puml', 'a--20260914-001252.puml', 'a--20260912-181000.puml',
      'b--20260913-031000.puml', 'README.md',
    ]);
    expect(got.a).toEqual({ stamp: '20260914-001252', file: 'a--20260914-001252.puml', count: 3 });
    expect(got.b.count).toBe(1);
  });
});

describe('versionDiff.diffLines', () => {
  test('動いた行だけを、消えた側・足した側の行番号付きで出す', () => {
    var before = ['@startuml', 'A -> B : x', '@enduml'].join('\n');
    var after = ['@startuml', 'A -> B : y', 'B -> C : z', '@enduml'].join('\n');
    var moved = vd.changedOnly(vd.diffLines(before, after));
    expect(moved.map((d) => d.kind + ' ' + d.text)).toEqual([
      'del A -> B : x', 'add A -> B : y', 'add B -> C : z',
    ]);
    expect(moved[0].before).toBe(2);
    expect(moved[1].after).toBe(2);
  });

  test('行末の空白と改行コードだけの差は動いた行に数えない', () => {
    var before = ['@startuml', 'A -> B : x', '@enduml'].join('\n');
    var after = ['@startuml', 'A -> B : x  ', '@enduml'].join('\r\n') + '\n\n';
    expect(vd.changedOnly(vd.diffLines(before, after))).toEqual([]);
  });
});

describe('versionDiff.compare', () => {
  test('控えがまだ無い図は no-version (指摘の対象にしない)', () => {
    var r = vd.compare({ name: 'spi_state.puml', current: FULL, previous: null });
    expect(r.verdict).toBe('no-version');
    expect(r.diff).toEqual([]);
  });

  test('中身が同じなら same', () => {
    expect(vd.compare({ name: 'a.puml', current: FULL, previous: FULL }).verdict).toBe('same');
  });

  test('1〜4 行の書き足しは事故にしない', () => {
    var after = FULL.replace('@enduml', 'class Irq_Driver\n@enduml');
    var r = vd.compare({ name: 'a.puml', current: after, previous: FULL });
    expect(r.verdict).toBe('edited');
    expect(r.lost).toBe(0);
  });

  test('別の図の中身で丸ごと塗り潰されたら replaced', () => {
    var r = vd.compare({
      name: 'plantuml-class.puml', current: TEMPLATE, previous: FULL, stamp: '20260914-001252',
    });
    expect(r.verdict).toBe('replaced');
    expect(r.titleBefore).toBe('Driver_Common_Class');
    expect(r.titleAfter).toBe('Sample Sequence');
    expect(r.beforeLines).toBe(10);
    expect(r.afterLines).toBe(5);
  });

  test('題は同じまま中身だけ大きく減ったら lost', () => {
    var stub = ['@startuml', 'title Driver_Common_Class', '@enduml'].join('\n');
    var r = vd.compare({ name: 'a.puml', current: stub, previous: FULL });
    expect(r.verdict).toBe('lost');
    expect(r.lost).toBe(7);
  });
});

describe('versionDiff.report', () => {
  var entries = [
    { name: 'ok.puml', current: FULL, previous: FULL, stamp: '20260913-031500' },
    { name: 'new.puml', current: TEMPLATE, previous: null, stamp: '' },
    { name: 'plantuml-class.puml', current: TEMPLATE, previous: FULL, stamp: '20260914-001252' },
  ];

  test('疑いのある図が先頭に来る', () => {
    var rep = vd.report(entries);
    expect(rep.rows[0].name).toBe('plantuml-class.puml');
    expect(rep.suspects.map((s) => s.name)).toEqual(['plantuml-class.puml']);
    expect(rep.total).toBe(3);
  });

  test('要約は、疑いの図と戻し先の版を名指しする', () => {
    var text = vd.formatSummary(vd.report(entries), 2);
    expect(text).toContain('⚠ plantuml-class.puml  別の図で塗り潰された疑い');
    expect(text).toContain('疑い 1 件 / 3 枚');
    // 戻し先は server の `type` と同じ綴り (拡張子を付けない)。
    expect(text).toContain('plantuml-class@20260914-001252');
    // 差分行は上限どおりに打ち切り、残りの本数を言う。
    expect(text).toContain('… 他 ');
  });

  test('対象が 1 枚も無くても落ちない', () => {
    expect(vd.formatSummary(vd.report([]))).toContain('対象の .puml がありません');
  });
});
