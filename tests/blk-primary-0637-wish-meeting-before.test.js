'use strict';
// BLK-primary-20260925-0637-wish: 会議セットの図は、保存先から開かずに選んだ図も含め、
// 「変更前 =」の基準より前の最後の版 (版の控え、Git ならコミット) を変更前にし、
// 変更前 / 変更後の表示の中で変わった行・文字を ± 差分と同じ色で示す。
// 基準より前の版が本当に無いときだけ「この基準より前の版がありません」と言う (同じ図を 2 つ並べない)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
}

const fs = require('fs');
const path = require('path');
const BL = require('../src/core/change-baseline');
require('../src/core/change-board.js');
const CB = global.window.MA.changeBoard;
const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('変わった行と文字の印 sideMarks', () => {
  const before = '@startuml\nparticipant SpiDrv\nSpiDrv -> Reg : write(CR1)\n@enduml';
  const after = '@startuml\nparticipant Spi_Driver\nSpi_Driver -> Reg : write(CR1)\nSpi_Driver -> Reg : read(SR)\n@enduml';
  const rows = CB.diffRows(before, after).rows;

  test('変更前は消えた (変わる前の) 行に赤、行の中で変わった文字だけを範囲で持つ', () => {
    const m = CB.sideMarks(rows, 'before');
    expect(Object.keys(m).sort()).toEqual(['2', '3']);
    expect(m[2].kind).toBe('del');
    // "participant SpiDrv" と "participant Spi_Driver" の違いは "Drv" → "_Driver" の所だけ
    expect('participant SpiDrv'.slice(m[2].from, m[2].to)).toBe('Drv');
    expect('SpiDrv -> Reg : write(CR1)'.slice(m[3].from, m[3].to)).toBe('Drv');
  });

  test('変更後は増えた・変わった行に緑。対の無い増えた行は行ごと', () => {
    const m = CB.sideMarks(rows, 'after');
    expect(Object.keys(m).sort()).toEqual(['2', '3', '4']);
    expect(m[2].kind).toBe('add');
    expect('participant Spi_Driver'.slice(m[2].from, m[2].to)).toBe('_Driver');
    const added = 'Spi_Driver -> Reg : read(SR)';
    expect(m[4].from).toBe(0);
    expect(m[4].to).toBe(added.length);
  });

  test('変わっていない図には印が無い / 畳んだ行 (gap) は飛ばす', () => {
    expect(CB.sideMarks(CB.diffRows(before, before).rows, 'after')).toEqual({});
    expect(CB.sideMarks([{ kind: 'gap', count: 3 }], 'before')).toEqual({});
    expect(CB.sideMarks(null, 'before')).toEqual({});
  });
});

describe('Git のコミットから時点の中身を選ぶ commitAt', () => {
  const commits = [
    { hash: 'c3', short: 'c3', date: '2026-09-25T10:00:00+09:00' },
    { hash: 'c2', short: 'c2', date: '2026-09-24T18:00:00+09:00' },
    { hash: 'c1', short: 'c1', date: '2026-09-20T09:00:00+09:00' },
  ];

  test('時点以前で最も新しいコミット (時差付きの日時で比べる)', () => {
    // 今日 0 時 (JST) = 2026-09-24T15:00:00Z より前の最後は c1 ではなく c2 (09-24 18:00 JST = 09:00Z)
    expect(BL.commitAt(commits, '2026-09-24T15:00:00.000Z').hash).toBe('c2');
    expect(BL.commitAt(commits, '2026-09-26T00:00:00Z').hash).toBe('c3');
  });

  test('時点より前のコミットが無い・読めない時点なら null', () => {
    expect(BL.commitAt(commits, '2026-09-01T00:00:00Z')).toBe(null);
    expect(BL.commitAt(commits, '')).toBe(null);
    expect(BL.commitAt([], '2026-09-26T00:00:00Z')).toBe(null);
  });
});

describe('会議セットの画面 (app.js)', () => {
  test('保存先から選んだ図の変更前を今の中身で埋めない', () => {
    expect(app).not.toContain("return { at: picked[name].mtime || '', dsl: picked[name].dsl };");
  });

  test('前回保存の控えが無い開いていない図は今日 0 時の版を読み、版の控えに無ければ Git のコミットから引く', () => {
    expect(app).toContain('function _msLoadPickBase(names)');
    expect(app).toContain('function _cbGitContentAt(dir, name, cut)');
    expect(app).toContain("'/git-show?'");
  });

  test('版が無いときは図の見出しで「この基準より前の版がありません」と言う', () => {
    expect(app).toContain('より前の版がありません');
    expect(app).toContain('class="cb-nobase"');
    expect(app).not.toContain("新しく作った図です。'");
  });

  test('変更前 / 変更後の表示は ± 差分と同じ色 (緑 / 赤) で行と文字に印を付ける', () => {
    expect(app).toContain('CB.sideMarks(e.allRows, side)');
    expect(html).toContain('pre.cb-side-dsl .cb-line-add { background: rgba(80, 180, 110, 0.16); }');
    expect(html).toContain('pre.cb-side-dsl .cb-line-del { background: rgba(220, 80, 80, 0.16); }');
    expect(html).toContain('mark.cb-ch-add');
    expect(html).toContain('mark.cb-ch-del');
  });
});
