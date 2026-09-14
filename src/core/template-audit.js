'use strict';
window.MA = window.MA || {};

// template-audit — ⧉ テンプレート複製の「この内容で作る」を押す前に、
// これから作る図の中身がクラスの宣言と噛み合っているかをその場で見る。
//
// BLK-primary-20260907-1203-wish: timer_state.puml は adc_state.puml を複製して
// 接頭辞だけ Adc → Timer に替えて作られたが、Timer_Driver に conv 系のメソッドが
// 無いため、中身が実態 (周期タイマ) と食い違ったまま保存された。
// 「🔍 名前突合」は開いている図をまとめて後から見る道具なので、気づいたのは
// 次の run の reviewer だった。複製は接頭辞の置換なので、置換しただけでは
// 意味の合わない名前がそのまま残る — つまり食い違いは複製した瞬間に確定している。
// ならば確定した瞬間、まだ作っていない画面の上で言うのが正しい。
//
// 突合そのものは method-audit を使う (同じ食い違いを 2 通りに定義しないため)。
// ここは DOM に触らない純関数だけを置き、表示と結線は app.js。
window.MA.templateAudit = (function() {

  // これから作る図 (result) を、他の図と一緒に突合に掛ける。
  //
  //   resultDsl … 置換後の DSL (まだどこにも保存されていない)
  //   resultName… 新しい図の名前
  //   otherDocs … 突合の相手。クラス図が要る ([{ name, dsl, diagramType }])
  //   sourceName… テンプレート元の図の名前。相手から外す
  //               (元の図は複製元であって、新しい図の正しさの根拠ではない)
  //
  // 返り値: { issues, clean } — issues は method-audit の形そのまま。
  function auditResult(resultDsl, resultName, otherDocs, sourceName) {
    var MAu = window.MA.methodAudit;
    var newDoc = { name: String(resultName || '(新しい図)'), dsl: String(resultDsl || '') };
    if (!MAu || !newDoc.dsl) return { issues: [], clean: true };

    var others = (Array.isArray(otherDocs) ? otherDocs : []).filter(function(d) {
      if (!d || !window.MA.dslUtils.docDsl(d)) return false;
      if (sourceName && d.name === sourceName) return false;
      return d.name !== newDoc.name;
    });

    var res = MAu.audit(others.concat([newDoc]));
    // 新しい図が持ち込んだ食い違いだけを残す。相手側の図が元から抱えている
    // 問題まで並べると、これから押すボタンとの関係が読めなくなる。
    var issues = (res.issues || []).filter(function(i) {
      return (i.docs || []).indexOf(newDoc.name) !== -1;
    });
    return { issues: issues, clean: issues.length === 0 };
  }

  // 突合できる相手 (クラスの宣言) が 1 つも無ければ、警告が出ないことに
  // 意味を持たせてはいけない。「問題なし」と「見ていない」を区別する。
  function hasClassDocs(otherDocs, sourceName) {
    var MAu = window.MA.methodAudit;
    if (!MAu) return false;
    var found = false;
    (Array.isArray(otherDocs) ? otherDocs : []).forEach(function(d) {
      if (!d || (sourceName && d.name === sourceName)) return;
      var dsl = window.MA.dslUtils.docDsl(d);
      if (dsl && MAu.parseClassDoc(dsl).methods.length > 0) found = true;
    });
    return found;
  }

  // 画面に出す 1 行の見出し。
  function summaryText(result, checked) {
    if (!checked) return 'クラスの宣言が開かれていないので、名前の突合はしていません';
    if (!result || result.clean) return 'クラスの宣言と噛み合っています';
    var n = result.issues.length;
    return 'クラスの宣言に無い名前が ' + n + ' 件あります。このまま作ると図と実態が食い違います';
  }

  function esc(s) {
    return (window.MA.htmlUtils && window.MA.htmlUtils.escHtml)
      ? window.MA.htmlUtils.escHtml(s) : String(s);
  }

  // 食い違いの一覧。method-audit の describe をそのまま使うので、
  // 「🔍 名前突合」で後から見たときと同じ文言になる。
  function buildIssuesHtml(result) {
    var MAu = window.MA.methodAudit;
    if (!MAu || !result || !result.issues || result.issues.length === 0) return '';
    return result.issues.map(function(i) {
      return '<div class="tpl-audit-row" data-audit-name="' + esc(i.method) + '">'
        + '<span class="tpl-audit-mark">✕</span> '
        + esc(MAu.describe(i))
        + '</div>';
    }).join('');
  }

  return {
    auditResult: auditResult,
    hasClassDocs: hasClassDocs,
    summaryText: summaryText,
    buildIssuesHtml: buildIssuesHtml,
  };
})();
