'use strict';
// BLK-builder-20260924-1706-3 (design 7a / 9a): 図種は左レールが選ぶ。上部バーの
// 「Sequence ▾」(#diagram-type) は同じ選択の 2 つ目の入口なので画面から外す。
// 値の持ち主 (change を各所が聞いている) なので要素そのものは残す。

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

function cssBlock(selector) {
  var re = new RegExp('\\n' + selector.replace(/[#-]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  var out = [];
  var m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join(';');
}

describe('上部バーの図種プルダウンを外す (BLK-builder-20260924-1706-3)', function() {
  test('要素は残り、6 図種の値を持つ', function() {
    var at = html.indexOf('<select id="diagram-type"');
    expect(at).toBeGreaterThan(0);
    var body = html.slice(at, html.indexOf('</select>', at));
    ['plantuml-sequence', 'plantuml-usecase', 'plantuml-component',
      'plantuml-class', 'plantuml-activity', 'plantuml-state'].forEach(function(v) {
      expect(body.indexOf('value="' + v + '"')).toBeGreaterThan(0);
    });
  });

  test('Tab で止まらず、読み上げにも出ない', function() {
    var tag = html.slice(html.indexOf('<select id="diagram-type"'));
    tag = tag.slice(0, tag.indexOf('>') + 1);
    expect(tag).toContain('tabindex="-1"');
    expect(tag).toContain('aria-hidden="true"');
  });

  test('画面では 1px に切り抜いて押せない (display:none にはしない: E2E の selectOption が効く)', function() {
    var css = cssBlock('#diagram-type');
    expect(css).toContain('clip-path: inset(50%)');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('position: absolute');
    expect(/display:\s*none/.test(css)).toBe(false);
    // 右寄せの余白を取らない (Import ▾ / Export ▾ が上部バーの右端に来る)
    expect(/margin-left:\s*auto/.test(css)).toBe(false);
  });
});
