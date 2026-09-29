'use strict';
// BLK-owner-20260924-2337-prune: 「既存の図から新しい図を起こす」入口は ツール ▾ の 1 行。
// 部品を起こす・テンプレート・骨格・系統ごと複製の 4 行を 1 行にし、何から起こすかは窓の上端で選ぶ。
// 旧名はその 1 行を引く語として残す (別の行として並べない)。

const TM = () => window.MA.toolMenu;
const OLD = ['btn-tab-part', 'btn-tab-skeleton', 'btn-tab-set'];

describe('新しい図を起こす入口は 1 行 (BLK-owner-20260924-2337-prune)', () => {
  test('ツール ▾「図をつくる」の「起こす」は 1 行で、旧い 3 行は無い', () => {
    const ids = TM().menuIds();
    OLD.forEach((id) => expect(ids).not.toContain(id));
    expect(ids).toContain('btn-tab-template');
    expect(TM().labelOf('btn-tab-template')).toBe('既存の図や雛形から新しい図を起こす…');
    expect(TM().groupOf('btn-tab-template')).toBe('make');
  });

  test('旧名で絞り込んでも、その 1 行だけに当たる', () => {
    ['部品を起こす', 'テンプレート', '骨格', 'セット複製', '系統ごと複製'].forEach((q) => {
      const hits = TM().filterItems(q).map((h) => h.id);
      expect(hits).toContain('btn-tab-template');
      OLD.forEach((id) => expect(hits).not.toContain(id));
    });
  });
});
