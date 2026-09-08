// @ts-check
// reviewer 台本の素材。primary が persona-data\primary に置いた DSL を読む立場なので、
// 5 枚以上を「読むだけ」で持つ。欠陥はわざと 1 つずつ仕込んであり、
// どの spec がどの欠陥を捕まえるかが 1 対 1 になる。
const S = require('./_scenario');

const DOCS = {
  spi_init_sequence: S.docFor('spi_init_sequence'),
  spi_state: S.docFor('spi_state'),
  can_init_sequence: S.docFor('can_init_sequence'),
  can_state: S.docFor('can_state'),
  driver_common_class: S.docFor('driver_common_class'),
  // 手順2 の不一致: 他図は Gpio_Driver なのにここだけ GpioDrv。
  gpio_init_sequence: [
    '@startuml', 'title GPIO 初期化シーケンス',
    'participant GpioDrv', 'participant Hw_Ctrl', 'participant Dbg_Trace',
    'GpioDrv -> Hw_Ctrl : Gpio_Init', 'Hw_Ctrl --> GpioDrv : Gpio_Done',
    '@enduml',
  ].join('\n'),
  gpio_state: [
    '@startuml', 'title GPIO 状態遷移',
    '[*] --> Uninit', 'Uninit --> Ready : Gpio_Init', 'Ready --> Uninit : Gpio_Reset',
    '@enduml',
  ].join('\n'),
};

// 図のテキストから拾う小さな読み取り。reviewer は GUI を使わないので、
// 台本と同じく DSL テキストを直接読む。
function participants(dsl) {
  return (dsl.match(/^participant\s+(\S+)/gm) || []).map((l) => l.split(/\s+/)[1]);
}
function messages(dsl) {
  return (dsl.match(/^\S+\s+-+>\s+\S+\s*:\s*(.+)$/gm) || [])
    .map((l) => l.split(':').slice(1).join(':').trim());
}
function arrowEnds(dsl) {
  const out = [];
  (dsl.match(/^(\S+)\s+-+>\s+(\S+)\s*:/gm) || []).forEach((l) => {
    const m = /^(\S+)\s+-+>\s+(\S+)\s*:/.exec(l);
    if (m) { out.push(m[1]); out.push(m[2]); }
  });
  return out;
}
function transitions(dsl) {
  return (dsl.match(/^\S+\s+-->\s+\S+\s*:\s*(.+)$/gm) || [])
    .map((l) => l.split(':').slice(1).join(':').trim());
}
function classNames(dsl) {
  return (dsl.match(/^class\s+(\S+)/gm) || []).map((l) => l.split(/\s+/)[1]);
}
function methods(dsl) {
  return (dsl.match(/^\s*[+\-#]\s*\w+\s*\([^)]*\)/gm) || []).map((l) => l.trim());
}

module.exports = { DOCS, participants, messages, arrowEnds, transitions, classNames, methods };
