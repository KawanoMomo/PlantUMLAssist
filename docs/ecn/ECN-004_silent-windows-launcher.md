# ECN-004: Windows 向け無音ランチャー (pythonw)

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: `4e0a507`, `4492bec` の一部
- **影響ファイル**: start.bat, README.md

## コンテキスト

PlantUMLAssist は backend サーバ必須なので「HTML ダブルクリックで動かない」という最初の質問が出た。`python server.py` のための cmd ウィンドウが開いたままになるのも邪魔というフィードバック。

## 対策

1. `start.bat` を用意し、ダブルクリックでサーバ起動 + ブラウザ自動オープン
2. `python` ではなく `pythonw` で起動することでコンソール無しに（`pythonw.exe` は print() が破棄されるが GUI ユーザが目にするのはブラウザだけなので問題ない）
3. batch 自体も `start "" pythonw server.py` で detached 起動して `exit /b 0` で即終了、cmd ウィンドウが残らない
4. README に `start.bat` 案内 + 「HTML を直接開いても動きません」の警告 + トラブルシュート表を追加

## 結果

ユーザーは `start.bat` ダブルクリックだけで使える状態。止めるときはタブを閉じるだけ（ECN-005 の auto-shutdown と組み合わせ）。

## 教訓

- 開発者ツールでも「Python 知らない人が使える」視点を忘れない。`pythonw` の存在は Python 初学者には知られていない
- ダブルクリック起動 + 自動ブラウザオープン + 無音 は小規模ローカルアプリの UX 基礎
