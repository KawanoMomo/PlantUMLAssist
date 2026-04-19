# ECN-006: UX polish - autonumber, UMLセマンティックなarrow label, zoom max 500%

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: `4492bec`
- **影響ファイル**: src/modules/sequence.js, src/app.js, plantuml-assist.html

## コンテキスト

3件の独立した UX 改善をまとめて実施:

1. `autonumber` が旧 MermaidAssist には UI があったのに PlantUMLAssist では消えていた
2. Arrow select の選択肢が `->`, `-->` のような生の DSL 記号だけで、UML 初学者には意味不明
3. Zoom 上限が 300% で、細部確認には不足という指摘

## 対策

### autonumber

- parse に `autonumber` / `autonumber N` / `autonumber N M` パターンを追加
- meta.autonumber を `true | { start, step } | null` として保持
- `toggleAutonumber()` updater 実装（既存行削除 or @startuml 直後に挿入、title がある場合はその下）
- Title 設定セクションの直下に checkbox UI

### Arrow label (UML 注釈)

10 種類の矢印に UML 意味付きラベルを添える:

| 矢印 | ラベル |
|---|---|
| `->` | 同期メッセージ (実線) |
| `-->` | 返信/戻り (破線) |
| `->>` | 非同期メッセージ (開矢印) |
| `-->>` | 非同期返信 (破線+開矢印) |
| `<-` | 同期 (逆向き) |
| ... | ... |

メッセージ追加フォームと編集パネルの両方の Arrow select に適用。

### Zoom max

`setZoom`: `max(0.25, min(3.0, z))` → `max(0.1, min(5.0, z))`。auto-fit は `min(1.0, ...)` に制限（小さい図を勝手に拡大しない）。

## 結果

- autonumber checkbox → editor に `autonumber` 追加 → SVG に `1 Request / 2 Query / ...` 描画確認
- Arrow select で `-> 同期メッセージ (実線)` と表示
- Zoom+を40回クリックで 500% 到達確認

## 教訓

- **DSL 記号はそのまま UI に出さない**。仕様を知らないユーザに配慮したラベル (形 + UML 意味) で常に説明を添える
- `autonumber` のような「あれば便利」な機能は類似プロジェクトから**機能表を作って漏れチェック**すべき
- Zoom 上限は用途依存。MermaidAssist は Gantt 前提で 300% で足りたが、Sequence/Class 図の細部確認には 500% 必要
