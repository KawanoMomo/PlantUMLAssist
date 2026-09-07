'use strict';
// BLK-reviewer-20260908-0203: --since は「監査対象になる指摘」の増減しか見ない
// ので、新規指摘が実データ (ドメインの図) の変更によるものか、対象外扱いの
// テンプレ (plantuml-*.puml / diagram1.puml) の汚染によるものかを区別できず、
// テンプレの内容がまるごと差し替わっても差分に現れなかった。切り分けは 22 枚を
// 1 枚ずつ手で diff するしかない。ファイルの分類と内容の指紋で、その往復を消す。
const assert = require('assert');
const scope = require('../src/core/audit-scope');
const report = require('../tools/audit-report');

function docs(over) {
  return [
    { name: 'adc_state.puml', dsl: '@startuml\nstate Idle\n@enduml' },
    { name: 'spi_state.puml', dsl: '@startuml\nstate Init\n@enduml' },
    { name: 'plantuml-class.puml', dsl: '@startuml\nclass Foo\n@enduml' },
    { name: 'diagram1.puml', dsl: '@startuml\ntitle Sample\n@enduml' },
  ].map(function(d) { return Object.assign({}, d, (over || {})[d.name] || {}); });
}

describe('ファイルの分類', function() {
  test('ドメインの図は実データ', function() {
    assert.strictEqual(scope.classify('adc_state.puml').kind, 'data');
    assert.strictEqual(scope.classify('primary/driver_common_class.puml').kind, 'data');
  });

  test('同梱テンプレと新規タブの既定サンプルはテンプレ (理由つき)', function() {
    assert.strictEqual(scope.classify('plantuml-sequence.puml').kind, 'template');
    assert.strictEqual(scope.classify('plantuml-sequence.puml').reason, 'アプリ同梱テンプレ');
    assert.strictEqual(scope.classify('diagram1.puml').kind, 'template');
    assert.strictEqual(scope.classify('diagram.puml').kind, 'template');
  });

  test('フォルダ付きの名前でも、区切りが / でも円記号でも同じ分類になる', function() {
    assert.strictEqual(scope.classify('primary/plantuml-state.puml').kind, 'template');
    assert.strictEqual(scope.classify('primary' + String.fromCharCode(92) + 'plantuml-state.puml').kind, 'template');
  });

  test('分類は名前で決める (中身が変わっても分類は動かない)', function() {
    // 中身で判定すると、テンプレの汚染が「テンプレが減って実データが増えた」に
    // 化けて、いちばん知りたい「テンプレが変わった」が読めなくなる。
    const a = scope.fileEntries([{ name: 'plantuml-class.puml', dsl: '@startuml\nclass Foo\n@enduml' }])[0];
    const b = scope.fileEntries([{ name: 'plantuml-class.puml', dsl: '@startuml\nstate Bar\n@enduml' }])[0];
    assert.strictEqual(a.kind, 'template');
    assert.strictEqual(b.kind, 'template');
    assert.notStrictEqual(a.hash, b.hash);
  });
});

describe('内容の指紋', function() {
  test('同じ内容なら同じ、1 文字違えば違う', function() {
    assert.strictEqual(scope.fingerprint('@startuml\nA\n@enduml'), scope.fingerprint('@startuml\nA\n@enduml'));
    assert.notStrictEqual(scope.fingerprint('@startuml\nA\n@enduml'), scope.fingerprint('@startuml\nB\n@enduml'));
  });

  test('並べ替えただけの内容も別の指紋になる', function() {
    assert.notStrictEqual(scope.fingerprint('ab'), scope.fingerprint('ba'));
  });

  test('空でも例外を投げない', function() {
    assert.strictEqual(typeof scope.fingerprint(''), 'string');
    assert.strictEqual(typeof scope.fingerprint(null), 'string');
  });
});

describe('レポートに載るファイル一覧', function() {
  test('docs (名前だけ) は残したまま、files に分類と指紋が載る', function() {
    const r = report.buildReport({}, docs(), { targets: ['t'] });
    assert.deepStrictEqual(r.docs, ['adc_state.puml', 'spi_state.puml', 'plantuml-class.puml', 'diagram1.puml']);
    assert.strictEqual(r.files.length, 4);
    assert.strictEqual(r.files.filter(function(f) { return f.kind === 'data'; }).length, 2);
    assert.strictEqual(r.files.filter(function(f) { return f.kind === 'template'; }).length, 2);
    assert.ok(r.files[0].hash && r.files[0].bytes > 0);
  });
});

