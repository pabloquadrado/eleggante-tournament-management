# Arena Eleggante

> A web system for running Barbershop Eleggante tournaments and publishing official competition information.

> **Repository notice:** This repository is temporarily public. The code is proprietary; public access does not grant permission to use or redistribute it.

## What it is (and isn't)

Arena Eleggante is a web system designed as a hosted SaaS, with public tournament pages and a planned administrative area. V1 is for Barbershop Eleggante's internal tournament operation. Visitors will use the website; they will not install or self-host it.

The V1 target covers EA FC tournaments, in person and online. It does not include payments, game or console synchronization, a native app, or self-service for other organizations. The approved PRD is maintained in the private team vault; [issue #1](https://github.com/pabloquadrado/eleggante-tournament-management/issues/1) records the approved technical spec. Neither is a list of features already implemented.

## Features

**Available in the current code:**

- **Public catalog:** Visitors browse published tournaments without signing in. Archived tournaments stay available by direct URL.
- **Tournament overview:** List and detail pages show state, game edition, mode, date, and venue or online instructions when present.
- **Read-only API:** `GET /api/v1/tournaments` and `GET /api/v1/tournaments/:id` return public overview data.
- **Email sign-in:** Players request a single-use email code, verify it, and complete their own profile. Phone changes require a fresh code sent to the verified email. Sessions and abuse controls are stored in PostgreSQL.
- **Limited onboarding:** Profile completion is available after email verification. Access remains limited until versioned consent is implemented in #5.

**Planned for internal V1:**

- **Identity and access:** Google sign-in, versioned consent, and Platform Admin, Owner, Organizer, Player, and Visitor permissions. The controlled first Platform Admin bootstrap belongs to #6.
- **Tournament operation:** Creation, approval, registration, waiting list, scheduling, suspension, closure, and archival.
- **Competition:** Team or national-team selection and draws, groups, knockout brackets, match results, standings, disputes, and audit history.
- **Public competition view:** Approved participants, published results, standings, brackets, and an unlisted read-only live draw link.

## Vision / Roadmap

1. **Now — first working slice:** The public catalog and read-only tournament overview are implemented. Administrative workflows and competition logic are not.
2. **Internal V1 — planned:** Run Barbershop Eleggante's EA FC tournaments in one system, from registration through official results. One organization operates in V1.
3. **Multiple organizations — future:** The approved design assigns tournaments and brand settings to organizations, but operating other organizations is outside V1.

## Stack & Architecture

| Area            | Current code                                                                                                                  | Planned direction from issue #1                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Application     | Node.js 24, TypeScript, AdonisJS 7, Inertia/React, Vite                                                                       | One web application with public and administrative areas                       |
| Data            | PostgreSQL 16 with Lucid migrations                                                                                           | Transactional source of truth for tournament state and history                 |
| Code boundaries | Public-tournament domain and PostgreSQL adapter under `app/modules/tournaments`; HTTP controller and React pages at the edges | Domain and application rules independent of framework and persistence adapters |
| Background work | Database-backed worker recovers and delivers committed OTP emails                                                            | Transactional outbox and operational email delivery                            |
| Local tooling   | Docker Compose, PostgreSQL, Mailpit                                                                                           | SMTP delivers operational sign-in and phone-change codes to local Mailpit     |
| Tests           | Japa unit, HTTP/PostgreSQL integration, and Chromium functional suites; c8 and browser instrumentation enforce coverage       | Extend behavior and security tests as each V1 workflow is built                |
| Production      | No production deployment is documented in this repository                                                                     | Coolify-managed containers and observability, subject to deployment checks     |

The technical spec calls for SOLID, Object Calisthenics by default, an object-oriented domain where practical, Clean Architecture boundaries, and TDD. These are implementation rules, not claims that every planned module exists today.

## Running locally (for the dev team)

**Requirements:** Docker and Docker Compose. Node.js, PostgreSQL, and other application dependencies run inside containers.

```bash
git config core.hooksPath .githooks
cp .env.example .env
docker compose build
docker compose run --rm app node ace generate:key
docker compose up -d app worker
docker compose exec app node ace db:seed
```

The app runs at `http://localhost:3333/tournaments`. The optional development seed adds two listed tournaments and one archived tournament. Email sign-in starts at `http://localhost:3333/sign-in`. Mailpit's local inbox is at `http://localhost:8025`; sign-in and phone-change codes appear there.

**Checks:** The test service uses `arena_test`, separate from the development database.

```bash
docker compose --profile test build tests
docker compose --profile test run --rm tests node ace migration:fresh --drop-types --force
docker compose --profile test run --rm tests npm run build
docker compose --profile test run --rm tests npm run typecheck
docker compose --profile test run --rm tests npm run lint
docker compose --profile test run --rm tests npm run test:coverage
```

The coverage gate requires 100% statements, branches, functions, and lines per covered application file. Configuration, generated code, database maintenance files, the disabled SSR entrypoint, and type-only files are excluded.

The commit hook scans staged changes with Gitleaks. CI scans Git history on every pull request.

## Configuration

Copy [`.env.example`](.env.example) for local development. `start/env.ts` validates the application variables.

| Variable                                                      | Local value or purpose                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                    | `development`; use `test` only for the test suite                                             |
| `HOST`, `PORT`, `APP_URL`                                     | Bind address, HTTP port, and application URL; Compose exposes port `3333`                     |
| `APP_NAME`                                                    | Name used in application logs; the example uses `Arena Eleggante`                             |
| `APP_KEY`                                                     | Generate locally with `node ace generate:key`; do not commit the value                        |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | PostgreSQL connection; Compose uses `database:5432` and `arena_dev`                           |
| `SESSION_DRIVER`                                              | `database` in development, tests, and CI; two-hour inactivity lifetime                                                              |
| `QUEUE_DRIVER`                                                | `database` locally; `sync` in CI                                                              |
| `LOG_LEVEL`                                                   | Application log level; the example uses `info`                                                |
| `TZ`                                                          | Container time zone setting; the example uses `UTC`. V1 displays dates in `America/Sao_Paulo` |

Replace the `DB_PASSWORD` placeholder in `.env` before starting Compose. The app key command fills `APP_KEY`. Compose starts PostgreSQL 16 and a Mailpit container. The local database is stored in a named Docker volume. Production secrets, the production mail provider, and hosting configuration are not finalized here. SMTP settings and worker recovery are documented in [Identity operations](docs/identity-operations.md).

## Screenshots

_TODO: Add a screenshot of the public tournament list._

_TODO: Add a screenshot of a tournament detail page after the visual identity is approved._

## License

**Proprietary — all rights reserved.** Unauthorized use, copying, modification, or redistribution is prohibited. See [LICENSE](LICENSE). This repository is not open source.
