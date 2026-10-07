# Architecture rules

The Owner requires SOLID, repository-based persistence, explicit TypeScript source imports, and an up-to-date Mermaid code map.

## SOLID in this codebase

- **Single responsibility:** HTTP and queue entrypoints translate framework input/output. Application use cases authorize and coordinate business operations; shared application services coordinate reusable workflow steps. Repositories load and persist domain records. Transport adapters handle SMTP, queueing, encryption, and browser session integration.
- **Open/closed:** Add or replace an infrastructure adapter through its interface and composition-root binding. Callers continue to use the same workflow interface.
- **Liskov substitution:** Every adapter honors its interface's result, failure, ordering, privacy, and transaction contracts. An in-memory adapter is not evidence that PostgreSQL concurrency is correct; verify the production adapter over HTTP with PostgreSQL.
- **Interface segregation:** Give each persistence or external-system responsibility a focused interface. Use aggregate-specific operations rather than a universal CRUD base repository or a query-builder interface.
- **Dependency inversion:** Domain and application code define the contracts. Infrastructure implements them. Entry points receive application use cases and framework-facing interfaces through dependency injection. Wire concrete adapters in `providers/`; infrastructure units of work create repository instances bound to their transaction.

## Allowed dependencies

Controllers, jobs, commands, and event handlers call application use cases for domain operations. They handle routing, cookies, HTTP status codes, queue payloads, and rendering. Queries and concrete PostgreSQL classes belong in infrastructure. Application code consumes plain records and interfaces; Lucid transactions, query builders, models, AdonisJS containers, and HTTP contexts stay outside it.

The composition root wires both domain modules. AdonisJS's framework directories contain thin entrypoints; each domain module groups its domain rules, application workflows/interfaces, and infrastructure adapters. React pages and presentation rules live in `inertia/`. See `docs/code-map.md` for the actual folder and dependency maps.

Keep all writes belonging to one business operation in the same transaction, including challenge consumption, identity creation, rotated sessions, notification intent, profile replay results, and audit events. Preserve challenge-before-outbox lock ordering and identity write serialization. A repository abstraction must preserve these guarantees rather than opening independent transactions for individual writes.

Database queries in migrations, seeders, infrastructure, and explicit integration-test setup/invariant assertions are expected. Behavioral tests continue to exercise public HTTP and browser interfaces.

## Application use cases

Agreed on 2026-10-07:

- A use case belongs to the application layer and is the entrypoint for an operation that accesses domain behavior or business data. This includes reads and writes through entities, repositories, and other domain-facing contracts. Presentation entrypoints delegate these operations to a use case.
- Define use cases by the application operation. Reuse the same use case from controllers, handlers, or other entrypoints when their behavior and access policy are equivalent; a separate endpoint does not require a separate use case.
- Implement each use case as one class per operation with a single public operation method, `execute(input)`. Inject focused dependencies through the constructor. Use plain typed inputs and results independent of framework context and persistence models.
- Keep pure rendering, redirects, and framework transport handling in presentation when they need no domain operation. Those entrypoints need no use case.
- Presentation establishes the caller's identity through the authentication adapter and passes plain caller information. The use case enforces permission to perform its operation, including caller eligibility and ownership, and coordinates the transaction through application-owned interfaces. Reusable business permission rules belong to the domain. Every caller receives the same authorization guarantees.
- Preserve a single transaction for the writes belonging to an operation, including audit, replay results, and notification intent. Infrastructure implements transactions and locking; framework effects that depend on committed state follow the commit.
- Extract workflow coordination shared by use cases into an application service. The outer use case owns the transaction; the shared application service participates through the same transaction-bound interfaces. Profile updates and sign-in can share OTP creation this way while preserving locking, replay, audit, and outbox guarantees.
- Give a business rule shared by multiple use cases one cohesive domain implementation and reuse it. Keep application workflow coordination in the application layer; sharing code alone does not make it a domain rule.

The identity and public tournament modules implement this structure. The composition root resolves their use cases and shared application services; the code map records the entrypoints and transaction ownership.

## Reusable business behavior

Agreed on 2026-10-07: choose the owner by responsibility. Keep behavior in its natural domain object when it has one; introduce a focused policy, specification, or domain service where it fits. Multiple use cases reuse that implementation.

| Responsibility | Owner |
| --- | --- |
| An object's invariants and state transitions | Entity or value object |
| A focused eligibility or authorization decision | Domain policy |
| Candidate criteria that benefit from composition | Specification |
| A business operation without a natural entity or value-object owner | Domain service |
| Repository, transaction, or outbox coordination shared by use cases | Application service |

`Policy` is the local descriptive name for a cohesive business decision. A policy can be a focused function or object. Use a specification when candidate matching needs reusable, composable criteria. Name domain services after the business operation they represent. A module groups cohesive domain concepts; the concepts retain their behavioral responsibilities.

The primary-source rationale and an OTP extraction example are recorded in [Reusable domain rules](../research/reusable-domain-rules.md).

## TypeScript imports

Application code, tests, tooling configuration, and project scripts use TypeScript. `ace.js` is the framework-required loader for the TypeScript console entrypoint. Use `.ts` or `.tsx` in relative project imports and dynamic imports. Use configured framework aliases and published package specifiers without appending a guessed extension. The TypeScript build rewrites source extensions to JavaScript; production output and package import maps target that generated output.

## Completion

Run `npm run check:architecture`, both type checks, lint, build, and the full per-file Node/browser coverage gate for a layer or repository change. Keep every source adapter covered. Record unavailable checks explicitly; a passing structural check does not establish correct transaction or security behavior. Update the Mermaid maps when files move or dependencies change.
