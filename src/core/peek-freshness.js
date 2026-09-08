'use strict';
window.MA = window.MA || {};

// peek-freshness — 「他の保存フォルダを覗く」一覧に、その図の SVG が今の puml から
// 作られたものかを最初から出す。
//
// BLK-reviewer-20260909-0603-wish: 自分の保存フォルダの一覧 (📂) は
// svg-freshness の判定を行ごとに出しているが、覗いた他人のフォルダの一覧は
// ファイル名しか出していなかった。primary/diagram1.puml の中身が書き換わったのに
// diagram1.svg が旧テンプレのままだった食い違いに気付けたのは、reviewer が毎回
// CLI で /verify-svg を叩いていたからで、GUI からは分からない。
// 判定そのものは svg-freshness に既にあるので、ここは「覗いた 1 フォルダぶんの
// 一覧をどう見せるか」だけを持つ:
//   - 行ごとの印は match も含めて必ず出す (無印を「確かめた」と読ませない)
//   - 未刻印 / 印だけのずれは、その場で /verify-svg にかける対象として名前を出す
window.MA.peekFreshness = (function() {

  function _SF() { return window.MA.svgFreshness; }

  // 覗いたフォルダの listFolder 結果 → svg-freshness の scan。
  function scan(folder) {
    var SF = _SF();
    if (!SF) return null;
    var entries = (folder && Array.isArray(folder.entries)) ? folder.entries : [];
    var verified = (folder && folder.verified && typeof folder.verified === 'object')
      ? folder.verified : {};
    return SF.scan(entries, verified);
  }

  // 一覧の行に出す印。自分のフォルダの一覧は「直すもの」だけに印を付けるが、
  // 覗く側の用は「この 1 枚を今の図として読んでよいか」なので、一致にも印を出す。
  // 印が無い行を「確かめた結果うまくいっている」と読み替えさせない。
  var ROW_MARKS = {
    match: '内容一致',
    format: '体裁差のみ',
    differ: '内容ずれ',
    missing: 'SVG 無',
    unverified: '未刻印',
  };

  function rowBadge(scanned, name) {
    var SF = _SF();
    if (!SF || !scanned) return null;
    var rows = scanned.rows || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].name !== name) continue;
      var content = rows[i].content;
      var b = SF.contentBadge(content, rows[i].basis);
      return {
        content: content,
        mark: ROW_MARKS[content] || b.mark,
        title: b.title,
        // 作り直しが要るのは「内容ずれ」と「SVG 無」だけ。体裁差・未刻印を
        // 赤で名指しすると、読める図まで直す対象に見える。
        alert: content === 'differ' || content === 'missing',
      };
    }
    // 一覧に無い名前 (puml が消えた直後など) は何も言わない。
    return null;
  }

  // 一覧の見出しに出す 1 行。何枚がどの状態かを、開く前に言う。
  function summary(scanned) {
    var SF = _SF();
    if (!SF || !scanned || !scanned.rows.length) return '';
    return SF.contentSummary(scanned);
  }

  // 見出しの 1 行が「今すぐ直すものがある」状態かどうか (色を変えるため)。
  function hasIssue(scanned) {
    var c = (scanned && scanned.contentCounts) || null;
    if (!c) return false;
    return (c.differ || 0) > 0 || (c.missing || 0) > 0;
  }

  // 上書きせずに白黒を付けられる図。svg-freshness の needsVerify と同じ基準
  // (未刻印 + 印だけで出たずれ)。覗いているフォルダは他人のものなので、
  // 作り直し (needsRender) は決して出さない — 直すのは持ち主の仕事。
  function verifyTargets(scanned) {
    return (scanned && Array.isArray(scanned.needsVerify)) ? scanned.needsVerify.slice() : [];
  }

  function verifyLabel(scanned) {
    var n = verifyTargets(scanned).length;
    return n === 0 ? '中身を確かめる SVG はありません' : 'SVG の中身を確かめる（' + n + ' 枚）';
  }

  var VERIFY_TITLE = '保存されている SVG は上書きしません。'
    + '1 枚ずつ描き直して中身を比べ、印だけでは言えなかった図に白黒を付けます';

  function verifyTitle() { return VERIFY_TITLE; }

  return {
    scan: scan,
    rowBadge: rowBadge,
    summary: summary,
    hasIssue: hasIssue,
    verifyTargets: verifyTargets,
    verifyLabel: verifyLabel,
    verifyTitle: verifyTitle,
  };
})();
