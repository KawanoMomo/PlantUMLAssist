'use strict';
window.MA = window.MA || {};

// workspace — 複数の図を「ドキュメント」として同時に開いて切り替える。
//
// 1 ドキュメント = { id, name, diagramType, dsl }。
// name はサーバの保存先ファイル名 ({name}.puml) にそのまま使うため
// [A-Za-z0-9_-]+ に正規化する。状態は localStorage に丸ごと保存するので
// リロードしてもタブ構成が残る。
window.MA.workspace = (function() {
  var KEY = 'plantuml-workspace';
  var NAME_RE = /^[A-Za-z0-9_-]+$/;

  var _state = null;   // { activeId, docs: [] }
  var _seq = 0;

  function _newId() {
    _seq++;
    return 'doc' + Date.now().toString(36) + '-' + _seq;
  }

  function sanitizeName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/\.puml$/i, '');
    s = s.replace(/[^A-Za-z0-9_-]+/g, '_');
    s = s.replace(/^_+|_+$/g, '');
    if (!s) s = 'diagram';
    return s;
  }

  function isValidName(name) {
    return typeof name === 'string' && NAME_RE.test(name);
  }

  function _uniqueName(name, exceptId) {
    var base = sanitizeName(name);
    var used = {};
    var docs = _state ? _state.docs : [];
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].id !== exceptId) used[docs[i].name] = true;
    }
    if (!used[base]) return base;
    var n = 2;
    while (used[base + '-' + n]) n++;
    return base + '-' + n;
  }

  function _read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw == null) return null;
      var v = JSON.parse(raw);
      if (!v || !Array.isArray(v.docs) || v.docs.length === 0) return null;
      var docs = [];
      for (var i = 0; i < v.docs.length; i++) {
        var d = v.docs[i];
        if (!d || typeof d.id !== 'string') continue;
        docs.push({
          id: d.id,
          name: isValidName(d.name) ? d.name : sanitizeName(d.name),
          diagramType: typeof d.diagramType === 'string' ? d.diagramType : 'plantuml-sequence',
          dsl: typeof d.dsl === 'string' ? d.dsl : '',
        });
      }
      if (docs.length === 0) return null;
      var activeId = docs[0].id;
      for (var j = 0; j < docs.length; j++) if (docs[j].id === v.activeId) activeId = v.activeId;
      return { activeId: activeId, docs: docs };
    } catch (e) {
      return null;
    }
  }

  function persist() {
    if (!_state) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(_state));
      return true;
    } catch (e) {
      return false;
    }
  }

  // init({ diagramType, dsl, name }) — 保存済みがあればそれを、無ければ
  // 与えられた既定値で 1 枚だけ持つワークスペースを作る。
  function init(defaults) {
    defaults = defaults || {};
    var restored = _read();
    if (restored) {
      _state = restored;
      return getActive();
    }
    _state = { activeId: null, docs: [] };
    var doc = {
      id: _newId(),
      name: _uniqueName(defaults.name || 'diagram1'),
      diagramType: defaults.diagramType || 'plantuml-sequence',
      dsl: typeof defaults.dsl === 'string' ? defaults.dsl : '',
    };
    _state.docs.push(doc);
    _state.activeId = doc.id;
    persist();
    return getActive();
  }

  function _copy(d) {
    return d ? { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl } : null;
  }

  function list() {
    if (!_state) return [];
    return _state.docs.map(_copy);
  }

  function count() {
    return _state ? _state.docs.length : 0;
  }

  function _find(id) {
    if (!_state) return null;
    for (var i = 0; i < _state.docs.length; i++) {
      if (_state.docs[i].id === id) return _state.docs[i];
    }
    return null;
  }

  function getActive() {
    return _state ? _copy(_find(_state.activeId)) : null;
  }

  function getActiveId() {
    return _state ? _state.activeId : null;
  }

  function findByName(name) {
    if (!_state) return null;
    for (var i = 0; i < _state.docs.length; i++) {
      if (_state.docs[i].name === name) return _copy(_state.docs[i]);
    }
    return null;
  }

  // アクティブなドキュメントの中身を書き戻す。タブを離れる直前に呼ぶ。
  function updateActive(patch) {
    var d = _state ? _find(_state.activeId) : null;
    if (!d || !patch) return null;
    if (typeof patch.dsl === 'string') d.dsl = patch.dsl;
    if (typeof patch.diagramType === 'string' && patch.diagramType) d.diagramType = patch.diagramType;
    persist();
    return _copy(d);
  }

  // id 指定でドキュメントを書き換える。一括置換のように「今開いていない図も
  // まとめて直す」操作で使う。
  function updateDoc(id, patch) {
    var d = _find(id);
    if (!d || !patch) return null;
    if (typeof patch.dsl === 'string') d.dsl = patch.dsl;
    if (typeof patch.diagramType === 'string' && patch.diagramType) d.diagramType = patch.diagramType;
    persist();
    return _copy(d);
  }

  function setActive(id) {
    if (!_find(id)) return null;
    _state.activeId = id;
    persist();
    return getActive();
  }

  // 新しいタブを開いてアクティブにする。同名は -2, -3 … で一意化する。
  function open(spec) {
    if (!_state) init({});
    spec = spec || {};
    var doc = {
      id: _newId(),
      name: _uniqueName(spec.name || 'diagram' + (_state.docs.length + 1)),
      diagramType: spec.diagramType || 'plantuml-sequence',
      dsl: typeof spec.dsl === 'string' ? spec.dsl : '',
    };
    _state.docs.push(doc);
    _state.activeId = doc.id;
    persist();
    return _copy(doc);
  }

  // 既に同じ name のタブがあればそれをアクティブにし、無ければ開く。
  // フォルダ一覧から選んだときに同じ図を二重に開かないため。
  function openOrActivate(spec) {
    spec = spec || {};
    if (!_state) init({});
    var name = sanitizeName(spec.name || '');
    for (var i = 0; i < _state.docs.length; i++) {
      if (_state.docs[i].name === name) {
        if (typeof spec.dsl === 'string') _state.docs[i].dsl = spec.dsl;
        if (spec.diagramType) _state.docs[i].diagramType = spec.diagramType;
        _state.activeId = _state.docs[i].id;
        persist();
        return _copy(_state.docs[i]);
      }
    }
    return open(spec);
  }

  // 最後の 1 枚は閉じない (常に何か編集できる状態を保つ)。
  function close(id) {
    if (!_state || _state.docs.length <= 1) return null;
    var idx = -1;
    for (var i = 0; i < _state.docs.length; i++) {
      if (_state.docs[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return null;
    _state.docs.splice(idx, 1);
    if (_state.activeId === id) {
      var next = _state.docs[idx] || _state.docs[idx - 1] || _state.docs[0];
      _state.activeId = next.id;
    }
    persist();
    return getActive();
  }

  function rename(id, name) {
    var d = _find(id);
    if (!d) return null;
    d.name = _uniqueName(name, id);
    persist();
    return _copy(d);
  }

  function reset() {
    _state = null;
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }

  // ── 保存フォルダ (server.py の /autosave) との橋渡し ──────────────────
  // type パラメータにドキュメント名をそのまま渡すので、フォルダには
  // {name}.puml が 1 図につき 1 ファイルできる。

  function _dir(fileDir) {
    return fileDir || './autosave';
  }

  function saveToFile(doc, fileDir) {
    if (!doc || !isValidName(doc.name)) return Promise.resolve(false);
    try {
      return window.fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: doc.name, dsl: doc.dsl, dir: _dir(fileDir) }),
        keepalive: true,
      }).then(function(r) { return !!(r && r.ok); }).catch(function() { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function listFiles(fileDir) {
    try {
      return window.fetch('/autosave?dir=' + encodeURIComponent(_dir(fileDir)))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) { return (data && Array.isArray(data.files)) ? data.files : []; })
        .catch(function() { return []; });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  function loadFile(name, fileDir) {
    if (!isValidName(name)) return Promise.resolve(null);
    try {
      return window.fetch('/autosave?type=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(_dir(fileDir)))
        .then(function(r) { return r.ok ? r.text() : null; })
        .catch(function() { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // DSL 本文から図の種類を推測する。フォルダから開いた図に対して
  // 正しいモジュールを選ぶために使う。
  function detectType(dsl) {
    var t = String(dsl == null ? '' : dsl);
    if (/^\s*(start|:.*;|if\s*\()/m.test(t) && /@startuml/.test(t) && /(^|\n)\s*(start|stop|:)/.test(t)) {
      if (/(^|\n)\s*start\s*$/m.test(t) || /(^|\n)\s*:.*;\s*$/m.test(t)) return 'plantuml-activity';
    }
    if (/(^|\n)\s*\[\*\]\s*-->/.test(t) || /(^|\n)\s*state\s+/.test(t)) return 'plantuml-state';
    if (/(^|\n)\s*(class|interface|abstract\s+class|enum)\s+/.test(t)) return 'plantuml-class';
    if (/(^|\n)\s*(usecase|actor)\s+/.test(t) && /\(.*\)/.test(t)) return 'plantuml-usecase';
    if (/(^|\n)\s*(component|\[[^\]]+\]\s*(-|<))/.test(t)) return 'plantuml-component';
    if (/(^|\n)\s*(participant|actor|boundary|control|entity|database)\s+/.test(t) || /-+>+\s*\w+\s*:/.test(t)) {
      return 'plantuml-sequence';
    }
    return null;
  }

  return {
    init: init,
    persist: persist,
    list: list,
    count: count,
    getActive: getActive,
    getActiveId: getActiveId,
    findByName: findByName,
    updateActive: updateActive,
    updateDoc: updateDoc,
    setActive: setActive,
    open: open,
    openOrActivate: openOrActivate,
    close: close,
    rename: rename,
    reset: reset,
    sanitizeName: sanitizeName,
    isValidName: isValidName,
    saveToFile: saveToFile,
    listFiles: listFiles,
    loadFile: loadFile,
    detectType: detectType,
  };
})();
