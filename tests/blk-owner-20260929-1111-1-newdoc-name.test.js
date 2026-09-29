'use strict';
// BLK-owner-20260929-1111-1: 「＋ 新しい図」の名前 diagramN は開いているタブとだけ比べて付き、
// 保存先に diagram2.puml があると何も聞かずにその名前で開いて、1 字打った時点の自動保存が
// 既存の図を上書きしていた。上書き前の中身も、打ちかけの版 20 個に押し出されて版に残らなかった。
//   - 新しい図の名前は保存先の図とも重ならない (diagram2 があれば diagram3)
//   - 新しい図 (まだ 1 度も書いていないタブ) の保存は、既にある同名の別ファイルを書かない (server が 409)
//   - 上書き前の元の中身の版は、打ちかけの版が上限を超えても残る
const { execFileSync } = require('child_process');
const path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

(function() {
  var store = {};
  var stub = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; },
    __reset: function() { store = {}; },
  };
  Object.defineProperty(global.window, 'localStorage', { configurable: true, value: stub });
})();

['../src/core/auto-save.js', '../src/core/workspace.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var ws = global.window.MA.workspace;
var as = global.window.MA.autoSave;

function syncThenable(value) {
  return {
    then: function(cb) {
      var next = cb ? cb(value) : value;
      return (next && typeof next.then === 'function') ? next : syncThenable(next);
    },
    catch: function() { return syncThenable(value); },
  };
}

function boot() {
  global.window.localStorage.__reset();
  ws.reset();
  ws.noteFolderNames('./d', []);
  return ws.init({ diagramType: 'plantuml-sequence', dsl: '@startuml\n@enduml', name: 'diagram1' });
}

function listing(files) {
  global.window.fetch = function() {
    return syncThenable({ ok: true, json: function() { return syncThenable({ files: files }); } });
  };
}

describe('BLK-owner-20260929-1111-1 新しい図の名前は保存先の図と重ならない', function() {
  test('保存先に diagram2 があるとき新しい図は diagram3', function() {
    boot();
    listing(['diagram2']);
    ws.listFiles('./d');
    expect(ws.newDocName('./d')).toBe('diagram3');
  });

  test('保存先に何も無ければ今までどおり diagram{タブ数 + 1}', function() {
    boot();
    listing([]);
    ws.listFiles('./d');
    expect(ws.newDocName('./d')).toBe('diagram2');
  });

  test('大文字小文字だけ違う名前も重なりとみなす (Windows のファイル名)', function() {
    boot();
    listing(['Diagram2.puml', 'DIAGRAM3']);
    ws.listFiles('./d');
    expect(ws.newDocName('./d')).toBe('diagram4');
  });

  test('開いているタブの名前とも重ならない', function() {
    boot();
    ws.open({ name: 'diagram3' });
    listing(['diagram2']);
    ws.listFiles('./d');
    // タブは 2 枚 → diagram3 から数える。diagram3 はタブ、diagram2 は保存先 (数え始めより前)。
    expect(ws.newDocName('./d')).toBe('diagram4');
  });

  test('保存先ごとに覚える (別の保存先の図とは比べない)', function() {
    boot();
    listing(['diagram2']);
    ws.listFiles('./other');
    expect(ws.newDocName('./d')).toBe('diagram2');
    expect(ws.knownInFolder('diagram2', './other')).toBe(true);
  });

  test('listFolder の一覧でも覚える', function() {
    boot();
    global.window.fetch = function() {
      return syncThenable({ ok: true, json: function() {
        return syncThenable({ entries: [{ name: 'diagram2', mtime: null, hash: null }], exists: true });
      } });
    };
    ws.listFolder('./d');
    expect(ws.newDocName('./d')).toBe('diagram3');
  });
});

describe('BLK-owner-20260929-1111-1 新しいタブの保存は既存の同名ファイルを書かない', function() {
  test('fresh で開いたタブは印を持ち、保存に freshId を添える', function() {
    boot();
    var doc = ws.open({ name: 'diagram2', fresh: true });
    expect(doc.fresh).toBe(true);
    var body = null;
    global.window.fetch = function(url, opt) {
      body = JSON.parse(opt.body);
      return syncThenable({ ok: true, status: 200, json: function() { return syncThenable({ ok: true, savedAs: 'diagram2' }); } });
    };
    ws.saveToFile(ws.getActive(), './d');
    expect(body.freshId).toBe(doc.id);
    // 書けたら印は外れる (以後は自分のファイルへの保存)。
    expect(ws.getActive().fresh === undefined).toBe(true);
  });

  test('印の無いタブ (保存先から開いた図など) は freshId を送らない', function() {
    boot();
    var body = null;
    global.window.fetch = function(url, opt) {
      body = JSON.parse(opt.body);
      return syncThenable({ ok: true, status: 200, json: function() { return syncThenable({ ok: true }); } });
    };
    ws.saveToFile(ws.getActive(), './d');
    expect(body.freshId === undefined).toBe(true);
  });

  test('server が 409 (同名の別の図) を返したら書けなかったと返し、印は残し、重なりを知らせる', function() {
    boot();
    var doc = ws.open({ name: 'diagram2', fresh: true });
    var heard = [];
    as.onFileConflict(function(info) { heard.push(info); });
    as.resetFileBlocked();
    global.window.fetch = function() {
      return syncThenable({ ok: false, status: 409, json: function() {
        return syncThenable({ error: 'exists', conflict: true, name: 'diagram2', message: '同じ名前の図が保存先にあります (diagram2.puml)' });
      } });
    };
    var got = null;
    ws.saveToFile(ws.getActive(), './d').then(function(v) { got = v; });
    expect(got).toBe(false);
    expect(ws.getActive().fresh).toBe(true);
    expect(heard.length).toBe(1);
    expect(heard[0].id).toBe(doc.id);
    expect(heard[0].reason).toContain('同じ名前の図が保存先にあります');
    expect(as.getLastWrite().where).toBe('blocked');
  });

  test('自動保存: 解決器が freshId を返せば送り、409 なら状態は blocked で重なりを知らせる', function() {
    global.window.localStorage.__reset();
    as.setConfig({ backend: 'file', fileDir: './d', enabled: true });
    as.resetFileBlocked();
    as.setFileNameResolver(function() { return { name: 'diagram2', dir: './d', freshId: 'doc-x' }; });
    var body = null;
    var heard = [];
    as.onFileConflict(function(info) { heard.push(info); });
    global.window.fetch = function(url, opt) {
      if (opt && opt.method === 'POST' && url === '/autosave') body = JSON.parse(opt.body);
      return syncThenable({ ok: false, status: 409, json: function() {
        return syncThenable({ conflict: true, message: '同じ名前の図が保存先にあります (diagram2.puml)' });
      } });
    };
    as.scheduleSave('plantuml-sequence', '@startuml\nA -> B\n@enduml');
    as.flush();
    expect(body.freshId).toBe('doc-x');
    expect(body.type).toBe('diagram2');
    expect(heard.some(function(h) { return h.id === 'doc-x'; })).toBe(true);
    expect(as.getLastWrite().where).toBe('blocked');
    as.setFileNameResolver(null);
  });

  test('自動保存: 書けたら新しい図が書けたことを知らせる (印を外す合図)', function() {
    global.window.localStorage.__reset();
    as.setConfig({ backend: 'file', fileDir: './d', enabled: true });
    as.setFileNameResolver(function() { return { name: 'diagram3', dir: './d', freshId: 'doc-y' }; });
    var heard = [];
    as.onFreshWritten(function(info) { heard.push(info); });
    global.window.fetch = function() {
      return syncThenable({ ok: true, status: 200, json: function() { return syncThenable({ ok: true, savedAs: 'diagram3' }); } });
    };
    as.scheduleSave('plantuml-sequence', '@startuml\nA -> B\n@enduml');
    as.flush();
    expect(heard.some(function(h) { return h.id === 'doc-y' && h.name === 'diagram3'; })).toBe(true);
    as.setFileNameResolver(null);
  });
});

// ── server.py ──────────────────────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..');
function runPython(body) {
  const script = [
    'import importlib.util, json, os, tempfile, pathlib, time',
    `spec = importlib.util.spec_from_file_location("puaserver", r"${path.join(projectRoot, 'server.py')}")`,
    'srv = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(srv)',
    'H = srv.Handler',
    'inst = H.__new__(H)',
    'tmp = pathlib.Path(tempfile.mkdtemp())',
  ].concat(body).join('\n');
  return execFileSync('python', ['-c', script], { encoding: 'utf-8', cwd: projectRoot });
}

describe('BLK-owner-20260929-1111-1 server: 新しい図の書き込みと元の版', function() {
  test('新しい図の書き込みは、既にある同名の別ファイルに当たると重なりとみなす', function() {
    const out = runPython([
      'p = tmp / "diagram2.puml"',
      'p.write_text("@startuml\\nAlice -> Bob : ORIGINAL_KEEP_ME\\n@enduml\\n", encoding="utf-8")',
      'r = {}',
      'r["clash"] = inst._fresh_clash(p, "doc-1", "skinparam shadowing false")',
      'r["noFresh"] = inst._fresh_clash(p, None, "skinparam shadowing false")',
      'r["same"] = inst._fresh_clash(p, "doc-1", "@startuml\\r\\nAlice -> Bob : ORIGINAL_KEEP_ME\\r\\n@enduml\\r\\n")',
      'r["absent"] = inst._fresh_clash(tmp / "diagram3.puml", "doc-1", "x")',
      'H._FRESH_OWNERS[inst._path_key(p)] = "doc-2"',
      'r["own"] = inst._fresh_clash(p, "doc-2", "y")',
      'r["other"] = inst._fresh_clash(p, "doc-1", "y")',
      'print(json.dumps(r))',
    ]);
    const r = JSON.parse(out.trim());
    expect(r.clash).toBe(true);
    expect(r.noFresh).toBe(false);
    expect(r.same).toBe(false);
    expect(r.absent).toBe(false);
    expect(r.own).toBe(false);     // その図が作ったファイルへの続きの保存
    expect(r.other).toBe(true);
  });

  test('1 字ごとの自動保存が 25 回続いても、上書き前の元の中身の版は残る (版の数は上限のまま)', function() {
    const out = runPython([
      'p = tmp / "diagram2.puml"',
      'p.write_text("ORIGINAL_KEEP_ME", encoding="utf-8")',
      'old = time.time() - 3600',
      'os.utime(p, (old, old))',
      'for i in range(25):',
      '    body = "skinparam shadowing false"[:i + 1] + str(i)',
      '    inst._stash_version(tmp, "diagram2", body)',
      '    srv._atomic_write_text(p, body)',
      '    inst._note_own_write(p)',
      'stamps = inst._version_stamps(tmp, "diagram2")',
      'texts = [inst._version_path(tmp, "diagram2", s).read_text(encoding="utf-8") for s in stamps]',
      'print(json.dumps({"n": len(stamps), "orig": texts.count("ORIGINAL_KEEP_ME"), "newest": texts[0]}))',
    ]);
    const r = JSON.parse(out.trim());
    expect(r.n).toBe(20);
    expect(r.orig).toBe(1);
    expect(r.newest).toBe('skinparam shadowing fals' + '23');
  });

  test('外で書き換わった中身も元の版として残る (この server が書いた直後の中身だけが打ちかけ)', function() {
    const out = runPython([
      'p = tmp / "a.puml"',
      'p.write_text("v0", encoding="utf-8")',
      'inst._stash_version(tmp, "a", "v1")',
      'srv._atomic_write_text(p, "v1")',
      'inst._note_own_write(p)',
      'first = inst._version_stamps(tmp, "a")[0]',
      'r = {"firstOrigin": inst._is_origin_version(tmp, "a", first)}',
      'inst._stash_version(tmp, "a", "v2")',
      'srv._atomic_write_text(p, "v2")',
      'inst._note_own_write(p)',
      'second = inst._version_stamps(tmp, "a")[0]',
      'r["secondOrigin"] = inst._is_origin_version(tmp, "a", second)',
      'time.sleep(0.05)',
      'p.write_text("OUTSIDE", encoding="utf-8")',
      'os.utime(p, (time.time() - 60, time.time() - 60))',
      'inst._stash_version(tmp, "a", "v3")',
      'third = inst._version_stamps(tmp, "a")[0]',
      'r["thirdOrigin"] = inst._is_origin_version(tmp, "a", third)',
      'r["thirdText"] = inst._version_path(tmp, "a", third).read_text(encoding="utf-8")',
      'print(json.dumps(r))',
    ]);
    const r = JSON.parse(out.trim());
    expect(r.firstOrigin).toBe(true);
    expect(r.secondOrigin).toBe(false);
    expect(r.thirdOrigin).toBe(true);
    expect(r.thirdText).toBe('OUTSIDE');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
['../src/core/auto-save.js', '../src/core/workspace.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
});
