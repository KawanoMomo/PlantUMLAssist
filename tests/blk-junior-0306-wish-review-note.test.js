'use strict';
// BLK-junior-20260913-0306-wish: reviewer の指摘.md を読み、そこに書かれた図名を
// 自分と先輩の保存フォルダから自動で見つけ、並べて見る画面をその組で開く。
// ここでは「1 件に切る」「実在する図名だけを拾う」「2 人が持つ名前を組にする」を守る。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/review-note.js'].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var RN = global.window.MA.reviewNote;

// reviewer が実際に書く形 (自由文、見出しに【】、図名は本文の中に混ざる)。
var NOTE = [
  '# junior への指摘(reviewer runs/20260913-0306 時点)',
  '自分宛の分だけ読んでください。',
  '',
  '## 【継続】junior/primary 間 gpio_init_sequence の部品名不一致',
  'junior 側 `Gpio`(2行のみ)/ primary 側 `Gpio_Driver` 詳細化、のまますり合わせ未反映。',
  'md5: 70bc06fa662e369d0b8da6a0596f766a',
  '',
  '### 内訳',
  '- participant の粒度が違う',
  '',
  '## 【要対応】gpio_state.svg が実体と食い違う',
  'render 結果と保存済みが不一致。再エクスポート待ち。',
  '',
  '## 【参考】timer_init_sequence は問題なし',
  'そのままで構いません。',
].join('\n');

// 保存フォルダの実際の並び。gpio_init_sequence は 2 人が持ち、gpio_state は junior だけ。
var DOCS = [
  { name: 'junior/gpio_init_sequence.puml', _dir: 'D:/pd/junior', _file: 'gpio_init_sequence' },
  { name: 'junior/gpio_state.puml', _dir: 'D:/pd/junior', _file: 'gpio_state' },
  { name: 'primary/gpio_init_sequence.puml', _dir: 'D:/pd/primary', _file: 'gpio_init_sequence' },
  { name: 'primary/driver_common_class.puml', _dir: 'D:/pd/primary', _file: 'driver_common_class' },
];

describe('reviewNote: 指摘.md を 1 件ずつに切る', function() {
  test('## 見出しの数だけ件になる (題と前書きは件にしない)', function() {
    var f = RN.parse(NOTE);
    expect(f.length).toBe(3);
    expect(f[0].heading).toBe('junior/primary 間 gpio_init_sequence の部品名不一致');
    expect(f[2].heading).toBe('timer_init_sequence は問題なし');
  });

  test('見出しの【】は印として残り、本文からは外れる', function() {
    var f = RN.parse(NOTE);
    expect(f[0].marks[0]).toBe('継続');
    expect(f[1].marks[0]).toBe('要対応');
    expect(f[0].heading.indexOf('【')).toBe(-1);
  });

  test('### 小見出しは親の件の本文に入る (件を増やさない)', function() {
    var f = RN.parse(NOTE);
    expect(f[0].body.indexOf('participant の粒度が違う') >= 0).toBe(true);
  });

  test('見出しが 1 つも無ければ 0 件', function() {
    expect(RN.parse('指摘はありません').length).toBe(0);
  });
});

