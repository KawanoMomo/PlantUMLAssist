'use strict';
// BLK-junior-20260907-1303-wish: 題材プリセット。
// セットを 1 度登録すれば、以降は「プリセットを選ぶ → 題材名を打つ → 生成」だけで
// 同じ構成の図一式が揃うこと。元の図がタブにも保存フォルダにも無くても生成できること。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var SP = W.MA.subjectPreset;
var FC = W.MA.familyClone;

function memStore() {
  var data = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function(k, v) { data[k] = String(v); },
    _data: data,
  };
}

var SEQ = '@startuml\ntitle GPIO 初期化\nparticipant App\nparticipant GpioDrv\nApp -> GpioDrv : Gpio_Init()\n@enduml';
var CLS = '@startuml\nclass GpioDrv {\n  +Gpio_Init()\n}\n@enduml';
var GROUP = {
  key: 'gpio',
  docs: [
    { name: 'GPIOドライバ初期化シーケンス.puml', diagramType: 'plantuml-sequence', dsl: SEQ },
    { name: 'GPIOドライバ派生クラス.puml', diagramType: 'plantuml-class', dsl: CLS },
  ],
};

describe('subjectPreset.fromGroup', function() {
  test('セットの中身を実体で持つ (元の図が消えても生成できる)', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式');
    expect(p.name).toBe('ドライバ一式');
    expect(p.subject).toBe('Gpio');
    expect(p.docs.length).toBe(2);
    expect(p.docs[0].dsl).toContain('Gpio_Init()');
    expect(p.docs[0].diagramType).toBe('plantuml-sequence');
  });
  test('拡張子は名前から落とす', function() {
    expect(SP.fromGroup(GROUP, 'Gpio', 'x').docs[0].name).toBe('GPIOドライバ初期化シーケンス');
  });
  test('プリセット名を省くと系統名を使う', function() {
    expect(SP.fromGroup(GROUP, 'Gpio', '').name).toBe('gpio');
  });
});

