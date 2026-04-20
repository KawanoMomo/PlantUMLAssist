# lib/

## plantuml.jar は別途ダウンロードが必要

配布リポジトリには PlantUML jar を同梱していません (ライセンス整合性のため)。
初回セットアップ時に下記のいずれかで取得してください。

### 方法1: fetch スクリプト (推奨)

```bash
# macOS / Linux / WSL / Git Bash
bash lib/fetch-plantuml.sh
```

```powershell
# Windows PowerShell
.\lib\fetch-plantuml.ps1
```

### 方法2: 手動ダウンロード

PlantUML 公式リリースページから任意のライセンス変種を選んで `lib/plantuml.jar` として配置:

- GPLv3 (default / 全機能): https://github.com/plantuml/plantuml/releases
- MIT / BSD / Apache / EPL / LGPL 版は機能サブセット (公式サイト参照)

本ツールは `lib/plantuml.jar` という固定パスを参照します。どのライセンス変種を
置いても動作しますが、利用者の責任で選択してください。

## 動作要件

- Java 11+ (推奨、常駐 daemon モード)。Java 8-10 はフォールバックで動作
- Java 未インストール: UI で online モード (plantuml.com) に切替可能
