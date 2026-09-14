'use strict';
// BLK-reviewer-20260914-0906
// 手順4.10 (svg スタンプ未検出時の再描画比較) は、印の無い svg 1 枚ごとに
// render API を叩き、返った svg の plantuml-src 埋め込みをデコードして
// 「どちらの絵か」を突き止める作業だった。図が増えるほど手順が線形に増える。
// PlantUML は書き出した svg に元の DSL を `<?plantuml-src …?>` として畳んでいるので、
// 一覧を出す時点で server が開いて持ち主を名指しできる。
const { execFileSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function runPython(body) {
  const script = [
    'import importlib.util, json, os, tempfile, base64, zlib',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    // PlantUML と同じ畳み方 (raw deflate → PlantUML の base64 表)
    'def fold(text):',
    '    raw = zlib.compressobj(9, zlib.DEFLATED, -15)',
    '    b = raw.compress(text.encode("utf-8")) + raw.flush()',
    '    t = base64.b64encode(b).decode("ascii").rstrip("=")',
    '    return t.translate(str.maketrans(srv._STD_B64, srv._PLANTUML_B64))',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 60000,
  }).trim();
}

const DECODE = [
  'src = "title A\\nclass Driver_Common"',
  'svg = ("<svg><g></g><?plantuml-src " + fold(src) + "?></svg>").encode("utf-8")',
  'got = srv.decode_svg_plantuml_src(svg)',
  'print(json.dumps({',
  '  "got": got,',
  '  "none": srv.decode_svg_plantuml_src(b"<svg></svg>"),',
  '  "broken": srv.decode_svg_plantuml_src(b"<svg><?plantuml-src ZZZZ?></svg>"),',
  '  "norm": srv.normalize_dsl("@startuml\\n" + src + "\\n\\n@enduml\\n") == srv.normalize_dsl(src),',
  '}))',
];

// 保存フォルダに 2 枚を置き、印の無い svg に「相手の絵」を入れる。
// 一覧がその持ち主を名指しできること。
const CROSS = [
  'from pathlib import Path',
  'd = Path(tempfile.mkdtemp())',
  'A = "@startuml\\ntitle ドライバ共通クラス図\\nclass Driver_Common\\n@enduml\\n"',
  'B = "@startuml\\ntitle CAN 初期化\\nparticipant Can_Driver\\n@enduml\\n"',
  '(d / "driver_common_class.puml").write_text(A, encoding="utf-8")',
  '(d / "can_init_sequence.puml").write_text(B, encoding="utf-8")',
  // driver_common_class.svg の中身は can_init_sequence の絵 (印は付けない)
  '(d / "driver_common_class.svg").write_text(',
  '    "<svg><?plantuml-src " + fold("title CAN 初期化\\nparticipant Can_Driver") + "?></svg>",',
  '    encoding="utf-8")',
  // can_init_sequence.svg は自分の絵 (印は付けない)
  '(d / "can_init_sequence.svg").write_text(',
  '    "<svg><?plantuml-src " + fold("title CAN 初期化\\nparticipant Can_Driver") + "?></svg>",',
  '    encoding="utf-8")',
  'H = srv.Handler.__new__(srv.Handler)',
  'entries = []',
  'for p in sorted(d.glob("*.puml")):',
  '    entries.append(H._autosave_entry(p))',
  'H._resolve_unstamped_svg_sources(d, entries)',
  'by = {e["name"]: e for e in entries}',
  'print(json.dumps({',
  '  "crossSource": by["driver_common_class"]["svgSource"],',
  '  "crossFrom": by["driver_common_class"].get("svgSourceFrom"),',
  '  "ownHash": by["can_init_sequence"]["hash"],',
  '  "selfSource": by["can_init_sequence"]["svgSource"],',
  '  "selfIsOwn": by["can_init_sequence"]["svgSource"] == by["can_init_sequence"]["hash"],',
  '}))',
];

// 印が付いている svg は、印の側をそのまま使う (畳まれた DSL で上書きしない)。
const STAMP_WINS = [
  'from pathlib import Path',
  'd = Path(tempfile.mkdtemp())',
  'A = "@startuml\\nclass Driver_Common\\n@enduml\\n"',
  '(d / "a.puml").write_text(A, encoding="utf-8")',
  'H = srv.Handler.__new__(srv.Handler)',
  '(d / "a.svg").write_text("<svg></svg>" + H._svg_stamp(d / "a.puml"), encoding="utf-8")',
  'entries = [H._autosave_entry(d / "a.puml")]',
  'H._resolve_unstamped_svg_sources(d, entries)',
  'print(json.dumps({"from": entries[0].get("svgSourceFrom"),',
  '                  "isOwn": entries[0]["svgSource"] == entries[0]["hash"]}))',
];

describe('印の無い SVG も持ち主を名指しできる (BLK-reviewer-20260914-0906)', () => {
  test('svg に畳まれた元の DSL を開ける (壊れていても落ちない)', () => {
    const out = JSON.parse(runPython(DECODE));
    expect(out.got).toBe('title A\nclass Driver_Common');
    expect(out.none).toBe(null);
    expect(out.broken).toBe(null);
    // 畳まれた側に @startuml / @enduml は入らないので、そろえてから比べる。
    expect(out.norm).toBe(true);
  });

  test('印が無くても、絵が入れ替わった svg の持ち主が一覧で分かる', () => {
    const out = JSON.parse(runPython(CROSS));
    // driver_common_class.svg の中身は can_init_sequence の絵。
    expect(out.crossSource).toBe(out.ownHash);
    expect(out.crossFrom).toBe('embedded');
    // 自分の絵を持っている側は、今の puml と一致していると言える。
    expect(out.selfIsOwn).toBe(true);
  });

  test('印のある svg は印の突合のままで、根拠もそう出る', () => {
    const out = JSON.parse(runPython(STAMP_WINS));
    expect(out.from).toBe('stamp');
    expect(out.isOwn).toBe(true);
  });
});

// 畳まれた DSL の相手がフォルダに居ないときも、「この図の絵ではない」とは言える。
// 黙ると「未刻印」に落ち、reviewer はその 1 枚を render API で確かめ直すことになる。
const ORPHAN = [
  'from pathlib import Path',
  'd = Path(tempfile.mkdtemp())',
  '(d / "a.puml").write_text(chr(10).join(["@startuml", "class A", "@enduml", ""]), encoding="utf-8")',
  '(d / "a.svg").write_text(',
  '    "<svg><?plantuml-src " + fold("class Zzz_NotHere") + "?></svg>", encoding="utf-8")',
  'H = srv.Handler.__new__(srv.Handler)',
  'entries = [H._autosave_entry(d / "a.puml")]',
  'H._resolve_unstamped_svg_sources(d, entries)',
  'print(json.dumps({"from": entries[0].get("svgSourceFrom"),',
  '                  "source": entries[0]["svgSource"],',
  '                  "isOwn": entries[0]["svgSource"] == entries[0]["hash"]}))',
];

describe('畳まれた DSL の相手がフォルダに居ないとき (BLK-reviewer-20260914-0906)', () => {
  test('相手は名指しできなくても「この図の絵ではない」とは言う', () => {
    const out = JSON.parse(runPython(ORPHAN));
    expect(out.from).toBe('embedded');
    expect(out.isOwn).toBe(false);
    expect(out.source.startsWith('embedded:')).toBe(true);
  });
});
