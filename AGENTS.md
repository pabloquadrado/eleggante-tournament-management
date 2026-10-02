## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; every new issue is also added to Project #1 “Eleggante Tournament Management”. See `docs/agents/issue-tracker.md`.

### Triage labels

We use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at the repository root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### Language

Write repository instructions, domain docs, ADRs, issues, specifications, plans, code, tests, identifiers, and internal stored values in English. The approved PRD remains in pt-BR; its instruction to write the technical specification in pt-BR is superseded by this rule. Keep canonical Portuguese terms, proper names, and expressions whose meaning would change in translation in their original form, with an English explanation when needed. Keep internal enum values and keys in English and map them to pt-BR labels in the interface. Write all user-visible copy in pt-BR, including pages, forms, errors, notifications, email, and text stored for display. The PRD is the only pt-BR document exception for now.

### Refinement gate

Before turning a story into implementation tasks, compare it with the approved PRD and relevant specification sections. Recheck acceptance examples, data and state impacts, authorization, public visibility, and tests; record any changed or unresolved decision in the issue. A proposed specification section is not approved merely because it is written.
