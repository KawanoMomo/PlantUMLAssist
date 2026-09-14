'use strict';
// BLK-junior-20260914-1206-wish: 指摘.md に言及の無い図でも、junior は自分と先輩の
// 両方を開いて突き合わせ「対応不要」を自分で判定していた。指摘.md を一覧の側から
// 読み、図 1 枚ずつに 対象外 / ⚠未確認 / ✅対応済み を付ける。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/component-pack.js', '../src/core/review-note.js',
 '../src/core/finding-actions.js', '../src/core/finding-variant.js',
 '../src/core/note-board.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var NB = global.window.MA.noteBoard;
var RN = global.window.MA.reviewNote;
var FV = global.window.MA.findingVariant;

// junior の保存フォルダの並び (8 周目の GPIO)。
var NAMES = [
  'gpio_init_sequence',
  'gpio_state',
  'gpio_component',
  'GPIOドライバ初期化アクティビティ図',
  'GPIOドライバ初期化アクティビティ図(資料用)',
];

var KINDS = {
  'gpio_init_sequence': 'シーケンス図',
  'gpio_state': '状態遷移図',
  'gpio_component': 'コンポーネント図',
  'GPIOドライバ初期化アクティビティ図': 'アクティビティ図',
  'GPIOドライバ初期化アクティビティ図(資料用)': 'アクティビティ図',
};

var NOTE = [
  '# junior への指摘',
  '自分宛の分だけ読んでください。',
  '',
  '## 【継続】gpio_init_sequence の部品名不一致',
  'junior 側 `Gpio` / primary 側 `Gpio_Driver`。`Gpio` を `Gpio_Driver` に統一してください。',
  '',
  '## 【参考】gpio_state は問題なし',
  'そのままで構いません。',
].join('\n');

// 覗ける全フォルダの図 (review-note.index が要る形)。
function indexOf(names) {
  var docs = [];
  names.forEach(function(n) {
    docs.push({ name: 'junior/' + n + '.puml' });
    docs.push({ name: 'primary/' + n + '.puml' });
  });
  return RN.index(docs);
}

function boardOf(noteText, names, kinds) {
  var idx = indexOf(names);
  var rows = RN.rows(RN.parse(noteText), idx);
  var targets = {};
  rows.forEach(function(r) {
    targets[r.id] = FV.choose({
      bases: (r.docs || []).map(function(d) { return d.name; }),
      names: idx.names,
      text: r.text || (r.title + '\n' + r.body),
    });
  });
  return {
    rows: rows,
    board: NB.scan({
      rows: rows, targets: targets, names: names,
      kindOf: function(n) { return (kinds || {})[n] || ''; },
    }),
  };
}

describe('note-board — どの図が指摘の対象か', function() {
  test('本文に名前が綴られた図だけが対象になる', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    expect(NB.hitsOf(b, 'gpio_init_sequence').length).toBe(1);
    expect(NB.hitsOf(b, 'gpio_state').length).toBe(1);
    expect(NB.hitsOf(b, 'gpio_component').length).toBe(0);
  });

  test('名前の挙がらない図は対象外 (開かずに次へ進める)', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var st = NB.statusOf({ hits: NB.hitsOf(b, 'gpio_component') });
    expect(st.key).toBe('off');
    expect(st.mark).toBe('対象外');
  });

  test('図名が無くても図種が名指しされていれば、その図種の図が対象になる', function() {
    var note = ['# junior への指摘', '',
      '## アクティビティ図の書き出し', '線が細いので出し直してください。'].join('\n');
    var b = boardOf(note, NAMES, KINDS).board;
    expect(NB.hitsOf(b, 'GPIOドライバ初期化アクティビティ図').length).toBe(1);
    expect(NB.hitsOf(b, 'GPIOドライバ初期化アクティビティ図(資料用)').length).toBe(1);
    expect(NB.hitsOf(b, 'gpio_state').length).toBe(0);
    expect(NB.hitsOf(b, 'GPIOドライバ初期化アクティビティ図')[0].why).toBe('kind');
  });

  test('図名も図種も書かれていない指摘は、どの図にも割り当てない', function() {
    var note = ['# junior への指摘', '', '## 全体', '章立てを見直してください。'].join('\n');
    var r = boardOf(note, NAMES, KINDS);
    expect(r.board.names.length).toBe(0);
    expect(r.board.unaddressed.length).toBe(1);
  });

  test('指摘が版を名指しすれば、その版だけが対象になる', function() {
    var note = ['# junior への指摘', '',
      '## 資料用のアクティビティ図',
      'GPIOドライバ初期化アクティビティ図 の資料用の版を直してください。'].join('\n');
    var b = boardOf(note, NAMES, KINDS).board;
    var hits = NB.hitsOf(b, 'GPIOドライバ初期化アクティビティ図(資料用)');
    expect(hits.length).toBe(1);
    expect(hits[0].why).toBe('variant');
  });
});

