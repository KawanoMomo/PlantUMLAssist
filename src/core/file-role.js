'use strict';
window.MA = window.MA || {};

// file-role — 保存フォルダのファイルが「実データ」か「テンプレ」かを宣言し、
// テンプレの中身が変わったら赤くする。
//
// BLK-reviewer-20260908-0203-wish: plantuml-sequence.puml / diagram1.puml /
// plantuml-usecase.puml はテンプレ扱いだったが、その宣言がどこにも無かったため
// 中身が別の図の内容に書き換わっていても一覧では他の 19 枚と同列に並び、
// 前回 run の tmp コピーとの手動全数 diff で初めて気付いた。
//
// 役割は 3 つ。
//   data     — 実データ。中身は変わって当たり前
//   template — テンプレ・参考。中身は変わらないはずのもの
//   unset    — まだ宣言していない (分類していないことを data と混ぜない)
//
// テンプレの汚染は「宣言した時点の指紋 (baseline) と今の指紋が違う」ことで決める。
// 指紋が取れない図は dirty と言わない — 「変わった」と「確かめられなかった」を
// 混ぜると、この道具が出す赤の意味が無くなる。
window.MA.fileRole = (function() {

  var ROLES = ['unset', 'data', 'template'];

  var ROLE_LABEL = { unset: '未分類', data: '実データ', template: 'テンプレ' };

  function _s(v) { return v == null ? '' : String(v); }

  function _validRole(r) { return ROLES.indexOf(_s(r)) >= 0 ? _s(r) : null; }

  // 保存フォルダの _roles.json (どんな形で来ても壊れない) → { name: {role, baseline, at} }
  function parse(raw) {
    var src = raw && typeof raw === 'object' ? (raw.roles && typeof raw.roles === 'object' ? raw.roles : raw) : null;
    var out = {};
    if (!src) return out;
    Object.keys(src).forEach(function(name) {
      var rec = src[name];
      if (!name) return;
      var role = _validRole(rec && typeof rec === 'object' ? rec.role : rec);
      if (!role || role === 'unset') return;   // unset は書かない (無いことが unset)
      out[name] = {
        role: role,
        baseline: rec && typeof rec === 'object' && typeof rec.baseline === 'string' ? rec.baseline : null,
        at: rec && typeof rec === 'object' && typeof rec.at === 'string' ? rec.at : null,
      };
    });
    return out;
  }

  function serialize(map) {
    return { version: 1, roles: parse(map) };
  }

  function roleOf(map, name) {
    var rec = map && map[name];
    return (rec && _validRole(rec.role)) || 'unset';
  }

  function roleLabel(role) { return ROLE_LABEL[role] || ROLE_LABEL.unset; }

  // 1 枚の状態。
  //   none    — 実データ / 未分類 (中身の変化は問わない)
  //   clean   — テンプレで、宣言した時点から中身が変わっていない
  //   dirty   — テンプレなのに中身が変わった (= 汚染。赤)
  //   unknown — テンプレだが指紋が取れず確かめられなかった
  function statusOf(entry, rec) {
    var role = (rec && _validRole(rec.role)) || 'unset';
    if (role !== 'template') return 'none';
    var now = entry && typeof entry.hash === 'string' && entry.hash ? entry.hash : null;
    var base = rec && typeof rec.baseline === 'string' && rec.baseline ? rec.baseline : null;
    if (!now || !base) return 'unknown';
    return now === base ? 'clean' : 'dirty';
  }

  var BADGES = {
    data: { mark: '実', title: '実データ。中身が変わるのは正常です', cls: 'role-data' },
    unset: { mark: '', title: '未分類。実データかテンプレかを押して決めてください', cls: 'role-unset' },
    clean: { mark: 'テ', title: 'テンプレ。宣言した時点から中身は変わっていません', cls: 'role-template' },
    dirty: { mark: 'テ 汚染', title: 'テンプレなのに中身が変わっています。書き換えた覚えが無ければ他の図の内容が流れ込んでいます', cls: 'role-dirty' },
    unknown: { mark: 'テ ?', title: 'テンプレですが指紋が取れず、中身が変わったかどうか確かめられません', cls: 'role-unknown' },
  };

  // 一覧に出す印。実データ / 未分類は役割そのもの、テンプレは状態で分ける。
  function badge(role, status) {
    if (role === 'template') return BADGES[status] || BADGES.unknown;
    return BADGES[role] || BADGES.unset;
  }

  function scan(entries, map) {
    var m = parse(map);
    var rows = (Array.isArray(entries) ? entries : []).map(function(e) {
      var name = e && typeof e.name === 'string' ? e.name : _s(e);
      var rec = m[name] || null;
      return {
        name: name,
        role: (rec && rec.role) || 'unset',
        status: statusOf(e, rec),
        hash: e && typeof e.hash === 'string' ? e.hash : null,
        baseline: (rec && rec.baseline) || null,
      };
    }).filter(function(r) { return r.name !== ''; });
    var counts = { data: 0, template: 0, unset: 0, dirty: 0, unknown: 0 };
    rows.forEach(function(r) {
      counts[r.role]++;
      if (r.status === 'dirty') counts.dirty++;
      if (r.status === 'unknown') counts.unknown++;
    });
    return {
      rows: rows,
      counts: counts,
      dirty: rows.filter(function(r) { return r.status === 'dirty'; }).map(function(r) { return r.name; }),
    };
  }

  // 一覧に配る早見表 { name: {role, status} }。
  function statusMap(scanned) {
    var out = {};
    ((scanned && scanned.rows) || []).forEach(function(r) { out[r.name] = { role: r.role, status: r.status }; });
    return out;
  }

  function summary(scanned) {
    if (!scanned || !scanned.rows.length) return '';
    var c = scanned.counts;
    if (c.dirty) {
      return 'テンプレ ' + c.dirty + ' 枚の中身が変わっています（実データ ' + c.data
        + ' / テンプレ ' + c.template + ' / 未分類 ' + c.unset + '）';
    }
    return '実データ ' + c.data + ' / テンプレ ' + c.template + ' / 未分類 ' + c.unset
      + (c.unknown ? '（テンプレ ' + c.unknown + ' 枚は指紋が取れません）' : '');
  }

  // 押すたびに 未分類 → 実データ → テンプレ → 未分類。
  function nextRole(role) {
    var i = ROLES.indexOf(_validRole(role) || 'unset');
    return ROLES[(i + 1) % ROLES.length];
  }

  // 役割を決める。テンプレにした瞬間の指紋を baseline にする
  // (「この中身のままであるべき」を宣言するのが分類の意味)。
  function setRole(map, entry, role, now) {
    var out = parse(map);
    var name = entry && typeof entry.name === 'string' ? entry.name : _s(entry);
    var r = _validRole(role) || 'unset';
    if (!name) return out;
    if (r === 'unset') { delete out[name]; return out; }
    out[name] = {
      role: r,
      baseline: r === 'template' && entry && typeof entry.hash === 'string' ? entry.hash : null,
      at: _s(now) || null,
    };
    return out;
  }

  // 今の中身を正として baseline を引き直す (自分で直したテンプレの赤を消す)。
  function accept(map, entry, now) {
    var name = entry && typeof entry.name === 'string' ? entry.name : _s(entry);
    if (roleOf(parse(map), name) !== 'template') return parse(map);
    return setRole(map, entry, 'template', now);
  }

  // 消えた図の宣言は捨てる (印だけが残り続けないようにする)。
  function keepExisting(map, entries) {
    var live = {};
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      var n = e && typeof e.name === 'string' ? e.name : _s(e);
      if (n) live[n] = true;
    });
    var m = parse(map);
    var out = {};
    Object.keys(m).forEach(function(n) { if (live[n]) out[n] = m[n]; });
    return out;
  }

  return {
    ROLES: ROLES,
    parse: parse,
    serialize: serialize,
    roleOf: roleOf,
    roleLabel: roleLabel,
    statusOf: statusOf,
    badge: badge,
    scan: scan,
    statusMap: statusMap,
    summary: summary,
    nextRole: nextRole,
    setRole: setRole,
    accept: accept,
    keepExisting: keepExisting,
  };
})();
