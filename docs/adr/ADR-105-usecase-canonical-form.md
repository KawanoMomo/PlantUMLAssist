# ADR-105: UseCase Canonical DSL Form

- **Status**: Accepted
- **Date**: 2026-04-25
- **Spec reference**: `docs/superpowers/specs/2026-04-25-usecase-design.md` Section 7

## Context

PlantUML UseCase Diagram has multiple equivalent DSL syntaxes for the same semantic element:

- actor: `actor X` / `actor "Label" as X` / `:X:` / `:Label: as X`
- usecase: `usecase X` / `usecase "Label" as X` / `(Label)` / `(Label) as X`
- package: `package "Label" {` / `rectangle "Label" {`

The parser must accept all variants (real-world .puml files use any of them), but the updater must emit ONE canonical form to keep DSL output deterministic and to avoid drift between parser and formatter.

## Decision

UseCase DSL emit uses **keyword-first canonical form**:

- actor: `actor X` (when label==id) / `actor "Label" as X` (when label!=id)
- usecase: `usecase X` (when label==id) / `usecase "Label" as X` (when label!=id)
- package: `package "Label" {` ... `}` (label always quoted for consistency)
- association: `A --> B` (label optional `: text`)
- generalization: `A <|-- B` (parent <|-- child direction)
- include: `A ..> B : <<include>>`
- extend: `A ..> B : <<extend>>`

Short forms (`:X:`, `(L)`, `rectangle`) are accepted on parse but normalized away on emit.

## Rationale

1. **Consistency with Sequence module**: `fmtParticipant` (Sequence) already uses keyword-first (`actor User` / `participant "Name" as Alias`). UseCase follows the same convention for the same reasons.
2. **Grep-friendliness**: `grep -n "usecase\b"` reliably finds all usecase declarations. Short form `(L1)` would also match message labels and parenthesized text in other contexts.
3. **renameWithRefs safety**: Keyword-anchored declarations have less ambiguity around the identifier `\b<id>\b` boundary than bare short-form names embedded in surrounding text.
4. **Round-trip predictability**: Users editing DSL by hand and then re-saving via UI will see their short forms canonicalized. This matches Sequence's behavior (`actor User` ↔ `participant User as User` round-trip).

## Consequences

- Parser test fixtures must include both forms to verify acceptance.
- README must note that PlantUML official samples (which often use short forms) get normalized when round-tripped through PlantUMLAssist.
- Future Tier1 figures (Component, Class, Activity, State) inherit this convention.

## Alternatives Considered

- **Short-form preferred** (e.g., always emit `(Label)` for usecase): rejected because of grep-friendliness and renameWithRefs robustness above.
- **Hybrid** (actor=keyword, usecase=short): rejected because it creates mental load (which form for which element?) and breaks the keyword-form invariant.
