// @ts-check
// BLK-reviewer-20260907-1203: CRLF で保存された DSL でも突合と構造一覧が動くこと。
// persona-data 配下の .puml は全て CRLF。素の split('\n') では行末に CR が残り、
// 行末を見る正規表現が一切マッチせず、突合が 0 件 =「問題なし」に化けていた。
// ブラウザに読ませた状態 (script の読み込み順を含む) で確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const STATE_DSL = [
  '@startuml',
  'state Idle',
  'state Sampling',
  '[*] --> Idle',
  'Idle --> Sampling : Timer_StartConv',
  'Sampling --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

const CLASS_DSL = [
  '@startuml',
  'class Timer_Driver {',
  '  + Timer_Init() : void',
  '}',
  '@enduml',
].join('\n');

test.describe('BLK-reviewer-1203 CRLF の DSL でも突合が効く', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
  });

  test('splitLines が LF / CRLF / CR を同じに割る', async ({ page }) => {
    const out = await page.evaluate(() => ({
      lf: window.MA.dslUtils.splitLines('a\nb'),
      crlf: window.MA.dslUtils.splitLines('a\r\nb'),
      cr: window.MA.dslUtils.splitLines('a\rb'),
    }));
    expect(out.lf).toEqual(['a', 'b']);
    expect(out.crlf).toEqual(['a', 'b']);
    expect(out.cr).toEqual(['a', 'b']);
  });

  test('CRLF の state 図から遷移イベントを拾える (以前は 0 件)', async ({ page }) => {
    const events = await page.evaluate(({ s }) => window.MA.methodAudit.stateEvents([
      { name: 'timer_state', diagramType: 'plantuml-state', dsl: s.replace(/\n/g, '\r\n') },
    ]).map((e) => e.event), { s: STATE_DSL });
    expect(events).toEqual(['Timer_StartConv', 'Timer_Ack']);
  });

  test('CRLF でも宣言の無いイベントを「問題なし」にしない', async ({ page }) => {
    const res = await page.evaluate(({ s, c }) => {
      const docs = (eol) => ([
        { name: 'timer_state', diagramType: 'plantuml-state', dsl: eol(s) },
        { name: 'timer_class', diagramType: 'plantuml-class', dsl: eol(c) },
      ]);
      const toCrlf = (t) => t.replace(/\n/g, '\r\n');
      const lf = window.MA.methodAudit.audit(docs((t) => t));
      const crlf = window.MA.methodAudit.audit(docs(toCrlf));
      return { lfIssues: lf.issues.length, crlfIssues: crlf.issues.length, crlfClean: crlf.clean };
    }, { s: STATE_DSL, c: CLASS_DSL });
    expect(res.crlfClean).toBe(false);
    expect(res.crlfIssues).toBe(res.lfIssues);
    expect(res.crlfIssues).toBeGreaterThan(0);
  });

  test('CRLF でも構造一覧が LF と同じになる', async ({ page }) => {
    const res = await page.evaluate(({ s }) => {
      const lf = window.MA.outline.build(s);
      const crlf = window.MA.outline.build(s.replace(/\n/g, '\r\n'));
      return {
        same: JSON.stringify(lf) === JSON.stringify(crlf),
        labels: crlf.nodes.map((n) => n.label).join(' '),
      };
    }, { s: STATE_DSL });
    expect(res.same).toBe(true);
    expect(res.labels).toContain('Idle');
    expect(res.labels).toContain('Sampling');
  });
});
