## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; every new issue is also added to Project #1 “Eleggante Tournament Management”. See `docs/agents/issue-tracker.md`.

### Triage labels

We use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at the repository root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### Language

Write repository instructions, domain docs, ADRs, issues, specifications, plans, code, tests, identifiers, and internal stored values in English. The approved PRD is maintained in the private team vault in pt-BR; its instruction to write the technical specification in pt-BR is superseded by this rule. Keep canonical Portuguese terms, proper names, and expressions whose meaning would change in translation in their original form, with an English explanation when needed. Keep internal enum values and keys in English and map them to pt-BR labels in the interface. Write all user-visible copy in pt-BR, including pages, forms, errors, notifications, email, and text stored for display. The PRD is the only pt-BR document exception for now.

### Architecture and TypeScript

Follow SOLID and the repository pattern. Controllers, jobs, commands, and event handlers delegate domain operations to application use cases. Application use cases depend on focused repository and adapter interfaces; concrete implementations are wired in the composition root. Keep SQL, ORM queries, database transactions, and persistence models inside infrastructure adapters, migrations, seeders, and explicit database test fixtures. Domain and application code remain independent of AdonisJS, PostgreSQL, and HTTP context types. Preserve atomicity, locking, authorization, idempotency, and audit behavior when changing these seams.

Write project source in TypeScript. Reference project-owned modules with explicit `.ts` or `.tsx` import specifiers, including dynamic imports; use package imports for external dependencies and framework aliases where configured. Generated JavaScript and package runtime resolution metadata belong to the build, not to source import conventions.

Before adding or changing entrypoints, use cases, reusable business rules, module interfaces, persistence, dependency injection, or folder organization, read `docs/agents/architecture.md`. Maintain the Mermaid system and folder maps in `docs/code-map.md` whenever those relationships change. Run the architecture check, type checks, and behavior tests appropriate to the change; architecture changes also require the full coverage gate.

### Phone inputs

Display Brazilian mobile phone inputs with the mask `+55 (00) 00000-0000`, including typed and pasted values. Validate the complete number on the server and store its canonical form with `+` followed by 13 digits; presentation punctuation belongs in the interface.

### Refinement gate

Before turning a story into implementation tasks, compare it with the approved PRD in the private team vault and relevant specification sections. Request access to the PRD from the Owner if needed. Recheck acceptance examples, data and state impacts, authorization, public visibility, and tests; record any changed or unresolved decision in the issue. A proposed specification section is not approved merely because it is written.

### Pull requests

Leave every completed pull request ready for the Owner to review. If a pull request starts as a draft, mark it ready after the work and required checks are complete. The Owner alone merges pull requests; agents must never merge them.

### Tests and coverage

Use Japa for unit tests of domain and presentation rules, integration tests that exercise the API over HTTP with PostgreSQL, and functional tests that drive the frontend in Chromium. Measure application source in both the Node process and the browser. Exclude framework configuration, generated code, disabled entrypoints, and type-only files; document each exclusion. The full coverage gate must pass at 100% statements, branches, functions, and lines per application file before implementation reaches `main`. Require the coverage CI check in the `main` branch protection rule so a pull request cannot merge when the gate fails. A passing percentage also needs meaningful behavior and authorization assertions.
