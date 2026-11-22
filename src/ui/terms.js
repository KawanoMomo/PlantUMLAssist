'use strict';
// 画面の語の正本 (TICKET-roadmap-20261115-2114-4)。
// 右パネル (選択中・末尾に追加) の同じ役の欄・ボタンは、6 図種でここの語をそのまま出す。
// 語は製品仕様書 docs/spec/product-spec.md の「画面の語」と CONTEXT.md に揃える (表と値は unit が突き合わせる)。
// 日本語と英語の併記 (「矢印の種類 / Arrow」) はしない。PlantUML の記法 (activate 等) は記法として出してよい。
// 本文 (PlantUML) に書く字はここでは決めない。
window.MA = window.MA || {};
window.MA.terms = {
  id: '名前 (id)',                 // 識別子 (as の後ろ・宣言の名前)
  label: '表示名',                  // 図に出る要素の名前 ("…" as の前)
  edgeLabel: 'ラベル',              // 関係・遷移・枝の線に乗る文字
  stereotype: 'ステレオタイプ',
  kind: '種類',
  del: '✕ 削除',
  apply: '変更を反映',
  renameRefs: '名前を変えたら関係の行も付け替える',
  arrow: '矢印の種類',
  lineColor: '線の色',
  color: '色',
  textColor: '文字色',
  direction: '向き',
  multiplicity: '多重度',
  relationKind: '関係の種類',
  addRelation: '関係を追加',
  condition: '条件',
  insertHere: 'この位置に挿入',
  reorder: '並び替え',
  swimlane: 'スイムレーン',
  inferActivation: '呼び出しの開始・終了を自動で入れる (activate)',
};
