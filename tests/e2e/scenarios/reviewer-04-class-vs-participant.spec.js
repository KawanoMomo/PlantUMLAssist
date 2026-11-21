// @ts-check
// reviewer 台本 手順4: クラス図のクラス名が、シーケンスの participant 名と一致するか突合する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');
const { loadMA } = require('../../load-ma');

test('手順4 クラス名と participant 名の食い違いを挙げられる', () => {
  const classes = R.classNames(R.DOCS.driver_common_class);
  expect(classes).toContain('Gpio_Driver');
  const parts = R.participants(R.DOCS.gpio_init_sequence);
  // 到達条件: クラス図にある Gpio_Driver がシーケンスに無い(GpioDrv になっている)と言える。
  expect(parts).not.toContain('Gpio_Driver');
  expect(parts).toContain('GpioDrv');
  const unmatched = classes.filter((c) => !parts.includes(c) && /Gpio/.test(c));
  expect(unmatched).toEqual(['Gpio_Driver']);
});

// ── BLK-reviewer-20260912-2206-wish ─────────────────────────────────────
// 成長規則で対象が junior のフォルダにも広がった回、junior と primary の
// 同名ファイル (gpio_init_sequence.puml) で participant 名 (Gpio / Gpio_Driver) と
// 粒度が食い違っているのを見つけたが、GUI にはこの 2 枚を並べて見る手段が無く、
// persona-data の 2 フォルダから同名ファイルを自分でテキストとして開いて
// 読み比べるしかなかった。同名で組み、本文を左右に並べ、食い違う語だけを
// 光らせられることを到達条件にする。

const JDIR = S.dirFor(__filename) + '-junior';
const PDIR = S.dirFor(__filename) + '-primary';
// 覚える必要の無い、実際のフォルダ名 (覚き先の一覧に出るのはフォルダ名そのもの)。
const JF = JDIR.slice(JDIR.lastIndexOf('/') + 1);
const PF = PDIR.slice(PDIR.lastIndexOf('/') + 1);
const BASE = 'sbs_gpio_init_sequence';

const J_DSL = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio', 'participant Hw_Ctrl',
  'Gpio -> Hw_Ctrl : Gpio_Init', 'Hw_Ctrl --> Gpio : Gpio_Done', '@enduml'].join('\n');
const P_DSL = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', 'Gpio_Driver -> Hw_Ctrl : Gpio_SetMode',
  'Hw_Ctrl --> Gpio_Driver : Gpio_Done', '@enduml'].join('\n');
