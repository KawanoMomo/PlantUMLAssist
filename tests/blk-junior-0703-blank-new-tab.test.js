'use strict';
// BLK-junior-20260909-0703: 先輩の図を手本に Class 図を白紙から起こそうとして
// 図種を Class にし ＋ (新規タブ) を押すと、雛形にサンプルの User / IAuth クラスと
// 関連が最初から入っていた。手本にも部品にも無いクラスなので、打ち始める前に
// 一旦全消去する一手間が要った。新規タブは白紙で作る。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/blank-doc.js')]; } catch (e) {}
require('../src/core/blank-doc.js');
var BD = global.window.MA.blankDoc;

var CLASS_TEMPLATE = ['@startuml', 'title Sample Class', 'class User {', '  - id : int', '}',
  'interface IAuth {', '  + verify() : bool', '}', 'User ..|> IAuth', '@enduml'].join('\n');
var SEQ_TEMPLATE = ['@startuml', 'title Sample Sequence', 'actor User',
  'User -> System : Request', '@enduml'].join('\n');

// ── blankDsl ────────────────────────────────────────────────────────────
// 白紙は「PlantUML として開ける空の図」。@startuml だけを消して壊さない。
assert.strictEqual(BD.blankDsl(), '@startuml\n@enduml');
assert.strictEqual(BD.blankDsl('plantuml-class'), '@startuml\n@enduml');
assert.strictEqual(BD.isBlank(BD.blankDsl()), true);
// 活動図の start / stop は見本ではなく骨格。ここまで消すと 1 工程足すのに
// start / stop を手で打つことになり、かえって手数が増える。
assert.strictEqual(BD.blankDsl('plantuml-activity'), '@startuml\nstart\nstop\n@enduml');
assert.strictEqual(BD.isBlank(BD.blankDsl('plantuml-activity'), 'plantuml-activity'), true);
// 骨格の間に 1 工程でも入れば、もう白紙ではない。
assert.strictEqual(
  BD.isBlank('@startuml\nstart\n:受信を待つ;\nstop\n@enduml', 'plantuml-activity'), false);

// ── isBlank ─────────────────────────────────────────────────────────────
// @start/@end・コメント・空行は「中身」に数えない (打ち始めていない図)。
assert.strictEqual(BD.isBlank(''), true);
assert.strictEqual(BD.isBlank('@startuml\n\n  \n@enduml'), true);
assert.strictEqual(BD.isBlank("@startuml\n' 覚え書き\n@enduml"), true);
// 1 行でも図の中身があれば白紙ではない。
assert.strictEqual(BD.isBlank('@startuml\nclass Timer_Driver\n@enduml'), false);
assert.strictEqual(BD.isBlank('@startuml\ntitle TIMER\n@enduml'), false);

// ── isUntouched ─────────────────────────────────────────────────────────
// 見本のまま 1 文字も直していない図は「自分の中身はまだ無い」。
assert.strictEqual(BD.isUntouched(CLASS_TEMPLATE, CLASS_TEMPLATE), true);
// 行頭の空白やインデントの差だけなら同じ扱い。
assert.strictEqual(BD.isUntouched('@startuml\n  title Sample Class\n@enduml',
  '@startuml\ntitle Sample Class\n@enduml'), true);
// 1 行でも足せば自分の中身。
assert.strictEqual(BD.isUntouched(CLASS_TEMPLATE + '\nclass Timer_Driver', CLASS_TEMPLATE), false);
// 白紙も「まだ中身が無い」側。
assert.strictEqual(BD.isUntouched(BD.blankDsl(), CLASS_TEMPLATE), true);
// 見本と無関係の図は当然ちがう。
assert.strictEqual(BD.isUntouched(SEQ_TEMPLATE, CLASS_TEMPLATE), false);

// ── dslForTypeSwitch ────────────────────────────────────────────────────
// 白紙のタブで図種を Class に選び直しただけなら、白紙のまま
// (ここで見本が降ってくると、打ち始める前に全消去する一手間が生まれる)。
assert.strictEqual(
  BD.dslForTypeSwitch(BD.blankDsl(), null, CLASS_TEMPLATE, SEQ_TEMPLATE,
    { fromType: 'plantuml-sequence', toType: 'plantuml-class' }),
  BD.blankDsl());
// 白紙のタブを活動図にすると、骨格 (start / stop) だけが出る。
assert.strictEqual(
  BD.dslForTypeSwitch(BD.blankDsl(), null, '@startuml\nstart\n:Hello world;\nstop\n@enduml', SEQ_TEMPLATE,
    { fromType: 'plantuml-sequence', toType: 'plantuml-activity' }),
  '@startuml\nstart\nstop\n@enduml');
// 見本のまま触っていないタブでも同じ。
assert.strictEqual(
  BD.dslForTypeSwitch(SEQ_TEMPLATE, null, CLASS_TEMPLATE, SEQ_TEMPLATE),
  BD.blankDsl());

// その図種で前に書いたものが残っていれば、従来どおりそれを戻す (白紙で潰さない)。
var saved = '@startuml\nclass Timer_Driver\n@enduml';
assert.strictEqual(
  BD.dslForTypeSwitch(BD.blankDsl(), saved, CLASS_TEMPLATE, SEQ_TEMPLATE), saved);

// 中身のある図の図種を切り替えたときは、従来どおり切り替え先の見本を出す
// (何も無い画面にしない)。
assert.strictEqual(
  BD.dslForTypeSwitch('@startuml\nactor 運転手\n運転手 -> Timer : start\n@enduml',
    null, CLASS_TEMPLATE, SEQ_TEMPLATE),
  CLASS_TEMPLATE);

console.log('    ✓ BLK-junior-20260909-0703 新規タブは白紙');
