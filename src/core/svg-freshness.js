'use strict';
window.MA = window.MA || {};

// svg-freshness — 保存フォルダの {name}.svg が {name}.puml に追いついているか。
//
// BLK-reviewer-20260908-0103: 図を読む前に「この SVG は今の puml から作られたものか」を
// 確かめるのに、`ls -l` で puml と svg のタイムスタンプを 1 枚ずつ突き合わせていた。
// 22 枚ぶん目で比べる作業なので、1 枚見落とすと「古いレイアウトを今の図として読む」
// ことに気付けない。判定はここに置き、一覧が答えを出せるようにする。
//
// 判定は 3 つだけ。
//   fresh   — svg が puml と同じかそれより新しい
//   stale   — svg の方が古い (作り直しが要る)
//   missing — svg が無い
// 時刻が取れない図は unknown。分からないことを fresh と言わない
// (「確かめた」と「確かめられなかった」を混ぜると、この道具の意味が無くなる)。
window.MA.svgFreshness = (function() {

  function _time(v) {
    if (typeof v !== 'string' || v === '') return null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  function statusOf(entry) {
    if (!entry) return 'unknown';
    var svg = _time(entry.svgMtime);
    if (svg === null) return 'missing';
    var puml = _time(entry.mtime);
    if (puml === null) return 'unknown';
    // 同時刻は追いついているものとして扱う (保存と描き出しが 1 秒に収まる)。
    return svg >= puml ? 'fresh' : 'stale';
  }

  // ── 内容での判定 (BLK-reviewer-20260908-1103) ─────────────────────────────
  // mtime の比較は「puml が svg より後に触られたか」しか見ていない。保存し直しただけで
  // 中身は追いついている図と、前々回の編集から追いついていない図が、同じ「古い」に見える。
  // 実際、mtime が古いと出た 16 枚のうち中身まで食い違っていたのは 7 枚だけで、
  // 残り 9 枚を確かめるのに 1 枚ずつ再描画して diff を取る手作業が要った。
  // server は svg を書き出すとき、その元になった puml の sha1 を svg の末尾に刻む
  // (entry.svgSource)。ここはその印と今の puml の sha1 (entry.hash) を突き合わせる。
  //   match      — この svg は今の puml から作られている (mtime が古くても中身は一致)
  //   differ     — 別の内容の puml から作られている (作り直しが要る。確実)
  //   missing    — svg が無い
  //   unverified — 印が無い。印を刻む前に書き出した svg なので内容では言えない
  //
  // BLK-reviewer-20260908-1103-wish: 印は「書き出した側の申告」なので、印を刻む前に
  // 置かれた svg (実データの 22 枚がそれ) については何も言えず、作り直して上書きしない限り
  // 未確認のままだった。作り直すと「今そう見える」だけで「保存されていた絵が正しかったか」は
  // 分からなくなる。そこで、上書きせずに 1 回描き直してバイト比較した結果 (records) も
  // 根拠として受け取る。records は {name: {pumlHash, svgHash, result}} で、
  // 突き合わせた 2 つの指紋が今のものと一致している間だけ有効。
  // BLK-reviewer-20260908-1103 (2103 差し戻し): 印は「どの puml バイト列から書き出したか」
  // しか言わないので、puml をヘッダの書式だけ書き換えて保存し直した図も印は食い違い、
  // 描かれる中身は同じなのに「内容ずれ」と名指しされる。reviewer は同じ 6 枚を毎回
  // /render + labels 突合で切り分け直していた。描き直して比べた控え (records) の方が
  // 「読めるか」を直に見た強い根拠なので、控えが今の指紋に対して有効な間は控えを先に採り、
  // 控えが無いときだけ印に落とす。
  function _validRecord(entry, records) {
    var r = records && records[entry.name];
    if (!r || typeof r !== 'object') return null;
    if (r.pumlHash !== entry.hash || r.svgHash !== entry.svgHash) return null;
    return _fromResult(r.result) === 'unverified' ? null : r;
  }

  function contentOf(entry, records) {
    if (!entry) return 'unverified';
    if (_time(entry.svgMtime) === null) return 'missing';
    var hash = entry.hash;
    if (typeof hash !== 'string' || hash === '') return 'unverified';
    var r = _validRecord(entry, records);
    if (r) return _fromResult(r.result);
    var stamp = entry.svgSource;
    if (typeof stamp === 'string' && stamp !== '') return stamp === hash ? 'match' : 'differ';
    return 'unverified';
  }

  // BLK-reviewer-20260908-0103 (1903 追記): server の突合結果は 3 通りになった。
  //   match          — バイトまで一致
  //   differ-format  — 描かれる中身は一致。体裁 (ヘッダ属性・XML 宣言) だけが違う
  //   differ-content — 描かれるものが違う
  // 体裁だけの差を「ずれ」と呼ぶと、作り直す必要の無い図が毎回名指しされ、
  // reviewer は labels/shape を自分で見比べて「実は一致」と判定し直すことになる
  // (実データ 7 枚がそれだった)。ここでは 'format' という別の答えにする。
  // 古い形 ('differ' だけを返す server) もそのまま読めるようにしておく。
  function _fromResult(result) {
    if (result === 'match') return 'match';
    if (result === 'differ-format') return 'format';
    if (result === 'differ-content' || result === 'differ') return 'differ';
    return 'unverified';
  }

  // 作り直さなくても「今の puml の図として読める」状態か。
  // 一致と体裁差はどちらも読める (作り直しの対象にしない)。
  function isSettled(content) { return content === 'match' || content === 'format'; }

  // BLK-reviewer-20260908-0103 (1403 追記): 同じ「一致 / ずれ」でも、根拠は 2 通りある。
  //   stamp    — svg 末尾の印 (@pua-source-sha1) と今の puml の sha1 の突合
  //   rerender — 上書きせずに 1 回描き直してバイト比較した結果
  // どちらで出た答えかが画面に出ていないため、reviewer は「印の突合である」ことを
  // server.py の SVG_STAMP_PREFIX を読んで初めて知った。印は保存した svg にしか付かず
  // /render の応答には付かないので、生の再描画結果とバイト比較すると必ず食い違う
  // (実データ 17 枚が全て不一致に見えた原因がこれ)。根拠を行にも要約にも書く。
  function contentBasisOf(entry, records) {
    if (!entry) return '';
    if (_time(entry.svgMtime) === null) return '';
    var hash = entry.hash;
    if (typeof hash !== 'string' || hash === '') return '';
    // contentOf と同じ順序で見る (答えと根拠が食い違わないように)。
    if (_validRecord(entry, records)) return 'rerender';
    var stamp = entry.svgSource;
    if (typeof stamp === 'string' && stamp !== '') {
      // BLK-reviewer-20260914-0906: 印が無い svg でも、PlantUML が svg に畳んだ
      // 元の DSL から持ち主が分かる。印の突合と混ぜて出すと「印があった」と
      // 読めてしまうので、根拠は別の名前で言う。
      return entry.svgSourceFrom === 'embedded' ? 'embedded' : 'stamp';
    }
    return '';
  }

  var BASIS_TEXT = {
    stamp: '印 (@pua-source-sha1) の突合',
    embedded: 'SVG に畳まれた元の DSL の突合',
    rerender: '描き直してのバイト比較',
  };

  function basisText(basis) { return BASIS_TEXT[basis] || ''; }

  var CONTENT_BADGES = {
    match: { mark: '内容一致', title: 'この SVG は今の puml から作られています (中身で確かめました)' },
    format: { mark: '体裁差のみ', title: '描かれる中身 (文字・図形の数) は今の puml と一致します。'
      + '違うのは書き出し経路による体裁 (ヘッダ属性・XML 宣言の書式) だけなので、作り直さなくても読めます' },
    differ: { mark: '内容ずれ', title: 'この SVG は別の内容の puml から作られています。作り直しが要ります' },
    missing: { mark: 'SVG 無', title: 'この図の SVG が保存フォルダにありません' },
    // BLK-reviewer-20260908-2003-wish: 「内容未確認」では、確かめ損ねたのか、そもそも
    // 印が無くて確かめようが無いのかが読めない。実データでこの状態になるのは
    // 「印を刻む前に保存された svg」だけなので、その事実をそのまま印にする。
    unverified: { mark: '未刻印', title: '印を刻む前に保存された SVG です。元の puml の印が無いので、'
      + '中身が一致するかはこの一覧だけでは言えません。「SVG の中身を確かめる」で白黒が付きます' },
  };

  // 印だけで出た「ずれ」は、体裁だけの差でもそう出る。作り直しを言い切らない。
  var STAMP_DIFFER_TITLE = 'この SVG は印 (@pua-source-sha1) が今の puml と違います。'
    + 'ただし体裁だけを書き換えて保存し直した図も印は違うので、'
    + '作り直しが要るかは「SVG の中身を確かめる」で確定します';

  // 畳まれた DSL は「その svg を描いたときの本文そのもの」なので、印と違って
  // 体裁だけの差では食い違わない。ずれと出たら作り直しが要ると言い切ってよい。
  var EMBEDDED_DIFFER_TITLE = 'この SVG に畳まれている元の DSL が、今の puml と違います。'
    + '描かれているのは別の内容なので、作り直しが要ります';

  function contentBadge(content, basis) {
    var b = CONTENT_BADGES[content] || CONTENT_BADGES.unverified;
    if (content === 'differ' && basis === 'stamp') b = { mark: b.mark, title: STAMP_DIFFER_TITLE };
    if (content === 'differ' && basis === 'embedded') b = { mark: b.mark, title: EMBEDDED_DIFFER_TITLE };
    var t = basisText(basis);
    if (!t) return b;
    // 何を見て出した答えかを印そのものに持たせる。実装を読まずに分かるようにする。
    return { mark: b.mark, title: b.title + ' — 根拠: ' + t };
  }

  var BADGES = {
    fresh: { mark: '', title: 'SVG は今の puml から作られています' },
    stale: { mark: 'SVG 古', title: 'SVG が puml より古い。作り直すまでは前のレイアウトです' },
    missing: { mark: 'SVG 無', title: 'この図の SVG が保存フォルダにありません' },
    unknown: { mark: 'SVG ?', title: '時刻が取れず、SVG が今の内容かどうか分かりません' },
  };

  function badge(status) {
    return BADGES[status] || BADGES.unknown;
  }

  // BLK-reviewer-20260915-0406-wish: mtime では古いが、中身は今の puml と一致した図。
  // ここまでは行から印が全部消えていたので、「確かめた結果 追いついていた」のか
  // 「そもそも古くなかった」のかが画面から読めず、reviewer は指摘.md を書く前に
  // 9 枚ぶん render API で描き直してバイト比較する裏取りを毎回やり直していた。
  // 「古い」と「作り直しが要る」を分けた第三の印として、行に出す。
  var STALE_SETTLED = {
    mark: 'SVG 古(内容一致)',
    title: '書き出しの時刻は puml より古いままですが、中身は今の puml と一致しています。'
      + '保存し直しただけで絵は変わっていないので、作り直しは要りません',
  };

  // その図が第三の状態か。mtime は古く、内容では追いついている。
  function isStaleSettled(status, content) {
    return status === 'stale' && isSettled(content);
  }

  // 何を見て「内容は一致」と言ったかを印に添える (contentBadge と同じ作法)。
  function staleSettledBadge(basis) {
    var t = basisText(basis);
    if (!t) return STALE_SETTLED;
    return { mark: STALE_SETTLED.mark, title: STALE_SETTLED.title + ' — 根拠: ' + t };
  }

  // 一覧ぶんの判定。作り直しが要るものを needsRender にまとめる。
  function scan(entries, records) {
    var rows = (Array.isArray(entries) ? entries : []).map(function(e) {
      return {
        name: e && e.name, status: statusOf(e), content: contentOf(e, records),
        basis: contentBasisOf(e, records),
        mtime: e && e.mtime, svgMtime: e && e.svgMtime,
      };
    }).filter(function(r) { return typeof r.name === 'string' && r.name !== ''; });
    var counts = { fresh: 0, stale: 0, missing: 0, unknown: 0 };
    var contentCounts = { match: 0, format: 0, differ: 0, missing: 0, unverified: 0 };
    var basisCounts = { stamp: 0, embedded: 0, rerender: 0 };
    rows.forEach(function(r) {
      counts[r.status]++;
      contentCounts[r.content]++;
      if (r.basis) basisCounts[r.basis]++;
    });
    return {
      rows: rows,
      counts: counts,
      contentCounts: contentCounts,
      basisCounts: basisCounts,
      // unknown は作り直しても「分からない」が消える保証が無いが、作り直せば
      // 必ず今の内容になるので対象に入れる。
      // 内容で一致が取れている図は、mtime が古くても作り直す必要が無いので外す
      // (BLK-reviewer-20260908-1103: ここで 16 枚が 7 枚に減る)。
      needsRender: rows.filter(function(r) { return r.status !== 'fresh' && !isSettled(r.content); })
        .map(function(r) { return r.name; }),
      // 内容で言い切るために作り直しが要る図。印の無い図も入る。
      needsProof: rows.filter(function(r) { return !isSettled(r.content); })
        .map(function(r) { return r.name; }),
      // 上書きせずに確かめられる図 (svg があって、まだ内容で言い切れていないもの)。
      // 作り直しと違い、保存されていた絵をそのまま残したまま白黒が付く。
      // BLK-reviewer-20260908-1103 (2103 差し戻し): 印だけで「ずれ」と出た図もここに入れる。
      // 印は体裁だけの差でも食い違うので、確かめるまでは作り直しが要るかが決まらない。
      // 対象から外していた間、reviewer はその図を GUI からは確かめられず、
      // 毎回 /render + labels 突合を手でやり直していた。
      needsVerify: rows.filter(function(r) {
        return r.content === 'unverified' || (r.content === 'differ' && r.basis === 'stamp');
      }).map(function(r) { return r.name; }),
      // BLK-reviewer-20260908-1203: 内容ずれと分かっている図。印 (svgSource) だけで
      // ずれが分かった図は、確かめ直していないので「何が食い違うか」の材料が手元に無い。
      // 中身を言うために server にもう一度突き合わせてもらう対象。
      needsDiff: rows.filter(function(r) { return r.content === 'differ'; })
        .map(function(r) { return r.name; }),
    };
  }

  function statusMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.status; });
    return out;
  }

  // BLK-primary-20260908-1303: 集計行が mtime だけを見て「SVG: 古い 2 枚」と言う一方、
  // 同じ画面の「古い SVG を作り直す」は内容一致まで見て「古い SVG はありません」と
  // 押せなかった。基準が 2 つあると、見出しからは「本当に古いのか」が分からず、
  // 「内容はすべて確かめてあります」まで開いて確かめる 1 手間が毎回要る。
  // 数える基準を needsRender と同じ (mtime が古く、かつ内容が一致していないもの) に
  // 揃え、内容一致で落ちた分は括弧で名指しして「なぜ数が減ったか」を消さない。
  function summary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var rows = scanned.rows;
    var need = { stale: 0, missing: 0, unknown: 0 };
    var settled = 0;   // mtime では古いが、中身は今の puml と一致した図
    rows.forEach(function(r) {
      if (r.status === 'fresh') return;
      if (isSettled(r.content)) { settled++; return; }
      need[r.status]++;
    });
    var note = settled ? '（中身が一致した ' + settled + ' 枚は作り直し不要）' : '';
    if (need.stale === 0 && need.missing === 0 && need.unknown === 0) {
      return 'SVG は ' + rows.length + ' 枚とも puml に追いついています' + note;
    }
    var parts = [];
    if (need.stale) parts.push('古い ' + need.stale + ' 枚');
    if (need.missing) parts.push('無い ' + need.missing + ' 枚');
    if (need.unknown) parts.push('不明 ' + need.unknown + ' 枚');
    return 'SVG: ' + parts.join(' / ') + note;
  }

  // BLK-reviewer-20260908-0823-wish: 「無い N 枚」だけでは、どの図を書き出し忘れたかを
  // 一覧の行から目で探すことになる (17 枚の突合で 1 枚見つけた、が偶然だった原因)。
  // 直し方ごとに名前を束ねて返し、一覧がそのまま名前を出せるようにする。
  // fresh と unknown は入れない — 前者は直す必要が無く、後者は名前を出しても
  // 「何をすればよいか」が決まらないため (要約の件数としては残る)。
  var SHORTFALL = [
    { status: 'missing', label: 'SVG が無い', title: 'この図の SVG が保存フォルダにありません。書き出すと消えます' },
    { status: 'stale', label: 'SVG が古い', title: 'SVG が puml より古い。作り直すまでは前のレイアウトです' },
  ];

  function shortfall(scanned) {
    var rows = (scanned && scanned.rows) || [];
    var out = [];
    // mtime では見つからない食い違い。svg の方が新しいのに、別の内容の puml から
    // 作られている図 — 時刻だけを見ていた頃は「追いついている」と読み違えていた。
    var differ = rows.filter(function(r) { return r.content === 'differ' && r.status === 'fresh'; })
      .map(function(r) { return r.name; });
    if (differ.length) {
      out.push({
        status: 'differ', label: 'SVG の内容が古い',
        title: 'この SVG は別の内容の puml から作られています。作り直すまでは前のレイアウトです',
        names: differ,
      });
    }
    // 内容で一致が取れた図は、mtime が古くても読める図なので名前を出さない
    // (出すと「直すもの」の一覧に、直す必要の無い図が毎回混ざる)。
    SHORTFALL.forEach(function(g) {
      var names = rows.filter(function(r) { return r.status === g.status && !isSettled(r.content); })
        .map(function(r) { return r.name; });
      if (names.length) out.push({ status: g.status, label: g.label, title: g.title, names: names });
    });
    return out;
  }

  // BLK-reviewer-20260908-2003-wish: 印の無い図は、要約の「未確認 N 枚」に件数としてしか
  // 出ておらず、どの 1 枚かは 22 行を目で探すか audit.js を回して突き止めるしかなかった
  // (実データでは 22 枚中 1 枚。5 枚は印だけで即座に片が付くのに、その 1 枚を名指しする
  // 表示が無いために毎回全図を確かめ直していた)。名前をここで束ねて返す。
  // 作り直し (shortfall) の行と混ぜない — 印が無い図に必要なのは作り直しではなく、
  // 上書きせずに描き直して比べること (保存されていた絵をそのまま残せる)。
  var UNSTAMPED_TITLE = '印を刻む前に保存された SVG。中身が一致するかはこの一覧では言えないので、'
    + '上書きせずに 1 回描き直して比べる';

  function unstamped(scanned) {
    var names = ((scanned && scanned.rows) || [])
      .filter(function(r) { return r.content === 'unverified'; })
      .map(function(r) { return r.name; });
    if (!names.length) return null;
    return { status: 'unverified', label: '未刻印（印を刻む前の SVG）', title: UNSTAMPED_TITLE, names: names };
  }

  // その行だけを確かめるボタンの文言。作り直しの「この N 枚だけ作り直す」と
  // 見分けが付くように、何をするか (確かめる) を言葉に出す。
  function unstampedVerifyLabel(group) {
    var n = (group && Array.isArray(group.names) && group.names.length) || 0;
    return n === 0 ? '' : 'この ' + n + ' 枚だけ中身を確かめる';
  }

  // 図ごとの SVG 書き出し時刻。行に puml の保存時刻と並べて出すためのもの。
  function svgMtimeMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.svgMtime || ''; });
    return out;
  }

  // 内容での 1 行。mtime の要約 (summary) とは別に出す — 見ているものが違う。
  function contentSummary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var c = scanned.contentCounts || { match: 0, format: 0, differ: 0, missing: 0, unverified: 0 };
    var fmt = c.format || 0;
    if (c.differ === 0 && c.missing === 0 && c.unverified === 0) {
      return '内容: ' + (c.match + fmt) + ' 枚とも今の puml から作られています'
        + (fmt ? '（うち ' + fmt + ' 枚は体裁だけが違う）' : '');
    }
    var parts = [];
    if (c.match) parts.push('一致 ' + c.match + ' 枚');
    if (fmt) parts.push('体裁差のみ ' + fmt + ' 枚');
    if (c.differ) parts.push('ずれ ' + c.differ + ' 枚');
    if (c.missing) parts.push('SVG 無 ' + c.missing + ' 枚');
    if (c.unverified) parts.push('未確認 ' + c.unverified + ' 枚');
    return '内容: ' + parts.join(' / ');
  }

  // BLK-reviewer-20260908-0103 (1403 追記): 「内容: 一致 17 枚」が何を見た答えかを
  // 画面で言う。ここが無いと、同じ判定を自分でやろうとした人が /render の応答と
  // 保存中の svg をバイト比較し、印のぶんだけ必ず食い違って全件ずれに見える。
  var STAMP_NOTE = '保存した SVG の末尾にだけ印が付くので、/render の応答と'
    + 'そのままバイト比較すると必ず食い違います';

  function basisNote(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var b = scanned.basisCounts || { stamp: 0, embedded: 0, rerender: 0 };
    var parts = [];
    if (b.stamp) parts.push('印 (@pua-source-sha1) の突合 ' + b.stamp + ' 枚');
    // BLK-reviewer-20260914-0906: 印の無い svg は、PlantUML が畳んだ元の DSL で判定する。
    if (b.embedded) parts.push('SVG に畳まれた元の DSL の突合 ' + b.embedded + ' 枚');
    if (b.rerender) parts.push('描き直してのバイト比較 ' + b.rerender + ' 枚');
    if (!parts.length) return '判定の根拠: まだ 1 枚も内容で判定していません (印が無く、確かめてもいない)';
    return '判定の根拠: ' + parts.join(' / ') + '。' + (b.stamp ? STAMP_NOTE : '保存中の SVG は上書きしていません');
  }

  // 内容で言い切れるようにするボタンの文言。
  // 押す前に何枚を描き直して比べるかが分かるようにする (1 枚あたり数百 ms かかる)。
  function verifyLabel(scanned) {
    var n = (scanned && scanned.needsVerify && scanned.needsVerify.length) || 0;
    return n === 0 ? '中身を確かめる SVG はありません' : 'SVG の中身を確かめる（' + n + ' 枚）';
  }

  // 食い違いの中身を調べるボタンの文言 (BLK-reviewer-20260908-1203)。
  // 対象は「ずれ」と分かっている図のうち、まだ中身を出していないもの。
  function diffLabel(pending) {
    var n = (pending && pending.length) || 0;
    return n === 0 ? '食い違いの中身は調べてあります' : '食い違いの中身を調べる（' + n + ' 枚）';
  }

  function proofLabel(scanned) {
    var n = (scanned && scanned.needsProof && scanned.needsProof.length) || 0;
    return n === 0 ? '内容はすべて確かめてあります' : '内容を確かめる（' + n + ' 枚を作り直す）';
  }

  // BLK-primary-20260908-1203: 「古い SVG を作り直す」は古い・無い・内容ずれを
  // まとめて作り直すので、reviewer に名指しされた 5 枚だけを狙えず、1 枚ずつ開いて
  // ⟳Render → Export▾ → SVG を 5 回繰り返すことになっていた。
  // 名前の行 (SVG が無い / SVG が古い / SVG の内容が古い) ごとに、その行の図だけを
  // 作り直せる文言を返す。行に並んでいる名前がそのまま作り直す対象になる。
  function groupRenderLabel(group) {
    var n = (group && Array.isArray(group.names) && group.names.length) || 0;
    return n === 0 ? '' : 'この ' + n + ' 枚だけ作り直す';
  }

  // その行の作り直しが何をするかの説明。行によって「無い図を書き出す」「古い図を
  // 描き直す」と中身が違うので、行の label をそのまま織り込む。
  function groupRenderTitle(group) {
    var label = (group && group.label) || '';
    var n = (group && Array.isArray(group.names) && group.names.length) || 0;
    return '「' + label + '」に並んでいる ' + n + ' 枚だけを puml から作り直す。'
      + 'ほかの図と puml には触らない';
  }

  // 作り直しボタンの文言。0 枚なら押させない。
  function renderLabel(scanned) {
    var n = (scanned && scanned.needsRender.length) || 0;
    return n === 0 ? '古い SVG はありません' : '古い SVG を作り直す（' + n + ' 枚）';
  }

  function contentMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.content; });
    return out;
  }

  function basisMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = r.basis; });
    return out;
  }

  return {
    statusOf: statusOf,
    contentOf: contentOf,
    basisMap: basisMap,
    contentBasisOf: contentBasisOf,
    isSettled: isSettled,
    basisText: basisText,
    basisNote: basisNote,
    STAMP_NOTE: STAMP_NOTE,
    badge: badge,
    contentBadge: contentBadge,
    isStaleSettled: isStaleSettled,
    staleSettledBadge: staleSettledBadge,
    scan: scan,
    statusMap: statusMap,
    contentMap: contentMap,
    summary: summary,
    contentSummary: contentSummary,
    shortfall: shortfall,
    unstamped: unstamped,
    unstampedVerifyLabel: unstampedVerifyLabel,
    svgMtimeMap: svgMtimeMap,
    renderLabel: renderLabel,
    groupRenderLabel: groupRenderLabel,
    groupRenderTitle: groupRenderTitle,
    proofLabel: proofLabel,
    diffLabel: diffLabel,
    verifyLabel: verifyLabel,
  };
})();
