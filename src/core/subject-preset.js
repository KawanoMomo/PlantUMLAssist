'use strict';
window.MA = window.MA || {};

// subject-preset — 図のセットを「題材プリセット」として 1 度だけ登録しておき、
// 以降は題材名を打つだけで同じ構成の図一式を生成する。
//
// BLK-junior-20260907-1303-wish: 題材が GPIO → UART → CAN と替わっても作る図は
// 毎回同じ構成で、周回のたびに「先輩の図を開く → セットを選ぶ → 置換元と置換先を
// 打つ」を繰り返していた。family-clone は「今そこに開いている図」を元にする作りなので、
// 元の図が手元に無ければ始まらないし、置換元の語も毎回打ち直す。
// セットの中身と置換元の語を保存してしまえば、4 周目以降は「プリセットを選ぶ →
// 題材名を打つ → 生成」だけになる。
//
// 置換そのものは family-clone の plan (= template-new の大小の族ごとの置換) を
// そのまま使う。ここが持つのは「保存する形」と「保存先とのやり取り」だけで、
// DOM には触らない。
window.MA.subjectPreset = (function() {

  var KEY = 'ma.subjectPresets';
  var VERSION = 1;

  function _s(v) { return v == null ? '' : String(v); }
  function _fc() { return window.MA.familyClone; }
  function _baseName(name) { return _s(name).replace(/\.(puml|plantuml|uml|txt)$/i, ''); }

  // ── 保存する形 ────────────────────────────────────────────────────────
  // docs は生成に必要な最小限 (名前・図種・DSL) だけを持つ。元の図が消えても
  // プリセットだけで生成できる状態を保つのが目的なので、参照ではなく実体を持つ。
  function fromGroup(group, subject, name) {
    var g = group || {};
    var docs = (g.docs || []).map(function(d) {
      return { name: _baseName(d.name), diagramType: _s(d.diagramType), dsl: _s(d.dsl) };
    });
    return {
      version: VERSION,
      name: _s(name).trim() || _s(g.key),
      subject: _s(subject).trim(),
      key: _s(g.key),
      docs: docs,
      savedAt: new Date().toISOString(),
    };
  }

  // 登録できない形は「登録できない理由」を返す。理由が言えない不可は作らない。
  function validate(preset) {
    if (!preset) return '登録するセットがありません';
    if (!_s(preset.name).trim()) return 'プリセット名を入れてください';
    if (!_s(preset.subject).trim()) return '置換元 (今の題材名) を入れてください';
    if (!preset.docs || !preset.docs.length) return 'セットに図が 1 枚もありません';
    var untouched = preset.docs.filter(function(d) {
      return _s(d.dsl).toLowerCase().indexOf(_s(preset.subject).toLowerCase()) < 0;
    });
    // 置換元が出てこない図は、生成しても題材が替わらないまま増えるだけ。
    // 登録の時点で気付けるようにする (生成のたびに同じ事故を起こさせない)。
    if (untouched.length === preset.docs.length) return '置換元「' + preset.subject + '」がセットのどの図にも出てきません';
    return '';
  }

  // ── 保存先とのやり取り ────────────────────────────────────────────────
  // store は localStorage と同じ形 (getItem / setItem) なら何でもよい。
  // 壊れた JSON が入っていても空扱いにして進む — プリセットが読めないことで
  // 図の作成そのものが止まってはいけない。
  function _store(store) {
    return store || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  function list(store) {
    var s = _store(store);
    if (!s) return [];
    var raw;
    try { raw = s.getItem(KEY); } catch (e) { return []; }
    if (!raw) return [];
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function(p) { return p && _s(p.name) && Array.isArray(p.docs); });
  }

  function load(store, name) {
    var key = _s(name).toLowerCase();
    var hit = list(store).filter(function(p) { return _s(p.name).toLowerCase() === key; });
    return hit.length ? hit[0] : null;
  }

  // 同じ名前は上書きする (登録し直しは「更新」であって重複ではない)。
  // 並びは名前順にして、選ぶ側で毎回同じ位置に出るようにする。
  function save(store, preset) {
    var s = _store(store);
    var err = validate(preset);
    if (err) throw new Error(err);
    if (!s) throw new Error('プリセットの保存先がありません');
    var key = _s(preset.name).toLowerCase();
    var next = list(store).filter(function(p) { return _s(p.name).toLowerCase() !== key; });
    next.push(preset);
    next.sort(function(a, b) { return _s(a.name) < _s(b.name) ? -1 : (_s(a.name) > _s(b.name) ? 1 : 0); });
    try { s.setItem(KEY, JSON.stringify(next)); } catch (e) { throw new Error('プリセットを保存できませんでした: ' + e.message); }
    return next;
  }

  function remove(store, name) {
    var s = _store(store);
    if (!s) return [];
    var key = _s(name).toLowerCase();
    var next = list(store).filter(function(p) { return _s(p.name).toLowerCase() !== key; });
    try { s.setItem(KEY, JSON.stringify(next)); } catch (e) { /* 消せなくても読み出しは壊れない */ }
    return next;
  }

  // ── 生成 ──────────────────────────────────────────────────────────────
  // family-clone の plan に委ねる。置換の規則を 2 つ持たない。
  function plan(preset, subject, existingNames) {
    var fc = _fc();
    if (!preset || !fc) return { items: [], docs: 0, changed: 0, remaining: 0, ready: false };
    var to = _s(subject).trim();
    var group = { key: _s(preset.key || preset.name), docs: preset.docs || [] };
    return fc.plan(group, [{ from: _s(preset.subject), to: to }], existingNames || []);
  }

  // プリセットを選んだだけで、何が何枚できるのかが分かる 1 行。
  function describe(preset) {
    if (!preset) return '';
    var fc = _fc();
    var types = {};
    // 図種は family-clone のセット名と同じ短い日本語で出す (画面で 2 通りの
    // 呼び方をしない)。
    (preset.docs || []).forEach(function(d) {
      if (d.diagramType) types[fc ? fc.shortType(d.diagramType) : d.diagramType] = true;
    });
    var kinds = Object.keys(types).sort().join(' / ');
    return _s(preset.name) + ' — ' + (preset.docs || []).length + ' 枚 (置換元: ' + _s(preset.subject) + ')'
      + (kinds ? ' · ' + kinds : '');
  }

  // 生成前の確認文。ready でない理由も同じ場所に出す (family-clone と同じ文面)。
  function summaryText(p) {
    var fc = _fc();
    return (p && fc) ? fc.summaryText(p) : '';
  }

  // 既にその題材で作ってある図の名前。plan は名前がぶつかると別名を付けて
  // 作り続けるので、そのままだと同じ題材の 2 セット目が黙って増える。
  // 「本来の名前」(衝突回避を掛ける前) が既にあるかどうかで判定する。
  function conflicts(preset, subject, existingNames) {
    var tn = window.MA.templateNew;
    if (!preset || !tn || !_s(subject).trim()) return [];
    var taken = {};
    (existingNames || []).forEach(function(n) { taken[_baseName(n).toLowerCase()] = true; });
    // suggestName ではなく instantiate を使う。suggestName は「名前が変わらない」
    // ときに題材名を末尾に足して逃げるので、既に作ってある題材を打っても
    // 別名になってしまい、ぶつかっていることが分からない。
    return (preset.docs || []).map(function(d) {
      return tn.instantiate(_baseName(d.name), _s(preset.subject), _s(subject).trim());
    }).filter(function(n) { return taken[_s(n).toLowerCase()]; });
  }

  return {
    KEY: KEY,
    VERSION: VERSION,
    fromGroup: fromGroup,
    validate: validate,
    list: list,
    load: load,
    save: save,
    remove: remove,
    plan: plan,
    describe: describe,
    summaryText: summaryText,
    conflicts: conflicts,
  };
})();
