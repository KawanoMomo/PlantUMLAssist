'use strict';
window.MA = window.MA || {};

// component-starter — 部品名 1 語から、ドライバのコンポーネント図の下書きを作る。
//
// BLK-junior-20260912-2206-wish: 手本になるコンポーネント図が 1 枚も無い部品がある。
// そこでは「他の保存フォルダを覗く」で先輩の図を 1 枚ずつ確かめ (手本が無いことの確認に
// 枚数ぶんの手数がかかる)、白紙のタブの末尾に追加で本体を 1 つ作り、そこで初めて
// 依存チェックの起点が選べるようになって定石から依存を足す、という組み立てを
// 部品が替わるたびに手で繰り返すことになる。
//
// ここは「本体 1 + 依存」を一度に組む。依存の並べ方は依存チェック (component-deps) と
// 同じで、実績 (この部品のシーケンス図・状態遷移図で実際に相手になっている名前) を
// 先に、定石 (ドライバなら普通ある 6 件) を後に置く。実績を先に置くのは、
// その部品が本当に持つ依存だと図から言えるのがそちらだけだから。
//
// 他部品の図の実績 (peer) は下書きには入れない。「別の部品がそうしている」は
// この部品の根拠にならないので、下書きに混ぜると消す手間だけが残る。足したければ
// 下書きを開いたあとの依存チェックにそのまま出る。
//
// ここが持つのは組み立てだけ。DOM にも localStorage にも触らない。
// 出来上がりは下書きであり、要らない依存は普通に消して使う。
window.MA.componentStarter = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 部品名。識別子の頭に置くので、英数字と _ 以外は落とす。
  // 「TIMER ドライバ」「timer_drv.puml」のような打ち方もそのまま受ける。
  function normalizeSubject(subject) {
    var s = _s(subject).trim();
    s = s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
    s = s.replace(/[ 　]*(?:ドライバ|driver|drv)[ 　]*$/i, '');
    s = s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
  }

  // 表示名に使う綴り。識別子は TIMER_Driver と連結するが、
  // タイトルは打った綴りをそのまま見せる。
  function displaySubject(subject) {
    return normalizeSubject(subject).replace(/_+/g, ' ');
  }

  // 図の主体になる本体の名前。依存の矢印の起点になる。
  function bodyName(subject) {
    var id = normalizeSubject(subject);
    return id ? id + '_Driver' : '';
  }

  // この部品のコンポーネント図が既にあるか。
  // 「まだ無い」と言い切ってから下書きを作らせるための確認で、
  // 同じ部品の図が既にあるならそれを開く方が早い。
  // 部品の見分けは依存チェックと同じ語の一致で見る (GpioDrv と gpio_component は同じ部品)。
  function existingDocs(subject, docs) {
    var CD = window.MA.componentDeps;
    var keys = CD ? CD.keyTokens(normalizeSubject(subject)) : [];
    if (!keys.length) return [];
    return (docs || []).filter(function(d) {
      if (!d || d.diagramType !== 'plantuml-component') return false;
      var toks = CD.keyTokens(_s(d.name));
      for (var i = 0; i < keys.length; i++) if (toks.indexOf(keys[i]) >= 0) return true;
      return false;
    });
  }

  // plan(subject, docs) — 何が作られるかを、DSL にする前の形で返す。
  // rows は依存チェックと同じ行 (name / label / why / source) なので、
  // 画面では出所をそのまま添えて見せられる。
  function plan(subject, docs) {
    var id = normalizeSubject(subject);
    if (!id) return null;
    var CD = window.MA.componentDeps;
    var rows = [];
    if (CD) {
      // 今の図ではなく白紙を渡す。下書きは白紙から起こすものなので、
      // 開いている図に何が書いてあっても中身は同じにする。
      var res = CD.check('', docs || [], null, id);
      rows = (res.rows || []).filter(function(r) { return r.source !== 'peer'; });
    }
    return {
      subject: id,
      display: displaySubject(subject),
      body: bodyName(subject),
      rows: rows,
      usageCount: rows.filter(function(r) { return r.source === 'usage'; }).length,
      catalogCount: rows.filter(function(r) { return r.source === 'catalog'; }).length,
    };
  }

  // 見出し 1 行。押す前に「何件入るか」と「実績が何件あるか」が読める。
  function summary(p) {
    if (!p) return '部品名を入れてください';
    var parts = [];
    if (p.usageCount) parts.push('この部品の図に出てくる相手 ' + p.usageCount + ' 件');
    if (p.catalogCount) parts.push('定石 ' + p.catalogCount + ' 件');
    if (!parts.length) return p.body + ' だけの下書きを作ります';
    return p.body + ' と依存 ' + p.rows.length + ' 本 (' + parts.join(' / ') + ') の下書きを作ります';
  }

  // 新しい図の名前の下書き。保存名にそのまま使える形にする。
  function docName(subject) {
    var id = normalizeSubject(subject);
    return id ? id.toLowerCase() + '_component' : '';
  }

  // dsl(subject, docs) — 下書きの DSL。宣言を先に、依存の矢印を後に。
  function dsl(subject, docs) {
    var p = plan(subject, docs);
    if (!p) return '';
    var CD = window.MA.componentDeps;
    var out = ['@startuml', 'title ' + p.display + ' ドライバ コンポーネント図',
      'component ' + p.body];
    var block = CD ? CD.blockFor(p.body, p.rows) : '';
    if (block) out.push(block);
    out.push('@enduml');
    return out.join('\n');
  }

  return {
    normalizeSubject: normalizeSubject,
    displaySubject: displaySubject,
    bodyName: bodyName,
    existingDocs: existingDocs,
    plan: plan,
    summary: summary,
    docName: docName,
    dsl: dsl,
  };
})();
