'use strict';
// BLK-primary-20260929-1108: 保存先に共通ファイル common_defs.puml を作り、隣の図に `!include common_defs.puml` を足すと
// 「cannot include common_defs.puml」で描けなかった。GUI の本文はファイルではなく文字列で PlantUML に渡るので、
// 相対の include を server の作業フォルダから探していた。
// 直し方: 描画・展開の要求に、その図の .puml のあるフォルダ (dir) を添え、PlantUML にそこを起点に探させる。
// 本文は書き換えない。読めないときの帯は探したフォルダを言う。
// 実際に server.py を読み込み、同梱の jar で描いて確かめる (jar か Java が無い機械では描画の段を飛ばす)。
var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.resolve(__dirname, '..');
var WORK = path.join(ROOT, 'test-results', 'unit-include-dir');
var INC = path.join(WORK, 'shared');
fs.mkdirSync(INC, { recursive: true });
fs.writeFileSync(path.join(INC, 'common_defs.puml'), 'skinparam monochrome true\nparticipant SharedDefs\n', 'utf8');

function runPython(lines) {
  var script = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("puaserver", r"' + path.join(ROOT, 'server.py') + '")',
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'from pathlib import Path',
    'INC = Path(r"' + INC + '")',
    'DSL = "@startuml\\n!include common_defs.puml\\nA -> SharedDefs : hi\\n@enduml\\n"',
  ].concat(lines).concat(['srv._shutdown_daemon()']).join('\n');
  return execFileSync('python', ['-c', script], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }).trim();
}

var hasJar = fs.existsSync(path.join(ROOT, 'lib', 'plantuml.jar'));
var javaOk = true;
try { execFileSync('java', ['-version'], { stdio: 'ignore', timeout: 20000 }); } catch (e) { javaOk = false; }

describe('BLK-primary-20260929-1108 相対の !include はその図のフォルダから探す', function() {
  test('render_base_dir: 実在するフォルダだけを起点にする (無い・空・改行入りは None)', function() {
    var out = runPython([
      'print(srv.render_base_dir(str(INC)) == INC.resolve())',
      'print(srv.render_base_dir(str(INC / "nope")) is None, srv.render_base_dir("") is None, srv.render_base_dir(None) is None, srv.render_base_dir("a\\nb") is None)',
      'print(srv.include_search_note("cannot include common_defs.puml", INC) == "探したフォルダ: " + str(INC))',
      'print(srv.include_search_note("Syntax Error?", INC) == "")',
    ]).split(/\r?\n/);
    expect(out[0]).toBe('True');
    expect(out[1]).toBe('True True True True');
    expect(out[2]).toBe('True');
    expect(out[3]).toBe('True');
  });

  if (hasJar && javaOk) {
    test('描画: dir を添えると隣の common_defs.puml を読んで描け、添えなければ従来どおり読めない (daemon と -pipe の両方)', function() {
      var out = runPython([
        'svg, err = srv.render_local(DSL, INC.resolve())',
        'print("daemon-dir", err is None and b"SharedDefs" in svg and srv.detect_render_error(svg) is None)',
        'svg, err = srv.render_local(DSL)',
        'print("daemon-none", srv.detect_render_error(svg) is not None and "cannot include" in srv.detect_render_error(svg)["message"])',
        'svg, err = srv._render_via_pipe(DSL, INC.resolve())',
        'print("pipe-dir", err is None and b"SharedDefs" in svg and srv.detect_render_error(svg) is None)',
      ]).split(/\r?\n/).filter(function(l) { return /^(daemon|pipe)-/.test(l); });
      expect(out).toEqual(['daemon-dir True', 'daemon-none True', 'pipe-dir True']);
    });

    test('展開 (/preproc): dir を添えると include した行まで展開する (選択枠の当て方もその行を読む)', function() {
      var out = runPython([
        'lines, err = srv.preproc_local(DSL, INC.resolve())',
        'print(json.dumps([err is None, "participant SharedDefs" in (lines or [])]))',
      ]).split(/\r?\n/).pop();
      expect(out).toBe('[true, true]');
    });
  }

  test('server: POST /render と /preproc は dir を読み、422 の文に探したフォルダを足す。仕様 (GET /render) に dir がある', function() {
    var server = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    expect(server).toContain("base_dir = render_base_dir(data.get('dir'))");
    expect(server).toContain("svg, error = render_local(text, base_dir)");
    expect(server).toContain("preproc_local(text, render_base_dir(data.get('dir')))");
    expect(server).toContain("searched = include_search_note(err.get('message')");
    expect(/'dir': \("任意。その図の \.puml のあるフォルダ/.test(server)).toBe(true);
    // 保存フォルダの svg を確かめ直す経路 (verify-svg) も保存フォルダを起点に描く。
    expect(server).toContain("render_local(text, save_dir) if mode == 'local'");
  });

  test('daemon: BASEDIR の前置きで起点を受け取り、PlantUML の SourceStringReader(本文, フォルダ) で読む', function() {
    var java = fs.readFileSync(path.join(ROOT, 'lib', 'PlantUMLDaemon.java'), 'utf8');
    expect(java).toContain('BASEDIR_MAGIC = "\\u0000BASEDIR "');
    expect(java).toContain('new SourceStringReader(dsl, SFile.fromFile(baseDir))');
    expect(java).toContain('preproc(dsl.substring(PREPROC_MAGIC.length()), baseDir)');
  });

  test('画面: 描画と展開の要求に、開いたファイルのフォルダ・そのタブの保存フォルダを dir として添える', function() {
    var app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    expect(app).toContain('var renderDir = _renderDirOfActive();');
    expect(app).toContain('if (renderDir) renderBody.dir = renderDir;');
    expect(app).toContain('_PEx.ensure(mmdText, null, renderDir)');
    // 手元から開いたファイルはそのファイルのフォルダ、保存先の図はそのタブの保存フォルダ
    var fn = app.slice(app.indexOf('function _renderDirOfDoc('), app.indexOf('function _renderDirOfActive('));
    expect(fn).toContain('_sourcePathOf(doc.id)');
    expect(fn).toContain('_docDir(doc)');
    // 保存フォルダの図を描き直す経路は、その図のフォルダを渡す
    expect(app).toContain('return renderDslToSvg(dsl, f.dir);');
    expect(app).toContain('return renderDslToSvg(dsl, dir);');
    var pe = fs.readFileSync(path.join(ROOT, 'src', 'core', 'preproc-expand.js'), 'utf8');
    expect(pe).toContain('function ensure(text, fetchFn, dir)');
    expect(pe).toContain('dir ? { text: withMarks(text), dir: dir }');
  });
});
