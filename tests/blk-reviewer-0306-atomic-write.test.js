'use strict';
// BLK-reviewer-20260913-0306
// reviewer は保存フォルダの .puml を GUI の外から直に読む。server.py が
// write_text で書いていた間は「0 バイトに切り詰めてから書く」ので、書いている
// 数百 ms の間に読んだ側は空・または途中までのファイルを見た (reviewer は
// 1298 → 78 バイトの揺れを実測し、内容消失と区別できなかった)。
// 読む側からは必ず「前の全文」か「次の全文」のどちらかに見えることを確かめる。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, tempfile, threading, time',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
  }).trim();
}

// 大きい方と小さい方を交互に書き続けながら、別のスレッドで読み続ける。
// 読めた中身が 2 つのどちらでもなければ、途中経過が見えたということ。
const READ_WHILE_WRITING = [
  'from pathlib import Path',
  'BIG = "@startuml\\n" + "class C%d\\n" * 400 % tuple(range(400)) + "@enduml\\n"',
  'SMALL = "@startuml\\nclass C\\n@enduml\\n"',
  'd = Path(tempfile.mkdtemp())',
  'p = d / "driver_common_class.puml"',
  'srv._atomic_write_text(p, BIG)',
  'stop = threading.Event()',
  'torn = []',
  'reads = [0]',
  'def reader():',
  '    while not stop.is_set():',
  '        try:',
  '            t = p.read_text(encoding="utf-8")',
  '        except OSError:',
  '            continue',
  '        reads[0] += 1',
  '        if t != BIG and t != SMALL:',
  '            torn.append(len(t))',
  '        time.sleep(0.002)',
  'th = threading.Thread(target=reader, daemon=True)',
  'th.start()',
  'for i in range(120):',
  '    srv._atomic_write_text(p, SMALL if i % 2 else BIG)',
  'stop.set()',
  'th.join(5)',
  'print(json.dumps({"torn": torn[:5], "tornCount": len(torn), "reads": reads[0]}))',
];

// 書いた中身がそのまま読めること (原子的にしたせいで改行や文字コードが変わらない)。
const ROUND_TRIP = [
  'from pathlib import Path',
  'd = Path(tempfile.mkdtemp())',
  'p = d / "x.puml"',
  'body = "@startuml\\ntitle ドライバ共通クラス図\\nclass Spi_Driver\\n@enduml\\n"',
  'srv._atomic_write_text(p, body)',
  'same = p.read_text(encoding="utf-8") == body',
  's = d / "x.svg"',
  'svg = "<svg>\\n<text>あ</text>\\n</svg>"',
  'srv._atomic_write_text(s, svg, newline="")',
  'raw = s.read_bytes()',
  'leftovers = [q.name for q in d.iterdir() if ".tmp-" in q.name]',
  'print(json.dumps({"same": same, "svgNoCrlf": b"\\r\\n" not in raw, "leftovers": leftovers}))',
];

describe('保存フォルダの書き込みは読んでいる側に途中を見せない (BLK-reviewer-20260913-0306)', () => {
  test('書き換え中に読み続けても、空や途中までの中身は一度も読めない', () => {
    const out = JSON.parse(runPython(READ_WHILE_WRITING));
    // 読めていない (= 何も確かめていない) テストにしない。
    expect(out.reads).toBeGreaterThan(20);
    expect(out.tornCount).toBe(0);
  });

  test('中身はそのまま残り、一時ファイルも残さない', () => {
    const out = JSON.parse(runPython(ROUND_TRIP));
    expect(out.same).toBe(true);
    expect(out.svgNoCrlf).toBe(true);
    expect(out.leftovers).toEqual([]);
  });

  test('.puml と .svg を書く窓口は write_text を直接使わない', () => {
    const src = require('fs').readFileSync(path.join(projectRoot, 'server.py'), 'utf8')
      .replace(/\r\n/g, '\n');
    // 保存フォルダの図そのもの (GUI の外から読まれる) を書く 4 箇所。
    expect(src).toContain('_atomic_write_text(file_path, dsl)');
    expect(src).toContain('_atomic_write_text(puml, dsl)');
    expect(src).toContain('_atomic_write_text(target, old)');
    expect(src).toContain("_atomic_write_text(svg_path, svg + self._svg_stamp(puml_path), newline='')");
    expect(/(file_path|puml|svg_path)\.write_text\(/.test(src)).toBe(false);
  });
});