describe('前回との内容差分', function() {
  const prev = scope.fileEntries(docs());

  test('テンプレだけが汚染された run を、実データ 0 枚変化として出す', function() {
    const cur = scope.fileEntries(docs({ 'plantuml-class.puml': { dsl: '@startuml\nclass Bar\n@enduml' } }));
    const fd = scope.diffFiles(prev, cur);
    assert.strictEqual(fd.dataChanged.length, 0);
    assert.strictEqual(fd.templateChanged.length, 1);
    assert.strictEqual(fd.templateChanged[0].name, 'plantuml-class.puml');
  });

  test('実データだけが変わった run は、テンプレ 0 枚変化として出る', function() {
    const cur = scope.fileEntries(docs({ 'adc_state.puml': { dsl: '@startuml\nstate Idle\nstate Done\n@enduml' } }));
    const fd = scope.diffFiles(prev, cur);
    assert.strictEqual(fd.dataChanged.length, 1);
    assert.strictEqual(fd.templateChanged.length, 0);
  });

  test('増えた図・消えた図も分類ごとに数える', function() {
    const cur = scope.fileEntries(docs().slice(1).concat([{ name: 'uart_state.puml', dsl: '@startuml\nstate U\n@enduml' }]));
    const fd = scope.diffFiles(prev, cur);
    assert.strictEqual(fd.dataAdded.length, 1);
    assert.strictEqual(fd.dataRemoved.length, 1);
    assert.strictEqual(fd.templateAdded.length, 0);
  });

  test('前回に files が無ければ null (「変化なし」と混ぜない)', function() {
    assert.strictEqual(scope.diffFiles(undefined, prev), null);
    assert.strictEqual(scope.diffFiles([], prev), null);
  });
});

describe('--summary に出る行', function() {
  function summaryOf(prevDocs, curDocs) {
    const cur = report.buildReport({}, curDocs, { targets: ['t'] });
    const prv = report.buildReport({}, prevDocs, { targets: ['t'] });
    return report.formatSummary(cur, prv);
  }

  test('テンプレ汚染の run は「実データは無変更」と読める', function() {
    const s = summaryOf(docs(), docs({ 'diagram1.puml': { dsl: '@startuml\nclass Whatever\n@enduml' } }));
    assert.ok(s.indexOf('実データ 0 枚変化 / テンプレ 1 枚変化') >= 0, s);
    assert.ok(s.indexOf('diagram1.puml') >= 0, s);
    assert.ok(s.indexOf('実データは無変更') >= 0, s);
  });

  test('実データが動いた run は「テンプレは無変更」と読める', function() {
    const s = summaryOf(docs(), docs({ 'spi_state.puml': { dsl: '@startuml\nstate Z\n@enduml' } }));
    assert.ok(s.indexOf('実データ 1 枚変化 / テンプレ 0 枚変化') >= 0, s);
    assert.ok(s.indexOf('テンプレは無変更') >= 0, s);
  });

  test('何も動いていない run は 1 行で言い切る', function() {
    const s = summaryOf(docs(), docs());
    assert.ok(s.indexOf('ファイル内容: 前回から変化なし') >= 0, s);
  });

  test('枚数の内訳は毎回出る (0 件を「見ていない」と読み違えないため)', function() {
    const s = summaryOf(docs(), docs());
    assert.ok(s.indexOf('内訳: 実データ 2 枚 / テンプレ 2 枚') >= 0, s);
  });

  test('files を持たない古い JSON と比べても落ちず、追えないことを言う', function() {
    const cur = report.buildReport({}, docs(), { targets: ['t'] });
    const old = report.buildReport({}, docs(), { targets: ['t'] });
    delete old.files;
    const s = report.formatSummary(cur, old);
    assert.ok(s.indexOf('ファイル指紋が無く') >= 0, s);
  });

  test('前回そのものが無ければファイル差分の行は足さない', function() {
    const cur = report.buildReport({}, docs(), { targets: ['t'] });
    const s = report.formatSummary(cur, null);
    assert.ok(s.indexOf('前回の監査結果が無い') >= 0, s);
    assert.ok(s.indexOf('ファイル内容:') < 0, s);
  });
});

