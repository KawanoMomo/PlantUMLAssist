'use strict';

// change-baseline — ▤ 変更サマリボードの「変更前 =」を何にするか。
//
// BLK-primary-20260924-1332-wish: ボードの変更前は「今日 0 時」しか無く、🔍 提出前レビューは
// 「前回提出」しか無かった。どちらも「図ごとに変更前と変更後を並べる」画面で、違うのは
// 何と比べるかだけ。相手は 1 つの画面の中で選ばせる (principles)。ここは基準の種類・
// 選べるかどうか・その時点より前の最後の版の選び方・会議の日時の控え方を持つ。
// DOM・localStorage・fetch には触らない (呼び手が値を渡す)。node からも require できる。
(function() {
  // BLK-owner-20260924-1712-prune: 既定は「前回保存」(± 差分の [今の内容を基準にする] や保存で決まる時点)。
  // これまで「今日 0 時」と名乗りながら中身はこの時点と比べていて、見出しに別の「基準 日時」が並んでいた。
  // 名前と中身をそろえ、今日 0 時は保存フォルダの版の控えからその時点の中身を読む別の選択肢にする。
  var KINDS = [
    { key: 'saved', label: '前回保存' },
    { key: 'today', label: '今日 0 時' },
    { key: 'meeting', label: '前回の会議' },
    { key: 'delivery', label: '前回提出' },
  ];
  var LABEL = {};
  KINDS.forEach(function(k) { LABEL[k.key] = k.label; });

  // 会議の控えは直近のものだけあればよい (前回の会議 = 今日より前の最後の 1 回)。
  var MAX_MEETINGS = 30;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 秒までで比べる ("2026-09-24T13:31:04.829Z" と "2026-09-24T13:31:04" を同じ線に揃える)。
  function _sec(iso) { return _s(iso).replace(/\.\d+/, '').replace(/Z$/, ''); }

  function isKind(key) { return !!LABEL[_s(key)]; }
  function labelOf(key) { return LABEL[_s(key)] || LABEL.saved; }

  // 手元の時計の今日 0 時 (ISO)。now は Date (テストで差し替える)。
  function todayStart(now) {
    var n = now instanceof Date ? now : new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
  }

  // 会議セットで並べた日時を控えに足す。同じ日の 2 回目以降は、その日の最後の時刻に置き換える
  // (「前回の会議」は日の単位で読むため、同じ日の並べ直しで控えが膨らまないようにする)。
  function recordMeeting(log, iso) {
    var at = _s(iso);
    if (!at) return _list(log).slice();
    var day = at.slice(0, 10);
    var out = _list(log).filter(function(x) { return _s(x).slice(0, 10) !== day; });
    out.push(at);
    out.sort();
    if (out.length > MAX_MEETINGS) out = out.slice(out.length - MAX_MEETINGS);
    return out;
  }

  // 今日より前で最後に会議セットを並べた日時。無ければ ''。
  function lastMeetingBefore(log, todayIso) {
    var cut = _sec(todayIso);
    var best = '';
    _list(log).forEach(function(x) {
      var t = _s(x);
      if (!t || (cut && _sec(t) >= cut)) return;
      if (t > best) best = t;
    });
    return best;
  }

  // 「変更前 =」の選択肢。選べない基準は disabled と、その理由を label に出す。
  //   state.savedAt    … 前回保存 (± 差分の基準) の時点 ('' ならまだ基準が無い。選べるが日時は出ない)
  //   state.todayAt    … 今日 0 時
  //   state.folder     … 保存フォルダに書いているか (今日 0 時の中身は版の控えから読むので要る)
  //   state.meetingAt  … lastMeetingBefore の結果 ('' なら会議の控えが無い)
  //   state.deliveryAt … 前回提出の日時 ('' なら一度も納品していない)
  // 選べる選択肢は日時を名前の後ろに添える (「前回保存 (09/23 21:51)」)。見出しはこの 1 か所で
  // 時点を言い、ほかに「基準 …」を並べない (BLK-owner-20260924-1712-prune)。
  function options(state) {
    var st = state || {};
    return KINDS.map(function(k) {
      var o = { key: k.key, label: k.label, disabled: false, at: '' };
      if (k.key === 'meeting') {
        o.at = _s(st.meetingAt);
        if (!o.at) { o.disabled = true; o.label = k.label + '（まだ会議セットで並べていません）'; }
      } else if (k.key === 'delivery') {
        o.at = _s(st.deliveryAt);
        if (!o.at) { o.disabled = true; o.label = k.label + '（まだ納品していません）'; }
      } else if (k.key === 'today') {
        o.at = _s(st.todayAt);
        if (!st.folder) { o.disabled = true; o.label = k.label + '（保存フォルダに書いているときに選べます）'; }
      } else {
        o.at = _s(st.savedAt);
      }
      if (!o.disabled && k.key !== 'today') {
        var sp = stamp(o.at);
        if (sp) o.label = k.label + ' (' + sp + ')';
      }
      return o;
    });
  }

  // その時点の中身を、保存フォルダの版の控えから選ぶ。
  // 版の控え (_versions) は「上書きされた時刻 at に退避された、それまでの中身」なので、
  // 時点 C の中身は「C より後に退避された版のうち最も早いもの」。C より後に 1 度も上書き
  // されていなければ今のファイルがそのまま C の中身 (ただし今のファイルが C より後に
  // 作られていたら、C の時点ではまだ無かった図 = null / 新規)。
  //   versions … [{ at, dsl }] (順不同。at は ISO)
  //   current  … { dsl, mtime } 今のファイル (無ければ null)
  // 返り値 { at, dsl } (at は選んだ版の退避時刻、今のファイルなら mtime) または null。
  function contentAt(versions, cutoffIso, current) {
    var cut = _sec(cutoffIso);
    var pick = null;
    _list(versions).forEach(function(v) {
      if (!v || v.dsl == null) return;
      var t = _sec(v.at);
      if (!t || (cut && t <= cut)) return;
      if (!pick || t < _sec(pick.at)) pick = v;
    });
    if (pick) return { at: _s(pick.at), dsl: _s(pick.dsl) };
    if (current && current.dsl != null) {
      var mt = _sec(current.mtime);
      if (mt && cut && mt > cut) return null;
      return { at: _s(current.mtime), dsl: _s(current.dsl) };
    }
    return null;
  }

  // 刻印 (server の _versions の名前、UTC の YYYYMMDD-HHMMSS[.n]) → ISO。読めなければ ''。
  function stampToIso(stamp) {
    var m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(_s(stamp));
    if (!m) return '';
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + 'Z';
  }

  // 刻印の一覧 (新しい順でも古い順でも) から、時点 C の中身を持つ版の刻印を選ぶ。
  // 本文を全部運ばずに、読む版を 1 つに絞るためのもの。'' なら版の中には無い
  // (今のファイルが C の中身か、C の時点ではまだ無かった図)。
  function stampAt(stamps, cutoffIso) {
    var rows = _list(stamps).map(function(st) { return { at: stampToIso(st), dsl: '', stamp: _s(st) }; })
      .filter(function(r) { return !!r.at; });
    var cut = _sec(cutoffIso);
    var pick = null;
    rows.forEach(function(r) {
      var t = _sec(r.at);
      if (cut && t <= cut) return;
      if (!pick || t < _sec(pick.at)) pick = r;
    });
    return pick ? pick.stamp : '';
  }

  // 「MM/DD HH:MM」。見出しと各図の「変更前 (MM/DD HH:MM)」に使う。
  function stamp(iso) {
    var d = new Date(_s(iso));
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 見出しの 1 句。「変更前 = 前回の会議 (09/23 15:00)」。今日 0 時は名前が時点なので日時を添えない。
  function headLabel(key, at) {
    var s = _s(key) === 'today' ? '' : stamp(at);
    return '変更前 = ' + labelOf(key) + (s ? ' (' + s + ')' : '');
  }

  // 各図の列見出し「変更前 (前回保存 09/23 21:51)」。見出しの選択と同じ語で言う。
  //   status … その図の状態 ('new' = その時点ではまだ無かった図)
  function columnLabel(key, at, status) {
    var k = isKind(key) ? _s(key) : 'saved';
    var s = k === 'today' ? '' : stamp(at);
    if (status === 'new') {
      return '変更前 (' + labelOf(k) + (k === 'saved' ? 'なし' : (s ? ' ' + s : '') + ' には無い図') + ')';
    }
    return '変更前 (' + labelOf(k) + (s ? ' ' + s : '') + ')';
  }

  var api = {
    KINDS: KINDS, isKind: isKind, labelOf: labelOf, todayStart: todayStart,
    recordMeeting: recordMeeting, lastMeetingBefore: lastMeetingBefore,
    options: options, contentAt: contentAt, stampToIso: stampToIso, stampAt: stampAt, stamp: stamp, headLabel: headLabel,
    columnLabel: columnLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.changeBaseline = api;
  }
})();