describe('note-board — 反映されているか', function() {
  var MINE_OLD = ['@startuml', 'participant Gpio', 'Gpio -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
  var MINE_FIXED = ['@startuml', 'participant Gpio_Driver',
    'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');

  test('古い綴りが残っていれば ⚠未確認', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var st = NB.statusOf({ hits: NB.hitsOf(b, 'gpio_init_sequence'), dsl: MINE_OLD });
    expect(st.key).toBe('todo');
    expect(st.mark).toBe('⚠未確認');
  });

  test('統一後の綴りだけなら ✅対応済み (Gpio_Driver を Gpio と読み違えない)', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var st = NB.statusOf({ hits: NB.hitsOf(b, 'gpio_init_sequence'), dsl: MINE_FIXED });
    expect(st.key).toBe('done');
    expect(st.mark).toBe('✅対応済み');
  });

  test('本文をまだ読んでいない図は ✅ にしない', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    expect(NB.statusOf({ hits: NB.hitsOf(b, 'gpio_init_sequence') }).key).toBe('todo');
  });

  test('別ドメインと決めた注記があれば ✅対応済み', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var dsl = ['@startuml', "' domain-verdict: separate gpio vs junior",
      'state Uninit', '@enduml'].join('\n');
    expect(NB.statusOf({ hits: NB.hitsOf(b, 'gpio_state'), dsl: dsl }).key).toBe('done');
  });

  // reviewer が実際に書く形。動詞が無いので finding-actions の renamePair では
  // 取れないが、どちらが自分の綴りかはフォルダ名で決まる。
  var SIDE_NOTE = [
    '# junior への指摘', '',
    '## 【継続】gpio_init_sequence の部品名不一致',
    'junior 側 `Gpio`(2行のみ)/ primary 側 `Gpio_Driver` 詳細化、のまますり合わせ未反映。',
  ].join('\n');

  test('「自分側 / 相手側」で書かれた食い違いも、直す向きとして読む', function() {
    expect(NB.sideRename(SIDE_NOTE, 'junior')).toEqual({ from: 'Gpio', to: 'Gpio_Driver' });
  });

  test('自分のフォルダが分からなければ、向きを決めない', function() {
    expect(NB.sideRename(SIDE_NOTE, '')).toBe(null);
  });

  test('自分側の綴りのままなら ⚠未確認、相手に揃えてあれば ✅対応済み', function() {
    var b = boardOf(SIDE_NOTE, NAMES, KINDS).board;
    var hits = NB.hitsOf(b, 'gpio_init_sequence');
    expect(NB.statusOf({ hits: hits, dsl: MINE_OLD, mineFolder: 'junior' }).key).toBe('todo');
    expect(NB.statusOf({ hits: hits, dsl: MINE_FIXED, mineFolder: 'junior' }).key).toBe('done');
  });

  test('部品ごと消しただけでは ✅ にしない (揃えた綴りが入って初めて対応済み)', function() {
    var b = boardOf(SIDE_NOTE, NAMES, KINDS).board;
    var empty = ['@startuml', 'participant Hw_Ctrl', '@enduml'].join('\n');
    var st = NB.statusOf({ hits: NB.hitsOf(b, 'gpio_init_sequence'), dsl: empty, mineFolder: 'junior' });
    expect(st.key).toBe('todo');
    expect(st.title).toContain('どちらの綴りも見当たりません');
  });

  test('証拠の無い指摘は本文を読んでも ⚠未確認 のまま', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var st = NB.statusOf({ hits: NB.hitsOf(b, 'gpio_state'), dsl: '@startuml\nstate Uninit\n@enduml' });
    expect(st.key).toBe('todo');
    expect(st.title).toContain('開いて確かめてください');
  });
});

describe('note-board — 一覧に出す形', function() {
  test('本文を取り寄せるのは対象の図だけ', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    expect(NB.pendingNames(b).sort()).toEqual(['gpio_init_sequence', 'gpio_state']);
  });

  test('見出しは、開かなくてよい枚数を先に言う', function() {
    var b = boardOf(NOTE, NAMES, KINDS).board;
    var map = NB.statusMap({ board: b, names: NAMES, dslByName: {} });
    var s = NB.summaryText({ board: b, names: NAMES, statusByName: map, hasNote: true });
    expect(s).toContain('対象外 3 枚');
    expect(s).toContain('⚠未確認 2 枚');
  });

  test('宛先の書かれていない指摘は件数で断る', function() {
    var note = ['# junior への指摘', '', '## 全体', '章立てを見直してください。'].join('\n');
    var b = boardOf(note, NAMES, KINDS).board;
    var map = NB.statusMap({ board: b, names: NAMES, dslByName: {} });
    expect(NB.summaryText({ board: b, names: NAMES, statusByName: map, hasNote: true }))
      .toContain('図名も図種も書かれていない指摘 1 件');
  });

  test('指摘.md が無ければ、その旨だけを言う', function() {
    var b = NB.scan({ rows: [], targets: {}, names: NAMES });
    expect(NB.summaryText({ board: b, names: NAMES, statusByName: {}, hasNote: false }))
      .toContain('指摘.md がありません');
  });
});
