'use strict';
window.MA = window.MA || {};

// autosave-status — 状態バーの保存状態が「どこまで届いたか」を言う。
//
// design 9c / 9a (BLK-builder-20260924-1336-3): 保存状態は文字だけの 1 行
// (「13:31 に自動保存 · 変更なし」)。💾 などの絵文字は付けない。
// 書けなかった回の ⚠ は警告なので残す。
//
// BLK-primary-20260914-2206: 一覧から開いた図に note を打っても保存フォルダの
// .puml が変わらない、という詰まりが続いた。自動保存は打鍵のたびに走っており、
// 💾 も「たった今」と出ていたが、ディスクへ写す側は錠の返事待ちで 1 度も
// 走っていなかった。💾 が指していたのはブラウザの中の控えで、ファイルではない。
// 「保存した」と「ファイルが変わった」が同じ 1 語になっていたのが詰まりの本体なので、
// 届いた先ごとに言葉を分ける。判定はここだけに置き、画面はここから取る。
window.MA.autosaveStatus = (function() {
  // describe(meta, last, rel, activeName)
  //   meta       … autoSave.getMeta()
  //   last       … autoSave.getLastWrite()
  //   rel        … 'たった今' のような相対時刻の文字列
  //   activeName … いま開いている図の名前 (書けなかったときに名指しする)
  // 返り値 { text, title, pending } … pending は「返事を待っている」= 押せば進む
  // clock … '13:31' のような時刻。design 9c: 保存状態は
  // 「13:31 に自動保存 · 変更なし」のように 1 行に短くまとめる
  // (「自動保存: 13:31:04」のような機械的な形にしない)。
  function describe(meta, last, rel, activeName, clock) {
    if (!meta) return { text: '', title: '', pending: false };
    var name = activeName ? String(activeName) : '';
    var saved = clock ? (String(clock) + ' に自動保存') : rel;
    var when = '最終保存: ' + meta.lastSavedAt
      + ' (' + String(meta.lastSavedType || '').replace('plantuml-', '') + ')';

    if (!last || last.where === 'local') {
      return { text: saved, title: when, pending: false };
    }
    if (last.where === 'file') {
      var f = last.fileName ? last.fileName + '.puml' : 'ファイル';
      return { text: saved + ' · ' + f, title: when + ' → ' + f + ' に書きました', pending: false };
    }
    if (last.where === 'blocked') {
      var b = last.fileName ? last.fileName + '.puml' : 'ファイル';
      return {
        text: 'ブラウザにのみ · ' + b + ' は書き込み停止中',
        title: String(last.reason || '') + '（編集内容はブラウザに残っています。図名を変えれば書けます）',
        pending: false,
      };
    }
    // where === 'deferred' … 保存フォルダ指定なのにファイルへ書かなかった回。
    var target = name ? name + '.puml' : 'ファイル';
    if (last.reason === 'unchanged') {
      // 開いたときのまま。ディスクは既にその内容なので、書いていないのは正しい。
      return { text: saved + ' · 変更なし', title: when + ' / ' + target + ' は開いたときのままです (本文を変えていないので書き直していません)', pending: false };
    }
    if (last.reason === 'ask') {
      return {
        text: '⚠ 未保存 · ' + target + ' に書いてよいか確認中',
        title: '一覧から開いたファイルです。「上書きする / 元のまま保つ」に答えるまで、'
          + 'ディスクへは書きません（打った内容はブラウザに残っています）。押すと確認を出します',
        pending: true,
      };
    }
    return {
      text: '⚠ 未保存 · ' + target + ' には書けません',
      title: '図に名前が付いていないため、保存フォルダのどのファイルに書けばよいか決まりません。'
        + '図名を付ければ書けます（打った内容はブラウザに残っています）',
      pending: false,
    };
  }

  // shortResult(msg) — 保存直後の 1 行 (#status-save-result) の、下端に見せる短い形。
  // BLK-builder-20260924-1413-2 (design 7a / 9c): 「./test-results/…/diagram1.puml に保存しました ／
  // 他 persona との部品名の衝突なし（1 枚と照合）」がそのまま下端を埋め、パース OK や件数が 2 行に
  // 折れていた。下端は 1 行に保ち、フォルダのパスと（…）の内訳は落として title (全文) に回す。
  //   - 区切り「 ／ 」は「 · 」に (9c の 1 行の区切りと同じ)
  //   - / や \ を含む語 (パス) はファイル名だけ
  //   - 全角の（…）は内訳なので落とす
  //   - 「他 persona との部品名の」のような前置きは落とし、「衝突なし」「衝突 2」だけ残す
  function shortResult(msg) {
    var raw = msg == null ? '' : String(msg);
    if (!raw) return '';
    return raw.split(/\s*／\s*/).map(function(seg) {
      var t = seg.replace(/（[^）]*）/g, '')
        .replace(/[^\s]*[\/\\]([^\s\/\\]+)/g, '$1')
        .replace(/他\s*persona\s*との部品名の/g, '')
        // 保存時チェックの「名前・整合・… を見て、この図に不一致はありません」は結論だけ
        .replace(/^.*を見て、この図に不一致はありません。?$/, '不一致なし')
        .replace(/\s+/g, ' ')
        .trim();
      return t;
    }).filter(function(t) { return t !== ''; }).join(' · ');
  }

  return { describe: describe, shortResult: shortResult };
})();
