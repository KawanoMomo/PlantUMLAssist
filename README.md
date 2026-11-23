# PlantUMLAssist

PlantUML 記法の本文(`.puml`)を正本に、GUI で UML 図を直すローカルのツール。Python の `server.py` + 単一 HTML `plantuml-assist.html` + `src/`(ビルド無し)。

![](docs/images/01-sequence-default.png)

6 図種(シーケンス / ユースケース / コンポーネント / クラス / アクティビティ / 状態遷移)。図の要素を押す・右パネルのフォームで足すと、押した要素の行だけを最小の差分で本文に書き戻す。
描画は PC の中の `lib/plantuml.jar` で行い、図を外へ送らない。手書きや他の道具で作った既存の `.puml` を壊さず開いて直せる。

機能の全部は製品仕様書 [`docs/spec/product-spec.md`](docs/spec/product-spec.md)(場面ごとに、できること・入口・振る舞い・確かめる spec)。v5.0.0〜v7.0 の振る舞いの変更は [`docs/ecn/ECN-011_v5.0.0-to-v7.0-behavior.md`](docs/ecn/ECN-011_v5.0.0-to-v7.0-behavior.md)、v7.0.0〜v8.0 は [`docs/ecn/ECN-012_v7.0.0-to-v8.0-behavior.md`](docs/ecn/ECN-012_v7.0.0-to-v8.0-behavior.md)、その後は [`docs/ecn/ECN-013_v8.0-to-v9.0-behavior.md`](docs/ecn/ECN-013_v8.0-to-v9.0-behavior.md)。

v9.0 は、書き出した 1 枚がそのまま資料に貼って読める版: PNG は何も選ばなくても SVG の寸法の 2 倍の画素数で出て、倍率(1〜4 倍)は Export ▾ の中の「PNG の大きさ:」の 1 か所で替えて道具に 1 つだけ覚える(本文に `scale` を書き足さない)。「クリップボードにコピー」も書き出しと同じく押した図の今の本文の図を同じ大きさ・白地で写し、写した・写さなかったを下端が言う。
v8.0 は、図の描き直しを待たずに続けて打てる版: GUI の手は描き直しの結果ではなく押した時点の本文に働く。右パネルの「変更を反映」の後も直した要素を選んだままで続けて直せ、「+ 追加」「まとめて」を間を空けずに続けても 1 手ずつ入り、描き直しの前に押した Export ▾ も今の本文の図を書き、⇄ 一括置換(Ctrl+H)で木へ当てた置換は「置換前に戻す」1 押しで全部戻る。
v7.0 で、保存先のフォルダの木の中で 1 件の変更(設計変更・レビュー指摘)を取りこぼさず反映して渡せるようにした(⇄ 一括置換がサブフォルダの図にも届く・指摘の 1 本を Ctrl+K の行番号で選ぶ・保存先に `.puml` と押した書き出しのほかを書かない・Export ▾ の「書き出し先:」の行で書き出しが古いかを読む)。

## できること

### 開く

Import ▾(ファイルを開く…・クリップボードから開く・保存先の一覧を開く)、Ctrl+O、ドラッグ&ドロップ、FILES ツリー(Ctrl+K と空の画面のボタンも同じ語「ファイルを開く…」)。前に開いた図は、保存フォルダの一覧の上端(Import ▾ →「保存先の一覧を開く」)の「最近開いた図」と Ctrl+K から開き直す。タブで複数の図を開き、左端の図種レールで新しい図の図種を選ぶ。日本語名・別名つきの宣言や旧記法の図もそのまま開く。

### 直す(6 図種で共通の操作)

図の要素にマウスを乗せると枠が出て、押すと右パネルで直せる。「変更を反映」の後も直した要素を選んだままなので、図を押し直さずに続けて直せる。右パネルの「末尾に追加」と「まとめて」で足し、図の行間の「＋ ここに挿入」で途中に差し込む(描き直しを待たずに続けて押しても、今の本文に 1 手ずつ入る)。本文と図の相互ジャンプ、↑↓ で選び続ける、Ctrl+Z / Ctrl+Y、位置を保ったズーム、図の設定(図名・タイトル・外観)、Ctrl+K コマンドパレット(行番号 `15`・`L15` か名前を打つと「図の要素へ移動」でその行を選べる。同名ラベルは行の順に並ぶ)、ツール ▾(行を書き換える・部品名を一括置換する)、⚙ 設定。

### 直す(図種ごとの操作)

シーケンス図の矢印の種類・向き・通し番号・alt / loop の範囲・注釈の位置、状態遷移図の子状態・擬似状態・状態遷移表、クラス図の属性と関係、アクティビティ図の分岐パターン、コンポーネント図の関係のカード・ステレオタイプ・境界、ユースケース図の 2 つ選んで関係を追加。

