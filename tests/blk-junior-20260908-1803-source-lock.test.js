'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
var SL = global.window.MA.sourceLock;

describe('source-lock — 開いた元ファイルを自動保存から守る (BLK-junior-20260908-1803-wish)', () => {
  beforeEach(() => { SL.clearAll(); });

  test('錠の無いドキュメントは今までどおりその名前へ書く', () => {
    expect(SL.decide('doc1', 'timer_state')).toEqual({ action: 'write', name: 'timer_state' });
    expect(SL.decide(null, 'timer_state')).toEqual({ action: 'write', name: 'timer_state' });
  });

  test('開いた瞬間に錠がかかり、最初の書き込みは聞いてから', () => {
    SL.mark('doc1', 'plantuml-usecase');
    expect(SL.decide('doc1', 'plantuml-usecase')).toEqual({ action: 'ask', origin: 'plantuml-usecase' });
    // 聞いている間は何度呼ばれても書かない (テンプレートが壊れる事故の再発防止)
    expect(SL.decide('doc1', 'plantuml-usecase').action).toBe('ask');
  });

  test('「元のまま保つ」を選ぶと、書き先は控えの名前に逃げる', () => {
    SL.mark('doc1', 'plantuml-usecase');
    var r = SL.answer('doc1', 'keep', ['plantuml-usecase']);
    expect(r).toEqual({ action: 'write', name: 'plantuml-usecase-編集中' });
    // 以後は聞かずに控えへ書き続ける
    expect(SL.decide('doc1', 'plantuml-usecase')).toEqual({ action: 'write', name: 'plantuml-usecase-編集中' });
  });

  test('控えの名前が既に使われていれば連番で避ける', () => {
    expect(SL.copyName('a', [])).toBe('a-編集中');
    expect(SL.copyName('a', ['a-編集中'])).toBe('a-編集中-2');
    expect(SL.copyName('a', ['a-編集中', 'a-編集中-2'])).toBe('a-編集中-3');
  });

  test('「書き換える」を選べば、以後は聞かずに元ファイルへ書く', () => {
    SL.mark('doc1', 'my-draft');
    expect(SL.answer('doc1', 'overwrite', [])).toEqual({ action: 'write', name: 'my-draft' });
    expect(SL.decide('doc1', 'my-draft')).toEqual({ action: 'write', name: 'my-draft' });
  });

  test('図名欄で名前を変え終えたら錠は外れる', () => {
    SL.mark('doc1', 'plantuml-usecase');
    expect(SL.decide('doc1', '自分版ユースケース')).toEqual({ action: 'write', name: '自分版ユースケース' });
    expect(SL.stateOf('doc1')).toBe(null);
  });

  test('「元のまま保つ」のあとに改名しても錠は外れ、新しい名前へ書く', () => {
    SL.mark('doc1', 'plantuml-usecase');
    SL.answer('doc1', 'keep', []);
    expect(SL.decide('doc1', '自分版')).toEqual({ action: 'write', name: '自分版' });
    expect(SL.stateOf('doc1')).toBe(null);
  });

  test('同じファイルを開き直しても、答え済みの返事はやり直さない', () => {
    SL.mark('doc1', 'plantuml-usecase');
    SL.answer('doc1', 'keep', []);
    SL.mark('doc1', 'plantuml-usecase');
    expect(SL.stateOf('doc1').mode).toBe('copy');
  });

  test('タブごとに錠は独立している', () => {
    SL.mark('doc1', 'a');
    SL.mark('doc2', 'b');
    SL.answer('doc1', 'overwrite', []);
    expect(SL.decide('doc1', 'a').action).toBe('write');
    expect(SL.decide('doc2', 'b').action).toBe('ask');
    SL.release('doc1');
    expect(SL.stateOf('doc1')).toBe(null);
    expect(SL.stateOf('doc2').mode).toBe('ask');
  });

  test('確認の文言は元ファイル名と逃がし先を必ず言う', () => {
    var t = SL.askText('plantuml-usecase');
    expect(t.body).toContain('plantuml-usecase.puml');
    expect(t.keep).toContain('plantuml-usecase-編集中');
    expect(t.overwrite).toContain('書き換える');
  });

  test('上部バーの表示は、書き先がどこかを錠の状態ごとに言う', () => {
    expect(SL.label('doc1', 'a')).toBe(null);
    SL.mark('doc1', 'a');
    expect(SL.label('doc1', 'a').text).toBe('🔒 a');
    SL.answer('doc1', 'keep', []);
    expect(SL.label('doc1', 'a').title).toContain('a-編集中.puml');
    SL.answer('doc1', 'overwrite', []);
    expect(SL.label('doc1', 'a').text).toBe('✎ a');
    // 改名済みのタブには何も出さない
    expect(SL.label('doc1', 'b')).toBe(null);
  });
});
