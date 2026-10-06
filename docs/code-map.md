# Code map

This map describes the current code. Domain modules group business rules, application workflows, their interfaces, and concrete infrastructure. AdonisJS directories contain framework entrypoints; Inertia contains the browser presentation.

## Folder organization

```mermaid
flowchart TD
  root[Repository] --> app[app/]
  root --> providers[providers/]
  root --> inertia[inertia/]
  root --> database[database/]
  root --> startup[start/ and config/]
  root --> tests[tests/]
  root --> docs[docs/]
  app --> edges[controllers/, jobs/, middleware/, exceptions/]
  app --> models[models/: framework auth model]
  app --> modules[modules/]
  modules --> identity[identity/]
  modules --> tournaments[tournaments/]
  identity --> idDomain[domain/: email, profile, OTP and access rules]
  identity --> idApp[application/: requests, verification, profiles, sessions, email delivery]
  idApp --> idPorts[ports/: repository and external adapter contracts]
  identity --> idInfra[infrastructure/]
  idInfra --> postgres[postgres/: focused repositories, queries, unit of work, retention]
  idInfra --> adonis[adonis/: session, secrets, SMTP and queue adapters]
  idInfra --> crypto[otp-cryptography.ts: keyed hashing and code generation]
  tournaments --> tournamentDomain[domain/: public visibility and projection]
  tournaments --> tournamentApp[application/: catalog and repository contract]
  tournaments --> tournamentInfra[infrastructure/postgres/: tournament repository]
  providers --> bindings[module-bindings-provider.ts: dependency composition]
  inertia --> pages[pages/: identity, tournaments, errors]
  inertia --> browserRules[lib/: phone mask and visitor formatting]
  inertia --> ui[components/, layouts/, app.tsx]
  database --> migrations[migrations/, seeders/, schema.ts]
  tests --> suites[unit/, integration/, functional/, support/]
  docs --> rules[agents/architecture.md: permanent rules]
```

## Runtime flow

Solid arrows show calls or data flow. Dashed arrows show implementations and dependency composition.

```mermaid
flowchart LR
  browser[Browser: React / Inertia] --> http[Routes and HTTP controllers]
  schedule[Outbox scheduling command] --> jobs[Queue jobs]
  http --> identity[Identity application workflows]
  http --> catalog[Public tournament catalog]
  jobs --> emails[Operational email workflow]
  identity --> domain[Domain rules and plain records]
  catalog --> domain
  emails --> domain
  identity --> repositories[Repository / query / unit-of-work contracts]
  catalog --> repositories
  emails --> repositories
  identity --> adapters[Session, secrets, consent, mail and queue interfaces]
  emails --> adapters
  pg[PostgreSQL implementations] -. implement .-> repositories
  framework[Adonis session / crypto / mail / queue adapters] -. implement .-> adapters
  pg --> db[(PostgreSQL)]
  framework --> smtp[SMTP: Mailpit locally]
  framework --> queue[Adonis queue]
  queue --> jobs
  composition[providers/module-bindings-provider.ts] -. wires .-> identity
  composition -. wires .-> catalog
  composition -. wires .-> emails
  composition -. binds contracts .-> pg
  composition -. binds contracts .-> framework
```

## Dependency direction

Controllers and jobs import application workflows, never concrete repositories. Application workflows import domain rules and contracts. Infrastructure imports and implements those contracts. The provider chooses concrete adapters. Infrastructure units of work create repositories bound to the same PostgreSQL transaction.

`app/models/user.ts` is the Adonis authentication adapter model, not a domain object. Framework authentication and session middleware integrate with their configured stores at the edge. Business persistence stays in the module infrastructure. Database migrations and seeders own schema and development fixtures.

Identity writes use one unit of work for profile changes, OTP state, sessions, outbox intent, replay results, and audit events. Email delivery uses a separate transaction and locks challenge before outbox; it does not hold the global identity write lock while waiting for SMTP. The browser session is activated only after the identity transaction commits.

## Verification

Japa unit tests cover domain and presentation rules. Integration tests cross HTTP, PostgreSQL, and the mail adapter; functional tests cross Chromium and HTTP. SQL in integration fixtures and persistence invariant assertions remains intentional. Automated delivery tests use `mail.fake()`; an actual Mailpit inbox/API test is not yet part of the automated suite.

`npm run lint` includes the architecture check. It checks import direction and explicit TypeScript source extensions, including dynamic imports; it does not prove every SOLID judgment or database concurrency guarantee. Those require review and behavior tests.
