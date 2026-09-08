'use strict';
window.MA = window.MA || {};

// workspace — 複数の図を「ドキュメント」として同時に開いて切り替える。
//
// 1 ドキュメント = { id, name, diagramType, dsl }。
// name はサーバの保存先ファイル名 ({name}.puml) にそのまま使う。
// BLK-junior-20260907-1203: 以前は [A-Za-z0-9_-]+ しか許さず、「GPIOドライバ
// ユースケース」のような日本語名の図が保存フォルダ経由で読み込めず、保存も
// 黙って download に落ちていた。ファイル名として危ないもの (パス区切り・
// Windows の禁止文字・制御文字・予約名) だけを弾き、日本語はそのまま通す。
// server.py の SAFE_NAME 判定と同じ規則。片方だけ変えないこと。
window.MA.workspace = (function() {
  var KEY = 'plantuml-workspace';
  // ファイル名に使えない文字。Windows の禁止文字 + パス区切り + 制御文字。
  // 正規表現ではなく文字の並びで持つ (バックスラッシュのエスケープ事故を避けるため)。
  var UNSAFE_CHARS = '<>:"|?*';
  function _isUnsafeChar(ch) {
    if (ch === '/' || ch === String.fromCharCode(92)) return true;   // パス区切り
    if (ch.charCodeAt(0) < 32) return true;                          // 制御文字
    return UNSAFE_CHARS.indexOf(ch) >= 0;
  }
  // Windows の予約デバイス名 (拡張子を付けても使えない)。
  var RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  var _state = null;   // { activeId, docs: [] }
  var _seq = 0;

  function _newId() {
    _seq++;
    return 'doc' + Date.now().toString(36) + '-' + _seq;
  }

  // 危ない文字だけを _ に潰す。日本語・空白・記号はそのまま残す。
  function sanitizeName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/\.puml$/i, '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      out += _isUnsafeChar(s.charAt(i)) ? '_' : s.charAt(i);
    }
    // Windows は末尾のドット・空白を落とすので、先に自分で落として名前を一意に保つ。
    out = out.replace(/^[\s.]+|[\s.]+$/g, '');
    if (!out || RESERVED_RE.test(out)) out = out ? out + '_' : 'diagram';
    return out;
  }

  // 名前の規則を、判定と同じ場所から日本語 1 行で出す。
  //
  // BLK-junior-20260908-0003: 名前変更ダイアログの説明文が「英数字・_ ・- のみ」
  // のまま残っていて、実際には通る日本語・空白・括弧を「使ってよいのか」毎回
  // 試すまで確信が持てなかった。文言を画面側に書き写すと、判定を変えたときに
  // また置いていかれる。判定の隣に置いて、画面はここから取る。
  function nameRuleText() {
    return '図の名前 (日本語・空白・括弧は使えます。'
      + UNSAFE_CHARS.split('').concat(['/', String.fromCharCode(92)]).join(' ')
      + ' と、先頭・末尾の空白とドットは使えません)';
  }

  function isValidName(name) {
    if (typeof name !== 'string' || !name) return false;
    if (RESERVED_RE.test(name)) return false;
    if (name !== name.replace(/^[\s.]+|[\s.]+$/g, '')) return false;
    for (var i = 0; i < name.length; i++) {
      if (_isUnsafeChar(name.charAt(i))) return false;
    }
    return true;
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
      }).then(function(r) {
        if (!(r && r.ok)) return false;
        // BLK-junior-20260908-2003: 図種が変わる保存は server が別ファイルへ回す。
        // 回された先は autoSave の知らせに寄せる (聞き手は 1 か所でよい)。
        if (!r.json) return true;
        return r.json().then(function(data) {
          if (window.MA.autoSave && window.MA.autoSave.noteFileRenamed) {
            window.MA.autoSave.noteFileRenamed(data);
          }
          return true;
        }).catch(function() { return true; });
      }).catch(function() { return false; });
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

  // BLK-reviewer-20260907-1403: 名前だけでなく最終保存時刻と本文の指紋も取る。
  // 古い server は entries を返さないので、その場合は名前だけの entry に落とす。
  function listFileEntries(fileDir) {
    try {
      return window.fetch('/autosave?dir=' + encodeURIComponent(_dir(fileDir)))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (!data) return [];
          if (Array.isArray(data.entries)) return data.entries;
          if (Array.isArray(data.files)) {
            return data.files.map(function(n) { return { name: n, mtime: null, hash: null }; });
          }
          return [];
        })
        .catch(function() { return []; });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  // listFolder — 一覧に加えて「その保存先が実在するか」も返す。
  //
  // BLK-primary-20260908-0103: listFileEntries は 0 件しか返さないので、
  // 「保存先の綴りを間違えた」と「まだ 1 枚も無い」が呼び出し側で区別できず、
  // 保存先の書式を誤ると 📂一覧が黙って空になっていた。
  // 返り値: { entries, exists, dir }。exists が null なら server に尋ねられなかった。
  function listFolder(fileDir) {
    var asked = _dir(fileDir);
    var miss = { entries: [], exists: null, dir: asked, roles: {}, verified: {}, now: null,
                 gone: [] };
    try {
      return window.fetch('/autosave?dir=' + encodeURIComponent(asked))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (!data) return miss;
          var entries = [];
          if (Array.isArray(data.entries)) entries = data.entries;
          else if (Array.isArray(data.files)) {
            entries = data.files.map(function(n) { return { name: n, mtime: null, hash: null }; });
          }
          return {
            entries: entries,
            // 古い server は exists を返さない。その場合は判定しない (null)。
            exists: (typeof data.exists === 'boolean') ? data.exists : null,
            dir: (typeof data.dir === 'string' && data.dir) ? data.dir : asked,
            // BLK-reviewer-20260908-0203-wish: 実データ / テンプレの宣言。
            // 一覧と同じ呼び出しで返る (別呼び出しにすると印の付く前が一瞬見える)。
            roles: (data.roles && typeof data.roles === 'object') ? data.roles : {},
            // BLK-reviewer-20260908-1103-wish: 「この svg を今の puml で描き直したら
            // 一致したか」の控え。指紋つきなので、どちらかが動けば未確認に戻せる。
            verified: (data.verified && typeof data.verified === 'object') ? data.verified : {},
            // BLK-reviewer-20260908-0923-wish: mtime を刻んだのと同じ時計の「今」。
            // 「直近 N 分以内に更新された」は端末の時計では判定できない。
            // 古い server は返さない (その場合は判定しない = null)。
            now: (typeof data.now === 'string' && data.now) ? data.now : null,
            // BLK-junior-20260908-2003: 本体が消えて、上書き前の控えだけが
            // 残っている図。現存する図と混ぜずに別枠で受け取る。
            gone: Array.isArray(data.gone) ? data.gone : [],
          };
        })
        .catch(function() { return miss; });
    } catch (e) {
      return Promise.resolve(miss);
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
    nameRuleText: nameRuleText,
    saveToFile: saveToFile,
    listFiles: listFiles,
    listFileEntries: listFileEntries,
    listFolder: listFolder,
    loadFile: loadFile,
    detectType: detectType,
  };
})();
