# ADR-102: Java 非同期 render pipeline

- **ステータス**: 承認
- **カテゴリ**: インターフェース
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

MermaidAssist は mermaid.js がブラウザ内で同期的に SVG を返すが、PlantUMLAssist は Java subprocess 経由で render するため数百ms〜数秒の遅延がある。

## 検討した選択肢

### A) 同期 fetch + editor block
- メリット: 実装シンプル
- デメリット: 入力中に画面が止まる

### B) Debounce 150ms + async fetch + status indicator
- メリット: UX 良好
- デメリット: race condition 注意

### C) WebSocket 双方向
- メリット: 最高速
- デメリット: YAGNI

## 決定

**B) Debounce + async fetch** を採用。

## 結果

- 入力中は古い SVG が残り、150ms 後に更新
- `#render-status` で状態表示 (Rendering…/OK/ERROR)

## 教訓

- subprocess 由来の非同期 UI はステータス表示が必須
