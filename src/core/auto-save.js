'use strict';
window.MA = window.MA || {};

window.MA.autoSave = (function() {
  var KEY_CONFIG = 'plantuml-autosave-config';
  var KEY_META = 'plantuml-autosave-meta';
  var DSL_PREFIX = 'plantuml-autosave-dsl-';
  var DEFAULTS = {
    enabled: true,
    debounceMs: 1000,
    restoreMode: 'confirm',
    backend: 'localStorage',
    fileDir: './autosave',
  };

  var _pending = null;       // { diagramType, dsl, fileName }
  var _timerId = null;
  var _saveListeners = [];

  function isAvailable() {
    try {
      var k = '__plantuml_autosave_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _readJson(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function _writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function _writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
  function _readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function _fileBackendWrite(diagramType, dsl, fileDir) {
    // Fire-and-forget POST to /autosave. We don't await: localStorage
    // already has the canonical sync copy. Errors are logged but don't
    // block the localStorage write.
    // Use window.fetch so test sandboxes can stub it via global.window.fetch.
    try {
      var body = JSON.stringify({ type: diagramType, dsl: dsl, dir: fileDir || './autosave' });
      window.fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).then(function(r) {
        // BLK-junior-20260908-2003: 図種が変わる保存は server が別ファイルへ回す。
        // 回された先を知らせないと、画面の図名と書かれたファイルがずれたまま
        // 次の保存も同じように回り続ける (図名を直すのは app.js)。
        if (!r || !r.ok || !r.json) return null;
        return r.json().catch(function() { return null; });
      }).then(function(data) {
        if (data && data.renamedFrom && data.savedAs && data.renamedFrom !== data.savedAs) {
          _notifyRenamed(data);
        }
      }).catch(function(e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[autoSave] file write failed:', e);
        }
      });
    } catch (e) { /* fetch may not exist in test sandbox; localStorage still works */ }
  }
  function _fileBackendDelete(fileDir) {
    try {
      window.fetch('/autosave?dir=' + encodeURIComponent(fileDir || './autosave'), {
        method: 'DELETE',
        keepalive: true,
      }).catch(function() {});
    } catch (e) {}
  }
  function _fileBackendList(fileDir) {
    // Returns Promise<{files: [...types], meta: {...}|null, dir: '...'} | null>
    try {
      return window.fetch('/autosave?dir=' + encodeURIComponent(fileDir || './autosave'))
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  function _fileBackendGetOne(diagramType, fileDir) {
    // Returns Promise<string | null>
    try {
      return window.fetch('/autosave?type=' + encodeURIComponent(diagramType) + '&dir=' + encodeURIComponent(fileDir || './autosave'))
        .then(function(r) { return r.ok ? r.text() : null; })
        .catch(function() { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function getConfig() {
    var stored = _readJson(KEY_CONFIG, {});
    var out = {};
    out.enabled = (typeof stored.enabled === 'boolean') ? stored.enabled : DEFAULTS.enabled;
    out.debounceMs = (typeof stored.debounceMs === 'number' && stored.debounceMs >= 100) ? stored.debounceMs : DEFAULTS.debounceMs;
    out.restoreMode = (stored.restoreMode === 'auto' || stored.restoreMode === 'confirm' || stored.restoreMode === 'none') ? stored.restoreMode : DEFAULTS.restoreMode;
    out.backend = (stored.backend === 'localStorage' || stored.backend === 'file') ? stored.backend : DEFAULTS.backend;
    out.fileDir = (typeof stored.fileDir === 'string' && stored.fileDir.length > 0) ? stored.fileDir : DEFAULTS.fileDir;
    return out;
  }
  function setConfig(partial) {
    var merged = getConfig();
    if (partial && typeof partial === 'object') {
      if ('enabled' in partial) merged.enabled = !!partial.enabled;
      if ('debounceMs' in partial) merged.debounceMs = partial.debounceMs;
      if ('restoreMode' in partial) merged.restoreMode = partial.restoreMode;
      if ('backend' in partial) merged.backend = partial.backend;
      if ('fileDir' in partial) merged.fileDir = partial.fileDir;
    }
    _writeJson(KEY_CONFIG, merged);
    // BLK-junior-20260907-0843: 保存先はブラウザではなくマシンの設定なので、
    // 新しいタブ・別プロファイルでも引き継げるよう server 側にも書き写す。
    if (window.MA.savePrefs) window.MA.savePrefs.save(merged);
    return getConfig();
  }

  // hydrateFromServer() — localStorage に保存先の指定が無いときだけ、
  // server が覚えている保存先を取り込む。取り込んだ値は書き戻して次回以降
  // localStorage 側でも効かせる。返り値は取り込んだキーの object。
  function hydrateFromServer() {
    var SP = window.MA.savePrefs;
    if (!SP) return Promise.resolve({});
    return SP.load().then(function(remote) {
      // stored はここで読む。fetch が飛んでいる間に設定画面から保存された値を
      // 後から来た server の値で上書きしない (init 直後に setConfig が走る)。
      var stored = _readJson(KEY_CONFIG, {});
      var apply = SP.applicable(stored, remote);
      if (Object.keys(apply).length === 0) return {};
      var merged = getConfig();
      SP.KEYS.forEach(function(k) { if (k in apply) merged[k] = apply[k]; });
      _writeJson(KEY_CONFIG, merged);
      return apply;
    });
  }

  // ── 書き込みを止める門 (BLK-junior-20260908-1803) ────────────────────────
  // ディスクへ写す前に「この名前に書いてよいか」を聞く。答えるのは app.js
  // (保存フォルダの役割宣言を知っているのはあちら)。ここは知らないまま止められる形にする。
  var _fileGuard = null;      // function(diagramType) -> 理由の文字列 / null
  var _blockedListeners = [];
  var _blockedSeen = {};      // 名前 → 最後に知らせた時刻。1 打鍵ごとには鳴らさない
  var BLOCK_QUIET_MS = 5000;  // この間は同じ名前で鳴らさない (打鍵のたびの通知を防ぐ)

  function setFileGuard(fn) {
    _fileGuard = (typeof fn === 'function') ? fn : null;
  }

  function _blockedBy(diagramType) {
    if (!_fileGuard) return null;
    try {
      var r = _fileGuard(diagramType);
      return r ? String(r) : null;
    } catch (e) {
      return null;   // 門が壊れていても保存は止めない
    }
  }

  function _notifyBlocked(diagramType, reason) {
    // 直前に知らせたばかりなら黙る。ただし時間が空いたら言い直す
    // (開いた直後の通知が別の通知に押し流され、編集中は何も言わない状態を作らない)。
    var now = Date.now();
    var last = _blockedSeen[diagramType];
    if (last && (now - last) < BLOCK_QUIET_MS) return;
    _blockedSeen[diagramType] = now;
    for (var i = 0; i < _blockedListeners.length; i++) {
      try { _blockedListeners[i]({ diagramType: diagramType, reason: reason }); } catch (e) {}
    }
  }

  // 別の経路 (app.js の saveActiveDoc) が止めたときも、知らせ方はここに揃える。
  function noteFileBlocked(diagramType, reason) {
    _notifyBlocked(String(diagramType == null ? '' : diagramType), reason);
  }

  function onFileBlocked(listener) {
    if (typeof listener === 'function') _blockedListeners.push(listener);
  }

  // ── 図種が変わって別ファイルへ回されたとき (BLK-junior-20260908-2003) ────
  var _renamedListeners = [];

  function _notifyRenamed(info) {
    for (var i = 0; i < _renamedListeners.length; i++) {
      try { _renamedListeners[i](info); } catch (e) {}
    }
  }

  function onFileRenamed(listener) {
    if (typeof listener === 'function') _renamedListeners.push(listener);
  }

  // 別の経路 (workspace.saveToFile) が書いたときも、知らせ方はここに揃える。
  function noteFileRenamed(info) {
    if (info && info.renamedFrom && info.savedAs && info.renamedFrom !== info.savedAs) {
      _notifyRenamed(info);
    }
  }

  // 図名を変えたら (= 別のファイルになったら) また鳴らせるようにする。
  function resetFileBlocked(diagramType) {
    if (diagramType == null) _blockedSeen = {};
    else delete _blockedSeen[diagramType];
  }

  // ── ディスクへ書く名前を決める門 (BLK-primary-20260913-0306) ─────────────
  // localStorage の鍵は図種 (plantuml-sequence 等) でよいが、保存フォルダの
  // ファイル名は「図の名前」でなければならない。図種を鍵にしたまま写すと、
  // diagram1 を打つたびに plantuml-sequence.puml が diagram1 の中身で
  // 上書きされ、一度も開いていない図の中身が入れ替わる (primary が実測)。
  // 名前を知っているのは workspace を持つ app.js なので、ここは聞くだけにする。
  // 解決器が無い間は従来どおり図種で書く (単体では localStorage 運用と同じ)。
  var _fileNameResolver = null;   // function(diagramType) -> 名前 / '' (書かない)

  function setFileNameResolver(fn) {
    _fileNameResolver = (typeof fn === 'function') ? fn : null;
  }

  // 返り値: 書くべきファイル名、または null (= ディスクへは書かない)
  function _fileNameFor(diagramType) {
    if (!_fileNameResolver) return diagramType;
    var n;
    try {
      n = _fileNameResolver(diagramType);
    } catch (e) {
      return null;   // 名前が分からないなら書かない (取り違えより無書き込み)
    }
    n = (n == null) ? '' : String(n);
    return n ? n : null;
  }

  function _doWrite(diagramType, dsl, fileName) {
    var ok = _writeRaw(DSL_PREFIX + diagramType, dsl);
    if (!ok) return null;
    var meta = { lastSavedAt: new Date().toISOString(), lastSavedType: diagramType };
    _writeJson(KEY_META, meta);
    // If file backend selected, mirror the write to disk via the server.
    var cfg = getConfig();
    if (fileName === undefined) fileName = _fileNameFor(diagramType);
    // fileName が null なら、名前が決まらないタブ (未命名・記号入り) なので
    // ディスクへは写さない。localStorage には残るので編集内容は消えず、
    // Ctrl+S で名前を付ければそのまま書ける。取り違えて別の図を潰すより良い。
    if (cfg.backend === 'file' && fileName != null) {
      // BLK-junior-20260908-1803: 書いてはいけないファイル (テンプレ宣言済み) には
      // ディスクへ写さない。localStorage 側は残すので、編集内容は失われず、
      // 図名を変えればそのまま新しいファイルに保存される。
      var block = _blockedBy(fileName);
      if (block) {
        _notifyBlocked(fileName, block);
      } else {
        _fileBackendWrite(fileName, dsl, cfg.fileDir);
      }
    }
    for (var i = 0; i < _saveListeners.length; i++) {
      try { _saveListeners[i](meta); } catch (e) { /* listener errors must not block */ }
    }
    return meta;
  }

  function flush() {
    if (_timerId != null) {
      try { clearTimeout(_timerId); } catch (e) {}
      _timerId = null;
    }
    if (_pending == null) return;
    var p = _pending;
    _pending = null;
    var cfg = getConfig();
    if (!cfg.enabled) return;
    _doWrite(p.diagramType, p.dsl, p.fileName);
  }

  function scheduleSave(diagramType, dsl) {
    if (!diagramType) return;
    var cfg = getConfig();
    if (!cfg.enabled) return;
    // 書き先の名前は「打った時点」で決める。debounce の 1 秒の間にタブを
    // 切り替えられると、あとで聞き直した名前は次のタブのものになり、
    // 前のタブの中身が次のタブのファイルへ流れ込む (これも入れ替わりの形)。
    _pending = {
      diagramType: diagramType,
      dsl: String(dsl == null ? '' : dsl),
      fileName: _fileNameFor(diagramType),
    };
    if (_timerId != null) {
      try { clearTimeout(_timerId); } catch (e) {}
    }
    _timerId = setTimeout(flush, cfg.debounceMs);
  }

  function restoreFor(diagramType) {
    if (!diagramType) return null;
    return _readRaw(DSL_PREFIX + diagramType);
  }
  function hasSavedFor(diagramType) {
    return restoreFor(diagramType) != null;
  }
  function getMeta() {
    return _readJson(KEY_META, null);
  }

  function clearAll() {
    // Cancel any pending debounced save so the timer can't fire moments
    // later and re-create the keys we're about to delete.
    if (_timerId != null) {
      try { clearTimeout(_timerId); } catch (e) {}
      _timerId = null;
    }
    _pending = null;
    var keysToRemove = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && (k.indexOf(DSL_PREFIX) === 0 || k === KEY_META)) {
          keysToRemove.push(k);
        }
      }
    } catch (e) { /* best-effort */ }
    for (var j = 0; j < keysToRemove.length; j++) {
      try { window.localStorage.removeItem(keysToRemove[j]); } catch (e) {}
    }
    // If file backend selected, also wipe the server-side directory.
    var cfg = getConfig();
    if (cfg.backend === 'file') {
      _fileBackendDelete(cfg.fileDir);
    }
  }

  function onSave(listener) {
    if (typeof listener === 'function') _saveListeners.push(listener);
  }

  // init() returns either undefined (sync, localStorage backend) or a
  // Promise (async, file backend hydrating localStorage from disk).
  // app.js bootRestore must check for the Promise and await it before
  // doing the restoreFor() lookups.
  function init() {
    // 保存先の引き継ぎが先。これを待たずに getConfig() を読むと、
    // 新しいタブでは既定の ./autosave を見にいってしまう。
    return hydrateFromServer().then(_initWithConfig, function() { return _initWithConfig({}); });
  }

  function _initWithConfig() {
    var cfg = getConfig();
    if (cfg.backend !== 'file') return null;
    return _fileBackendList(cfg.fileDir).then(function(data) {
      if (!data || !Array.isArray(data.files)) return;
      // Fetch every file in parallel and seed localStorage with them.
      var promises = data.files.map(function(t) {
        return _fileBackendGetOne(t, cfg.fileDir).then(function(text) {
          if (text != null) {
            try { window.localStorage.setItem(DSL_PREFIX + t, text); } catch (e) {}
          }
        });
      });
      // Update meta from server's record (more authoritative)
      if (data.meta) {
        try { window.localStorage.setItem(KEY_META, JSON.stringify(data.meta)); } catch (e) {}
      }
      return Promise.all(promises).then(function() { return data; });
    });
  }

  return {
    init: init,
    scheduleSave: scheduleSave,
    flush: flush,
    restoreFor: restoreFor,
    hasSavedFor: hasSavedFor,
    getMeta: getMeta,
    clearAll: clearAll,
    getConfig: getConfig,
    setConfig: setConfig,
    hydrateFromServer: hydrateFromServer,
    isAvailable: isAvailable,
    onSave: onSave,
    setFileGuard: setFileGuard,
    setFileNameResolver: setFileNameResolver,
    onFileBlocked: onFileBlocked,
    onFileRenamed: onFileRenamed,
    noteFileRenamed: noteFileRenamed,
    noteFileBlocked: noteFileBlocked,
    resetFileBlocked: resetFileBlocked,
  };
})();