### 描く

打つたび・操作のたびに `lib/plantuml.jar` で描き直す(`POST /render`。仕様は `GET /render` が JSON で返す)。描けないときも直前の図を残し、読めない行を知らせる。`!include` した共通ファイルも描く。

### 保存する

Ctrl+S と自動保存で、保存先から開いた図はそのファイルに書く。直していない図はバイト単位で一致したまま。保存先に書くのは `.puml` と押した書き出しだけ。前の版は FILES の右クリック「この図の履歴を表示」(Ctrl+K も同じ語)で見比べ・戻せる。

### 書き出す

上部バー Export ▾ で今の図を SVG / PNG / PNG(透過背景)/ クリップボードに書き出す(Ctrl+E。項目は「SVG で書き出す」「PNG で書き出す」「PNG（透過背景）で書き出す」「クリップボードにコピー」)。SVG は FILES のファイルの右クリックと Ctrl+K にも同じ「SVG で書き出す」で出る(Ctrl+K は「書き出」で 3 形式を引ける)。保存先から開いた図は、ダウンロードではなく保存先の中に図の名前で書く(既定は図と同じフォルダ。Export ▾ の「書き出し先:」の「替える…」で保存先の下の別のフォルダに替えられる)。書いた先・名前・新規か上書きかを下端に出す。書き出した後に本文を直して保存すると、Export ▾ の「書き出し先:」の行に置き場の書き出しが古い旨が出て、書き出し直すと消える。保存先の無い図は今までどおりダウンロード。描き直しが届く前・図を開いた直後に押しても、下端に「描き直しが届いたら書き出します…」と出して、押した図の今の本文の図を 1 回だけ書く。
PNG の大きさ: PNG は何も選ばなくても SVG の寸法の 2 倍の画素数で、SVG から描き直して出る(資料に貼っても字がつぶれない)。Export ▾ の項目の下の「PNG の大きさ:」の行で 1〜4 倍に替えられ、道具に 1 つだけ覚える(別の図・開き直しの後も同じ)。「PNG で書き出す」「PNG（透過背景）で書き出す」・保存先の一覧のまとめての書き出し・「クリップボードにコピー」が同じ倍率で、書いた後の下端が画素数と倍率を言う。描ける上限を超える画素数は描かずに止めて知らせる。
「クリップボードにコピー」(Ctrl+Shift+C・Ctrl+K も同じ)も、押した図の今の本文の図を PNG の書き出しと同じ大きさ・白地で写す。描き直しが届く前に押したら「描き直しが届いたらクリップボードに写します…」と出して届いてから 1 回だけ写し、写したら下端が画素数を言う。描けない本文・待つ間にタブを替えたときは写さずに理由を言い、クリップボードは前のまま。

### フォルダで図を扱う

- フォルダを開く・替える: 保存先は「保存先のフォルダを選ぶ…」の 1 つの窓(FILES の右クリック・Import ▾・Ctrl+K・⚙ 設定のどれからでも同じ語で開く)でフォルダを辿って選ぶ(パスは打たなくてよい。打つときも窓の中の 1 か所だけ)。保存先を決めるまでは保存・書き出しはブラウザのダウンロードで、FILES の保存先節と保存先の一覧は図を並べずにそう言う。
- 図を見つけて開く: FILES ツリーに保存先とその下のフォルダが実在の階層のまま出る。図を押して開き、絞り込み欄と Ctrl+P で名前から引く(同じ名前の図はフォルダの道で見分ける)。
- 作る・移す・名前を変える・消す: フォルダの右クリックで「新しい図」「新しいフォルダ」、図の右クリックで名前変更・複製・移動(保存先の下のフォルダへ)・削除。開いているタブは新しい場所に付いていき、消した図は「この図の履歴」から戻せる。
- まとめて扱う一覧: 保存フォルダの一覧(「保存先の一覧を開く」。FILES の保存先の右クリック・Import ▾・Ctrl+K のどれからでも同じ語で開く)で保存先の直下の図を並べて絞り、印を付けてまとめて開く・まとめて書き出す。保存先の下のフォルダの図も「サブフォルダの図」の節に道付き(`hw/a`)で並び、開かずに印を付けて直下の図と 1 回で書き出せる(それぞれの図のフォルダの置き場に図の名前で書く)。
- 読むだけ: 隣のフォルダの図を書かずに開いて見る「読むだけ」節。
- GIT: 保存先の Git の変更・履歴を見る GIT 節。

### 図をまたいで名前を替える

