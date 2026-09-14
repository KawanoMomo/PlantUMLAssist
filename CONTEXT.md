# PlantUMLAssist

GUI editor for PlantUML notation. This glossary fixes the canonical domain language shared by the diagram modules; module code, ADRs, and specs should use these terms (and avoid the listed alternatives).

## Language

### Activity diagram

**Node**:
A single addressable element in an activity flow — the unit the parser model and the SVG overlay both refer to.
_Avoid_: element, item, shape

**Action**:
A single processing step, written `:text;`. A leaf node.
_Avoid_: activity, task, step, process

**Decision**:
The header of an `if` / `while` / `repeat` construct (rendered as a diamond).
_Avoid_: condition node, branch point, gateway

**Composite node**:
A node that owns one or more nested bodies — `if`, `while`, `repeat`, `fork`, `split`. It is moved and deleted as one atomic unit, never split from its bodies.
_Avoid_: block, container, group

**Fork**:
A composite whose branches run concurrently (`fork` / `fork again` / `end fork`).

**Split**:
A composite whose branches are separate parallel flows (`split` / `split again` / `end split`). Structurally mirrors Fork (branches, atomic move); kept distinct because the rendered semantics differ.

**Leaf node**:
A node with no nested body — action, start, stop, end, swimlane, note.

**Branch**:
One arm of a composite: the then / elseif / else arm of an `if`, or one arm of a `fork`.
_Avoid_: path, case, route

**Body**:
The ordered sequence of child nodes directly contained by a composite or a branch.
_Avoid_: contents, children list

**Sibling**:
Nodes that share the same immediate parent body. Reordering moves a node only among its siblings.
_Avoid_: neighbor, adjacent node
