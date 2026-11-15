'use strict';
// BLK-builder-20260924-1716-4 (design 9c / 10a): 下端の「並べて比較」の札は
// TICKET-owner-20261115-2141-prune で外した。入口は FILES「読むだけ」の 1 か所。

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('下端の並べて比較の札は無い', function() {
  test('HTML に #status-senior の札も CSS も無い', function() {
    expect(html).not.toContain('id="status-senior"');
    expect(/#status-senior\b/.test(html)).toBe(false);
  });

  test('入口は FILES「読むだけ」の ⇔ に残っている', function() {
    expect(html).toContain('id="btn-tab-senior"');
  });
});
