# scenarios — テストの正本

ペルソナ台本(`E:\01_Loop\loop\personas\{persona}.md` の「今日の業務」)の手順と 1 対 1 に対応する spec を置く。

- ファイル名: `{persona}-{手順番号}-{要約}.spec.js`(例: `junior-03-save-target.spec.js`)
- 1 ファイル = 台本の 1 手順。手順の到達条件(保存先にファイルがある、置換のヒット数が出る、など)を assert にする
- 機能を追加したときは既存の spec を書き換える。**新しい spec ファイルを作れるのは台本に手順が増えたときだけ**
- 機能固有の細部は unit テスト(`tests/*.test.js`)で守る。ここには置かない
- helpers は `require('../helpers')`。テストが作る保存フォルダ・画像は `test-results/` 配下のみ

実行: `npm run test:e2e`(scenarios のみ) / `npm run test:e2e:all`(scenarios + legacy)

`tests/e2e/legacy/` は作り直し前の 311 本。シナリオが同じ操作を検証するようになった順に削除していく。
