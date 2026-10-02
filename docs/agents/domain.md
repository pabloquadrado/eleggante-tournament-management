# Domain docs

How engineering skills should consume domain documentation in this repository.

## Before exploring

Read `CONTEXT.md` at the repository root. Read relevant ADRs in `docs/adr/` when they exist.

If a referenced document does not exist, proceed silently. The `domain-modeling` skill creates glossary terms and ADRs only when a real decision has been resolved.

## Layout

This is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Vocabulary

Use the canonical terms defined in `CONTEXT.md` in issue titles, specifications, plans, test names, and implementation discussions. Do not drift to terms listed under `_Avoid_`.

If a required concept is absent from the glossary, either reconsider the language or record the gap for `domain-modeling`.

## ADR conflicts

If a proposed change conflicts with an ADR, surface the conflict explicitly instead of silently overriding it.
