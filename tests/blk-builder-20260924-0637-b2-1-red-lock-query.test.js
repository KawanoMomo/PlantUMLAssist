'use strict';
// BLK-builder-20260924-0637-b2-1-red (known-red primary-05-fix-gaps:46):
// 「元ファイルは変更前のまま保つ」で保存が控え (`{名前}-編集中`) へ逸れたのに、帯が
// 「本体は変更前のままです」と言った直後、本体が書き換わっていた。保存前の突合が
// 「開いたときのままか」を decide で問い合わせており、控えの名前で聞いたために
// decide が「名前が変わった」と読んで錠を外し、続く突合の書き戻しが本体へ入っていた。
// 問い合わせ (unchangedSinceOpen) は錠に触らないこと、app.js がそれを使うことを守る。

var fs = require('fs');
var path = require('path');

// 錠は localStorage に持つので、URL 付きの jsdom を自前で用意する (単独実行でも読み書きできる)。
var jsdom = require('jsdom');
var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
var SL = global.window.MA.sourceLock;

var OPENED = ['@startuml', 'class AdcRegs', 'class SpiRegs', '@enduml'].join('\n');
var EDITED = OPENED + '\nclass WriteConfig';

describe('source-lock — 開いたときのままかを、錠を動かさずに答える', function() {
  beforeEach(function() { SL.clearAll(); });

  test('開いたときの本文のままなら true、1 文字でも変われば false', function() {
    SL.mark('doc1', 'plantuml-usecase', OPENED);
    expect(SL.unchangedSinceOpen('doc1', OPENED)).toBe(true);
    expect(SL.unchangedSinceOpen('doc1', EDITED)).toBe(false);
  });

  test('控えへ逸れた後に問い合わせても錠は外れず、書き先は控えのまま', function() {
    SL.mark('doc1', 'plantuml-usecase', OPENED);
    var w = SL.answer('doc1', 'keep', [], false);
    expect(w.name).toBe('plantuml-usecase' + SL.COPY_SUFFIX);
    // 保存前の突合がする問い合わせ (控えを選んだ図は「開いたまま」ではない)。
    expect(SL.unchangedSinceOpen('doc1', EDITED)).toBe(false);
    // 錠は残っていて、次の書き戻しも控えへ行く (本体へは入らない)。
    expect(SL.stateOf('doc1')).not.toBeNull();
    expect(SL.decide('doc1', 'plantuml-usecase', [], EDITED).name).toBe('plantuml-usecase' + SL.COPY_SUFFIX);
  });

  test('錠の無い図 (自分で作ったタブ) は「開いたまま」ではない', function() {
    expect(SL.unchangedSinceOpen('nodoc', OPENED)).toBe(false);
  });

  test('「書き換える」と答えた図は、本文が同じでも「開いたまま」に数えない (decide と同じ)', function() {
    SL.mark('doc1', 'plantuml-usecase', OPENED);
    SL.answer('doc1', 'overwrite', [], false);
    expect(SL.unchangedSinceOpen('doc1', OPENED)).toBe(false);
  });
});

describe('app.js — 保存前の突合の問い合わせは錠を動かさない', function() {
  test('_isUnchangedSinceOpen は decide ではなく unchangedSinceOpen で聞く', function() {
    var app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');
    var i = app.indexOf('function _isUnchangedSinceOpen(');
    expect(i).toBeGreaterThan(-1);
    var body = app.slice(i, app.indexOf('\n}', i));
    expect(body.indexOf('unchangedSinceOpen(doc.id')).toBeGreaterThan(-1);
    expect(body.indexOf('.decide(')).toBe(-1);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
