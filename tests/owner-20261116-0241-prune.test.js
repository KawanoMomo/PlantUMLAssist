'use strict';
// TICKET-owner-20261116-0241-prune: 保存先の一覧に生えた棚卸し・監査の欄を外し、
// 一覧は 並べる・絞る・印を付けてまとめて開く・最近開いた図 だけにする。
// 外したもの (隠して残さない): SVG の鮮度と作り直し・SVG の中身を確かめる (/verify-svg)・
// 食い違いの中身・可視差分・前回控えとの比較 (＝ の印・変化なしを隠す・差分ビュー)・
// 中身が同じ図の統合・本体 / 編集中 / SVG の反映状況・差し替え待ち・直近の更新・一時控え・
// FILES の「SVG 古い」「控え」の札。
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
var SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

var GONE_MODULES = ['svg-freshness', 'svg-compare-row', 'svg-cross', 'svg-diff-summary', 'svg-visual-diff',
  'dsl-visible-diff', 'dupe-merge', 'draft-mark', 'peek-freshness', 'sync-state', 'swap-queue',
  'write-activity', 'review-watch', 'change-stamp', 'review-diff', 'audit-scope'];

describe('保存先の一覧の棚卸し・監査の欄を外した (TICKET-owner-20261116-0241-prune)', function() {
  test('外したモジュールはファイルも読み込みも無い', function() {
    GONE_MODULES.forEach(function(m) {
      expect(fs.existsSync(path.join(ROOT, 'src', 'core', m + '.js'))).toBe(false);
      expect(HTML).not.toContain('src/core/' + m + '.js');
    });
  });

  test('一覧の描画は外した欄を作らない (呼び出しも無い)', function() {
    ['appendSvgSection', 'appendSvgDiffSection', 'appendDupeSection', 'appendSyncSection',
     'appendSwapQueueSection', 'appendWriteSection', 'appendDraftSection', 'folderDiffButton',
     'folderSvgVisualButton', 'folderDraftButton', 'folderChangedButton', 'renderStaleSvgs',
     'verifySvgContents', 'openReviewDiff', 'openSvgVisualDiff', 'toggleActiveDraft',
     'window.MA.reviewWatch', 'window.MA.svgFreshness', 'window.MA.draftMark', 'window.MA.dupeMerge',
     "'/verify-svg'", 'folder-mark-seen', 'folder-stamp-hide'].forEach(function(w) {
      expect(APP).not.toContain(w);
    });
  });

  test('画面に外した欄の語・入口が残らない', function() {
    ['btn-tab-draft', 'svg-visual-modal', 'id="rd-modal"', "'rd-modal'",'変化なしを隠す', 'ここまで見たことにする',
     '変更図だけ選ぶ', 'SVG 古い', '対象set', 'SVG を作り直', '枚だけ作り直す'].forEach(function(w) {
      expect(HTML).not.toContain(w);
      expect(APP).not.toContain(w);
    });
  });

  test('残す: 並べる・絞る・印を付けてまとめて開く・最近開いた図・この図の履歴・1 枚削除', function() {
    ['function folderFilterBar', 'function folderPickBar', 'function folderOpenButton',
     'function appendRecentSection', 'function folderVersionButton', 'function folderDeleteButton',
     'function appendRoleSection'].forEach(function(w) {
      expect(APP).toContain(w);
    });
  });

  test('server は SVG を描き直して比べる窓口と控えを持たない (保存先に残った控えは読まない・消さない)', function() {
    expect(SERVER).not.toContain('_handle_verify_svg_post');
    expect(SERVER).not.toContain('_svg_verify_path');
    expect(SERVER).not.toContain("'verified': verified");
  });
});