describe('subjectPreset.validate', function() {
  test('揃っていれば空文字 (登録できる)', function() {
    expect(SP.validate(SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式'))).toBe('');
  });
  test('名前が無ければ理由を返す', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', '');
    p.name = '';
    expect(SP.validate(p)).toContain('プリセット名');
  });
  test('置換元が無ければ理由を返す', function() {
    expect(SP.validate(SP.fromGroup(GROUP, '', 'x'))).toContain('置換元');
  });
  test('図が 0 枚なら理由を返す', function() {
    expect(SP.validate(SP.fromGroup({ key: 'x', docs: [] }, 'Gpio', 'x'))).toContain('1 枚もありません');
  });
  test('置換元がどの図にも出てこなければ登録させない', function() {
    expect(SP.validate(SP.fromGroup(GROUP, 'Spi', 'x'))).toContain('出てきません');
  });
});

describe('subjectPreset の保存先', function() {
  test('save したものが list / load で戻る', function() {
    var s = memStore();
    SP.save(s, SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式'));
    expect(SP.list(s).length).toBe(1);
    expect(SP.load(s, 'ドライバ一式').subject).toBe('Gpio');
    expect(SP.load(s, 'ドライバ一式').docs.length).toBe(2);
  });
  test('同じ名前は上書きになる (登録し直しで重複しない)', function() {
    var s = memStore();
    SP.save(s, SP.fromGroup(GROUP, 'Gpio', 'A'));
    SP.save(s, SP.fromGroup(GROUP, 'GpioDrv', 'A'));
    expect(SP.list(s).length).toBe(1);
    expect(SP.load(s, 'A').subject).toBe('GpioDrv');
  });
  test('名前順に並ぶ', function() {
    var s = memStore();
    SP.save(s, SP.fromGroup(GROUP, 'Gpio', 'ゼータ'));
    SP.save(s, SP.fromGroup(GROUP, 'Gpio', 'アルファ'));
    expect(SP.list(s).map(function(p) { return p.name; })).toEqual(['アルファ', 'ゼータ']);
  });
  test('remove で消える', function() {
    var s = memStore();
    SP.save(s, SP.fromGroup(GROUP, 'Gpio', 'A'));
    SP.remove(s, 'A');
    expect(SP.list(s).length).toBe(0);
  });
  test('壊れた JSON でも空扱いで進む (図の作成を止めない)', function() {
    var s = memStore();
    s.setItem(SP.KEY, '{壊れている');
    expect(SP.list(s)).toEqual([]);
  });
  test('配列でない値が入っていても空扱い', function() {
    var s = memStore();
    s.setItem(SP.KEY, '{"name":"x"}');
    expect(SP.list(s)).toEqual([]);
  });
  test('登録できない形は理由付きで投げ、保存先を汚さない', function() {
    var s = memStore();
    expect(function() { SP.save(s, SP.fromGroup(GROUP, 'Spi', 'A')); }).toThrow('出てきません');
    expect(SP.list(s).length).toBe(0);
  });
});

describe('subjectPreset.plan — 題材名だけで一式を生成する', function() {
  test('プリセット + 題材名で 2 枚が生成でき、名前も題材が替わる', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式');
    var plan = SP.plan(p, 'I2c', []);
    expect(plan.ready).toBe(true);
    expect(plan.items.length).toBe(2);
    expect(plan.items[0].dsl).toContain('I2c_Init()');
    expect(plan.items[0].dsl).not.toContain('Gpio_Init()');
    expect(plan.items[0].name).toContain('I2C');
  });
  test('大小の族ごと替わる (GPIO も Gpio も同時に)', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式');
    var dsl = SP.plan(p, 'I2c', []).items[0].dsl;
    expect(dsl).toContain('I2C 初期化');
    expect(dsl).toContain('I2cDrv');
  });
  test('図種はプリセットに保存したものを引き継ぐ', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式');
    var items = SP.plan(p, 'I2c', []).items;
    expect(items[0].diagramType).toBe('plantuml-sequence');
    expect(items[1].diagramType).toBe('plantuml-class');
  });
  test('題材名が空なら生成させない', function() {
    expect(SP.plan(SP.fromGroup(GROUP, 'Gpio', 'A'), '', []).ready).toBe(false);
  });
  test('既にその題材で作ってあれば conflicts が名指しで返る', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'A');
    expect(SP.conflicts(p, 'I2c', ['I2Cドライバ初期化シーケンス'])).toEqual(['I2Cドライバ初期化シーケンス']);
  });
  test('拡張子付きで渡された既存名とも突き合う', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'A');
    expect(SP.conflicts(p, 'I2c', ['I2Cドライバ派生クラス.puml']).length).toBe(1);
  });
  test('まだ作っていない題材なら conflicts は空', function() {
    expect(SP.conflicts(SP.fromGroup(GROUP, 'Gpio', 'A'), 'I2c', ['GPIOドライバ派生クラス'])).toEqual([]);
  });
  test('題材名が空なら conflicts は空 (打ちかけで赤を出さない)', function() {
    expect(SP.conflicts(SP.fromGroup(GROUP, 'Gpio', 'A'), '', ['何か'])).toEqual([]);
  });
  test('名前がぶつかっても plan は別名で作る (黙って上書きしない)', function() {
    var plan = SP.plan(SP.fromGroup(GROUP, 'Gpio', 'A'), 'I2c', ['I2Cドライバ初期化シーケンス']);
    expect(plan.items[0].name).not.toBe('I2Cドライバ初期化シーケンス');
    expect(plan.items[1].name).toBe('I2Cドライバ派生クラス');
  });
  test('preset が無ければ空の plan を返す (落ちない)', function() {
    expect(SP.plan(null, 'I2c', []).ready).toBe(false);
  });
  test('family-clone の plan と同じ結果になる (置換規則を 2 つ持たない)', function() {
    var p = SP.fromGroup(GROUP, 'Gpio', 'A');
    var mine = SP.plan(p, 'I2c', []);
    var theirs = FC.plan(GROUP, [{ from: 'Gpio', to: 'I2c' }], []);
    expect(mine.items.map(function(i) { return i.dsl; })).toEqual(theirs.items.map(function(i) { return i.dsl; }));
  });
});

describe('subjectPreset.describe', function() {
  test('枚数・置換元・図種が 1 行で分かる', function() {
    var t = SP.describe(SP.fromGroup(GROUP, 'Gpio', 'ドライバ一式'));
    expect(t).toContain('ドライバ一式');
    expect(t).toContain('2 枚');
    expect(t).toContain('置換元: Gpio');
    expect(t).toContain('クラス / シーケンス');
  });
  test('preset が無ければ空文字', function() {
    expect(SP.describe(null)).toBe('');
  });
});
