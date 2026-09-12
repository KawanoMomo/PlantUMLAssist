'use strict';
// BLK-reviewer-20260912-2206: 手順 4(拡張) で junior/primary の同名図を突き合わせたとき、
// CLI が出すのは「gpio ドメインが食い違い」までで、食い違っている名前そのもの
// (`Gpio` vs `Gpio_Driver`) は出なかった。reviewer は毎回 2 フォルダから同名ファイルを
// 開いて手 diff し、そこで初めて不一致に気づいていた。
// 突合結果に組ごとの名前差を載せ、同名ファイルの組を先頭に置く。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/scope-decl.js',
  '../src/core/family-audit.js',
  '../src/core/audit-scope.js',
  '../src/core/domain-verdict.js',
  '../src/core/domain-cohort.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var dc = global.window.MA.domainCohort;

function seq(participants, messages) {
  return ['@startuml']
    .concat(participants.map(function(p) { return 'participant ' + p; }))
    .concat(messages)
    .concat(['@enduml']).join('\n');
}

// reviewer が実際に突き合わせた 2 枚。同名ファイルで、participant 名が食い違う。
var SAME_NAME = [
  {
    name: 'junior/gpio_init_sequence.puml',
    dsl: seq(['Gpio', 'Hw_Ctrl'], ['Gpio -> Hw_Ctrl : Init']),
  },
  {
    name: 'primary/gpio_init_sequence.puml',
    dsl: seq(['Gpio_Driver', 'Hw_Ctrl'], ['Gpio_Driver -> Hw_Ctrl : Gpio_Init']),
  },
];

describe('BLK-reviewer-20260912-2206 ドメイン突合が名前差そのものを出す', function() {
  test('同名ファイルの組は、食い違っている部品名を左右どちら側かまで名指しする', function() {
    var rows = dc.diffRows(dc.audit(SAME_NAME));
    expect(rows.length).toBe(1);
    var r = rows[0];
    expect(r.sameBase).toBe(true);
    expect(r.leftFolder).toBe('junior');
    expect(r.rightFolder).toBe('primary');
    // 手 diff で見つけていたものが、そのまま行に載る。
    expect(r.names.onlyA).toContain('Gpio');
    expect(r.names.onlyB).toContain('Gpio_Driver');
    // 両方にある名前は差分に数えない (直す所だけを読む)。
    expect(r.names.both).toContain('Hw_Ctrl');
  });

  test('行の文面に、フォルダ名と食い違った名前の両方が入る', function() {
    var rows = dc.diffRows(dc.audit(SAME_NAME));
    var text = dc.diffRowText(rows[0]);
    expect(text).toContain('[同名]');
    expect(text).toContain('junior だけ: Gpio');
    expect(text).toContain('primary だけ: Gpio_Driver');
    // 部品名とラベルは直し方が違うので、1 行の中でも分けて出す。
    expect(text).toContain('部品名:');
    expect(text).toContain('ラベル:');
  });

  test('audit() の結果に差分行が入り、文面まで作られている', function() {
    var out = dc.audit(SAME_NAME);
    expect(out.diffRows.length).toBe(1);
    expect(out.diffRows[0].text).toContain('Gpio_Driver');
  });

  test('同名ファイルの組は、ドメインが同じだけの組より先に並ぶ', function() {
    var docs = SAME_NAME.concat([
      { name: 'junior/gpio_read_sequence.puml', dsl: seq(['Gpio', 'Hw_Ctrl'], ['Gpio -> Hw_Ctrl : Read']) },
    ]);
    var rows = dc.diffRows(dc.audit(docs));
    // 3 枚で組は 2 つ (junior 2 枚 × primary 1 枚)。同名の組が先頭。
    expect(rows.length).toBe(2);
    expect(rows[0].sameBase).toBe(true);
    expect(rows[1].sameBase).toBe(false);
  });

  test('揃っている組は既定で出さない。all を渡せば出る', function() {
    var same = [
      { name: 'junior/gpio_init_sequence.puml', dsl: seq(['Gpio', 'Hw'], ['Gpio -> Hw : Init']) },
      { name: 'primary/gpio_init_sequence.puml', dsl: seq(['Gpio', 'Hw'], ['Gpio -> Hw : Init']) },
    ];
    var out = dc.audit(same);
    expect(dc.diffRows(out).length).toBe(0);
    var all = dc.diffRows(out, { all: true });
    expect(all.length).toBe(1);
    expect(dc.diffRowText(all[0])).toContain('差分なし');
  });

  test('別物と宣言済みの組は既定で出さない (決着済みを毎回読ませない)', function() {
    var declared = [
      {
        name: 'junior/gpio_init_sequence.puml',
        dsl: ["@startuml", "' domain-verdict: separate gpio vs primary", 'participant Gpio', 'Gpio -> Hw : Init', '@enduml'].join('\n'),
      },
      {
        name: 'primary/gpio_init_sequence.puml',
        dsl: ["@startuml", "' domain-verdict: separate gpio vs junior", 'participant Gpio_Driver', 'Gpio_Driver -> Hw : Gpio_Init', '@enduml'].join('\n'),
      },
    ];
    var out = dc.audit(declared);
    expect(out.declared).toBe(1);
    expect(dc.diffRows(out).length).toBe(0);
  });

  test('長い名前の並びは打ち切り、打ち切った件数を必ず添える', function() {
    var many = [
      { name: 'junior/gpio_init_sequence.puml', dsl: seq(['A1', 'A2', 'A3', 'A4'], ['A1 -> A2 : x']) },
      { name: 'primary/gpio_init_sequence.puml', dsl: seq(['B1', 'B2', 'B3', 'B4'], ['B1 -> B2 : y']) },
    ];
    var text = dc.diffRowText(dc.diffRows(dc.audit(many))[0], 2);
    expect(text).toContain('ほか 2 件');
  });
});

