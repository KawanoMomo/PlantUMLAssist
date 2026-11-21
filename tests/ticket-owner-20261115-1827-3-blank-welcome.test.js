'use strict';
// TICKET-owner-20261115-1827-3: 白紙の図 (@startuml / @enduml だけ) に PlantUML が返す案内画面
// 「Welcome to PlantUML!」を利用者の図として出さない。白紙かどうかの判定 (isBlankWelcome) を守る。
// 全件の実行では前のファイルが global.window を差し替えるので、render-error.js を自前の window に読み込む。
var fs = require('fs');
var path = require('path');
var ownWin = { MA: {} };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'render-error.js'), 'utf8'))(ownWin);
var RE = ownWin.MA.renderError;

// PlantUML が白紙の本文に返す案内画面の骨格 (ロゴ・長い本文は省いてある)。
var WELCOME_SVG = [
  '<?plantuml 1.2026.8?><svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">',
  '<text fill="#000000" font-size="14" font-weight="bold">Welcome to PlantUML!</text>',
  '<text fill="#000000" font-size="12">You can start with a simple UML Diagram like:</text>',
  '<text fill="#000000" font-size="12">Bob-&gt;Alice: Hello</text>',
  '<text fill="#000000" font-size="12">https://plantuml.com</text>',
  '</svg>',
].join('');

var ERROR_SVG = [
  '<?plantuml 1.2026.2?><svg xmlns="http://www.w3.org/2000/svg">',
  '<text fill="#000000" font-size="12">Welcome to PlantUML!</text>',
  '<rect fill="#33FF02" width="142" x="5" y="296"/>',
  '<text fill="#000000" font-size="14">[From string (line 3) ]</text>',
  '<text fill="#33FF02" font-size="14">zzz??? bad line !!!</text>',
  '<text fill="#FF0000" font-size="14">Syntax Error? (Assumed diagram type: sequence)</text>',
  '</svg>',
].join('');

var GOOD_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Alice</text><text>Bob</text></svg>';

describe('白紙の図の案内画面を図として出さない (TICKET-owner-20261115-1827-3)', function() {
  test('白紙の本文に返った案内画面は白紙とみなす (6 図種とも本文は @startuml / @enduml だけ)', function() {
    expect(RE.isBlankWelcome(WELCOME_SVG, '@startuml\n@enduml')).toBe(true);
    expect(RE.isBlankWelcome(WELCOME_SVG, '@startuml\n\n@enduml\n')).toBe(true);
    expect(RE.isBlankWelcome(WELCOME_SVG, "@startuml\n' メモ\n@enduml")).toBe(true);
  });

  test('ふつうに描けた図は白紙ではない', function() {
    expect(RE.isBlankWelcome(GOOD_SVG, '@startuml\nAlice -> Bob\n@enduml')).toBe(false);
    expect(RE.isBlankWelcome('', '@startuml\n@enduml')).toBe(false);
    expect(RE.isBlankWelcome(null, '@startuml\n@enduml')).toBe(false);
  });

  test('本文に自分で「Welcome to PlantUML!」と書いた図は白紙ではない', function() {
    expect(RE.isBlankWelcome(WELCOME_SVG, '@startuml\nAlice -> Bob : Welcome to PlantUML!\n@enduml')).toBe(false);
  });

  test('同じ文言を含むエラー画は白紙ではない (帯の扱いのまま)', function() {
    expect(RE.isBlankWelcome(ERROR_SVG, '@startuml\nzzz??? bad line !!!\n@enduml')).toBe(false);
  });

  test('案内の 1 行は日本語で「末尾に追加」から足せることを言い、plantuml.com を出さない', function() {
    expect(RE.BLANK_HINT).toBe('まだ要素がありません。右の「末尾に追加」から最初の要素を足せます');
    expect(/plantuml\.com|Welcome/.test(RE.BLANK_HINT)).toBe(false);
  });
});
