'use strict';
window.MA = window.MA || {};

// source-lock — 「開いたファイル」を自動保存の巻き添えから守る。
//
// BLK-junior-20260908-1803-wish: 先輩版・テンプレートを見比べのために開くと、
// その瞬間からタブの名前は元ファイル名のままで、自動保存は編集途中の本文を
// その元ファイルへ書き続けた。図名欄で名前を変え終えるまでの間、見比べる
// つもりで開いた元ファイル (`plantuml-usecase.puml`) が壊れる。
//
// ここは「開いた元ファイルへ最初に書き戻す直前に一度だけ確認を挟み、
// 利用者が『元のまま保つ』を選んだら書き先を控えの名前に逃がす」判定だけを
// 置く。DOM にも fetch にも触らない。実行は app.js。
//
// 状態遷移 (ドキュメント 1 枚につき 1 つ):
//   開く          → mode 'ask'       … まだ 1 度も書いていない。次の書き込みで聞く
//   「上書き」    → mode 'overwrite' … 以後そのまま元ファイルへ書く
//   「元を保つ」  → mode 'copy'      … 以後 alias (元名-編集中) へ書く
//   図名欄で改名  → 錠が外れる       … 以後は普通のドキュメントと同じ
//
// BLK-primary-20260909-0403: 開いたファイルが 1 枚なら確認は 1 回だが、
// 15 枚のタブを横断する日は「開いたまま」のファイルの数だけ確認が挟まる。
// タブを切り替えるたびに割り込まれ、閉じ忘れると次のクリックが効かない。
// そこで **返事を全体の既定として控え**、まだ聞いていない他のタブには
// 同じ扱いを黙って適用する (decide() が既定を見る)。聞くのは 1 日に 1 回きり。
window.MA.sourceLock = (function() {
  var KEY = 'plantuml-source-lock';
  var DEFAULT_KEY = 'plantuml-source-lock-default';
  var COPY_SUFFIX = '-編集中';

  function _read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw == null) return {};
      var v = JSON.parse(raw);
      return (v && typeof v === 'object') ? v : {};
    } catch (e) {
      return {};
    }
  }
  function _write(map) {
    try { window.localStorage.setItem(KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }
  }

  // mark(docId, originName) — 既存ファイルを開いて作った / 読み直したタブに錠をかける。
  // 既に錠があるドキュメントは上書きしない (2 回目に開いても確認をやり直さない)。
  function mark(docId, originName) {
    if (!docId || !originName) return null;
    var map = _read();
    if (map[docId] && map[docId].origin === originName) return map[docId];
    map[docId] = { origin: originName, mode: 'ask', alias: null };
    _write(map);
    return map[docId];
  }

  function stateOf(docId) {
    if (!docId) return null;
    var e = _read()[docId];
    return e ? { origin: e.origin, mode: e.mode, alias: e.alias || null } : null;
  }

  function release(docId) {
    if (!docId) return false;
    var map = _read();
    if (!(docId in map)) return false;
    delete map[docId];
    _write(map);
    return true;
  }

  function clearAll() {
    _write({});
    try { window.localStorage.removeItem(DEFAULT_KEY); } catch (e) {}
  }

  // 既定の返事 — 一度答えたら、まだ聞いていない他の「開いたファイル」にも同じ扱いを
  // 適用する。null なら既定なし (次の 1 枚でまた聞く)。
  function defaultChoice() {
    try {
      var v = window.localStorage.getItem(DEFAULT_KEY);
      return (v === 'keep' || v === 'overwrite') ? v : null;
    } catch (e) { return null; }
  }
  function setDefault(choice) {
    try {
      if (choice === 'keep' || choice === 'overwrite') window.localStorage.setItem(DEFAULT_KEY, choice);
      else window.localStorage.removeItem(DEFAULT_KEY);
      return true;
    } catch (e) { return false; }
  }

  // copyName(origin, used) — 元ファイルを保つときの控えの名前。
  // 既に使われている名前は避ける (used は名前の配列)。
  function copyName(origin, used) {
    var base = String(origin == null ? '' : origin) + COPY_SUFFIX;
    var taken = {};
    (used || []).forEach(function(n) { taken[n] = true; });
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + '-' + n]) n++;
    return base + '-' + n;
  }

  // decide(docId, docName) — 自動保存が今どこへ書くべきかを返す。
  //
  //   { action: 'write', name }  … その名前へ書いてよい
  //   { action: 'ask', origin }  … 書く前に一度だけ聞く (今回は書かない)
  //
  // 図名欄で名前を変えたら (docName !== origin) 錠は用済みなので外す。
  // 「名前を変え終えるまで」という利用者の言い方をそのまま条件にしている。
  // used を渡せば、既定を当てるときの控えの名前が既存タブと衝突しない。
  function decide(docId, docName, used) {
    var name = String(docName == null ? '' : docName);
    var e = docId ? _read()[docId] : null;
    if (!e) return { action: 'write', name: name };
    if (name !== e.origin) { release(docId); return { action: 'write', name: name }; }
    if (e.mode === 'copy' && e.alias) return { action: 'write', name: e.alias };
    if (e.mode === 'overwrite') return { action: 'write', name: e.origin };
    // まだ聞いていないが、既に同じ問いに答えている日は聞き直さない。
    var def = defaultChoice();
    if (def) return answer(docId, def, used, false);
    return { action: 'ask', origin: e.origin };
  }

  // answer(docId, choice, used) — 確認への返事。
  //   'overwrite' … 元ファイルへ書いてよい
  //   'keep'      … 元ファイルは変更前のまま保ち、控えへ書く
  // 返り値は decide() と同じ形 (返事の直後にそのまま書けるように)。
  // applyToAll に true を渡すと、この返事を既定にして以後は聞かない。
  function answer(docId, choice, used, applyToAll) {
    var map = _read();
    var e = map[docId];
    if (applyToAll) setDefault(choice === 'keep' ? 'keep' : 'overwrite');
    if (!e) return { action: 'write', name: '' };
    if (choice === 'keep') {
      e.mode = 'copy';
      e.alias = copyName(e.origin, used);
      _write(map);
      return { action: 'write', name: e.alias };
    }
    e.mode = 'overwrite';
    e.alias = null;
    _write(map);
    return { action: 'write', name: e.origin };
  }

  // 確認ダイアログに出す文言。判定の隣に置き、画面はここから取る
  // (書き先が変わったときに文言だけ置いていかれないように)。
  function askText(origin) {
    return {
      title: '開いたファイルを上書きしますか',
      body: '「' + origin + '.puml」は開いたままのファイルです。'
        + 'このまま編集を続けると自動保存が元ファイルを書き換えます。',
      overwrite: 'このファイルを書き換える',
      keep: '元ファイルは変更前のまま保つ（' + origin + COPY_SUFFIX + ' に書く）',
      all: '開いている他のファイルも同じ扱いにする（毎回聞かない）',
    };
  }

  // 上部バーに常時出す 1 語。錠がかかっていることを見えるようにする
  // (確認に答えたあとも、書き先がどこかは見えていないと分からない)。
  function label(docId, docName) {
    var e = docId ? _read()[docId] : null;
    if (!e || String(docName) !== e.origin) return null;
    if (e.mode === 'copy' && e.alias) {
      return { text: '🔒 元ファイル保護', title: e.origin + '.puml は変更前のまま保ちます。書き先は ' + e.alias + '.puml です' };
    }
    if (e.mode === 'overwrite') {
      return { text: '✎ ' + e.origin, title: '開いた ' + e.origin + '.puml をそのまま書き換えます' };
    }
    return { text: '🔒 ' + e.origin, title: '開いたファイルです。最初の自動保存の前に、上書きしてよいか一度だけ確認します' };
  }

  return {
    mark: mark,
    stateOf: stateOf,
    release: release,
    clearAll: clearAll,
    copyName: copyName,
    decide: decide,
    answer: answer,
    askText: askText,
    label: label,
    defaultChoice: defaultChoice,
    setDefault: setDefault,
    COPY_SUFFIX: COPY_SUFFIX,
  };
})();