// CLI 側。reviewer が打つのは `npm run audit -- --cohort <2 フォルダ>` の 1 本だけなので、
// 名前差がその出力に出ること自体をここで固定する (モジュールが返すだけでは手 diff は消えない)。
describe('BLK-reviewer-20260912-2206 --cohort の出力に名前差が出る', function() {
  var loadMA = require('../tools/audit-runtime').loadMA;
  var report = require('../tools/audit-report');
  var cli = require('../tools/audit');

  function summaryOf(docs, options) {
    var rt = loadMA();
    var r = report.buildReport(rt.MA, docs, { targets: ['junior', 'primary'], only: ['cohort'] });
    return report.formatSummary(r, undefined, options);
  }

  test('食い違った部品名が要約の行に出る', function() {
    var out = summaryOf(SAME_NAME);
    expect(out).toContain('差分:');
    expect(out).toContain('junior だけ: Gpio');
    expect(out).toContain('primary だけ: Gpio_Driver');
  });

  test('組が多いときは既定 10 組で打ち切り、残り件数を言う', function() {
    var docs = [];
    for (var i = 0; i < 12; i++) {
      docs.push({ name: 'junior/d' + i + '_init_sequence.puml', dsl: seq(['A' + i], ['A' + i + ' -> A' + i + ' : x']) });
      docs.push({ name: 'primary/d' + i + '_init_sequence.puml', dsl: seq(['B' + i], ['B' + i + ' -> B' + i + ' : y']) });
    }
    var out = summaryOf(docs);
    expect(out).toContain('ほか 2 組');
    // --pairs-max で伸ばせば打ち切りの行は消える。
    expect(summaryOf(docs, { pairsMax: Infinity })).not.toContain('ほか 2 組');
  });

  test('--pairs-max を読む。0 は全部、数でなければ落とす', function() {
    expect(cli.parseArgs(['x', '--pairs-max', '3']).pairsMax).toBe(3);
    expect(cli.parseArgs(['x', '--pairs-max=0']).pairsMax).toBe(Infinity);
    expect(function() { cli.parseArgs(['x', '--pairs-max', 'abc']); }).toThrow();
  });

  test('--personas はペルソナ名を並びとして読む', function() {
    expect(cli.parseArgs(['--personas', 'junior,primary']).personas).toEqual(['junior', 'primary']);
    expect(cli.parseArgs(['--personas=junior, primary']).personas).toEqual(['junior', 'primary']);
    // 毎 tick 打つので 1 文字の別名も同じものを指す。
    expect(cli.parseArgs(['-p', 'junior,primary']).personas).toEqual(['junior', 'primary']);
  });

  test('--personas はフォルダを渡す。無いペルソナ名は 1 で落ちる', function() {
    var fs = require('fs');
    var os = require('os');
    var path = require('path');
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-personas-'));
    fs.mkdirSync(path.join(root, 'junior'));
    fs.mkdirSync(path.join(root, 'primary'));
    // 控えフォルダ。フォルダを渡しても突合の対象に混ざらないことを固定する。
    fs.mkdirSync(path.join(root, 'junior', '_versions'));
    fs.writeFileSync(path.join(root, 'junior', 'gpio_init_sequence.puml'), SAME_NAME[0].dsl, 'utf-8');
    fs.writeFileSync(path.join(root, 'junior', '_versions', 'gpio_init_sequence.puml'), SAME_NAME[0].dsl, 'utf-8');
    fs.writeFileSync(path.join(root, 'primary', 'gpio_init_sequence.puml'), SAME_NAME[1].dsl, 'utf-8');

    var prevRoot = process.env.PUA_PERSONA_DATA;
    var lines = [];
    var log = console.log, err = console.error;
    console.log = function(s) { lines.push(String(s)); };
    console.error = function(s) { lines.push(String(s)); };
    var code, bad;
    try {
      process.env.PUA_PERSONA_DATA = root;
      code = cli.main(['--cohort', '--personas', 'junior,primary', '--no-state']);
      bad = cli.main(['--cohort', '--personas', 'nosuch', '--no-state']);
    } finally {
      console.log = log;
      console.error = err;
      if (prevRoot === undefined) delete process.env.PUA_PERSONA_DATA;
      else process.env.PUA_PERSONA_DATA = prevRoot;
    }
    expect(code).toBe(0);
    var out = lines.join('\n');
    // 2 フォルダなので名前の先頭 1 段がフォルダ名になり、突合が成立する。
    expect(out).toContain('junior だけ: Gpio');
    expect(out).toContain('primary だけ: Gpio_Driver');
    // 控えを拾っていたら 3 枚になる。
    expect(out).toContain('図 2 枚');
    expect(bad).toBe(1);
  });
});
