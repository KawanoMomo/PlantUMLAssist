'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
// 関係の名称と説明は relation-kind-cards が持つ (design 3c: 3 図種で共通)。
try { delete require.cache[require.resolve('../src/core/relation-kind-cards.js')]; } catch (e) {}
require('../src/core/relation-kind-cards.js');
try { delete require.cache[require.resolve('../src/core/relation-add.js')]; } catch (e) {}
require('../src/core/relation-add.js');
var RA = global.window.MA.relationAdd;

describe('relation-add — 関係を追加パネル (design 3a)', () => {
  test('kinds: UseCase は 関連/包含/拡張/汎化 の 4 種を仕様の順で返す', () => {
    var vals = RA.kinds('usecase').map(k => k.value);
    expect(vals.join(',')).toBe('association,include,extend,generalization');
  });

  test('kinds: 各項目に UML 名称 (主)・意味の説明 (副)・矢印の見本がそろう', () => {
    RA.kinds('usecase').forEach(k => {
      expect(k.name.length > 0).toBe(true);
      expect(k.desc.length > 0).toBe(true);
      expect(k.sample.length > 0).toBe(true);
    });
  });

  test('kinds: 名称は UML 名を主に置き、説明は名称と別の文言である', () => {
    var inc = RA.findKind('usecase', 'include');
    expect(inc.name).toBe('包含 / include');
    expect(inc.desc).toBe('実行時に必ず呼び出される');
  });

  test('kinds: Component は 関連/依存/提供/要求 (design 3b と共有)', () => {
    var vals = RA.kinds('component').map(k => k.value);
    expect(vals.join(',')).toBe('association,dependency,provides,requires');
  });

  test('kinds: 未知の図種は空配列 (呼び手が落ちない)', () => {
    expect(RA.kinds('sequence').length).toBe(0);
    expect(RA.defaultKind('sequence')).toBe('');
  });

  test('defaultKind: 先頭の 関連 / association が既定', () => {
    expect(RA.defaultKind('usecase')).toBe('association');
  });

  test('findKind: 無い値は null', () => {
    expect(RA.findKind('usecase', 'realization')).toBeNull();
  });

  test('orient: 既定は選択順どおり、swapped で From/To が入れ替わる', () => {
    var sel = [{ id: 'User' }, { id: 'Validate' }];
    expect(RA.orient(sel, false).from.id).toBe('User');
    expect(RA.orient(sel, false).to.id).toBe('Validate');
    expect(RA.orient(sel, true).from.id).toBe('Validate');
    expect(RA.orient(sel, true).to.id).toBe('User');
  });

  test('orient: 2 件未満は null', () => {
    expect(RA.orient([{ id: 'A' }], false)).toBeNull();
    expect(RA.orient(null, false)).toBeNull();
  });

  test('previewLine: 実際に書き込む fmtRelation を通すので DSL と食い違わない', () => {
    var fmt = (kind, from, to, label) =>
      kind === 'include' ? from + ' ..> ' + to + ' : <<include>>'
                         : from + ' --> ' + to + (label ? ' : ' + label : '');
    expect(RA.previewLine(fmt, 'association', 'User', 'Login', '')).toBe('User --> Login');
    expect(RA.previewLine(fmt, 'association', 'User', 'Login', '起動')).toBe('User --> Login : 起動');
    expect(RA.previewLine(fmt, 'include', 'Login', 'Validate', '')).toBe('Login ..> Validate : <<include>>');
  });

  test('previewLine: 端が欠けている / fmt が投げる場合は空文字', () => {
    var fmt = () => { throw new Error('boom'); };
    expect(RA.previewLine(fmt, 'association', 'A', 'B', '')).toBe('');
    expect(RA.previewLine(null, 'association', 'A', 'B', '')).toBe('');
    expect(RA.previewLine((k, f, t) => f + t, 'association', '', 'B', '')).toBe('');
  });

  test('noticeText: 2 つ選択中のときだけ「関係を追加できます」を出す', () => {
    expect(RA.noticeText(0)).toBeNull();
    expect(RA.noticeText(1)).toBeNull();
    expect(RA.noticeText(2)).toBe('2 つ選択中 — 関係を追加できます');
  });

  test('noticeText: 3 つ以上は追加できない旨を件数つきで伝える', () => {
    expect(RA.noticeText(3)).toBe('3 つ選択中 — 関係を追加できるのは 2 つまでです');
  });

  test('optionsHtml: 4 件ぶんのラジオを出し、選択中の 1 件だけ checked', () => {
    var html = RA.optionsHtml('usecase', 'uc-conn', 'extend');
    expect((html.match(/type="radio"/g) || []).length).toBe(4);
    expect((html.match(/ checked/g) || []).length).toBe(1);
    expect(html).toContain('id="uc-conn-kind-extend" value="extend" checked');
  });

  test('optionsHtml: 選択値の指定が無ければ既定 (association) が checked', () => {
    var html = RA.optionsHtml('usecase', 'uc-conn', '');
    expect(html).toContain('value="association" checked');
  });

  test('optionsHtml: 名称・説明・矢印の見本がすべて DOM に出る', () => {
    var html = RA.optionsHtml('usecase', 'uc-conn', 'association');
    expect(html).toContain('関連 / association');
    expect(html).toContain('アクターがユースケースを利用する');
    expect(html).toContain('rel-opt-sample');
  });

  test('optionHtml: 名称・説明は HTML エスケープされる', () => {
    var html = RA.optionHtml('x', { value: 'v', name: '<b>n</b>', desc: 'a&b', sample: '>' }, false);
    expect(html).toContain('&lt;b&gt;n&lt;/b&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).not.toContain('<b>n</b>');
  });
});
