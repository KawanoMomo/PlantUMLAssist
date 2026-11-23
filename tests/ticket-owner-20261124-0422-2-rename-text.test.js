'use strict';
// TICKET-owner-20261124-0422-2: 改名で参照する行を付け替えるとき、付け替えるのは識別子の位置
// (宣言・線の両端・`note … of X` / `note over X` の対象) だけ。関係・メッセージのラベル、note の本文、
// コメント行の字は 1 バイトも変えない。共通の口 dslUpdater.renameWithRefs を 5 図種 (sequence・class・
// component・usecase・state) の改名が通る。
var DU = (typeof window !== 'undefined' && window.MA && window.MA.dslUpdater)
  || (global.window && global.window.MA && global.window.MA.dslUpdater);

function rw(lines, from, to) { return DU.renameWithRefs(lines.join('\n'), from, to).split('\n'); }

describe('renameWithRefs: ラベル・note の本文の同じ語は変えない', function() {
  test('component: 関係のラベルと 1 行の note の本文はそのまま、両端と note の対象だけ', function() {
    var out = rw(["' Bus is the shared line", 'component Bus', 'component BusCtl', 'Bus --> BusCtl : Bus data',
      'note right of Bus : Bus note'], 'Bus', 'Bus2');
    expect(out).toEqual(["' Bus is the shared line", 'component Bus2', 'component BusCtl', 'Bus2 --> BusCtl : Bus data',
      'note right of Bus2 : Bus note']);
  });
  test('class: 関係のラベル・note の本文はそのまま', function() {
    var out = rw(['class Bus {', '  +send()', '}', 'class BusCtl', 'BusCtl --> Bus : uses Bus', 'note right of Bus : Bus note'], 'Bus', 'Bus2');
    expect(out).toEqual(['class Bus2 {', '  +send()', '}', 'class BusCtl', 'BusCtl --> Bus2 : uses Bus', 'note right of Bus2 : Bus note']);
  });
  test('usecase: 関係のラベルはそのまま、短い書き方 :User: は識別子として付け替える', function() {
    var out = rw(['actor User', 'actor UserAdmin', 'User --> UC1 : User login', ':User: --> (Logout) : User out'], 'User', 'User2');
    expect(out).toEqual(['actor User2', 'actor UserAdmin', 'User2 --> UC1 : User login', ':User2: --> (Logout) : User out']);
  });
  test('sequence: メッセージのラベルと note over の本文はそのまま、`:` の前後に空白が無くても', function() {
    var out = rw(['participant Ctl', 'participant CtlSub', 'Ctl -> CtlSub : Ctl req', 'CtlSub->Ctl:Ctl ack',
      'note over Ctl : Ctl note', 'activate Ctl'], 'Ctl', 'Ctl2');
    expect(out).toEqual(['participant Ctl2', 'participant CtlSub', 'Ctl2 -> CtlSub : Ctl req', 'CtlSub->Ctl2:Ctl ack',
      'note over Ctl2 : Ctl note', 'activate Ctl2']);
  });
  test('state: 遷移のラベルと状態の説明・entry の文はそのまま', function() {
    var out = rw(['state Idle : Idle desc', '[*] --> Idle', 'Idle --> IdleWait : Idle go', 'Idle : entry / Idle start'], 'Idle', 'Idle2');
    expect(out).toEqual(['state Idle2 : Idle desc', '[*] --> Idle2', 'Idle2 --> IdleWait : Idle go', 'Idle2 : entry / Idle start']);
  });
  test('複数行の note は対象だけ付け替え、本文の行は変えない', function() {
    var out = rw(['note right of Bus', '  Bus is here', 'end note', 'note over Bus, X', 'Bus again', 'endnote', 'Bus --> X'], 'Bus', 'Bus2');
    expect(out).toEqual(['note right of Bus2', '  Bus is here', 'end note', 'note over Bus2, X', 'Bus again', 'endnote', 'Bus2 --> X']);
  });
  test('legend・title・区切り・グループの見出しの文は変えない', function() {
    var src = ['title Ctl overview', 'legend', 'Ctl is the controller', 'endlegend', '== Ctl phase ==', '... Ctl waits ...',
      'alt Ctl ok', 'Ctl -> X : go', 'else Ctl ng', 'end'];
    expect(rw(src, 'Ctl', 'Ctl2')).toEqual(['title Ctl overview', 'legend', 'Ctl is the controller', 'endlegend', '== Ctl phase ==',
      '... Ctl waits ...', 'alt Ctl ok', 'Ctl2 -> X : go', 'else Ctl ng', 'end']);
  });
  test('見出しの語を名前にした要素の関係の行は付け替える', function() {
    expect(rw(['group --> X : link'], 'group', 'grp')).toEqual(['grp --> X : link']);
  });
  test('引用符の中・コメント行・同じ名前で始まる別の名前は今どおり変えない', function() {
    var out = rw(['component "Bus" as Bus', "' Bus", 'BusCtl --> Bus'], 'Bus', 'Bus2');
    expect(out).toEqual(['component "Bus" as Bus2', "' Bus", 'BusCtl --> Bus2']);
  });
  test('CRLF の行末を保つ', function() {
    expect(DU.renameWithRefs('Bus --> X : Bus data\r\nnote right of Bus\r\nBus text\r\nend note\r\n', 'Bus', 'B2'))
      .toBe('B2 --> X : Bus data\r\nnote right of B2\r\nBus text\r\nend note\r\n');
  });
});

describe('改名する図種のモジュールは共通の口を使う (図種ごとの別の付け替えを持たない)', function() {
  var fs = require('fs');
  var path = require('path');
  ['sequence', 'class', 'component', 'usecase'].forEach(function(m) {
    test(m + '.js の renameWithRefs は dslUpdater.renameWithRefs', function() {
      var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', m + '.js'), 'utf8');
      expect(/var renameWithRefs = window\.MA\.dslUpdater\.renameWithRefs;/.test(src)).toBe(true);
    });
  });
  test('state.js の改名は dslUpdater.renameDecl を通る', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'state.js'), 'utf8');
    expect(src.indexOf('window.MA.dslUpdater.renameDecl(') >= 0).toBe(true);
  });
});
