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
| `POST /verify-svg` | `{dir, types: [名前...], mode}` | 200 `{ok, results, verified}` / 400 `{error, expected, example}` |

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
| `GET /peek-dirs` | — | 保存フォルダの候補を覗く |
| `POST /file-roles` | `{dir, roles}` | `_roles.json` を丸ごと置き換える |
| `POST /export-log` | — | 書き出しの控えを 1 件足す |

保存中の svg が今の puml から作られたかは、`GET /autosave` の `svgSource` (svg に刻まれた印) と
`hash` (今の puml の sha1) を比べる。印が無い svg は `POST /verify-svg` が描き直して確かめる。

## 保管庫・設定・生存

| 窓口 | 要求 | 返り |
| --- | --- | --- |
| `GET /vault` | `?dir=` | 保管庫の中身 |
| `POST /vault` | — | 保管庫へ入れる |
| `GET /prefs` | — | この機械に保存した設定 |
| `POST /prefs` | — | 設定を書く |
| `GET /env` | — | Java / jar の有無など実行環境 |
| `POST /heartbeat` | — | 204。無音 300 秒で server は自分で落ちる |
| `POST /shutdown` | — | 204。停止を予約する (Java は残るので別に止める) |
