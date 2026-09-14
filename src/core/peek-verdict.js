'use strict';
window.MA = window.MA || {};

// peek-verdict — 「相手のフォルダにこの図種は 1 枚も無かった」という確認の結論を、
// 確認した本人の図の中に残す (BLK-junior-20260914-1706-wish)。
//
// 「先輩の変更を取り込む」場面で、先輩にアクティビティ図が 1 枚も無ければ取り込む
// 変更は存在しない。ところが「別ドメインなので対応不要」のような図そのものへの判定と
// 違い、「この図種は相手に実体が無いので今回は対応不要だった」は図のどこにも残らず、
// 次に同じ図を担当するたびに 👀他フォルダ → 図種バッジの確認をゼロからやり直していた。
//
// 残し方は既存の注記行と同じ、PlantUML のコメント 1 行:
//   ' @peek activity|primary|0|2026-09-14T17:10|対応不要（先輩に実体なし）
// 相手のフォルダに図が増えたら、その印は古い (確かめ直す) と自分から言う。
//
// DOM も fetch も触らない。書き戻しは app.js。
window.MA.peekVerdict = (function() {

  var MARK = "' @peek ";

  function _s(v) { return v == null ? '' : String(v); }

  function _lines(dsl) { return _s(dsl).split(/\r\n?|\n/); }

  function isVerdictLine(line) { return _s(line).trim().indexOf(MARK.trim()) === 0; }

  // 1 行を組み立てる。区切りは既存の注記行と同じ `|`。
  function format(rec) {
    if (!rec || !rec.kind) return '';
    return MARK + [_s(rec.kind), _s(rec.dir), String(rec.count == null ? 0 : rec.count),
                   _s(rec.at), _s(rec.note) || '対応不要（相手に実体なし）'].join('|');
  }

  function parseLine(line) {
    if (!isVerdictLine(line)) return null;
    var body = _s(line).trim().slice(MARK.trim().length).replace(/^\s+/, '');
    var f = body.split('|');
    if (!f[0]) return null;
    var n = parseInt(f[2], 10);
    return {
      kind: f[0].trim(),
      dir: _s(f[1]).trim(),
      count: isNaN(n) ? 0 : n,
      at: _s(f[3]).trim(),
      note: _s(f[4]).trim() || '対応不要（相手に実体なし）',
    };
  }

  // 図の中の控え。同じ図種・同じ相手の行は後の方 (書き直した方) を採る。
  function parse(dsl) {
    var out = [];
    _lines(dsl).forEach(function(l) {
      var r = parseLine(l);
      if (!r) return;
      for (var i = 0; i < out.length; i++) {
        if (out[i].kind === r.kind && out[i].dir === r.dir) { out[i] = r; return; }
      }
      out.push(r);
    });
    return out;
  }

  function find(dsl, kind, dir) {
    var rs = parse(dsl);
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].kind === kind && (dir == null || rs[i].dir === dir)) return rs[i];
    }
    return null;
  }

  // 控えを書き足す / 書き直す。同じ図種・同じ相手の古い行は落とす。
  // 置き場所は @startuml の次の行 (図の描画には出ないコメント)。
  function write(dsl, rec) {
    if (!rec || !rec.kind) return _s(dsl);
    var line = format(rec);
    var kept = _lines(dsl).filter(function(l) {
      var r = parseLine(l);
      return !(r && r.kind === rec.kind && r.dir === rec.dir);
    });
    for (var i = 0; i < kept.length; i++) {
      if (/^\s*@startuml/.test(kept[i])) {
        kept.splice(i + 1, 0, line);
        return kept.join('\n');
      }
    }
    return [line].concat(kept).join('\n');
  }

  // 控えを外す (相手に図が増えて、確かめ直した後など)。
  function remove(dsl, kind, dir) {
    return _lines(dsl).filter(function(l) {
      var r = parseLine(l);
      return !(r && r.kind === kind && (dir == null || r.dir === dir));
    }).join('\n');
  }

  // 相手に図が増えていれば、その控えは古い。増えていなければそのまま使える。
  function isStale(rec, nowCount) {
    if (!rec) return false;
    var n = nowCount == null ? rec.count : nowCount;
    return Number(n) > Number(rec.count);
  }

  // 一覧・行に出す印。控えが無ければ印も出さない。
  function badge(rec, nowCount) {
    if (!rec) return null;
    var stale = isStale(rec, nowCount);
    return {
      mark: stale ? '👀要確認' : '👀手本なし',
      stale: stale,
      kind: rec.kind,
      title: stale
        ? (rec.dir || '相手') + ' に ' + rec.kind + ' が増えました（前回の確認は '
          + (rec.at || '不明') + ' 時点で 0 枚）。確かめ直してください'
        : '前回確認時点（' + (rec.at || '不明') + '）で ' + (rec.dir || '相手')
          + ' に ' + rec.kind + ' は 0 枚でした: ' + rec.note,
    };
  }

  // 控えを取るかどうかを聞く一言。相手に 1 枚でもあるなら聞かない
  // (取り込む変更があるので、対応不要にはならない)。
  function offerText(kind, dir, count) {
    if (Number(count) > 0) return '';
    return (dir || '相手') + ' に ' + kind + ' は 0 枚です。「対応不要（手本なし）」として控えますか';
  }

  return {
    MARK: MARK, format: format, parse: parse, parseLine: parseLine, find: find,
    write: write, remove: remove, isStale: isStale, badge: badge,
    offerText: offerText, isVerdictLine: isVerdictLine,
  };
})();
