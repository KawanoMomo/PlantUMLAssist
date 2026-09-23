'use strict';
// BLK-junior-20260923-1409: Export ▾「PNG（透過背景）」が 1 枚だけ
// 「PNGエクスポートに失敗しました (SVG読み込みエラー)」で止まった。
//
// PlantUML が svg の末尾に畳む元 DSL の処理命令 `<?plantuml-src …?>` は、
// innerHTML で画面に入れるとコメントノードに化ける (`<!--?plantuml-src …?-->`)。
// 畳んだ文字列がたまたま `--` を含む図では XML のコメント規則に反するので、
// XMLSerializer で書き戻した svg を data: URI から Image に読ませると onerror になる。
// 他のシーケンス図で通っていたのは畳んだ文字列に `--` が無かっただけで、
// 図の書き方の違いではない。描画に関わらないので書き出す前に落とす。
const assert = require('assert');
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/svg-export.js')]; } catch (e) {}
require('../src/core/svg-export.js');
var sx = global.window.MA.svgExport;

var XMLSerializer = dom.window.XMLSerializer;

// junior の 1 枚と同じ形: 畳んだ元 DSL に `--` が入っている。
var FOLDED_WITH_DASHES = 'XL7TQXD1--4BtFuMfAA--9m1x';
var FOLDED_PLAIN = 'XL7TQXD143BtFuMfAA9m1x';

function svgWithEmbeddedSource(folded) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="140">'
    + '<g><text>IRQ init</text></g>'
    + '<?plantuml-src ' + folded + '?>'
    + '</svg>';
}

// 画面に入れて取り出し直す経路 (innerHTML → XMLSerializer) を本物の DOM で再現する。
function throughDom(svgText) {
  var host = dom.window.document.createElement('div');
  host.innerHTML = svgText;
  return host.querySelector('svg');
}

// ---- 前提: 化けることそのものを押さえる (直したつもりで直っていない事故を防ぐ) ----
describe('plantuml-src の埋め込みは DOM を通るとコメントに化ける', () => {
  test('innerHTML を通した svg を書き戻すと二重ハイフンのコメントになる', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    var out = new XMLSerializer().serializeToString(el);
    expect(out).toContain('<!--?plantuml-src');
    expect(sx.isBrokenComment(out)).toBe(true);
  });

  test('畳んだ文字列に -- が無い図では壊れない（他の 5 系統が通っていた理由）', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_PLAIN));
    var out = new XMLSerializer().serializeToString(el);
    expect(sx.isBrokenComment(out)).toBe(false);
  });
});

// ---- 直し: 書き出す前に落とす ----
describe('stripNonRendered は書き出す前にコメント・処理命令を落とす', () => {
  test('化けたコメントを落とすと XML として壊れなくなる', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    sx.stripNonRendered(el);
    var out = new XMLSerializer().serializeToString(el);
    expect(out).not.toContain('plantuml-src');
    expect(sx.isBrokenComment(out)).toBe(false);
  });

  test('描画に関わるノードは 1 つも消さない', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    sx.stripNonRendered(el);
    var out = new XMLSerializer().serializeToString(el);
    expect(out).toContain('<text>IRQ init</text>');
    expect(el.getAttribute('width')).toBe('320');
  });

  test('入れ子の奥にあるコメントも落とす', () => {
    var el = throughDom('<svg xmlns="http://www.w3.org/2000/svg"><g><!--a--b--><rect/></g></svg>');
    sx.stripNonRendered(el);
    var out = new XMLSerializer().serializeToString(el);
    expect(sx.isBrokenComment(out)).toBe(false);
    expect(out).toContain('<rect');
  });

  test('渡されたノードをそのまま返し、null でも落ちない', () => {
    var el = throughDom('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>');
    expect(sx.stripNonRendered(el)).toBe(el);
    expect(function() { sx.stripNonRendered(null); }).not.toThrow();
  });
});

