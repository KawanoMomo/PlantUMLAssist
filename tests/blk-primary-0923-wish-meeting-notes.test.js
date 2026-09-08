'use strict';
// BLK-primary-20260908-0923-wish: 変更サマリボードの中身を「会議メモ」1 枚にまとめて
// 持ち出せるようにする。開いた図ごとの要修正件数・該当行・印の日時・申し送りが
// 1 枚のテキストに入り、直す担当がボードを開き直さなくても読めることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/meeting-notes.js')]; } catch (e) {}
require('../src/core/meeting-notes.js');
var MN = global.window.MA.meetingNotes;

// review-verdicts / handover-notes を実物と同じ形で差し替える (localStorage を持ち込まない)。
function verdicts(map) {
  function listFor(name) { return (map[name] || []).slice(); }
  function counts(name) {
    var out = { done: 0, fix: 0 };
    listFor(name).forEach(function(r) { if (r.verdict === '済') out.done++; else out.fix++; });
    return out;
  }
  function docs() {
    var out = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var c = counts(k);
      out.push({ name: k, done: c.done, fix: c.fix });
    }
    out.sort(function(a, b) { return b.fix - a.fix || (a.name < b.name ? -1 : 1); });
    return out;
  }
  function totals() {
    var t = { done: 0, fix: 0, docs: 0 };
    docs().forEach(function(d) { t.done += d.done; t.fix += d.fix; t.docs++; });
    return t;
  }
  return { listFor: listFor, counts: counts, docs: docs, totals: totals };
}

function notes(map) {
  return {
    get: function(name) { return map[name] || null; },
    list: function() {
      var out = [];
      for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) out.push({ name: k, text: map[k].text, at: map[k].at });
      }
      return out;
    },
  };
}

var BOARD = {
  total: 15, changedCount: 2, hasChange: true, added: 4, removed: 1,
  entries: [
    {
      id: 'd1', name: 'adc_state', diagramType: 'plantuml-state', status: 'changed',
      markedAt: '2026-09-08T09:00:00.000Z', added: 3, removed: 1, rows: [],
    },
    {
      id: 'd2', name: 'Adc_Driver', diagramType: 'plantuml-class', status: 'new',
      markedAt: '', added: 1, removed: 0, rows: [],
    },
  ],
};

var RV = verdicts({
  adc_state: [
    { key: 'add|Done --> Configured', verdict: '要修正', at: '2026-09-08T09:40:00.000Z', text: 'Done --> Configured' },
    { key: 'del|Idle --> Done', verdict: '済', at: '2026-09-08T09:41:00.000Z', text: 'Idle --> Done' },
  ],
  timer_state: [
    { key: 'add|Tick', verdict: '要修正', at: '2026-09-08T09:20:00.000Z', text: 'Tick' },
  ],
});

var HN = notes({
  adc_state: { name: 'adc_state', text: 'Done から戻る遷移が抜けていた', at: '2026-09-08T09:12:00.000Z' },
});

function built() {
  return MN.build({ board: BOARD, verdicts: RV, notes: HN, at: '2026-09-08T09:50:00.000Z' });
}

describe('meetingNotes.build の見出し', () => {
  test('書き出した日時・枚数・要修正/済 の合計が 1 行に並ぶ', () => {
    var head = built().text.split('\n')[1];
    expect(head).toContain('2026-09-08 09:50');
    expect(head).toContain('開いた図 15 枚 / 変わった図 2 枚');
    expect(head).toContain('+4 −1 行');
    expect(head).toContain('要修正 2 件 / 済 1 件');
  });

  test('合計は戻り値でも読める (ボタンの表示に使う)', () => {
    var res = built();
    expect(res.fixTotal).toBe(2);
    expect(res.doneTotal).toBe(1);
    expect(res.docCount).toBe(2);
  });
});

describe('meetingNotes.build の要修正の表', () => {
  test('要修正が残っている図だけが件数付きで並ぶ', () => {
    var text = built().text;
    expect(text).toContain('| adc_state | 1 | 1 |');
    expect(text).toContain('| timer_state | 1 | 0 |');
    // 印の無い図は表に出さない (次の仕事にならないため)
    expect(text).not.toContain('| Adc_Driver |');
  });

  test('要修正が 1 件も無ければその旨を書く', () => {
    var res = MN.build({ board: BOARD, verdicts: verdicts({}), notes: notes({}), at: '2026-09-08T09:50:00.000Z' });
    expect(res.text).toContain('要修正の印が付いた図はありません。');
    expect(res.fixTotal).toBe(0);
  });
});

describe('meetingNotes.build の図ごとの内訳', () => {
  test('図の見出しに種別と増減が入る', () => {
    var text = built().text;
    expect(text).toContain('### adc_state (state) — +3 −1');
    expect(text).toContain('### Adc_Driver (class) — 新規 +1');
  });

  test('印の付いた行が種別・日時つきで並ぶ', () => {
    var text = built().text;
    expect(text).toContain('- [要修正] + `Done --> Configured` (2026-09-08 09:40)');
    expect(text).toContain('- [済] − `Idle --> Done` (2026-09-08 09:41)');
  });

  test('申し送りは図の見出しの下に付く', () => {
    expect(built().text).toContain('申し送り: Done から戻る遷移が抜けていた (2026-09-08 09:12)');
  });

  test('印の無い図はその旨を書く (書き落としと区別する)', () => {
    expect(built().text).toContain('印の付いた行はありません。');
  });
});

describe('meetingNotes.build のボードに出ていない図', () => {
  test('基準を取り直して差分が消えた図の印も落とさない', () => {
    var res = built();
    expect(res.text).toContain('## ボードに出ていない図');
    expect(res.text).toContain('### timer_state');
    expect(res.text).toContain('- [要修正] + `Tick`');
    expect(res.restCount).toBe(1);
  });

  test('印も申し送りも残っていなければ節ごと出さない', () => {
    var res = MN.build({ board: BOARD, verdicts: verdicts({}), notes: notes({}), at: '' });
    expect(res.text).not.toContain('## ボードに出ていない図');
    expect(res.restCount).toBe(0);
  });
});

describe('meetingNotes の書き出し名と結果表示', () => {
  test('ファイル名は分まで入る (同じ会議で 2 度押しても区別が付く)', () => {
    expect(MN.fileName('2026-09-08T09:50:00.000Z')).toBe('会議メモ-20260908-0950.md');
  });

  test('日時が無ければ日時なしの名前にする', () => {
    expect(MN.fileName('')).toBe('会議メモ.md');
  });

  test('押した人に何が入ったかを返す', () => {
    expect(MN.resultText(built()))
      .toBe('会議メモを書き出しました (図 2 枚 ・ 要修正 2 件 / 済 1 件)');
  });
});

describe('meetingNotes.build の欠けた入力', () => {
  test('ボードが無くても印と申し送りだけで組み立てる', () => {
    var res = MN.build({ board: null, verdicts: RV, notes: HN, at: '2026-09-08T09:50:00.000Z' });
    expect(res.text).toContain('要修正 2 件 / 済 1 件');
    expect(res.text).toContain('ボードに並んだ図はありません。');
    expect(res.docCount).toBe(0);
  });

  test('印も申し送りも無いときでも 1 枚のメモになる', () => {
    var res = MN.build({});
    expect(res.text.split('\n')[0]).toBe('# レビュー会議メモ');
    expect(res.fixTotal).toBe(0);
  });
});
