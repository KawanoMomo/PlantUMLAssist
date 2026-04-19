# ECN-003: online render の User-Agent 付与による 403 回避

- **ステータス**: 適用済
- **種別**: 不具合修正
- **対象コミット**: `e937018`
- **影響ファイル**: server.py

## コンテキスト

`render-mode = online` で plantuml.com にリクエストを送ると HTTP 403 Forbidden が返ってくるバグ。エラー画面は「Render error: Failed to fetch」と表示され原因が不明瞭だった。

## 問題の詳細

Python urllib のデフォルト User-Agent は `Python-urllib/3.x`。plantuml.com はこの UA を自動でブロックする。
さらにその前段でサーバ自体が落ちていた場合（heartbeat auto-shutdown のテスト時）、ブラウザ側は「Failed to fetch」というネットワークエラーになり、500+JSON の本来のエラーが見えない構造になっていた。

## 対策

```python
req = urllib.request.Request(url, headers={
    'User-Agent': 'PlantUMLAssist/0.1 (+https://github.com/KawanoMomo)',
    'Accept': 'image/svg+xml',
})
```

+ HTTPError を個別 catch して HTTP コードと body(先頭200文字) をエラーメッセージに乗せるよう改善。URLError は `.reason` のみ表示。

## 結果

Online モードで SVG が正常取得 (3198 bytes 確認)。エラー時も HTTP コード付きで原因判明。

## 教訓

- 外部公開サーバへ Python urllib で叩くときは **必ず UA を明示**する。多くのサイトがデフォルト UA を弾く
- 「Failed to fetch」というブラウザエラーは「サーバがそもそも生きていない」可能性を含む。エラー表示段階でサーバの生存確認手順を誘導すべき（README トラブルシュート表に記載済）
