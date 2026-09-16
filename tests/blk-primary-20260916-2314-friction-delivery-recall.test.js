'use strict';
// BLK-primary-20260916-2314-friction: 納品パッケージの対象を毎回 24 枚全部チェック済みから
// 「全部外す → 14 枚を 1 枚ずつ」選び直していた (クリック 17)。既定を前回出した図にする。
// あわせて、控え (_export-log.json) より前に作った delivery-*.zip がフォルダにあるのに
// 「まだ 1 度も提出していません」と出ていたので、server が zip の中身 (svg/ の名前) を一覧と一緒に返す。
const { execFileSync } = require('child_process');
const path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/save-diff.js',
  '../src/core/change-board.js',
  '../src/core/submit-check.js',
  '../src/core/bulk-export.js',
  '../src/core/delivery-package.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var DP = window.MA.deliveryPackage;

function cands(names) {
  return names.map(function(n) { return { name: n, deliverable: true, open: false }; });
}
var ALL = ['Fig1', 'adc_state', 'can', 'diagram1', 'spi_state', 'uart_state'];

describe('前回と同じ図を既定にする', function() {
  test('前回出した名前を今の候補の並び順で返し、消えた図は落とす', function() {
    expect(DP.recallPicks(cands(ALL), ['uart_state', 'adc_state', 'gone_state', 'spi_state']))
      .toEqual(['adc_state', 'spi_state', 'uart_state']);
  });

  test('出どころは控えの最新を優先し、無ければフォルダの最新の納品 zip', function() {
    var zips = [{ file: 'delivery-20260914-2106.zip', at: '2026-09-14T21:06', names: ['can'] }];
    var fromLog = DP.lastPickSource({ names: ['adc_state'], file: 'delivery-20260916-2318.zip', at: 'x' }, zips);
    expect(fromLog.from).toBe('log');
    expect(fromLog.names).toEqual(['adc_state']);
    var fromZip = DP.lastPickSource(null, zips);
    expect(fromZip.from).toBe('zip');
    expect(fromZip.file).toBe('delivery-20260914-2106.zip');
    expect(DP.lastPickSource(null, []).names).toEqual([]);
    // 控えに names が無い古い形式なら zip に落ちる。
    expect(DP.lastPickSource({ file: 'a.zip' }, zips).from).toBe('zip');
  });

  test('控えに載っていない zip だけを「控えなし」として返す', function() {
    var zips = [
      { file: 'delivery-20260916-2318.zip', names: ['a'] },
      { file: 'delivery-20260909-0003.zip', names: ['a', 'b'] },
    ];
    var out = DP.unloggedZips(zips, [{ file: 'delivery-20260916-2318.zip' }]);
    expect(out.map(function(z) { return z.file; })).toEqual(['delivery-20260909-0003.zip']);
  });
});

global.window = prevWindow;
global.document = prevDocument;

const projectRoot = path.resolve(__dirname, '..');

describe('server が保存フォルダの納品 zip を一覧と一緒に返す', function() {
  test('delivery-*.zip の svg/ から図の名前を読み、新しい順に並べる。壊れた zip と別名の zip は飛ばす', function() {
    const script = [
      'import importlib.util, json, shutil, tempfile, threading, urllib.request, urllib.parse, zipfile, os',
      `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
      'srv = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(srv)',
      'class H(srv.Handler):',
      '    def log_message(self, *a): pass',
      'server = srv.ThreadingHTTPServer(("127.0.0.1", 0), H)',
      'server.daemon_threads = True',
      'threading.Thread(target=server.serve_forever, daemon=True).start()',
      'base = "http://127.0.0.1:%d" % server.server_address[1]',
      'tmp = tempfile.mkdtemp()',
      'open(os.path.join(tmp, "a.puml"), "w").write("@startuml\\nA -> B\\n@enduml\\n")',
      'def mk(name, members):',
      '    with zipfile.ZipFile(os.path.join(tmp, name), "w") as z:',
      '        z.writestr("index.html", "x")',
      '        for m in members: z.writestr(m, "<svg/>")',
      'mk("delivery-20260908-1903.zip", ["svg/a.svg", "svg/b.svg"])',
      'mk("delivery-20260914-2106.zip", ["svg/a.svg"])',
      'mk("diagrams-20260914-2106.zip", ["svg/zzz.svg"])',
      'open(os.path.join(tmp, "delivery-20260915-0000.zip"), "w").write("broken")',
      'data = json.loads(urllib.request.urlopen(base + "/autosave?dir=" + urllib.parse.quote(tmp), timeout=10).read().decode("utf-8"))',
      'print(json.dumps(data.get("deliveryZips")))',
      'server.shutdown()',
      'shutil.rmtree(tmp, ignore_errors=True)',
    ].join('\n');
    const out = JSON.parse(execFileSync('python', ['-c', script], { cwd: projectRoot, encoding: 'utf8', timeout: 60000 }).trim());
    expect(out).toEqual([
      { file: 'delivery-20260914-2106.zip', names: ['a'], at: '2026-09-14T21:06' },
      { file: 'delivery-20260908-1903.zip', names: ['a', 'b'], at: '2026-09-08T19:03' },
    ]);
  });
});
