# server API

`server.py` が受ける窓口の一覧。**正本は動いている server 自身** で、`GET /api` が同じ索引を
JSON で返す。curl / node から使うときは、まずこれを叩けば呼び出し側 (`src/app.js`) を
grep しなくて済む。

```
curl -sS http://127.0.0.1:8766/api            # 索引
curl -sS http://127.0.0.1:8766/render         # POST /render の仕様
```

ポートは `PUA_PORT` で変わる (既定 8766)。

## 応答の文字コード

JSON の応答は既定で utf-8 (`Content-Type: application/json; charset=utf-8`)。日本語が
端末で化けるときは、呼ぶ側が文字コードを選べる。宣言する charset と実バイト列は常に一致する。

```
curl -sS "http://127.0.0.1:8766/render?charset=ascii"              # \uXXXX 逃がしの純 ASCII
curl -sS -H "Accept-Charset: shift_jis" http://127.0.0.1:8766/api  # cp932 (日本語 Windows の端末)
```

`?charset=` は GET で、`Accept-Charset:` は GET / POST どちらでも効く
(POST の窓口はパスを完全一致で見るので、クエリではなくヘッダで指定する)。
`ascii` / `us-ascii`、`cp932` / `ms932` / `sjis` / `shift_jis` / `shift-jis`、`utf-8` / `utf8` を解する。
知らない名前は utf-8 に落ちる。cp932 に無い文字 (絵文字など) は JSON の `\uXXXX` に逃がす。

## 描画

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /render` | — | `POST /render` の仕様 |
| `POST /render` | `{text, mode, dir}` | 200 `image/svg+xml` / 400 `{error}` / 422 `{error, line}` |
| `POST /preproc` | `{text}` | 200 `{ok: true, lines}` (同梱 jar のプリプロセッサで展開した最初の図の行) / 200 `{ok: false, error}` / 400 `{error}` |

`text` は `@startuml … @enduml` の DSL 全文 (入力の名前はこれ 1 つ。無ければ 400 が受け取ったフィールドを並べる)。
`mode` は `local` (既定) か `online`。`dir` は任意で、相対の `!include` を探すその図のフォルダ。


## 保存フォルダ

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /autosave` | `?dir=&type=` | 図の一覧 (`dsl` `hash` など)。`type` 付きは 1 枚の本文 (LF) と、ディスクの改行・文字コードを見出し `X-Pua-Eol` `X-Pua-Encoding` `X-Pua-Bom` で返す |
| `POST /autosave` | `{type, dir, dsl, eol?, bom?}` | 図の DSL を保存する。`eol` `bom` が無ければ上書きする相手のファイルの改行・BOM を引き継ぎ、書いた値を `eol` `encoding` `bom` で返す。書くバイトがディスクの `.puml` と同じなら書き直さず (更新時刻を進めない) `written: false` を返す (保存済みであることは同じ) |
| `DELETE /autosave` | `?dir=&type=` | 保存を消す |
| `GET /autosave-versions` | `?dir=&type=` | 1 枚の図の版の一覧 |
| `GET /peek-dirs` | — | 保存フォルダの候補を覗く |
| `GET /browse-dir` | — | 保存先を選ぶ窓でフォルダを辿る (`?dir=`。子フォルダ・親・ドライブ・.puml の枚数。読むだけ) |
| `GET /export-file` | `?dir=&name=&sub=` | 置き場の書き出し (SVG / PNG / 透過 PNG) が保存先の `.puml` より古いか `{ok, exports:[{kind, rel, exists, stale}]}`。更新時刻だけで判定し、読むだけ (保存先に何も書かない) |
| `GET /tree-dir` | `?dir=` | 保存先の下のサブフォルダを実在の階層のまま `{ok, root, dirs:[{rel, path, name, depth, files}]}` (隠しフォルダ・`_versions` は出さない。読むだけ) |
| `GET /git-status` | `?dir=` | 保存先が Git 作業木なら `{repo, branch, ahead, behind, changes:[{code, file, name}]}`。作業木でなければ `{repo:false}`。読むだけで通信しない |
| `GET /git-log` | `?dir=&file=` | その図 (file 省略で保存先全体) に関係するコミット `{commits:[{hash, short, author, date, message, tags, head, added, removed}]}` |
| `GET /git-refs` | `?dir=` | ブランチとタグ `{current, branches, tags}` |
| `GET /git-show` | `?dir=&file=&rev=` | rev 時点の `{file}.puml` の本文 `{text}`。無ければ 404 |
| `POST /git-commit` | `{dir, message}` | 保存先の変更を全部載せてコミット `{ok, short}`。失敗は 409 `{error}` |
| `POST /git-pull` | `{dir}` | 取得 (`pull --ff-only`)。画面で押したときだけ呼ぶ |
| `POST /git-push` | `{dir}` | 送信 (`push`)。画面で押したときだけ呼ぶ。認証は OS の git |
| `POST /git-checkout` | `{dir, branch}` | ブランチ切り替え |
| `GET /peek-notes` | `?dir=` | 隣のフォルダに置かれた指摘 (`.md`) を読む |

書き出しが今の puml より古いかは `GET /export-file` が更新時刻で答える (描き直して比べる窓口 `/verify-svg` は
TICKET-owner-20261116-0241-prune、書き出した svg に印を刻む口と保存フォルダの親の確認済みの台帳は TICKET-owner-20261123-0642-prune で外した)。

## 保管庫・設定・生存

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /tickets` | `?dir=` | 変更チケットの一覧 |
| `POST /tickets` | `{dir, ticket}` | 変更チケットを 1 枚書く (id ごと置き換え) |
| `DELETE /tickets` | `?dir=&id=` | 変更チケットを 1 枚消す |
| `GET /rename-pairs` | `?dir=` | そのフォルダで打たれた置換の組 (新しい順) |
| `POST /rename-pairs` | `{dir, from, to, hits}` | 置換の組を 1 つ覚える (同じ組は 1 行)。組は保存先ではなく設定の置き場 (保存先ごと) に書く。保存先に前からある `_renames/pairs.json` は読むだけ |
| `GET /version` | — | アプリの版・コミット・日付 (`{version, commit, date}`。git tag が正本) |
| `GET /update-check` | — | 押したときだけ GitHub Releases の latest を 1 回読み `{current, release:{tag_name, html_url, assets}}` か `{current, error}`。落とさない・実行しない |
| `POST /open-url` | `{url}` | このリポジトリの GitHub の URL だけを既定のブラウザで開く。他の URL は 400 |
| `POST /file-op` | `{op, dir, name, to?, toDir?}` | FILES ツリーの右クリック (design 10b)。`op` は `rename` / `copy` / `move` / `reveal`。行き先に同名があれば 409 (上書きしない)。過去版は動かさない |
| `GET /prefs` | — | この機械に保存した設定 |
| `GET /data-root` | — | 設定と既定の保存先の置き場所 `{dataRoot, sandbox}`(sandbox は `PUA_DATA_ROOT` で起こしたテスト用。sandbox のサーバは相対の保存先(既定の `./autosave`)を作業フォルダではなく dataRoot の下に解く) |
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
