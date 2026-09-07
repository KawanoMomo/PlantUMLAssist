'use strict';
// BLK-builder-20260907-1003-3 / design 3b「Component — 矢印を選択」。
//
// 仕様: 線を選ぶと、関係の種類・向き・ラベル・削除だけを出す。関係の種類は
// UML の名称が主・意味の説明が従のカードで並べる。提供 / 要求 は向きが固定のため、
// 選んだ時点で 部品 → インターフェース の向きに並べ替え、その旨を注記で伝える。

var RC = (global.window && global.window.MA && global.window.MA.relationKindCards);
var co = (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlComponent);

var PARSED = {
  elements: [
    { kind: 'component', id: 'WebApp', label: 'WebApp' },
    { kind: 'component', id: 'Logger', label: 'Logger' },
    { kind: 'interface', id: 'IAuth', label: 'IAuth' },
  ],
};

describe('design 3b 関係の種類カード', function() {
  test('component の 4 種がすべて並ぶ', function() {
    var vals = RC.kindsOf('component').map(function(k) { return k.value; });
    expect(vals).toEqual(['association', 'dependency', 'provides', 'requires']);
  });

  test('各カードは UML の名称と意味の説明を両方持つ', function() {
    RC.kindsOf('component').forEach(function(k) {
      expect(k.name.length > 0).toBe(true);
      expect(k.desc.length > 0).toBe(true);
      // 名称は「和名 / 英名」、説明は記法ではなく日本語の文
      expect(k.name).toContain('/');
      expect(k.desc.indexOf('-') === -1).toBe(true);
    });
  });

  test('design が書いた説明文がそのまま出る', function() {
    var byVal = {};
    RC.kindsOf('component').forEach(function(k) { byVal[k.value] = k; });
    expect(byVal.association.desc).toBe('部品どうしが接続されている');
    expect(byVal.dependency.desc).toBe('一方が他方を利用している');
    expect(byVal.provides.desc).toBe('部品がインターフェースを提供する');
    expect(byVal.requires.desc).toBe('部品がインターフェースを必要とする');
  });

  test('cardsHtml は選択中のカードだけ aria-pressed=true にする', function() {
    var html = RC.cardsHtml('co-rel-card', RC.kindsOf('component'), 'dependency');
    expect(html).toContain('data-value="dependency" aria-pressed="true"');
    expect(html).toContain('data-value="association" aria-pressed="false"');
    expect(html).toContain('関係の種類 / Relation');
    expect(html).toContain('部品がインターフェースを提供する');
  });

  test('cardsHtml は 1 クリックで選べるボタンとして出す (select ではない)', function() {
    var html = RC.cardsHtml('co-rel-card', RC.kindsOf('component'), 'association');
    expect(html.indexOf('<select') === -1).toBe(true);
    expect(html.split('<button').length - 1).toBe(4);
  });
});

describe('design 3b 向きが固定の関係', function() {
  var kindOf = null;
  beforeEach(function() { kindOf = RC.kindOfFromParsed(PARSED); });

  test('provides / requires だけが向き固定', function() {
    expect(RC.isFixedOrientation('provides')).toBe(true);
    expect(RC.isFixedOrientation('requires')).toBe(true);
    expect(RC.isFixedOrientation('association')).toBe(false);
    expect(RC.isFixedOrientation('dependency')).toBe(false);
  });

  test('interface → component を選ぶと 部品 → インターフェース に並べ替える', function() {
    var o = RC.orient('provides', 'IAuth', 'WebApp', kindOf);
    expect(o.from).toBe('WebApp');
    expect(o.to).toBe('IAuth');
    expect(o.swapped).toBe(true);
  });

  test('すでに 部品 → インターフェース なら並べ替えない', function() {
    var o = RC.orient('requires', 'WebApp', 'IAuth', kindOf);
    expect(o.from).toBe('WebApp');
    expect(o.to).toBe('IAuth');
    expect(o.swapped).toBe(false);
  });

  test('向きが固定でない種類は並べ替えない', function() {
    var o = RC.orient('dependency', 'IAuth', 'WebApp', kindOf);
    expect(o.from).toBe('IAuth');
    expect(o.swapped).toBe(false);
  });

  test('部品どうしなど判定できない組は並べ替えない', function() {
    var o = RC.orient('provides', 'WebApp', 'Logger', kindOf);
    expect(o.swapped).toBe(false);
  });

  test('注記は選ぶ前から読める文言である', function() {
    expect(RC.noteHtml()).toContain('提供 / 要求 は向きが固定です');
    expect(RC.noteHtml()).toContain('部品 → インターフェース');
  });
});

describe('design 3b 見出しと DSL への反映', function() {
  test('headerHtml は行番号と From → To を平文で出す', function() {
    var html = RC.headerHtml(10, 'WebApp', 'Logger');
    expect(html).toContain('Relation · 10 行目');
    expect(html).toContain('WebApp → Logger');
  });

  test('並べ替えた向きで DSL に書くと 部品 -() インターフェース になる', function() {
    var text = [
      '@startuml',
      'component WebApp',
      'interface IAuth',
      'IAuth ..> WebApp',
      '@enduml',
    ].join('\n');
    var o = RC.orient('provides', 'IAuth', 'WebApp', RC.kindOfFromParsed(PARSED));
    var out = co.updateRelation(text, 4, 'kind', 'provides');
    out = co.updateRelation(out, 4, 'from', o.from);
    out = co.updateRelation(out, 4, 'to', o.to);
    expect(out.split('\n')[3]).toBe('WebApp -() IAuth');
  });

  test('並べ替えないまま provides にすると意味が逆転する (これを防ぐのが 3b)', function() {
    var text = '@startuml\nIAuth ..> WebApp\n@enduml';
    var out = co.updateRelation(text, 2, 'kind', 'provides');
    expect(out.split('\n')[1]).toBe('IAuth -() WebApp');
  });

  test('その他の設定は折りたたみとして出る', function() {
    var html = RC.moreSettingsHtml('co-rel-more');
    expect(html).toContain('その他の設定…');
    expect(html).toContain('aria-expanded="false"');
  });
});
