# ECN-002: UI shell と toolbar の MermaidAssist フィーチャーパリティ

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: `5de02a1`, `277a0c3`
- **影響ファイル**: plantuml-assist.html, src/app.js

## コンテキスト

v0.1.0 MVP の UI は最低限の toolbar (Undo/Redo/Render/mode選択) だけで、MermaidAssist にある Open/Save、Zoom -/+/表示/Fit、Export メニュー、pane-resizer、line-numbers、overlay-layer、statusbar が欠落していた。姉妹プロジェクトなら構造と機能を揃えるべき、というユーザ指摘で着手。

## 対策

1. CSS 変数と font (IBM Plex Mono + Noto Sans JP) を MermaidAssist と揃える
2. toolbar に `.logo` / `.tb-btn` / `.tb-sep` クラスを導入して見た目を統一
3. Open / Save / Zoom / Export / Fit ボタンと hidden `#file-input` を追加
4. Editor 側に line-numbers カラムと pane-resizer (ドラッグでリサイズ) を追加
5. Preview 側に overlay-layer と statusbar を追加
6. `#props-pane` → `#props-content` のネスト構造に合わせて app.js の propsEl を変更
7. Export は SVG / PNG / PNG透過 / クリップボード（MermaidAssist と同じ4種）
8. PlantUML 特有の SVG 対応: `style="width:Xpx;height:Ypx"` を width/height 属性に正規化する normalizeSvgSize() を追加（PNG エクスポート時 Image() が size を取れない問題の回避）

## 結果

UI 見た目が MermaidAssist と一致。Zoom/Export/Save が全機能動作。9 E2E pass。

## 教訓

- 姉妹プロジェクトは **shell 構造から機能まで対称**を前提にすべき。後追いで揃えるより初期からコピーした方が安い。
- PlantUML の SVG は style 属性に width/height を inline で入れてくる。Mermaid が出す SVG と違うので、Image() でサイズ取れない → PNG Export 時に認識。`normalizeSvgSize()` で属性に昇格させる処理が必要。
