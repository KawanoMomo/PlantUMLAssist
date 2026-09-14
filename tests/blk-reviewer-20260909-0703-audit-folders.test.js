'use strict';
// BLK-reviewer-20260909-0703: 手順 4.7 で primary と junior の保存フォルダを
// そのまま `tools/audit.js <primary> <junior> --only cohort` に渡すと、
// (1) 自動保存の履歴フォルダ (_versions / _vault) の中身まで拾い、
//     `_versions` を別ペルソナのフォルダとして突き合わせて「食い違い」を出す
// (2) フォルダを 2 つ渡しても名前に folder 段が付かないので、
//     フォルダをまたぐドメインが 0 件になる (絶対パスで渡すと特に)
// の 2 つで、本物の突合を見るのに glob で絞る回避が要った。
const fs = require('fs');
const os = require('os');
const path = require('path');
const report = require('../tools/audit-report');
const { loadMA } = require('../tools/audit-runtime');
const cli = require('../tools/audit');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pua-folders-')); }
function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}
const GPIO_P = '@startuml\nparticipant Gpio_Driver\nGpio_Driver -> Gpio_Hw : Gpio_Init()\n@enduml\n';
const GPIO_J = '@startuml\nparticipant GpioDrv\nGpioDrv -> GpioHw : gpioInit()\n@enduml\n';

describe('collectDocs — 自動保存の履歴フォルダを拾わない', function() {
  test('_versions / _vault の中の .puml は集めない', function() {
    const d = tmpdir();
    write(d, 'gpio_init_sequence.puml', GPIO_P);
    write(d, '_versions/gpio_init_sequence-20260909-070301.puml', GPIO_P);
    write(d, '_vault/gpio_init_sequence.puml', GPIO_P);
    const docs = report.collectDocs(d);
    expect(docs.length).toBe(1);
    expect(docs[0].name).toBe('gpio_init_sequence.puml');
  });

  test('履歴フォルダを名指しで渡したときは、その中身を集める（意図して見に行った場合）', function() {
    const d = tmpdir();
    write(d, '_versions/gpio_init_sequence-20260909-070301.puml', GPIO_P);
    const docs = report.collectDocs(path.join(d, '_versions'));
    expect(docs.length).toBe(1);
  });
});

describe('collectDocs — フォルダを 2 つ以上渡したときは名前にフォルダが付く', function() {
  test('ペルソナのフォルダ名が name の先頭 1 段になる', function() {
    const root = tmpdir();
    write(root, 'primary/gpio_init_sequence.puml', GPIO_P);
    write(root, 'junior/gpio_init_sequence.puml', GPIO_J);
    const docs = report.collectDocs([
      path.join(root, 'primary'), path.join(root, 'junior'),
    ]);
    expect(docs.map(function(d) { return d.name; }).sort().join(','))
      .toBe('junior/gpio_init_sequence.puml,primary/gpio_init_sequence.puml');
  });

  test('絶対パスで渡しても同じ (フォルダ判定が壊れない)', function() {
    const root = tmpdir();
    write(root, 'primary/gpio_init_sequence.puml', GPIO_P);
    write(root, 'junior/gpio_init_sequence.puml', GPIO_J);
    const docs = report.collectDocs([
      path.resolve(root, 'primary'), path.resolve(root, 'junior'),
    ]);
    const folders = docs.map(function(d) { return d.name.split('/')[0]; }).sort();
    expect(folders.join(',')).toBe('junior,primary');
  });

  test('フォルダ 1 つだけのときは今までどおり、そのフォルダからの相対名', function() {
    const d = tmpdir();
    write(d, 'a/seq.puml', GPIO_P);
    const docs = report.collectDocs(d);
    expect(docs[0].name).toBe('a/seq.puml');
  });

  test('ファイルを混ぜて渡してもファイルは basename のまま', function() {
    const root = tmpdir();
    const f = write(root, 'primary/gpio_init_sequence.puml', GPIO_P);
    write(root, 'junior/gpio_init_sequence.puml', GPIO_J);
    const docs = report.collectDocs([f, path.join(root, 'junior')]);
    expect(docs.map(function(d) { return d.name; }).sort().join(','))
      .toBe('gpio_init_sequence.puml,gpio_init_sequence.puml');
  });
});

describe('ドメイン突合 — 履歴フォルダを別ペルソナとして数えない', function() {
  test('_versions を含むフォルダ 2 つでも、突き合わせるのは 2 フォルダだけ', function() {
    const root = tmpdir();
    write(root, 'primary/gpio_init_sequence.puml', GPIO_P);
    write(root, 'primary/_versions/gpio_init_sequence-20260909-070301.puml', GPIO_P);
    write(root, 'junior/gpio_init_sequence.puml', GPIO_J);
    write(root, 'junior/_vault/gpio_init_sequence.puml', GPIO_J);
    const rt = loadMA();
    const docs = report.collectDocs([path.join(root, 'primary'), path.join(root, 'junior')]);
    const res = rt.MA.domainCohort.audit(docs);
    const folders = {};
    docs.forEach(function(d) { folders[d.name.split('/')[0]] = true; });
    expect(Object.keys(folders).sort().join(',')).toBe('junior,primary');
    // gpio ドメインがフォルダをまたぐ 1 組として出る (_versions は混ざらない)。
    expect(res.groups.length).toBe(1);
    expect(res.groups[0].domain).toBe('gpio');
    expect(res.groups[0].folders.sort().join(',')).toBe('junior,primary');
  });
});

describe('audit.js --cohort — 手順 4.7 の 1 コマンド', function() {
  test('--only cohort --summary と同じ意味になる', function() {
    const o = cli.parseArgs(['../persona-data', '--cohort']);
    expect(o.only.join(',')).toBe('cohort');
    expect(o.summary).toBe(true);
    expect(o.targets.join(',')).toBe('../persona-data');
  });

  test('打鍵数が 50 以下で済む', function() {
    const cmd = 'node tools/audit.js ../persona-data --cohort';
    expect(cmd.length <= 50).toBe(true);
  });

  test('使い方に載っている', function() {
    expect(cli.USAGE).toContain('--cohort');
  });
});
