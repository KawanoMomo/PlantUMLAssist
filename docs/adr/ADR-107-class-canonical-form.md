# ADR-107: Class Canonical DSL Form

- **Status**: Accepted
- **Date**: 2026-04-26
- **Spec reference**: `docs/superpowers/specs/2026-04-26-class-design.md` Section 5

## Context

PlantUML Class Diagram は表記揺れが多い:
- class: `class X` / `class X {}` / `class "Label" as X`
- interface: `interface X` / `class X <<interface>>` (stereotype 流用)
- abstract: `abstract class X` / `abstract X` (1 トークン省略)
- enum: `enum X { RED }` (block 必須)
- inheritance: `Foo --|> Bar` / `Bar <|-- Foo` (両方向)
- generics: `Foo<T>` (空白なし) / `Foo< T >` (空白あり)
- stereotype + generics: `class Foo<T> <<Entity>>` / `class Foo <<Entity>><T>` (順序揺れ)
- member: `+id:int` / `+ id : int` (空白揺れ)

parser はすべて受理するが、updater は ONE canonical form を emit する。

## Decision

Class DSL emit uses keyword-first canonical form:

- class: `class X` (空 body 時) / `class X { ... }` (body あり) / `class "Label" as X` (label != id 時のみ)
- interface: `interface X` (専用キーワード優先、`class X <<interface>>` は parse-only)
- abstract: `abstract class X` (2 トークン強制、`abstract X` は parse-only)
- enum: `enum X { ... }` (block 必須、空でも `{ }`)
- inheritance: `Bar <|-- Foo` (parent <|-- child 順、UseCase generalization と一致)
- aggregation: `Foo o-- Bar` (`o` 側が全体)
- composition: `Foo *-- Bar` (`*` 側が全体)
- implementation: `Foo <|.. Bar` (`<|` 側が parent interface)
- association: `Foo -- Bar` (label 任意 `: text`)
- dependency: `Foo ..> Bar`
- generics: `Foo<T>` (`<` 直後は ID で開始、空白なし、ネスト `Map<K, V>` は `,` の後に空白 1 つ)
- stereotype + generics: `class Foo<T> <<Entity>>` (ID → generics → stereotype 順)
- attribute: `+ name : type` (visibility, 空白, name, ` : `, type)
- method: `+ login() : void` (visibility, 空白, name, params, ` : `, return type)
- static / abstract method: `{static}` / `{abstract}` 修飾子は visibility の直後に挿入

## Rationale

1. ADR-105 (UseCase) / ADR-106 (Component) の keyword-first 原則と一貫
2. Grep-friendliness: `grep -n "^class\\b\\|^interface\\b\\|^abstract class\\b\\|^enum\\b"` で要素抽出可能
3. renameWithRefs robustness: ID は word boundary で一意特定可能
4. Round-trip predictability: 短縮 / 揺れ形式は parser で受理して emit で正規化

## Consequences

- Parser test fixtures は揺れ形式 + canonical 両方を含む
- README に「PlantUML サンプルが短縮形式の場合は保存時に正規化される」を明記
- Future Tier1 残り (Activity, State) も同方針継承

## Alternatives Considered

- **abstract 1-トークン省略を canonical**: 採用拒否 — `abstract Foo` は他キーワードと衝突しやすい
- **inheritance を `Foo --|> Bar` (子→親) で canonical**: 採用拒否 — UseCase generalization と一致させる方が一貫
