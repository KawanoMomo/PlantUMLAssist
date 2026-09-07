'use strict';
// BLK-builder-20260907-2035-3 / design 3c:
// 「関係の種類」カードは UseCase / Component / Class で共通の語彙を使う。
// relation-add (2 つ選んで追加する側) も同じ語彙を読む。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/relation-kind-cards.js')]; } catch (e) {}
require('../src/core/relation-kind-cards.js');
try { delete require.cache[require.resolve('../src/core/relation-add.js')]; } catch (e) {}
require('../src/core/relation-add.js');

var RC = global.window.MA.relationKindCards;
var RA = global.window.MA.relationAdd;

describe('relation-kind-cards — 3 図種ぶんの関係の語彙 (design 3c)', () => {
  test('UseCase は 関連/包含/拡張/汎化 を仕様の順で返す', () => {
    expect(RC.kindsOf('usecase').map(k => k.value).join(','))
      .toBe('association,include,extend,generalization');
  });

  test('Class は既存のプルダウンにあった 7 種をすべて持つ', () => {
    var vals = RC.kindsOf('class').map(k => k.value).sort().join(',');
    expect(vals).toBe('aggregation,association,composition,dependency,implementation,inheritance,nested');
  });

  test('どの図種でも UML 名称 (主) と意味の説明 (従) がそろう', () => {
    ['usecase', 'component', 'class'].forEach(function(d) {
      RC.kindsOf(d).forEach(function(k) {
        expect(k.name.length > 0).toBe(true);
        expect(k.desc.length > 0).toBe(true);
        // 記法だけのラベル (`Include (..>)`) には戻さない
        expect(/^[A-Za-z]+\s*\(/.test(k.name)).toBe(false);
      });
    });
  });

  test('カード HTML は data-value と説明文を持ち、選択中のものだけ aria-pressed=true', () => {
    var html = RC.cardsHtml('uc-rel-card', RC.kindsOf('usecase'), 'include');
    expect(html.indexOf('data-value="include"') >= 0).toBe(true);
    expect(html.indexOf('実行時に必ず呼び出される') >= 0).toBe(true);
    expect((html.match(/aria-pressed="true"/g) || []).length).toBe(1);
  });

  test('向き固定の注記は Component だけに出る', () => {
    expect(RC.noteHtml('component').indexOf('向きが固定') >= 0).toBe(true);
    expect(RC.noteHtml('usecase')).toBe('');
    expect(RC.noteHtml('class')).toBe('');
    // 引数なしは Component 扱い (3b から先に入った呼び出しをそのまま通す)
    expect(RC.noteHtml().indexOf('向きが固定') >= 0).toBe(true);
  });
});

describe('relation-add は同じ語彙を読み、矢印の見本だけを足す', () => {
  test('UseCase の名称・説明が relation-kind-cards と一致する', () => {
    var a = RA.kinds('usecase').map(k => k.value + '|' + k.name + '|' + k.desc).join(';');
    var b = RC.kindsOf('usecase').map(k => k.value + '|' + k.name + '|' + k.desc).join(';');
    expect(a).toBe(b);
  });

  test('各項目に矢印の見本が付く', () => {
    ['usecase', 'component'].forEach(function(d) {
      RA.kinds(d).forEach(function(k) { expect(k.sample.length > 0).toBe(true); });
    });
  });

  test('defaultKind は先頭の種類', () => {
    expect(RA.defaultKind('usecase')).toBe('association');
    expect(RA.findKind('usecase', 'extend').desc).toBe('条件を満たすときだけ実行される');
  });
});
