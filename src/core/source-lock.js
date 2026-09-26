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

  // BLK-junior-20260914-0906: 開いたときの本文の指紋。守るべきものが本当にあるか
  // (= 開いてから本文が変わったか) を、聞く前に機械で決めるために憶える。
  // FNV-1a 32bit。暗号強度は要らない (要るのは「同じ本文なら同じ値」だけ)。
  function fingerprint(dsl) {
    var s = String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  // mark(docId, originName, originDsl) — 既存ファイルを開いて作った / 読み直したタブに錠をかける。
  // 既に錠があるドキュメントは上書きしない (2 回目に開いても確認をやり直さない)。
  function mark(docId, originName, originDsl) {
    if (!docId || !originName) return null;
    var map = _read();
    if (map[docId] && map[docId].origin === originName) return map[docId];
    map[docId] = { origin: originName, mode: 'ask', alias: null,
                   opened: originDsl == null ? null : fingerprint(originDsl) };
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
  //
  // BLK-junior-20260914-0906: dsl を渡せば「開いたときから本文が変わっていない」
  // ことを見る。変わっていなければ書き戻す中身が元ファイルと同じなので、守るものも
  // 書く必要も無い。一覧から開いて眺めるだけの手順 (junior 手順 1) で毎回
  // 確認が割り込んでいたのはここで、聞かずに黙って何もしない:
  //   { action: 'skip' } … 開いたときのまま。書かない・聞かない
  function decide(docId, docName, used, dsl) {
    var name = String(docName == null ? '' : docName);
    var e = docId ? _read()[docId] : null;
    if (!e) return { action: 'write', name: name };
    if (name !== e.origin) { release(docId); return { action: 'write', name: name }; }
    if (e.mode === 'copy' && e.alias) return { action: 'write', name: e.alias };
    if (e.mode === 'overwrite') return { action: 'write', name: e.origin };
    // 開いたままの本文なら、元ファイルは既にその内容なので聞く理由が無い。
    if (typeof dsl === 'string' && e.opened && fingerprint(dsl) === e.opened) {
      return { action: 'skip', name: e.origin, reason: 'unchanged' };
    }
    // まだ聞いていないが、既に同じ問いに答えている日は聞き直さない。
    var def = defaultChoice();
    if (def) return answer(docId, def, used, false);
    return { action: 'ask', origin: e.origin };
  }

  // unchangedSinceOpen(docId, dsl) — 開いたときから本文が変わっていないか (decide が skip を
  // 返す条件) を、錠に触らずに答える。decide は名前が変わっていれば錠を外すので、書き先が
  // 控え (`{名前}-編集中`) に替わった後の doc で問い合わせると、それだけで錠が外れて以後の
  // 書き戻しが本体へ入ってしまう (BLK-builder-20260924-0637-b2-1-red)。問い合わせはこちらを使う。
  function unchangedSinceOpen(docId, dsl) {
    var e = docId ? _read()[docId] : null;
    if (!e || typeof dsl !== 'string' || !e.opened) return false;
    if (e.mode === 'copy' && e.alias) return false;
    if (e.mode === 'overwrite') return false;
    return fingerprint(dsl) === e.opened;
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
  // dir — そのタブの書き先のフォルダ (BLK-human-20260925-1150)。渡せば「どのフォルダのファイルか」も言う。
  function askText(origin, dir) {
    var where = dir ? '（' + String(dir).replace(/[\\/]+$/, '') + ' の中）' : '';
    return {
      title: '開いたファイルを上書きしますか',
      // BLK-junior-20260914-0906: 「なぜ今これを聞かれるのか」と「どちらを選んでも
      // 古い控えの中身が図に入ることはない」を本文で言い切る。開いただけでは
      // 聞かれない (decide が skip を返す) ので、出たときは必ず本文を変えている。
      body: '「' + origin + '.puml」' + where + 'は一覧から開いたファイルです。開いたときから本文が変わったので、'
        + 'このまま自動保存すると元ファイルを書き換えます。どちらを選んでも、書かれるのは'
        + 'いま画面に出ている本文です（' + origin + COPY_SUFFIX + ' などの古い控えの中身が図に入ることはありません）。',
      overwrite: 'このファイルを書き換える',
      keep: '元ファイルは変更前のまま保つ（いまの本文は ' + origin + COPY_SUFFIX + ' に書く）',
      all: '開いている他のファイルも同じ扱いにする（毎回聞かない）',
      // BLK-junior-20260915-2240: 二択が同格に見え、しかも強調が付いていたのは
      // 「元ファイルを保つ」側だった。直した本文を元ファイルに入れたくて上書き保存を
      // 押した人にとって、選ぶべきはほぼ必ず「書き換える」なので、こちらを主にする。
      recommended: 'overwrite',
      overwriteNote: 'おすすめ（直した本文がこのファイルに入ります）',
      keepNote: '元ファイルはいま見えている表記に変わりません',
      // BLK-junior-20260916-0046: 同じ表記直しを何枚も続ける回は、1 枚ずつ開いて
      // 直して答える手順そのものが重い (10 枚で 20 クリック)。保存フォルダを
      // またぐ ⇄ 一括置換なら 1 回で済むので、詰まったその場から入れるようにする。
      bulk: '⇄ 同じ直しを保存フォルダの図にまとめて当てる',
      bulkNote: '1 枚ずつ開き直さずに済みます（このファイルは書き換えます）',
    };
  }

  // 答えたあとに状態バーへ出す 1 行。「静かに元の表記へ戻った」ように見えるのは
  // keep を選んだときなので、そのときだけ取り消しの入口があることまで言う。
  function answeredText(choice, origin, alias) {
    if (choice === 'keep') {
      return {
        text: '' + origin + '.puml は変更前のまま（いまの本文は ' + alias + '.puml に入りました）',
        undo: '↩ やっぱり ' + origin + '.puml を書き換える',
      };
    }
    return { text: '✎ ' + origin + '.puml を書き換えます', undo: '' };
  }

  // 上部バーに常時出す 1 語。錠がかかっていることを見えるようにする
  // (確認に答えたあとも、書き先がどこかは見えていないと分からない)。
  // BLK-builder-20260924-1702-2 (design 9a): 札は絵文字を使わず、ファイル名も繰り返さない
  // (名前は左隣のパンくずが言う)。札が言うのは「この図をどう書くか」だけ。
  function label(docId, docName) {
    var e = docId ? _read()[docId] : null;
    if (!e || String(docName) !== e.origin) return null;
    if (e.mode === 'copy' && e.alias) {
      // BLK-junior-20260915-2240: 押し間違えても、押した本人がここから 1 クリックで戻せる。
      return {
        text: '元ファイル保護',
        title: e.origin + '.puml は変更前のまま保ちます。書き先は ' + e.alias
          + '.puml です（押すと ' + e.origin + '.puml を書き換える方に戻せます）',
        undoable: true,
      };
    }
    if (e.mode === 'overwrite') {
      return { text: '元ファイルに書く', title: '開いた ' + e.origin + '.puml をそのまま書き換えます' };
    }
    return { text: '書く前に確認',
             title: '一覧から開いたファイルです。読むだけなら何も書きません。本文を変えたときだけ、'
               + '元ファイルを書き換えてよいか一度だけ確認します' };
  }

  return {
    mark: mark,
    fingerprint: fingerprint,
    stateOf: stateOf,
    release: release,
    clearAll: clearAll,
    copyName: copyName,
    decide: decide,
    unchangedSinceOpen: unchangedSinceOpen,
    answer: answer,
    answeredText: answeredText,
    askText: askText,
    label: label,
    defaultChoice: defaultChoice,
    setDefault: setDefault,
    COPY_SUFFIX: COPY_SUFFIX,
  };
})();