// 追記 (BLK-reviewer-20260908-0203 の 0723 追記分): 指紋を載せる前に採った JSON と
// 比べる run は「追えない」で終わり、その 1 回だけは 22 枚の手 diff に戻っていた。
// 前回の図がフォルダで残っているなら、そこから指紋を採り直して同じ 1 回で出す。
describe('指紋を持たない前回との比較', function() {
  function summaryOf(prev, cur, opts) {
    return report.formatSummary(report.buildReport({}, cur, { targets: ['t'] }), prev, opts);
  }

  test('名前だけの前回でも、追加・消失は同じ 1 回で言える', function() {
    const old = report.buildReport({}, docs(), { targets: ['t'] });
    delete old.files;                       // 指紋を載せる前の JSON
    const cur = docs().concat([{ name: 'pwm_state.puml', dsl: '@startuml\nstate P\n@enduml' }]);
    const s = summaryOf(old, cur);
    assert.ok(s.indexOf('名前の増減だけ比較した') >= 0, s);
    assert.ok(s.indexOf('追加: pwm_state.puml') >= 0, s);
    assert.ok(s.indexOf('(実データ 1 / テンプレ 0)') >= 0, s);
  });

  test('内容が変わっていても、名前だけの前回では「変化なし」と言わない', function() {
    const old = report.buildReport({}, docs(), { targets: ['t'] });
    delete old.files;
    const s = summaryOf(old, docs({ 'diagram1.puml': { dsl: '@startuml\nclass X\n@enduml' } }));
    assert.ok(s.indexOf('前回から変化なし') < 0, s);
    assert.ok(s.indexOf('名前の増減はなし') >= 0, s);
    assert.ok(s.indexOf('--since-files') >= 0, s);   // 内容まで見る手を示す
  });

  test('前回の図フォルダを渡せば、その run から内容変化を切り分けられる', function() {
    const old = report.buildReport({}, docs(), { targets: ['t'] });
    delete old.files;
    const prevFiles = scope.fileEntries(docs());     // 控えのフォルダから採り直した指紋
    const s = summaryOf(old, docs({ 'diagram1.puml': { dsl: '@startuml\nclass X\n@enduml' } }),
      { prevFiles: prevFiles, prevFilesFrom: 'runs/前回/tmp' });
    assert.ok(s.indexOf('ファイル内容の比較元: runs/前回/tmp') >= 0, s);
    assert.ok(s.indexOf('実データ 0 枚変化 / テンプレ 1 枚変化') >= 0, s);
    assert.ok(s.indexOf('テンプレ変化: diagram1.puml') >= 0, s);
  });

  test('採り直した指紋は、指紋入りの前回 JSON より優先する', function() {
    const prv = report.buildReport({}, docs(), { targets: ['t'] });
    // JSON 側は「変化なし」に見えるが、控えのフォルダは spi_state が別内容だった
    const prevFiles = scope.fileEntries(docs({ 'spi_state.puml': { dsl: '@startuml\nstate OLD\n@enduml' } }));
    const s = summaryOf(prv, docs(), { prevFiles: prevFiles });
    assert.ok(s.indexOf('実データ 1 枚変化') >= 0, s);
  });

  test('baselineFiles は 指紋入り JSON > 名前だけ > 無し の順で土台を選ぶ', function() {
    const withFiles = report.buildReport({}, docs(), { targets: ['t'] });
    assert.strictEqual(report.baselineFiles(withFiles, {}), withFiles.files);
    const namesOnly = report.buildReport({}, docs(), { targets: ['t'] });
    delete namesOnly.files;
    const base = report.baselineFiles(namesOnly, {});
    assert.strictEqual(base.length, 4);
    assert.strictEqual(base[0].hash, null);
    assert.strictEqual(report.baselineFiles(null, {}), null);
  });

  test('contentComparable が false の差分は changed を作らない', function() {
    const prevNames = scope.entriesFromNames(docs().map(function(d) { return d.name; }));
    const fd = scope.diffFiles(prevNames, scope.fileEntries(docs({ 'spi_state.puml': { dsl: 'x' } })));
    assert.strictEqual(fd.contentComparable, false);
    assert.strictEqual(fd.changed.length, 0);
    assert.strictEqual(fd.touched, 0);
  });
});
