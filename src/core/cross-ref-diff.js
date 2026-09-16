'use strict';
window.MA = window.MA || {};

// cross-ref-diff — 別のフォルダ (他ペルソナの保存先) にある同種の図を相手に選び、
// 「相手にしかない要素 / 自分にしかない要素」を出す。
//
// BLK-junior-20260908-0723-wish: 先輩版と自分版の同種図を見比べる場面で、GUI は
// 「開いているタブどうし」しか並べられなかった。先輩の図を読むには自分の保存先設定を
// 一時的に先輩のフォルダへ替え、開いて内容を憶え、設定を自分へ戻してから記憶を頼りに
// 打ち直す、という往復になっていた。さらに ⚖ 整合チェックが見るのは並び・語尾・打ち間違いで、
// 「先輩が後から足した要素」= 片方にしか無い要素は、そもそも突き合わせの対象外だった。
//
// ここが受け持つのは判断だけ:
//   counterparts — 相手フォルダのファイル名のうち、今の図に対応するのはどれか
//   diff         — 2 つの DSL を要素単位で突き合わせ、片方にしか無いものを挙げる
//   renameMap    — 部品名が違う 2 枚 (GPIO 版と UART 版) を同じ土俵に載せる置換
//   insertPlan   — 足りない 1 行を自分の DSL のどこへ入れるか
// DOM も localStorage も fetch も触らない (画面と読み込みは app.js の職掌)。
window.MA.crossRefDiff = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // ── 相手のファイル選び ───────────────────────────────────────────────
  // 拡張子と、末尾の括弧書き (「(先輩反映)」「(レビュー反映)」など、同じ図の
  // 言い直しに付く印) を落とした形。名前合わせはこの形どうしで見る。
  function baseName(name) {
    return _s(name)
      .replace(/\.(puml|pu|plantuml|txt)$/i, '')
      .replace(/[（(][^）)]*[）)]\s*$/, '')
      .trim();
  }

  function _tokens(name) {
    return baseName(name).toLowerCase()
      .split(/[_\-\s.]+/)
      .filter(function(t) { return t !== ''; });
  }

  // 2 つの名前の近さ。0 が最も近い。一致する所が無ければ null。
  //   0    … 同じ (括弧書きと拡張子を除いて一致)
  //   1..2 … 語がどれだけ重なるか (重なりが多いほど小さい)
  // 名前が日本語で語に割れないときは、文字の重なりで見る (「GPIOドライバ初期化
  // シーケンス」と「GPIOドライバ初期化シーケンス(先輩反映)」のような組を拾う)。
  function nameDistance(a, b) {
    var x = baseName(a).toLowerCase(), y = baseName(b).toLowerCase();
    if (x === '' || y === '') return null;
    if (x === y) return 0;
    var ta = _tokens(a), tb = _tokens(b);
    if (ta.length > 1 || tb.length > 1) {
      var shared = ta.filter(function(t) { return tb.indexOf(t) >= 0; }).length;
      if (shared > 0) {
        var ratio = shared / Math.max(ta.length, tb.length);
        return 1 + (1 - ratio);
      }
    }
    // 文字単位の重なり (片方がもう片方を含む場合を含む)。
    // たまたま 1 文字かすっただけの名前を「近い」と言わないよう下限を置く。
    var ratio2 = _charOverlap(x, y);
    if (ratio2 < MIN_CHAR_OVERLAP) return null;
    return 1 + (1 - ratio2);
  }

  var MIN_CHAR_OVERLAP = 0.4;

  function _charOverlap(x, y) {
    var seen = {}, i;
    for (i = 0; i < y.length; i++) seen[y[i]] = (seen[y[i]] || 0) + 1;
    var hit = 0;
    for (i = 0; i < x.length; i++) {
      if (seen[x[i]] > 0) { seen[x[i]]--; hit++; }
    }
    return hit / Math.max(x.length, y.length);
  }

  // 相手フォルダの名前一覧を、今の図に近い順に並べる。近さが付かない名前も
  // 末尾に残す (対応が機械には見えなくても、人には分かることがある)。
  // BLK-junior-20260917-0423: 相手の一覧は {name, kind} でも文字列でもよい。
  // 図種が分かっている相手は、自分と違う図種なら「対応する図」ではない。
  // クラス図の相手にシーケンス図を当てると、全要素が「片方にしか無い」に
  // なって「先輩が全部書き換えた」と見分けが付かなくなる。
  function _cpName(e) { return (e && typeof e === 'object') ? _s(e.name) : _s(e); }
  function _cpKind(e) {
    if (!e || typeof e !== 'object') return '';
    return _s(e.savedKind) || _s(e.kind);
  }

  function counterparts(names, selfName, selfKind) {
    var want = _s(selfKind);
    var out = [];
    (names || []).forEach(function(n, i) {
      var name = _cpName(n);
      if (name === '') return;
      var kind = _cpKind(n);
      // 図種が両方分かっていて食い違うときだけ外す。分からない相手は今までどおり。
      var mismatch = want !== '' && kind !== '' && kind !== want;
      var d = mismatch ? null : nameDistance(name, selfName);
      out.push({ name: name, kind: kind, distance: d, kindMismatch: mismatch, order: i });
    });
    out.sort(function(a, b) {
      var ad = a.distance == null ? Infinity : a.distance;
      var bd = b.distance == null ? Infinity : b.distance;
      if (ad !== bd) return ad - bd;
      // 近さが付かないものどうしは、同じ図種を先に出す (人が選ぶときの手掛かり)。
      if (a.kindMismatch !== b.kindMismatch) return a.kindMismatch ? 1 : -1;
      return a.order - b.order;
    });
    return out;
  }

  // 開いた瞬間に出す 1 件。近さの付いた候補があればその先頭。
  // 何も近くなければ null (勝手に無関係な図を並べない)。
  function pickCounterpart(names, selfName, selfKind) {
    var list = counterparts(names, selfName, selfKind);
    for (var i = 0; i < list.length; i++) {
      if (list[i].distance != null) return list[i].name;
    }
    return null;
  }

  // 相手のフォルダを読んだ結果を 1 つの答えにする (BLK-junior-20260917-0423)。
  // 「先輩の図を開いて見比べる」手順は、相手に対応する図が無いときも答えが要る。
  // 無いことが画面に出ないと、フォルダを人が目で走査して「無い」を確かめ直す
  // ことになり、手順そのものが止まる。
  //   picked   … 相手が決まった
  //   no-kind  … 相手にその図種が 1 枚も無い (比較元なし。増分なしとして進めてよい)
  //   no-match … その図種はあるが、名前が離れていて機械には対応が付かない
  //   empty    … 相手のフォルダに図が無い
  function _kindWord(slug) {
    var DK = window.MA && window.MA.diagramKind;
    var lab = (DK && DK.label) ? DK.label(slug) : '';
    return lab ? lab + '図' : 'この図種';
  }

  function counterpartVerdict(names, selfName, selfKind) {
    var list = counterparts(names, selfName, selfKind);
    var pick = pickCounterpart(names, selfName, selfKind);
    var sameKind = list.filter(function(c) { return !c.kindMismatch; }).length;
    var word = _kindWord(selfKind);
    if (list.length === 0) {
      return { state: 'empty', name: null, total: 0, sameKind: 0,
        message: '相手のフォルダに図がありません' };
    }
    if (pick) {
      return { state: 'picked', name: pick, total: list.length, sameKind: sameKind, message: '' };
    }
    if (_s(selfKind) !== '' && sameKind === 0) {
      return {
        state: 'no-kind', name: null, total: list.length, sameKind: 0,
        message: '相手のフォルダに' + word + 'がありません (' + list.length + ' 枚中 0 枚)。'
          + '比較元が無いので、先輩側の増分は無しとして先へ進めます',
      };
    }
    return {
      state: 'no-match', name: null, total: list.length, sameKind: sameKind,
      message: word + 'は ' + sameKind + ' 枚ありますが、名前が離れていて対応が付きません。'
        + '下の一覧から相手を選んでください',
    };
  }

  // ── 部品名をそろえる ─────────────────────────────────────────────────
  // GPIO 版と UART 版のように部品名だけ違う 2 枚は、そのまま比べると全行が
  // 「片方にしか無い」になる。名前から拾える差し替え語を 1 組だけ返す。
  // 拾えなければ null (勝手な置換はしない)。
  function renameMap(selfName, refName) {
    var a = _tokens(selfName), b = _tokens(refName);
    var da = a.filter(function(t) { return b.indexOf(t) < 0; });
    var db = b.filter(function(t) { return a.indexOf(t) < 0; });
    if (da.length !== 1 || db.length !== 1) return null;
    if (da[0] === db[0]) return null;
    return { from: db[0], to: da[0] };   // 参照側の語を自分側の語に読み替える
  }

  // 大文字小文字の形をなるべく保った置換。Gpio → Uart / GPIO → UART。
  function applyRename(text, map) {
    if (!map || !map.from) return _s(text);
    var re = new RegExp(_escape(map.from), 'gi');
    return _s(text).replace(re, function(hit) { return _matchCase(hit, map.to); });
  }

  function _escape(s) { return _s(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function _matchCase(hit, to) {
    if (hit === hit.toUpperCase() && hit !== hit.toLowerCase()) return to.toUpperCase();
    if (hit[0] === hit[0].toUpperCase()) return to.charAt(0).toUpperCase() + to.slice(1);
    return to.toLowerCase();
  }

  // ── 要素の突き合わせ ─────────────────────────────────────────────────
  // 突き合わせに使う節。title・ブロックの開き閉じ・ライフラインの帯は
  // 「足された要素」として数えない (骨組みであって中身ではない)。
  var SKIP_KINDS = { title: true, block: true, lifeline: true };

  function _nodes(dsl) {
    if (!window.MA.outline || !window.MA.outline.build) return [];
    var built = window.MA.outline.build(_s(dsl));
    var list = (built && built.nodes) || built || [];
    return (Array.isArray(list) ? list : []).filter(function(n) {
      return n && !SKIP_KINDS[n.kind];
    });
  }

  // 種別・名前・文言をつなぐ区切り。outline の節は 1 行から作るので改行は入らない。
  var KEY_SEP = '\n';
  // 入れ子の道筋の区切り (outline が付ける parent と同じ形)。
  var PARENT_SEP = ' / ';

  // 同じ要素と見なす鍵。種別 + 入れ子の道筋 + 名前 + 文言。
  // 空白の詰め方と大文字小文字は無視する。
  // BLK-junior-20260917-0323-wish: 親の中の `Idle` とトップレベルの `Idle` は
  // 別の状態なので、道筋を鍵に入れないと「親の中に増えた子」が共通に落ちる。
  function keyOf(node) {
    return [_s(node && node.kind), _norm(node && node.parent),
            _norm(node && node.label), _norm(node && node.detail)].join(KEY_SEP);
  }

  function _norm(v) { return _s(v).replace(/\s+/g, ' ').trim().toLowerCase(); }

  // outline の node.line は 0 始まりの行番号。画面とエディタは 1 始まりなので
  // ここで 1 始まりに直して渡す。
  function _entry(node, dslLines, map) {
    var raw = dslLines[node.line];
    return {
      kind: node.kind,
      label: _s(node.label),
      detail: _s(node.detail),
      parent: applyRename(_s(node.parent), map),
      line: (node.line || 0) + 1,
      text: applyRename(_s(raw).trim(), map),
    };
  }

  // 2 つの DSL を突き合わせる。map があれば参照側の部品名を自分側に読み替えてから見る。
  // 返すのは:
  //   onlyRef  … 相手にあって自分に無い (= 先輩が後から足した要素)
  //   onlySelf … 自分にあって相手に無い
  //   common   … 両方にある数
  function diff(selfDsl, refDsl, map) {
    var selfLines = _s(selfDsl).split('\n');
    var refLines = _s(refDsl).split('\n');
    var selfNodes = _nodes(selfDsl);
    // 参照側は読み替えてから節に割る (読み替え後の名前で突き合わせるため)。
    var refNodes = _nodes(map ? applyRename(refDsl, map) : refDsl);
    var refRaw = map ? applyRename(refDsl, map).split('\n') : refLines;

    var selfKeys = {};
    selfNodes.forEach(function(n) { selfKeys[keyOf(n)] = true; });
    var refKeys = {};
    refNodes.forEach(function(n) { refKeys[keyOf(n)] = true; });

    var onlyRef = [], onlySelf = [], common = 0;
    refNodes.forEach(function(n) {
      if (selfKeys[keyOf(n)]) { common++; return; }
      onlyRef.push(_entry(n, refRaw, null));
    });
    selfNodes.forEach(function(n) {
      if (!refKeys[keyOf(n)]) onlySelf.push(_entry(n, selfLines, null));
    });
    return { onlyRef: onlyRef, onlySelf: onlySelf, common: common, renamed: map || null };
  }

  // ── 突き合わせが成り立っているか ─────────────────────────────────────
  // BLK-junior-20260908-0823: 名前が 1 つも一致しない 2 枚 (電気的な出力状態で
  // 描いた図と、Uninit/Busy/Error の抽象度で描いた図) を突き合わせると、
  // 全要素が「相手にしかない」に落ちる。これを「先輩が後から足した差分」として
  // 出すと、利用者は取り込む 1 個を選べないまま数字だけ信じることになる。
  // 共通が 0 件なら差分ではなく「土俵が違う」と言い切る。
  //   aligned  … 共通が多数。片方にしか無い要素は足された / 消された要素と読める
  //   partial  … 共通はあるが少ない。名前の付け方が揃っていない疑いがある
  //   disjoint … 共通 0 件。別の粒度で描かれていて、要素単位では比べられない
  var PARTIAL_RATIO = 0.25;

  function comparability(result) {
    var r = result || {};
    var a = (r.onlyRef || []).length, b = (r.onlySelf || []).length;
    var common = r.common || 0;
    var total = common + a + b;
    if (total === 0) return { level: 'aligned', ratio: 1, common: 0 };
    var ratio = common / total;
    // 片方が空 (相手が空の図など) は「土俵が違う」ではなく、素直に片寄りとして扱う。
    if (common === 0 && a > 0 && b > 0) return { level: 'disjoint', ratio: 0, common: 0 };
    if (ratio < PARTIAL_RATIO) return { level: 'partial', ratio: ratio, common: common };
    return { level: 'aligned', ratio: ratio, common: common };
  }

  // 見出しの 1 行。数を読む側が引き算しなくて済むように言い切る。
  function summary(result) {
    var r = result || {};
    var a = (r.onlyRef || []).length, b = (r.onlySelf || []).length;
    if (a === 0 && b === 0) return '同じ要素が揃っています (' + (r.common || 0) + ' 件)';
    var c = comparability(r);
    if (c.level === 'disjoint') {
      return '対応する要素が 1 つもありません (相手 ' + a + ' 件 / 自分 ' + b + ' 件)。'
        + '同じものを別の粒度で描いている可能性があります';
    }
    var parts = [];
    if (a > 0) parts.push('相手にしかない ' + a + ' 件');
    if (b > 0) parts.push('自分にしかない ' + b + ' 件');
    var s = parts.join(' · ') + ' (共通 ' + (r.common || 0) + ' 件)';
    var nested = nestedCount(r.onlyRef);
    if (nested > 0) s += '。うち ' + nested + ' 件は親の中 (入れ子) の増分です';
    if (c.level === 'partial') s += ' — 共通が少なく、名前の付け方が揃っていない可能性があります';
    return s;
  }

  // ── 名前が合わないときの、形での見比べ ───────────────────────────────
  // 名前で対応が付かなくても「状態がいくつ / 遷移がいくつ / 擬似状態や注釈があるか」
  // なら比べられる。どちらが細かく描いてあるかが 1 目で分かるので、
  // 「取り込む 1 個」を選ぶ前に、そもそも同じ粒度かを確かめられる。
  var KIND_LABELS = {
    state: '状態', relation: '遷移・関係', note: '注釈', action: '動作',
    participant: '参加者', actor: 'アクター', class: 'クラス',
    component: '部品', usecase: 'ユースケース', block: 'ブロック', if: '分岐',
  };

  function kindLabel(kind) {
    return KIND_LABELS[_s(kind)] || _s(kind);
  }

  // 一覧の 1 行に出す名前。親の中の要素は道筋ごと出す。
  // BLK-junior-20260917-0323-wish: 「状態 Idle」とだけ出ると、それが
  // トップレベルに増えたのか親の中に増えたのかが行から読めない。
  function entryLabel(entry) {
    var e = entry || {};
    var name = _s(e.label);
    return _s(e.parent) ? (_s(e.parent) + PARENT_SEP + name) : name;
  }

  // 入れ子の中に増えた要素だけを数える。見出しで「親の中に N 件」と言い切るため。
  function nestedCount(list) {
    return (list || []).filter(function(e) { return _s(e && e.parent) !== ''; }).length;
  }

  // 図の形。種別ごとの件数と、状態遷移図の擬似状態 ([*] / choice / fork) の件数。
  function shape(dsl) {
    var counts = {};
    _nodes(dsl).forEach(function(n) {
      var k = _s(n.kind);
      counts[k] = (counts[k] || 0) + 1;
    });
    var pseudo = 0;
    _s(dsl).split('\n').forEach(function(line) {
      if (/\[\*\]/.test(line)) pseudo++;
      if (/^\s*state\s+\S+\s*<<\s*(choice|fork|join|end|start|history)\s*>>/i.test(line)) pseudo++;
    });
    return { counts: counts, pseudo: pseudo };
  }

  // 2 枚の形を並べた表。件数が違う種別が上に来る (見るべき所から並べる)。
  function shapeRows(selfDsl, refDsl) {
    var a = shape(selfDsl), b = shape(refDsl);
    var kinds = {};
    Object.keys(a.counts).forEach(function(k) { kinds[k] = true; });
    Object.keys(b.counts).forEach(function(k) { kinds[k] = true; });
    var rows = Object.keys(kinds).map(function(k) {
      return { kind: k, label: kindLabel(k), self: a.counts[k] || 0, ref: b.counts[k] || 0 };
    });
    if (a.pseudo || b.pseudo) {
      rows.push({ kind: 'pseudo', label: '擬似状態 ([*] / choice など)', self: a.pseudo, ref: b.pseudo });
    }
    rows.sort(function(x, y) {
      var dx = Math.abs(x.self - x.ref), dy = Math.abs(y.self - y.ref);
      return dy - dx || x.label.localeCompare(y.label);
    });
    return rows;
  }

  // 形の見比べの 1 行。どちらが細かいかを言い切る。
  function shapeSummary(selfDsl, refDsl) {
    var rows = shapeRows(selfDsl, refDsl);
    var self = 0, ref = 0;
    rows.forEach(function(r) {
      if (r.kind === 'pseudo') return;   // 擬似状態は状態・遷移に既に数えられている
      self += r.self; ref += r.ref;
    });
    if (self === ref) return '要素の数は同じ (どちらも ' + self + ' 件)。粒度の違いは中身で見てください';
    var more = ref > self ? '相手' : '自分';
    return more + 'の方が細かく描いてあります (相手 ' + ref + ' 件 / 自分 ' + self + ' 件)';
  }

  // ── 骨格は同じで、語だけが違う 2 枚 ──────────────────────────────────
  // BLK-junior-20260908-1303: 同じ台本から起こした 2 枚 (UART 版と CAN 版) は、
  // start → 4 アクション → if → stop まで並びが完全に同じで、違うのはドメインの語
  // (UART クロック有効化 / CAN クロック有効化) だけ。名前が 1 つも一致しないので
  // 「対応する要素が 1 つもない = 別の粒度」と診断されるが、実際は逆で、
  // 粒度は同じ・骨格も同じ・後から作った方にだけある要素は 1 つも無い。
  // 種別の並びが位置ごとに一致するなら、それは「土俵が違う」ではなく
  // 「同じ骨格の言い換え」なので、位置で対応させた語の対応表を出す。
  function parallel(selfDsl, refDsl) {
    var a = _nodes(selfDsl), b = _nodes(refDsl);
    var out = { aligned: false, pairs: [], differing: 0, same: 0, count: 0 };
    if (a.length === 0 || a.length !== b.length) return out;
    for (var i = 0; i < a.length; i++) {
      if (_s(a[i].kind) !== _s(b[i].kind)) return out;
    }
    var selfLines = _s(selfDsl).split('\n');
    var refLines = _s(refDsl).split('\n');
    out.aligned = true;
    out.count = a.length;
    for (var j = 0; j < a.length; j++) {
      var same = keyOf(a[j]) === keyOf(b[j]);
      out.pairs.push({
        kind: _s(a[j].kind),
        label: kindLabel(a[j].kind),
        same: same,
        self: _entry(a[j], selfLines, null),
        ref: _entry(b[j], refLines, null),
      });
      if (same) out.same++; else out.differing++;
    }
    return out;
  }

  // 骨格が同じでも、12 箇所のうち 1 箇所だけ語が違うのは「先輩が後から直した 1 行」で、
  // それは取り込む対象になる。言い換え (別題材で起こし直した 2 枚) と読めるのは、
  // 違う箇所が 2 つ以上あって、かつ全体の 1/4 以上を占めるとき。
  var REPHRASE_RATIO = 0.25;

  // 逆に、位置ごとの語が 1 つも共通しないときは「同じ骨格の言い換え」とは言えない。
  // BLK-junior-20260908-0823 の 2 枚 (電気的な出力状態 / ドライバの生死) は
  // たまたま状態も遷移も同数なので並びは揃うが、共有する語が 1 つも無く、
  // 実際には別の粒度で描かれている。共通の語が 1 つ以上あることを条件にする。
  function isRephrase(par) {
    var p = par || {};
    if (!p.aligned || !p.count || p.differing < 2) return false;
    if (!p.same) return false;
    return (p.differing / p.count) >= REPHRASE_RATIO;
  }

  // 骨格が同じときの 1 行。手順が「取り込む 1 個を選ぶ」で止まらないよう、
  // 「取り込む要素は無い」までを言い切る。
  function parallelSummary(par) {
    var p = par || {};
    if (!p.aligned) return '';
    if (p.differing === 0) {
      return '要素の並びも語も同じです (' + p.count + ' 箇所)。取り込む要素はありません';
    }
    return '骨格は同じで、語だけが違います (' + p.count + ' 箇所中 ' + p.differing + ' 箇所)。'
      + '片方にだけある要素はありません — 取り込む対象ではなく、言い換えの対応表として読んでください';
  }

  // 語の対応表を申し送りに貼れる形にする。表を目で写す手を残さないため。
  function parallelText(par, selfName, refName) {
    var p = par || {};
    if (!p.aligned) return '';
    var head = '骨格は同じで語だけが違う ' + (p.differing || 0) + ' 箇所'
      + ' (' + _s(selfName || '自分') + ' ↔ ' + _s(refName || '相手') + ')';
    var body = (p.pairs || []).filter(function(x) { return !x.same; }).map(function(x) {
      return '- ' + x.label + ': ' + _s(x.self.label) + ' ↔ ' + _s(x.ref.label);
    }).join('\n');
    return body ? (head + '\n' + body) : head;
  }

  // ── 足りない 1 行を入れる場所 ─────────────────────────────────────────
  // 宣言 (participant / class / state …) は最後の宣言の直後、
  // それ以外 (関係・注釈) は @enduml の直前。@enduml が無ければ末尾。
  var DECL_RE = /^\s*(participant|actor|boundary|control|entity|database|collections|queue|class|abstract\s+class|interface|enum|state|component|node|package|folder|rectangle|cloud|storage|usecase)\b/i;

  // 入れ子の道筋を持つ要素 (`state Configured {` の中の `Idle`) は、親の中へ入れる。
  // BLK-junior-20260917-0323-wish: 親の外へ足すと、子状態がトップレベルの兄弟に
  // なって図の意味が変わる。取り込んだ側は形が崩れてから気付くことになる。
  function _parents(entry) {
    return _s(entry && entry.parent).split(PARENT_SEP)
      .map(function(t) { return t.trim(); })
      .filter(function(t) { return t !== ''; });
  }

  // 宣言行が name を宣言しているか。`state Idle`・`state "待機" as Idle {` の両方。
  function _declares(line, name) {
    var t = _s(line).trim();
    if (!DECL_RE.test(t)) return false;
    var n = _norm(name);
    if (n === '') return false;
    var body = t.replace(/^\s*[A-Za-z]+(\s+class)?\s+/i, '').replace(/\s*\{\s*$/, '');
    var as = body.match(/^(.*?)\s+as\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*$/i);
    var cands = as ? [as[1], as[2]] : [body];
    for (var i = 0; i < cands.length; i++) {
      var c = _norm(cands[i]).replace(/\s*<<[^>]*>>\s*$/, '').replace(/^"|"$/g, '').trim();
      if (c === n) return true;
    }
    return false;
  }

  // name の本体 { … } を [from, to) の中から探す。
  //   { open, close } … 本体がある
  //   { declOnly }    … 宣言はあるが本体が無い (`state Configured`)
  //   null            … 宣言そのものが無い
  function _findBlock(lines, name, from, to) {
    for (var i = from; i < to; i++) {
      if (!_declares(lines[i], name)) continue;
      if (!/\{\s*$/.test(_s(lines[i]))) return { declOnly: i };
      var depth = 1;
      for (var j = i + 1; j < lines.length; j++) {
        var t = _s(lines[j]).trim();
        if (/\{\s*$/.test(t)) depth++;
        else if (/^\}/.test(t)) { depth--; if (depth === 0) return { open: i, close: j }; }
      }
      return { open: i, close: lines.length };
    }
    return null;
  }

  // [from, to) の中での置き場所。宣言は宣言の並びの末尾、それ以外は範囲の末尾。
  function _placeIn(lines, text, from, to) {
    if (!DECL_RE.test(text)) return to;
    for (var i = to - 1; i >= from; i--) {
      if (DECL_RE.test(_s(lines[i]).trim())) return i + 1;
    }
    return from;
  }

  function insertPlan(selfDsl, entry) {
    var lines = _s(selfDsl).split('\n');
    var text = _s(entry && entry.text).trim();
    if (text === '') return null;
    var parents = _parents(entry);
    var from = 0, to = _endIndex(lines), expand = null, level = 0;
    for (var p = 0; p < parents.length; p++) {
      var b = _findBlock(lines, parents[p], from, to);
      // 親が自分の図にまだ無いなら、道筋は辿れない。トップレベルの置き場所に戻す
      // (親そのものも「相手にしかない」に出ているので、先にそれを取り込む)。
      if (!b) { level = 0; from = 0; to = _endIndex(lines); expand = null; break; }
      level++;
      if (b.declOnly != null) {
        // 自分の側では親がまだ 1 行の宣言。本体を開いてその中へ入れる。
        expand = { at: b.declOnly, name: parents[p] };
        from = b.declOnly + 1; to = b.declOnly + 1;
        break;
      }
      from = b.open + 1; to = b.close;
    }
    var at = expand ? from : _placeIn(lines, text, from, to);
    var plan = { index: at, line: at + 1, text: _indent(text, level),
                 parent: parents.join(PARENT_SEP), from: from, to: to };
    if (expand) plan.expand = expand;
    return plan;
  }

  function _indent(text, level) {
    var body = _s(text).trim();
    var pad = '';
    for (var i = 0; i < level; i++) pad += '  ';
    return pad + body;
  }

  function _endIndex(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*@end/i.test(lines[i])) return i;
    }
    return lines.length;
  }

  // 実際に入れた後の DSL。入れた行の番号も返す (画面がその行へ飛べるように)。
  function applyInsert(selfDsl, entry) {
    var plan = insertPlan(selfDsl, entry);
    if (!plan) return null;
    var lines = _s(selfDsl).split('\n');
    var level = _parents(entry).length;
    var add = [plan.text];
    // 相手側で本体を開いている宣言 (`state Configured {`) は閉じ括弧まで入れる。
    if (/\{\s*$/.test(plan.text)) add.push(_indent('}', level));
    if (plan.expand) {
      lines[plan.expand.at] = _s(lines[plan.expand.at]).replace(/\s*$/, '') + ' {';
      add.push(_indent('}', Math.max(0, level - 1)));
    }
    lines.splice.apply(lines, [plan.index, 0].concat(add));
    return { dsl: lines.join('\n'), line: plan.line };
  }

  // ── 入れる前に「どこへ入るか」を見せる ───────────────────────────────
  // BLK-junior-20260917-0223-wish: 取り込みは 1 行ずつで、押すまで入る場所が
  // 分からなかった。押すと一覧が出し直されカーソルも飛ぶので、次の 1 行を
  // 探し直すことになる。入る場所を先に 1 行で見せ、まとめて入れられるようにする。
  function planText(selfDsl, entry) {
    var plan = insertPlan(selfDsl, entry);
    if (!plan) return '';
    var lines = _s(selfDsl).split('\n');
    var anchor = '';
    for (var i = plan.index - 1; i >= 0; i--) {
      var t = _s(lines[i]).trim();
      if (t !== '') { anchor = t; break; }
    }
    if (plan.expand) {
      return plan.line + ' 行目 (「' + plan.expand.name + '」に { } を開いて) に入ります';
    }
    if (anchor === '') return plan.line + ' 行目 (先頭) に入ります';
    return plan.line + ' 行目、「' + anchor + '」の後に入ります';
  }

  // 既に自分の図にある行は入れない (二重に足すと同じ手順が 2 本になる)。
  // 見るのは入る先の範囲だけ。トップレベルの `state Idle` があっても、
  // 親の中に `Idle` が無いなら、それは入れるべき子状態。
  function _has(lines, text, from, to) {
    var a = from == null ? 0 : from;
    var b = to == null ? lines.length : to;
    for (var i = a; i < b; i++) {
      if (_s(lines[i]).trim() === text) return true;
    }
    return false;
  }

  // チェックした分をまとめて入れる。1 件ずつ入れ直すのと同じ置き場所になるよう、
  // 入れるたびに次の行の位置を計算し直す (宣言は宣言の並びの末尾へ伸びていく)。
  function applyInserts(selfDsl, entries) {
    var dsl = _s(selfDsl);
    var list = Array.isArray(entries) ? entries : [];
    var applied = [];
    var skipped = [];
    list.forEach(function(entry) {
      var text = _s(entry && entry.text).trim();
      if (text === '') { return; }
      var lines = dsl.split('\n');
      var plan = insertPlan(dsl, entry);
      if (!plan) { skipped.push({ text: text, reason: 'noplan' }); return; }
      if (_has(lines, text, plan.from, plan.to)) {
        skipped.push({ text: text, reason: 'already' });
        return;
      }
      var out = applyInsert(dsl, entry);
      if (!out) { skipped.push({ text: text, reason: 'noplan' }); return; }
      dsl = out.dsl;
      applied.push({ text: text, line: out.line });
    });
    return {
      dsl: dsl,
      applied: applied,
      skipped: skipped,
      count: applied.length,
      lines: applied.map(function(a) { return a.line; }),
      firstLine: applied.length ? applied[0].line : 0,
    };
  }

  // 取り込んだ後に出す 1 行。何件入って、何件が既にあったかまで言い切る
  // (件数だけだと「押したのに増えない」が不具合に見える)。
  function insertsSummary(res) {
    var r = res || {};
    var n = r.count || 0;
    var already = (r.skipped || []).filter(function(s) { return s.reason === 'already'; }).length;
    if (n === 0 && already === 0) return '取り込む行を選んでください';
    var head = n === 0 ? '取り込んだ行はありません' : (n + ' 件を取り込みました');
    if (n > 0) head += ' (' + (r.lines || []).join(', ') + ' 行目)';
    if (already > 0) head += '。' + already + ' 件は既に自分の図にあったので入れていません';
    return head;
  }

  return {
    baseName: baseName,
    nameDistance: nameDistance,
    counterparts: counterparts,
    pickCounterpart: pickCounterpart,
    counterpartVerdict: counterpartVerdict,
    renameMap: renameMap,
    applyRename: applyRename,
    keyOf: keyOf,
    diff: diff,
    summary: summary,
    comparability: comparability,
    kindLabel: kindLabel,
    entryLabel: entryLabel,
    nestedCount: nestedCount,
    shape: shape,
    shapeRows: shapeRows,
    shapeSummary: shapeSummary,
    parallel: parallel,
    isRephrase: isRephrase,
    parallelSummary: parallelSummary,
    parallelText: parallelText,
    insertPlan: insertPlan,
    applyInsert: applyInsert,
    planText: planText,
    applyInserts: applyInserts,
    insertsSummary: insertsSummary,
  };
})();
