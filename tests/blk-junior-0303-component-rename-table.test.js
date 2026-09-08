'use strict';
// BLK-junior-20260909-0303: コンポーネント図のサンプル要素を 1 回でまとめて付け替える。
var co = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlComponent);

var SAMPLE = [
  '@startuml',
  'component WebApp',
  'interface IAuth',
  'WebApp -() IAuth',
  '@enduml',
].join('\n');

describe('renameElements', function() {
  test('2 要素の Alias と Label を 1 回で付け替え、関連も追従する', function() {
    var out = co.renameElements(SAMPLE, [
      { line: 2, id: 'GpioDrv', label: 'GPIO ドライバ' },
      { line: 3, id: 'IGpio', label: 'GPIO API' },
    ]);
    expect(out).toContain('component "GPIO ドライバ" as GpioDrv');
    expect(out).toContain('interface "GPIO API" as IGpio');
    expect(out).toContain('GpioDrv -() IGpio');
    expect(out).not.toContain('WebApp');
    expect(out).not.toContain('IAuth');
  });

  test('Alias だけ変えても関連が追従する', function() {
    var out = co.renameElements(SAMPLE, [{ line: 2, id: 'GpioDrv', label: '' }]);
    expect(out).toContain('component GpioDrv');
    expect(out).toContain('GpioDrv -() IAuth');
  });

  test('Label だけ変えると Alias は保たれる', function() {
    var out = co.renameElements(SAMPLE, [{ line: 3, id: 'IAuth', label: 'GPIO API' }]);
    expect(out).toContain('interface "GPIO API" as IAuth');
    expect(out).toContain('WebApp -() IAuth');
  });

  test('同値・空欄・存在しない行は無視する', function() {
    expect(co.renameElements(SAMPLE, [
      { line: 2, id: 'WebApp', label: 'WebApp' },
      { line: 9, id: 'X', label: 'X' },
      { line: 3, id: '', label: '' },
    ])).toBe(SAMPLE);
    expect(co.renameElements(SAMPLE, [])).toBe(SAMPLE);
    expect(co.renameElements(SAMPLE, null)).toBe(SAMPLE);
  });

  test('前後の空白は落とす', function() {
    var out = co.renameElements(SAMPLE, [{ line: 2, id: '  GpioDrv  ', label: '  GPIO ドライバ ' }]);
    expect(out).toContain('component "GPIO ドライバ" as GpioDrv');
  });

  test('部分一致する他の名前を巻き込まない', function() {
    var src = '@startuml\ncomponent WebApp\ncomponent WebAppTest\nWebApp -- WebAppTest\n@enduml';
    var out = co.renameElements(src, [{ line: 2, id: 'GpioDrv', label: '' }]);
    expect(out).toContain('component GpioDrv');
    expect(out).toContain('component WebAppTest');
    expect(out).toContain('GpioDrv -- WebAppTest');
  });
});