ツール ▾ → 部品名を一括置換する(Ctrl+H)で、開いている図と保存先の図をまたいで部品名を替える。「保存先の下の全部の図も数える (サブフォルダの図も)」で、保存先の直下とその下のどの階層の図も道付き(`hw/a`)で数えて当て、同じ名前の図はフォルダの道で見分ける。直前の置換は窓の「置換前に戻す (N 枚)」1 押しで、開いている図も開いていない図も全部置換前に戻る(先に Ctrl+Z で戻した図は二重に戻さない)。過去の置換の組を押すと両欄が埋まる。置換の組は保存先に書かない。

### 配布と確かめる入口

Windows 単体アプリ(portable zip / インストーラ。`start.bat`・`PlantUMLAssist.exe`)、⚙ 設定 → 情報「更新を確認」、確かめる入口 `scripts\build.ps1` / `test.ps1` / `verify.ps1`。

## セットアップ

> **初回のみ**: リポジトリには PlantUML jar を同梱していません (ライセンス整合性のため)。
> 下記いずれかで `lib/plantuml.jar` を配置してください。

```bash
# macOS / Linux / WSL / Git Bash
bash lib/fetch-plantuml.sh

# Windows PowerShell
.\lib\fetch-plantuml.ps1
```

または PlantUML 公式リリース (https://github.com/plantuml/plantuml/releases) から任意のライセンス変種 (GPLv3 / LGPL / Apache 2.0 / EPL / MIT / BSD) を手動ダウンロードして `lib/plantuml.jar` として配置してください。詳細は `lib/README.md` を参照。

## 起動

> HTML をダブルクリックしても動きません。Python バックエンド経由でアクセスしてください。

```bash
python server.py
```

コンソールに `PlantUMLAssist server starting on http://127.0.0.1:8766` と表示されたら、ブラウザで **http://127.0.0.1:8766/** を開きます。

Windows では `start.bat` をダブルクリックでも起動可能 (server.py を起動してブラウザを自動で開きます)。

**自動停止**: ブラウザタブを閉じるとサーバーも自動で停止します (heartbeat 方式、タブ close 後 2〜6秒以内に終了)。F5 リロードは自動判定で継続。明示的に止めたい場合は `Ctrl+C`。

### Windows アプリ版 (exe / インストーラ)

Python も Java も PlantUML も入っていない相手に配る形です。画面は Web 版と同じ
`plantuml-assist.html` / `src/` を読むので、機能に差はありません。

```bash
python -m pip install pywebview      # 開発機で試すとき
python app.py                        # 窓で開く (Web 版は python server.py のまま)
```

配布物は GitHub Actions (`.github/workflows/windows-app.yml`) が `v*` タグで作ります。
リポジトリにバイナリは入れません。手元で作るなら:

```bash
python -m pip install pywebview pyinstaller
pyinstaller packaging/PlantUMLAssist.spec --noconfirm
iscc packaging\installer.iss           # Inno Setup 6 が要ります
```

- **plantuml.jar は同梱しません**。初回起動後、⚙設定 → レンダリング →
  「jar を選ぶ」でファイルを指定するか、「公式から取得」を押してください。
  選んだ場所は `.assist-prefs.json` (アプリ版では `%APPDATA%\PlantUMLAssist\`) に残ります。
- **Java も同梱しません**。同じ画面に検出結果が出ます。無ければ
  [Temurin](https://adoptium.net/temurin/releases/) を入れてください (Java 11 以上)。
- アプリ版の保存・書き出しはネイティブのファイルダイアログです
  (Web 版はブラウザのダウンロード)。

## 要件

- Python 3 (標準ライブラリのみ、追加パッケージ不要)
- **Java 11 以降 推奨** (常駐 JVM daemon モードで高速化)
  - Java 8〜10 でも動作可能だが、自動的に毎回 JVM 起動する従来モード (低速) にフォールバック
  - online モードのみ使うなら Java 不要
- `lib/plantuml.jar` (**別途ダウンロード必要**、fetch スクリプト提供。推奨版は下の「推奨 PlantUML 版」、約 30 MB)
- `lib/PlantUMLDaemon.java` (リポジトリ同梱、ビルド不要 — Java 11+ の single-file source-launcher が直接実行)

Java がインストールされていない場合は、⚙ 設定の描画エンジンを `online (plantuml.com)` に切替えて使用可能。plantuml.com の公開サーバを利用するため、**業務データは外部送信される** ことに注意。

### 推奨 PlantUML 版

**推奨 PlantUML 版: 1.2026.8**(開発・自動検証はこの版で行う。これより古い版は並行領域が描かれない等の既知の差がある)。

- 推奨版は `lib/PLANTUML_VERSION` の 1 行だけに書く。`lib/fetch-plantuml.ps1` / `.sh`、設定 → レンダリング の「公式から取得」、
  設定欄の版の表示はここを読む
- 設定 → レンダリング に「使用中: 1.2026.3 / 推奨: 1.2026.8」のように使っている版と推奨版が並び、違えば隣の「取得し直す」で推奨版に替えられる。
  版は jar のマニフェストから読む (通信しない)
- 1.2026.3〜1.2026.6 は並行領域 (`--` / `||`) を持つ複合状態で最初の領域しか描かない (残りの領域が黙って消える)。
  これらの版を使っていると、設定欄にその旨が 1 行出る
- Windows アプリのインストーラは jar を同梱しない (初回に「公式から取得」で推奨版を取る)

### Java バージョン別の挙動

| バージョン | 動作 | 初回 render | 2回目以降 |
|---|---|---|---|
| **Java 11+** (推奨) | 常駐 daemon モード。JVM を1回だけ起動して stdin/stdout pipe 通信 | ~400ms (JVM warmup) | **~10-30ms** |
| Java 8 / 9 / 10 | 従来モード (自動フォールバック)。毎回 `java -jar plantuml.jar -pipe` を起動 | ~1.5s | ~1.5s |
| Java 未インストール | local モード使用不可。online モードは使用可 | — | — |

daemon モードでは **ネットワークソケットを一切開きません** (pipe 通信のみ)。外部から daemon プロセスにアクセスすることは OS レベルで不可能です。

### トラブルシューティング

| 症状 | 原因 | 対策 |
|---|---|---|
| "Render error: Failed to fetch" | server.py が起動していない / HTML を `file://` で開いている | `python server.py` を起動し、`http://127.0.0.1:8766/` にアクセス |
| "java not found" (local mode) | Java 未インストール | JDK/JRE 11+ をインストール (Java 8-10 でも動作するが低速)、または online モードへ切替 |
| local mode で毎回数秒かかる | Java 10 以下で daemon モードが起動できず従来モードにフォールバック | Java 11 以降 (LTS: 11 / 17 / 21) にアップグレード推奨 |
| "online render failed: HTTP 4xx/5xx" | plantuml.com のレート制限/障害 | 時間をおいて再試行、または local モードへ切替 |

## テスト

Windows PowerShell から `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\<名前>.ps1` で呼ぶ。どれも exit 0 が緑。

| 入口 | すること |
|---|---|
| `scripts\build.ps1 [-Force]` | `node_modules` が無いときだけ `npm ci`。Java と python が PATH にあること、`lib\plantuml.jar` があることを確かめる (git worktree で jar が無ければ本体のチェックアウトの `lib\` から写す。ダウンロードはしない) |
| `scripts\test.ps1` | unit (`node tests/run-tests.js`) |
| `scripts\verify.ps1 -Scenarios <dir\|files> -Out <絶対パス>` | Playwright で台本の scenario (`tests/scenarios/{persona}-{手順}-{場面}.spec.js`) を回し、`<Out>\summary.json` に scenario ごとの passed / failed・操作から描画までの ms (`renderMs`)・1 操作で動いた本文の行数 (`diffLines`) を書く。フォルダを渡すと既存の e2e のうち `tests/e2e/scenarios` も回す (`-NoE2E` で外す。`tests/e2e/legacy` は `-E2EProject legacy\|all` のときだけ)。scenario のファイルだけ渡すとその scenario だけ、`tests/e2e/` の spec を渡すとその e2e だけ |

試験のサーバは worker ごとに `PUA_DATA_ROOT` (`test-results\e2e-data\`) 付きで起こすので、利用者の本物の保存先と設定には触れない。ポートは `PUA_PORT` から空きを探す。

## 設計ドキュメント

- **製品仕様書**: `docs/spec/product-spec.md`(残した機能の全部)/ 整理表 `docs/spec/feature-triage.md`
- **最初の設計**: `docs/superpowers/specs/2026-04-17-plantuml-assist-design.md`
- **Tier1 master spec**: `docs/superpowers/specs/2026-04-24-plantuml-tier1-complete-master.md`
- **Overlay-driven**: `docs/superpowers/specs/2026-04-26-tier1-overlay-driven-design.md`
- **直接操作 UX チェックリスト**: `docs/direct-manipulation-ux-checklist.md`
- 用語: `CONTEXT.md`。ADR: `docs/adr/` (ADR-101+)。ECN: `docs/ecn/`

## ライセンス

本リポジトリは **MIT** (`LICENSE` 参照)。

`lib/plantuml.jar` は同梱していません。利用者が PlantUML 公式から任意のライセンス変種 (GPLv3 / LGPL / Apache 2.0 / EPL / MIT / BSD) をダウンロードして配置します。jar のライセンスはその配布元の条項に従い、本リポジトリのライセンスとは別扱いです。
