'use strict';
// BLK-junior-20260908-1803: 見比べのために Open で開いたテンプレ (前周の完了物) へ、
// 図名を変えるまでの間に自動保存が書き込み、テンプレが編集途中の内容で壊れた。
// テンプレ宣言のあるファイルにはディスクへ書かない (localStorage の控えは残す)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

// localStorage は決め打ちの控えに差し替える (jsdom の実装は test 間で残る)。
(function() {
  var store = {};
  var stub = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();

try { delete require.cache[require.resolve('../src/core/file-role.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/auto-save.js')]; } catch (e) {}
require('../src/core/file-role.js');
require('../src/core/auto-save.js');

const FR = global.window.MA.fileRole;
const AS = global.window.MA.autoSave;

const ROLES = {
  'plantuml-usecase.puml': { role: 'template', baseline: 'abc', at: '2026-09-08T00:00:00Z' },
  'gpio-usecase.puml': { role: 'data', baseline: null, at: '2026-09-08T00:00:00Z' },
};

describe('テンプレは自動保存の書き先にしない (BLK-junior-20260908-1803)', function() {
  test('テンプレ宣言のある名前は止める', function() {
    expect(FR.blocksAutosave(ROLES, 'plantuml-usecase.puml')).toBe(true);
  });

  test('実データ・未分類・空は止めない (普段の保存を邪魔しない)', function() {
    expect(FR.blocksAutosave(ROLES, 'gpio-usecase.puml')).toBe(false);
    expect(FR.blocksAutosave(ROLES, 'shiranai.puml')).toBe(false);
    expect(FR.blocksAutosave(ROLES, '')).toBe(false);
    expect(FR.blocksAutosave(null, 'plantuml-usecase.puml')).toBe(false);
  });

  test('止めた理由の文言は、何が起きなかったかと次の手を言う', function() {
    var m = FR.blockedMessage('plantuml-usecase.puml');
    expect(m).toContain('plantuml-usecase.puml');
    expect(m).toContain('自動保存しません');
    expect(m).toContain('図名を変える');
  });
});

describe('autoSave の門 (BLK-junior-20260908-1803)', function() {
  var writes;
  var blocked = [];
  // 通知の受け手は 1 度だけ登録する (test ごとに足すと同じ通知を人数分数えてしまう)。
  AS.onFileBlocked(function(info) { blocked.push(info); });

  beforeEach(function() {
    writes = [];
    blocked.length = 0;
    global.window.localStorage.clear();
    global.window.fetch = function(url, opts) {
      writes.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
    };
    AS.setConfig({ enabled: true, debounceMs: 0, backend: 'file', fileDir: './x' });
    AS.setFileGuard(null);
    AS.resetFileBlocked();
  });

  test('門が無ければこれまでどおりディスクへ書く', function() {
    AS.scheduleSave('gpio-usecase', '@startuml\n@enduml');
    AS.flush();
    expect(writes.length).toBe(1);
    expect(writes[0].type).toBe('gpio-usecase');
  });

  test('門が止めた名前はディスクへ書かない', function() {
    AS.setFileGuard(function(t) { return t === 'plantuml-usecase' ? 'テンプレです' : null; });
    AS.scheduleSave('plantuml-usecase', '@startuml\nA --> B\n@enduml');
    AS.flush();
    expect(writes.length).toBe(0);
  });

  test('止めても localStorage の控えは残る (編集内容は失わない)', function() {
    AS.setFileGuard(function() { return 'テンプレです'; });
    AS.scheduleSave('plantuml-usecase', '@startuml\nmid-typing <<exte');
    AS.flush();
    expect(AS.restoreFor('plantuml-usecase')).toBe('@startuml\nmid-typing <<exte');
  });

  test('止めたことは 1 度だけ知らせる (1 打鍵ごとに鳴らさない)', function() {
    AS.setFileGuard(function() { return 'テンプレです'; });
    for (var i = 0; i < 5; i++) {
      AS.scheduleSave('plantuml-usecase', '@startuml\n' + i);
      AS.flush();
    }
    expect(blocked.length).toBe(1);
    expect(blocked[0].diagramType).toBe('plantuml-usecase');
  });

  test('別の名前になればまた知らせる', function() {
    AS.setFileGuard(function() { return 'テンプレです'; });
    AS.scheduleSave('plantuml-usecase', 'a'); AS.flush();
    AS.scheduleSave('plantuml-sequence', 'b'); AS.flush();
    expect(blocked.length).toBe(2);
  });

  test('門が例外を投げても保存は止まらない (門の壊れで作業を失わない)', function() {
    AS.setFileGuard(function() { throw new Error('boom'); });
    AS.scheduleSave('gpio-usecase', 'x');
    AS.flush();
    expect(writes.length).toBe(1);
  });
});
