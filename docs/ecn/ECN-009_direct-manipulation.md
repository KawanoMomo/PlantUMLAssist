# ECN-009: Sequence 直接操作 UX 強化 (UC-11〜16)

- **ステータス**: 適用済
- **種別**: 改善
- **対象コミット**: Sprint 8-11 (selection highlight / hover-insert / pulldown-new / keyboard / drag+color / undo coverage)
- **影響ファイル**: plantuml-assist.html, src/ui/sequence-overlay.js, src/modules/sequence.js, src/ui/rich-label-editor.js, src/app.js

## コンテキスト

Sprint 1-7 で overlay click→selection→props 編集の基盤は完成したが、6 つの UX ギャップが残った。

## 対策

- C14: 選択ハイライト (青枠 + 薄青塗り) — `setSelectedHighlight` + CSS class `selected`
- C15/C16: hover 水平点線 + click で modal 挿入 — `#hover-layer` SVG + `resolveInsertLine`
- C17: pulldown `+ 新規追加` で participant 先行作成
- C18: StableState 互換 keyboard (Tab=2空白 / Escape / 改行 → `\n`)
- C19: participant drag 並び替え (閾値判定 + ghost + drop indicator) + 色パレット (#HEX suffix)
- C20: 全 change handler で pushHistory() 網羅

## 結果

- 6 UC (UC-11〜UC-16) 全 PASS
- unit +15, E2E +6

## 教訓

- overlay class toggle で視覚状態を表現するパターン (rebuild より安定)
- rich editor の keyboard 契約を明確化 — Tab=2空白/Escape/改行変換
- drag の閾値判定 (>4px) で click との競合を回避する鉄板パターン
- pushHistory は mount closure 単位 (per-session boolean flag) で 1 回、keystroke 単位で多発させない
