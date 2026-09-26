# server API

`server.py` が受ける窓口の一覧。**正本は動いている server 自身** で、`GET /api` が同じ索引を
JSON で返す。curl / node から使うときは、まずこれを叩けば呼び出し側 (`src/app.js`) を
grep しなくて済む。

```
curl -sS http://127.0.0.1:8766/api            # 索引
curl -sS http://127.0.0.1:8766/render         # POST /render の仕様
curl -sS http://127.0.0.1:8766/verify-svg     # POST /verify-svg の仕様
```

ポートは `PUA_PORT` で変わる (既定 8766)。

## 応答の文字コード

`POST /verify-svg` の 400 は、日本語の `error` / `expected.fields` と並べて
**ASCII だけの言い直し** (`errorAscii` と `expected.fieldsAscii`、それに ASCII の `example`) を必ず返す。
端末の文字コードが何であれ、返ってきた応答をそのまま読めば正しい形が分かる (打ち直しは要らない)。

JSON の応答は既定で utf-8 (`Content-Type: application/json; charset=utf-8`)。日本語が
端末で化けるときは、呼ぶ側が文字コードを選べる。宣言する charset と実バイト列は常に一致する。

```
curl -sS "http://127.0.0.1:8766/verify-svg?charset=ascii"          # \uXXXX 逃がしの純 ASCII
curl -sS -H "Accept-Charset: shift_jis" http://127.0.0.1:8766/api  # cp932 (日本語 Windows の端末)
```

`?charset=` は GET で、`Accept-Charset:` は GET / POST どちらでも効く
(POST の窓口はパスを完全一致で見るので、クエリではなくヘッダで指定する)。
`ascii` / `us-ascii`、`cp932` / `ms932` / `sjis` / `shift_jis` / `shift-jis`、`utf-8` / `utf8` を解する。
知らない名前は utf-8 に落ちる。cp932 に無い文字 (絵文字など) は JSON の `\uXXXX` に逃がす。

## 描画

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /render` | — | `POST /render` の仕様 (別名・比較の注意つき) |
| `POST /render` | `{text, mode}` | 200 `image/svg+xml` / 400 `{error}` / 422 `{error, line}` |

`text` は `@startuml … @enduml` の DSL 全文。`dsl` `source` `uml` `puml` `diagram` は別名として
受理されるが、正式な名前は `text` (別名で送ると `X-PlantUMLAssist-Warning` が付く)。
`mode` は `local` (既定) か `online`。

この応答の SVG には `<!-- @pua-source-sha1 ... -->` の印が**付かない**。保存済みの
`{name}.svg` には付くので、この 2 つの生バイト比較は内容が同じでも必ず食い違う。

## 保存中の svg の検証

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /verify-svg` | — | `POST /verify-svg` の仕様 |
| `POST /verify-svg` | `{dir, types: [名前...], mode}` | 200 `{ok, results, verified}` / 400 `{error, errorAscii, expected}` |

**puml と svg は本文に渡さない。** server が `dir` と `types` (拡張子なしの図の名前) から読む。
`types` は 1〜200 件の必須。`dir` を省くと既定の保存フォルダ。1 枚あたり数百 ms かかる。

```
curl -sS -X POST http://127.0.0.1:8766/verify-svg -H "Content-Type: application/json" \
  -d '{"dir": "E:/01_Loop/persona-data/primary", "types": ["spi_init_sequence"], "mode": "local"}'
```

`results[name].status`:

| status | 意味 |
| --- | --- |
| `match` | バイトまで一致した |
| `differ-format` | 描かれる中身 (文字・図形の数) は一致。体裁だけが違うので作り直さなくても読める |
| `differ-content` | 描かれるものが違う。作り直しが要る |
| `missing` | svg が無い |
| `error` | 描けなかった (判定していない) |

`differ-*` のときは中身を言うための材料 (`pumlText` `svgLabels` `drawnLabels` `svgShape`
`drawnShape`) が付く。