describe('reviewNote: 図名の突き合わせ', function() {
  var idx;
  beforeEach(function() { idx = RN.index(DOCS); });

  test('保存フォルダに実在する名前だけを拾う (md5 値は拾わない)', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    var names = rows[0].docs.map(function(d) { return d.name; });
    expect(names.join(',')).toBe('gpio_init_sequence');
  });

  test('2 人が同じ名前を持つ指摘は、その組で並べられる', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    expect(rows[0].ready).toBe(true);
    expect(rows[0].pairs[0].base).toBe('gpio_init_sequence');
    expect(rows[0].pairs[0].a).toBe('junior');
    expect(rows[0].pairs[0].b).toBe('primary');
  });

  test('片方にしか無い図は組にならず、理由が読める', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    expect(rows[1].ready).toBe(false);
    expect(rows[1].docs[0].name).toBe('gpio_state');
    expect(RN.rowLabel(rows[1]).indexOf('junior にしかありません') >= 0).toBe(true);
  });

  test('保存フォルダに無い図名の指摘は、図名なしとして出る', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    expect(rows[2].docs.length).toBe(0);
    expect(RN.rowLabel(rows[2]).indexOf('図の名前が書かれていません') >= 0).toBe(true);
  });

  test('短い名前が長い名前に含まれるときは長い方だけを採る', function() {
    var docs = DOCS.concat([
      { name: 'junior/gpio_state_detail.puml', _dir: 'D:/pd/junior', _file: 'gpio_state_detail' },
      { name: 'primary/gpio_state_detail.puml', _dir: 'D:/pd/primary', _file: 'gpio_state_detail' },
    ]);
    var rows = RN.rows(RN.parse('## ずれ\ngpio_state_detail を見てください'), RN.index(docs));
    expect(rows[0].docs.map(function(d) { return d.name; }).join(',')).toBe('gpio_state_detail');
  });

  test('見出しに書かれた図名も拾う (本文に無くても組になる)', function() {
    var rows = RN.rows(RN.parse('## driver_common_class の階層が消えている\n復元してください'), RN.index(DOCS));
    expect(rows[0].docs[0].name).toBe('driver_common_class');
    expect(rows[0].ready).toBe(false);
  });

  test('見出しは「押したら何が出るか」を言い切る', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    expect(RN.rowLabel(rows[0]))
      .toBe('junior/primary 間 gpio_init_sequence の部品名不一致 — gpio_init_sequence (junior ⇔ primary) を並べる');
  });

  test('一覧の見出しは、1 クリックで開ける件数を先に言う', function() {
    var rows = RN.rows(RN.parse(NOTE), idx);
    expect(RN.summaryText(rows)).toBe('指摘 3 件 / うち 1 件はクリック 1 回で並べて見られます');
    expect(RN.summaryText([])).toBe('指摘.md がありません');
  });
});

// 追記 (junior run 20260914-0906): 指摘.md に名前の挙がらない図を開いたとき、
// 「本当に指摘が無いか」を確かめるのに指摘.md を全文読み直していた。
describe('reviewNote: 指摘の無い図と言い切る', function() {
  var rows;
  beforeEach(function() { rows = RN.rows(RN.parse(NOTE), RN.index(DOCS)); });

  test('名前が挙がっている図は、どの指摘かを名指しで返す', function() {
    var st = RN.docStatus(rows, 'gpio_init_sequence', []);
    expect(st.clear).toBe(false);
    expect(st.text.indexOf('部品名不一致') >= 0).toBe(true);
  });

  test('名前が 1 件も挙がっていない図は「指摘はありません」', function() {
    var st = RN.docStatus(rows, 'driver_common_class', []);
    expect(st.clear).toBe(true);
    expect(st.text).toBe('driver_common_class への指摘はありません (指摘.md に名前が挙がっていません)');
  });

  test('図に残る判断の注記 (domain-verdict) も一緒に出す', function() {
    var st = RN.docStatus(rows, 'driver_common_class', [
      { folder: 'primary', dsl: "@startuml\n' domain-verdict: separate gpio vs junior\n@enduml" },
    ]);
    expect(st.notes.length).toBe(1);
    expect(st.text.indexOf('primary: domain-verdict: separate gpio vs junior') >= 0).toBe(true);
  });

  test('同じ注記が両側にあっても 1 回しか出さない', function() {
    var dsl = "@startuml\n' domain-verdict: separate gpio vs junior\n@enduml";
    var st = RN.docStatus(rows, 'gpio_state', [
      { folder: 'junior', dsl: dsl }, { folder: 'junior', dsl: dsl },
    ]);
    expect(st.notes.length).toBe(1);
  });

  test('注記でない普通のコメントは拾わない', function() {
    expect(RN.verdictNotes("@startuml\n' メモ\n@enduml").length).toBe(0);
  });
});

describe('reviewNote: どの .md を読むか', function() {
  test('reviewer のフォルダのものを先に選ぶ', function() {
    var picked = RN.pickNote([
      { folder: 'junior', name: 'メモ.md', text: 'x' },
      { folder: 'reviewer', name: '指摘.md', text: 'y' },
    ]);
    expect(picked.folder).toBe('reviewer');
  });

  test('空のファイルは選ばない', function() {
    expect(RN.pickNote([{ folder: 'reviewer', name: '指摘.md', text: '' }])).toBe(null);
    expect(RN.pickNote([])).toBe(null);
  });
});
