# ECN-008: ライフライン activate/deactivate UI

- **ステータス**: 適用済
- **種別**: 機能追加
- **対象コミット**: `0cd3736`
- **影響ファイル**: src/modules/sequence.js

## コンテキスト

ユーザから「ライフライン (アクティベーションバー) も表現できる？」という質問。PlantUML / Mermaid ともエンジン側は `activate X` / `deactivate X` を認識して太い縦帯を描画するが、UI から生成する手段が無かった。

## 対策

### Parse

PlantUML 固有: `activate`, `deactivate`, `create`, `destroy` の4種をサポート。
```js
var ACTIVATION_RE = /^(activate|deactivate|create|destroy)\s+(\S+)$/;
```
要素として `{kind: 'activation', action, target, line}` を push。

### Updater

`addActivation(text, action, target)`: `insertBeforeEnd` で `action target` 行を追加。

### UI

「ライフライン制御 (activate/deactivate)」セクション:
- Action select (activate / deactivate / create / destroy)
- Target participant select
- `+ ライフライン操作 追加` button

「ライフライン操作一覧」で既存ops 表示 + 削除ボタン。

## 結果

- 実機 (PlantUML online):
  ```
  User -> System : Login
  activate System
  System -> DB : Query
  activate DB
  DB --> System : Result
  deactivate DB
  System --> User : OK
  deactivate System
  ```
  → System と DB に太い縦帯（アクティベーションバー）描画確認
- 一覧に 4件表示 + 削除ボタン動作確認

## 教訓

- アクティベーションバーは Sequence Diagram の基本要素なのに parse/UI 両方欠落していた。これも修正フロー観点の漏れ（ECN-007 と同カテゴリ）
- `create` / `destroy` は PlantUML 固有、`activate` / `deactivate` は両者共通。クロスプロジェクト適用時の差異として記録
