# ADR-106: Component Canonical DSL Form

- **Status**: Accepted
- **Date**: 2026-04-25
- **Spec reference**: `docs/superpowers/specs/2026-04-25-component-design.md` Section 7

## Context

PlantUML Component Diagram has multiple equivalent DSL syntaxes:
- component: `component X` / `component "Label" as X` / `[X]` / `[X] as A`
- interface: `interface X` / `interface "Label" as X` / `() X`
- package boundary: `package "L" {` / `folder "L" {` / `frame "L" {` / `node "L" {` / `rectangle "L" {`
- lollipop: `component -() interface` (provides) / `interface )- component` (requires) / reverse forms

The parser must accept all variants but the updater must emit ONE canonical form.

## Decision

Component DSL emit uses keyword-first canonical form:

- component: `component X` (when label==id) / `component "Label" as X` (when label!=id)
- interface: `interface X` / `interface "Label" as X`
- port: `port X` (placed on line directly after parent component)
- package: `package "Label" {` ... `}` (label always quoted)
- association: `A -- B` (label optional `: text`)
- dependency: `A ..> B`
- provides (lollipop): `component -() interface`
- requires (lollipop): `interface )- component`

Short forms (`[X]`, `() X`, `folder`/`frame`/`node`/`rectangle`) are accepted on parse but normalized away on emit.

## Rationale

1. Consistency with ADR-105 (UseCase) keyword-first principle
2. Grep-friendliness: `grep -n "component\b"` reliably finds component declarations
3. renameWithRefs robustness: keyword anchors reduce identifier match ambiguity
4. Round-trip predictability: short-form input gets normalized on save

## Consequences

- Parser test fixtures must include both forms
- README must note that PlantUML official samples (which often use short forms) get normalized
- Future Tier1 figures (Class, Activity, State) inherit this convention

## Alternatives Considered

- **Short-form preferred** (e.g., always emit `[Label]` for component): rejected because of grep-friendliness and renameWithRefs robustness
- **Hybrid** (component=keyword, interface=short): rejected because it creates inconsistency with ADR-105
