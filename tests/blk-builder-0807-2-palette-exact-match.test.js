'use strict';
// BLK-builder-20260908-0807-2-red
// コマンドパレットで「保存」と打つと、その 2 文字をたまたま含むだけの
// 「保存フォルダの図を一覧」が 1 位に出て、本命の「ファイルを保存」は 3 位だった。
// 順位が「見つかった位置」だけで決まっていたため。
// キーワードに完全一致した候補は、部分一致より必ず前に出す。

const CP = () => window.MA.commandPalette;

// 実際の app.js の並びと同じ順で、「保存」を含むコマンドを並べる。
const SAVE_ISH = [
  { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', keywords: ['保存', 'save', 'file', 'ほぞん'] },
  { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', hint: 'Tabs', keywords: ['folder', 'list', 'いちらん'] },
  { id: 'tab-diff', title: '前回保存からの差分 / Diff', hint: 'Tabs', keywords: ['diff', 'change', 'さぶん'] },
  { id: 'export-svg', title: 'SVG として保存 / Export SVG', hint: 'Export', keywords: ['export', 'svg'] },
];

function titles(items) { return items.map((i) => i.title); }

describe('コマンドパレット: 完全一致を先に出す (BLK-builder-20260908-0807-2-red)', () => {
  test('「保存」で「ファイルを保存」が 1 位になる', () => {
    const items = CP().buildItems(SAVE_ISH, '');
    const got = CP().filter(items, '保存');
    expect(got[0].title).toBe('ファイルを保存 / Save');
  });

  test('たまたま含むだけの候補も消えはせず、後ろに並ぶ', () => {
    const items = CP().buildItems(SAVE_ISH, '');
    const got = titles(CP().filter(items, '保存'));
    expect(got.length).toBe(4);
    expect(got.indexOf('保存フォルダの図を一覧 / Folder')).toBeGreaterThan(0);
    expect(got.indexOf('SVG として保存 / Export SVG')).toBeGreaterThan(0);
  });

  test('score: キーワード完全一致は、どんな部分一致より小さい', () => {
    const exact = CP().score({ title: 'ファイルを保存 / Save', keywords: ['保存'], hint: '' }, '保存');
    const head = CP().score({ title: '保存フォルダの図を一覧 / Folder', keywords: [], hint: '' }, '保存');
    expect(exact).toBeLessThan(head);
    expect(head).toBe(0); // 先頭一致 = 位置 0
  });

  test('score: title そのものの完全一致は、キーワード完全一致よりさらに強い', () => {
    const byTitle = CP().score({ title: '保存', keywords: [], hint: '' }, '保存');
    const byKeyword = CP().score({ title: 'ファイルを保存 / Save', keywords: ['保存'], hint: '' }, '保存');
    expect(byTitle).toBeLessThan(byKeyword);
  });

  test('大文字小文字は無視して完全一致とみなす', () => {
    const s = CP().score({ title: 'Export SVG', keywords: ['SVG'], hint: '' }, 'svg');
    expect(s).toBeLessThan(0);
  });

  test('完全一致が無い問い合わせは今までどおりの順位', () => {
    const items = CP().buildItems(SAVE_ISH, '');
    const got = titles(CP().filter(items, 'フォルダ'));
    expect(got).toEqual(['保存フォルダの図を一覧 / Folder']);
  });

  test('一致しない問い合わせは null のまま', () => {
    expect(CP().score({ title: 'ファイルを保存 / Save', keywords: ['保存'], hint: '' }, 'zzzz')).toBe(null);
  });
});