describe('stripEmbeddedSourceText は文字列経路（一括書き出し）でも落とす', () => {
  test('処理命令の形を落とす', () => {
    var out = sx.stripEmbeddedSourceText(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    expect(out).not.toContain('plantuml-src');
    expect(out).toContain('<text>IRQ init</text>');
  });

  test('化けたコメントの形も落とす', () => {
    var src = '<svg width="10" height="10"><g/><!--?plantuml-src ' + FOLDED_WITH_DASHES + '?--></svg>';
    var out = sx.stripEmbeddedSourceText(src);
    expect(out).not.toContain('plantuml-src');
    expect(sx.isBrokenComment(out)).toBe(false);
  });

  test('埋め込みが無い svg は 1 文字も変えない', () => {
    var src = '<svg width="10" height="10"><g/></svg>';
    expect(sx.stripEmbeddedSourceText(src)).toBe(src);
  });

  test('null / undefined でも落ちない', () => {
    expect(sx.stripEmbeddedSourceText(null)).toBe('');
    expect(sx.stripEmbeddedSourceText(undefined)).toBe('');
  });
});

// ---- 失敗は「SVGエラー」で終わらせず名指しする ----
describe('reasonFor は読めなかったものを名指しする', () => {
  test('二重ハイフンのコメントを名指しする', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    var out = new XMLSerializer().serializeToString(el);
    var why = sx.reasonFor(out);
    expect(why).toContain('二重ハイフン');
    expect(why).toContain('元 DSL');
  });

  test('処理命令が残っている場合を名指しする', () => {
    var why = sx.reasonFor(svgWithEmbeddedSource(FOLDED_PLAIN));
    expect(why).toContain('処理命令');
  });

  test('プレビューが空のときを名指しする', () => {
    expect(sx.reasonFor('')).toContain('プレビューが空');
    expect(sx.reasonFor('   ')).toContain('プレビューが空');
  });

  test('svg ですらないときを名指しする', () => {
    expect(sx.reasonFor('<div>error</div>')).toContain('SVG がありません');
  });

  test('落としたあとの正しい svg では何も言わない（誤報を出さない）', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    sx.stripNonRendered(el);
    var out = new XMLSerializer().serializeToString(el);
    expect(sx.reasonFor(out)).toBe('');
  });
});

describe('sizeOf は書き出す大きさを読む', () => {
  test('width / height を読む', () => {
    var s = sx.sizeOf('<svg width="320" height="140"></svg>', 800, 400);
    expect(s.w).toBe(320);
    expect(s.h).toBe(140);
  });

  test('読めなければ既定値に落とす', () => {
    var s = sx.sizeOf('<svg></svg>', 800, 400);
    expect(s.w).toBe(800);
    expect(s.h).toBe(400);
  });

  test('0 や負の値は既定値に落とす', () => {
    var s = sx.sizeOf('<svg width="0" height="0"></svg>');
    expect(s.w).toBe(800);
    expect(s.h).toBe(400);
  });
});

// ---- 「SVG として保存」は埋め込みを落とさず、正しい形に戻す ----
describe('restoreEmbeddedSource は保存する svg を XML として正しくする', () => {
  test('化けたコメントを処理命令に戻す（埋め込みは残す）', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    var out = sx.restoreEmbeddedSource(new XMLSerializer().serializeToString(el));
    expect(out).toContain('<?plantuml-src ' + FOLDED_WITH_DASHES + '?>');
    expect(out).not.toContain('<!--?plantuml-src');
    expect(sx.isBrokenComment(out)).toBe(false);
  });

  test('戻した svg は XML として読める', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    var out = sx.restoreEmbeddedSource(new XMLSerializer().serializeToString(el));
    var doc = new dom.window.DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('text').textContent).toBe('IRQ init');
  });

  test('壊れていた元の svg は XML として読めない（この直しが要る証拠）', () => {
    var el = throughDom(svgWithEmbeddedSource(FOLDED_WITH_DASHES));
    var out = new XMLSerializer().serializeToString(el);
    var doc = new dom.window.DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).not.toBeNull();
  });

  test('埋め込みが無い svg は 1 文字も変えない', () => {
    var src = '<svg width="10" height="10"><g/></svg>';
    expect(sx.restoreEmbeddedSource(src)).toBe(src);
  });
});
