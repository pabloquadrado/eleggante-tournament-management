# Architecture rules

The Owner requires SOLID, repository-based persistence, explicit TypeScript source imports, and an up-to-date Mermaid code map.

## SOLID in this codebase

- **Single responsibility:** HTTP and queue entrypoints translate framework input/output. Application workflows coordinate business operations. Repositories load and persist domain records. Transport adapters handle SMTP, queueing, encryption, and browser session integration.
- **Open/closed:** Add or replace an infrastructure adapter through its interface and composition-root binding. Callers continue to use the same workflow interface.
- **Liskov substitution:** Every adapter honors its interface's result, failure, ordering, privacy, and transaction contracts. An in-memory adapter is not evidence that PostgreSQL concurrency is correct; verify the production adapter over HTTP with PostgreSQL.
- **Interface segregation:** Give each persistence or external-system responsibility a focused interface. Use aggregate-specific operations rather than a universal CRUD base repository or a query-builder interface.
- **Dependency inversion:** Domain and application code define the contracts. Infrastructure implements them. Entry points receive application workflows and framework-facing interfaces through dependency injection. Wire concrete adapters in `providers/`; infrastructure units of work create repository instances bound to their transaction.

## Allowed dependencies

Controllers, jobs, commands, and event handlers call application workflows. They handle routing, cookies, HTTP status codes, queue payloads, and rendering. Queries and concrete PostgreSQL classes belong in infrastructure. Application code consumes plain records and interfaces; Lucid transactions, query builders, models, AdonisJS containers, and HTTP contexts stay outside it.

The composition root wires both domain modules. AdonisJS's framework directories contain thin entrypoints; each domain module groups its domain rules, application workflows/interfaces, and infrastructure adapters. React pages and presentation rules live in `inertia/`. See `docs/code-map.md` for the actual folder and dependency maps.

Keep all writes belonging to one business operation in the same transaction, including challenge consumption, identity creation, rotated sessions, notification intent, profile replay results, and audit events. Preserve challenge-before-outbox lock ordering and identity write serialization. A repository abstraction must preserve these guarantees rather than opening independent transactions for individual writes.

Database queries in migrations, seeders, infrastructure, and explicit integration-test setup/invariant assertions are expected. Behavioral tests continue to exercise public HTTP and browser interfaces.

## TypeScript imports

Application code, tests, tooling configuration, and project scripts use TypeScript. `ace.js` is the framework-required loader for the TypeScript console entrypoint. Use `.ts` or `.tsx` in relative project imports and dynamic imports. Use configured framework aliases and published package specifiers without appending a guessed extension. The TypeScript build rewrites source extensions to JavaScript; production output and package import maps target that generated output.

## Completion

Run `npm run check:architecture`, both type checks, lint, build, and the full per-file Node/browser coverage gate for a layer or repository change. Keep every source adapter covered. Record unavailable checks explicitly; a passing structural check does not establish correct transaction or security behavior. Update the Mermaid maps when files move or dependencies change.