## 保存フォルダ

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /autosave` | `?dir=&type=` | 図の一覧 (`dsl` `hash` `svgSource` など) |
| `POST /autosave` | `{type, dir, dsl}` | 図の DSL を保存する |
| `DELETE /autosave` | `?dir=&type=` | 保存を消す |
| `POST /autosave-svg` | `{type, dir, svg}` | 書き出した svg を保存する (印を刻む) |
| `GET /autosave-versions` | `?dir=&type=` | 1 枚の図の版の一覧 |
| `GET /version-search` | `?dir=&q=` | 保存フォルダの全図の版から部品名を探す (混入点の材料) |
| `GET /version-diff` | `?dir=&type=[&stamp=]` | 1 枚の図の「その版」と「直前の版」の本文を組で返す (全文差分の材料) |
| `GET /peek-dirs` | — | 保存フォルダの候補を覗く |
| `GET /git-status` | `?dir=` | 保存先が Git 作業木なら `{repo, branch, ahead, behind, changes:[{code, file, name}]}`。作業木でなければ `{repo:false}`。読むだけで通信しない |
| `GET /git-log` | `?dir=&file=` | その図 (file 省略で保存先全体) に関係するコミット `{commits:[{hash, short, author, date, message, tags, head, added, removed}]}` |
| `GET /git-refs` | `?dir=` | ブランチとタグ `{current, branches, tags}` |
| `GET /git-show` | `?dir=&file=&rev=` | rev 時点の `{file}.puml` の本文 `{text}`。無ければ 404 |
| `POST /git-commit` | `{dir, message}` | 保存先の変更を全部載せてコミット `{ok, short}`。失敗は 409 `{error}` |
| `POST /git-pull` | `{dir}` | 取得 (`pull --ff-only`)。画面で押したときだけ呼ぶ |
| `POST /git-push` | `{dir}` | 送信 (`push`)。画面で押したときだけ呼ぶ。認証は OS の git |
| `POST /git-checkout` | `{dir, branch}` | ブランチ切り替え |
| `GET /peek-notes` | `?dir=` | 隣のフォルダに置かれた指摘 (`.md`) を読む |
| `GET /name-registry` | `?dir=` | 保存フォルダの**親**にある正式表記の登録簿 (`_names.json`。3 人で共有) |
| `POST /name-registry` | `{dir, entries}` | 正式表記の登録簿を丸ごと置き換える |
| `GET /cohort-ack` | `?dir=` | 保存フォルダの**親**にある確認済みの組の台帳 (`_cohort-ack.json`。ドメイン突合で内部揺れと確かめた組) |
| `POST /cohort-ack` | `{dir, entries}` | 確認済みの組の台帳を丸ごと置き換える |
| `GET /meeting-log` | `?dir=` | 保存フォルダの `_meetings.json` にある、会議セットで並べた日時の控え (古い順)。▤ 変更サマリボードの「変更前 = 前回の会議」が読む |
| `POST /meeting-log` | `{dir, at}` | 会議セットで並べた日時を 1 つ足す (1 日 1 件。同じ日はその日の最後の時刻に置き換える) |
| `POST /file-roles` | `{dir, roles}` | `_roles.json` を丸ごと置き換える |
| `POST /export-zip` | `{dir, name, base64}` | 書き出した zip を保存フォルダに置き、書けたバイト数を返す |
| `POST /export-log` | — | 書き出しの控えを 1 件足す |

`GET /version-search` の `q` は空白区切りの語 (最大 6 語)。返りは
`{terms, dir, scanned, files:[{name, versions:[{stamp, current, counts, lines}]}]}` で、
版は古い順・最後の 1 件が `current: true` (まだ控えになっていない今の中身。更新時刻 `mtime` (UTC) 付き)。
`ci=1` を付けると大文字小文字を無視する (▤ 影響を見る の「版履歴を症状の語で探す」が使う)。
`counts` は語ごとの出現数、`lines` は当たった行だけ (1 版 40 行まで)。本文は返さない。
どの版で増えたか・混在がどこから始まったかの判定は GUI 側 (`src/core/blame-point.js`)。

`GET /version-diff` は混入点の行から 1 クリックで開く全文差分の材料。返りは
`{name, dir, stamp, current, prev, first, before, after}` で、`before` が直前の版・
`after` がその版の本文 (全文)。`stamp` を省くと「いまの中身」と最新の控えを比べる。
最古の控えを指したときは直前が無いので `prev: null` / `first: true` / `before: ""`。
行の突き合わせと畳みは GUI 側 (`src/core/version-fulldiff.js`、LCS は `version-diff.js`)。

保存中の svg が今の puml から作られたかは、`GET /autosave` の `svgSource` (svg に刻まれた印) と
`hash` (今の puml の sha1) を比べる。印が無い svg は `POST /verify-svg` が描き直して確かめる。

## 保管庫・設定・生存

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /vault` | `?dir=` | 保管庫の中身 |
| `POST /vault` | — | 保管庫へ入れる |
| `GET /tickets` | `?dir=` | 変更チケットの一覧 |
| `POST /tickets` | `{dir, ticket}` | 変更チケットを 1 枚書く (id ごと置き換え) |
| `DELETE /tickets` | `?dir=&id=` | 変更チケットを 1 枚消す |
| `GET /peek-settled` | `?dir=` | 手本なしで確定した (相手, 図種) の一覧。確定した組は 👀他フォルダで聞き直さない |
| `POST /peek-settled` | `{dir, peer, kind, settled}` / `{dir, clear: true}` | 確定を 1 つ足す (`settled: false` で外す) / 全部外す |
| `GET /rename-pairs` | `?dir=` | そのフォルダで打たれた置換の組 (新しい順) |
| `POST /rename-pairs` | `{dir, from, to, hits}` | 置換の組を 1 つ覚える (同じ組は 1 行) |
| `GET /doc-sets` | `?dir=` | そのフォルダに登録した資料セット (名前を付けた図の組) |
| `POST /doc-sets` | `{dir, name, docs}` | 資料セットを 1 つ登録する (同じ名前は置き換え) |
| `DELETE /doc-sets` | `?dir=&name=` | 資料セットを 1 つ消す |
| `GET /version` | — | アプリの版・コミット・日付 (`{version, commit, date}`。git tag が正本) |
| `GET /update-check` | — | 押したときだけ GitHub Releases の latest を 1 回読み `{current, release:{tag_name, html_url, assets}}` か `{current, error}`。落とさない・実行しない |
| `POST /open-url` | `{url}` | このリポジトリの GitHub の URL だけを既定のブラウザで開く。他の URL は 400 |
| `POST /file-op` | `{op, dir, name, to?, toDir?}` | FILES ツリーの右クリック (design 10b)。`op` は `rename` / `copy` / `move` / `reveal`。行き先に同名があれば 409 (上書きしない)。過去版は動かさない |
| `GET /prefs` | — | この機械に保存した設定 |
| `GET /data-root` | — | 設定と既定の保存先の置き場所 `{dataRoot, sandbox}`(sandbox は `PUA_DATA_ROOT` で起こしたテスト用) |
| `POST /prefs` | — | 設定を書く |
| `GET /env` | — | Java / jar の有無、`app` (アプリ版か)、`javaUrl` (Java が無いときの案内先) |
| `POST /jar-path` | `{path}` | 描画に使う plantuml.jar の場所を設定する。無いファイル・`.jar` でないものは 400 |
| `POST /pick-jar` | — | アプリ版: ファイルダイアログで jar を選ぶ。Web 版は 409 |
| `POST /fetch-jar` | — | アプリ版/Windows: `lib/fetch-plantuml.ps1` で公式から jar を取る。使えない環境は 409 |
| `POST /native-save` | `{fileName, text` または `base64}` | アプリ版: 保存ダイアログを出して書き、`{path}`。やめたら `{canceled:true}`。Web 版は 409 |
| `POST /native-open` | — | アプリ版: 開くダイアログ (複数選択) で .puml を読み、`{files:[{path, name, text, encoding, bom, eol}]}`。Web 版は 409 |
| `POST /native-write` | `{path, text, encoding, bom}` | 開いた元の .puml / .plantuml / .uml / .txt へ書き戻す。Shift_JIS は cp932 で書き、書けない字があれば 400。無いファイルには書かない |
| `POST /heartbeat` | — | 204。無音 300 秒で server は自分で落ちる |
| `POST /shutdown` | — | 204。停止を予約する (Java は残るので別に止める)。環境変数 `PUA_NO_IDLE_EXIT=1` で起こした server は何もしない (無音 3 時間で落ちる安全弁だけ残る) |
