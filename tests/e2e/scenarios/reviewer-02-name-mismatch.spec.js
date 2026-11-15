// @ts-check
// reviewer 台本 手順2: 5 枚の間で部品名の不一致を探し、見つけたら指摘を書く
// (図名・行・内容・初出日・継続 tick 数)。
// 成長規則で対象は junior のフォルダにも広がっているので、フォルダをまたぐ
// 同じドメインの図の突合もここで到達条件にする (BLK-reviewer-20260909-0403-wish)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順2 図をまたぐ部品名の不一致を、図名と行で指せる', () => {
  const findings = [];
  for (const [name, dsl] of Object.entries(R.DOCS)) {
    dsl.split('\n').forEach((line, i) => {
      // 他図の多数派は Xxx_Driver。XxxDrv 形が残っていれば不一致。
      const m = /\b([A-Z][a-z]+)Drv\b/.exec(line);
      if (m) findings.push({ doc: name, line: i + 1, content: line.trim(), want: m[1] + '_Driver' });
    });
  }
  // 到達条件: 不一致が見つかり、指摘の 3 要素 (図名・行・内容) が揃う。
  expect(findings.length).toBeGreaterThan(0);
  expect(new Set(findings.map((f) => f.doc))).toEqual(new Set(['gpio_init_sequence']));
  expect(findings[0].line).toBeGreaterThan(0);
  expect(findings[0].want).toBe('Gpio_Driver');
});

// フォルダをまたぐ同じドメインの図の突合 (domain-cohort)・テンプレ由来の除外・ドメイン宣言 (domain-verdict) は
// TICKET-owner-20261115-2141-prune で外した (「部品」「系統」を前提にした突き合わせ。roadmap v5.0 (c))。
