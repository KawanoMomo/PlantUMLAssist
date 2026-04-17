# ADR-103: Local / Online render モード切替

- **ステータス**: 承認
- **カテゴリ**: 配布・運用
- **日付**: 2026-04-17
- **対象プロジェクト**: PlantUMLAssist

## コンテキスト

PlantUML レンダリング方式:
- local Java (subprocess、完全オフライン)
- online (plantuml.com)

## 検討した選択肢

### A) local のみ
- Java 必須、情報漏洩リスク 0

### B) online のみ
- Java 不要、情報漏洩リスクあり

### C) 両方、UI 切替
- ユーザー選択可、実装量 1.5倍

## 決定

**C) 両方、localStorage 保存** を採用。デフォルト `local`。

## 結果

- 業務利用: local で secure
- 個人利用: online でゼロインストール可能

## 教訓

- セキュリティ優先デフォルト + 利便性 option は両立可能
