// @ts-check
// reviewer 台本 手順8: 前回の指摘が反映されたか確認する。
// 指摘.md の反映状況・台帳・トラッカー (CLI 用の道具) は整理で外した。残るのは、
// 指摘が減った理由が正しいかを監査そのものが名指しすること。
const { test, expect } = require('@playwright/test');
// 監査は window.MA 前提なので、spec からは src/core を読み込む小さな入口で読む。
const { loadMA } = require('../../load-ma');

// 手順8 の裏取りは「指摘が減ったか」だけでは終わらない。
// メソッド名をそのままクラスとして宣言した行でも、写しにだけ入れた修正でも件数は減り、
// これまでは該当 diff を 1 枚ずつ読み直すか sha1 を手で比べるまで気付けなかった。
test('手順8 指摘が減った理由が誤った宣言なら、diff を読み直す前に監査が名指しする', () => {
  const MA = loadMA().MA;
  const seq = { name: 'adc_sequence.puml',
    dsl: ['@startuml', 'Adc_Driver -> AdcRegs : WriteConfig()', '@enduml'].join('\n') };
  const 前回 = { name: 'driver_common_class.puml',
    dsl: ['@startuml', 'class Adc_Driver {', '  +Adc_Init()', '}', '@enduml'].join('\n') };
  // primary の「対応」。受け手のクラスと一緒に、メソッド名のクラスまで足してある。
  const 今回 = { name: 'driver_common_class.puml', dsl: ['@startuml',
    'class Adc_Driver {', '  +Adc_Init()', '}',
    'class AdcRegs', 'class WriteConfig', '@enduml'].join('\n') };

  const before = MA.methodAudit.audit([前回, seq]);
  const after = MA.methodAudit.audit([今回, seq]);
  // 「クラス無し」は確かに消える。ここまでしか見ないと直ったように読める。
  expect(before.issues.filter((i) => i.kind === 'no-class').length).toBe(1);
  expect(after.issues.filter((i) => i.kind === 'no-class').length).toBe(0);

  // 到達条件: 誤った宣言が指摘として出るので、合計は減らない。
  const suspect = after.issues.filter((i) => i.kind === 'method-as-class');
  expect(suspect.map((i) => i.method)).toEqual(['WriteConfig']);
  expect(MA.methodAudit.describe(suspect[0])).toContain('メソッド宣言を独立したクラスとして書いた誤りの疑い');
  expect(after.issues.length).toBeGreaterThanOrEqual(before.issues.length);
});

test('手順8 本体ではなく写しにだけ入った修正を、sha1 を手で比べずに名指しする', () => {
  const MA = loadMA().MA;
  const seq = { name: 'timer_sequence.puml',
    dsl: ['@startuml', 'App -> Timer_Driver : Timer_Init(cfg)', '@enduml'].join('\n') };
  const 写し = { name: 'driver_common_class-編集中.puml',
    dsl: ['@startuml', 'class Timer_Driver {', '  +Timer_Init(cfg)', '}', '@enduml'].join('\n') };
  const r = MA.methodAudit.audit([写し, seq]);
  expect(r.issues.map((i) => i.kind)).toEqual(['draft-only']);
  // 到達条件: どのファイルにだけ宣言があるかまで 1 行で読める。
  expect(MA.methodAudit.describe(r.issues[0]))
    .toContain('写しの driver_common_class-編集中.puml にしかない');
});
