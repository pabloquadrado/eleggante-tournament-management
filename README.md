# Arena Eleggante

Issue #2 delivers a read-only public tournament catalog. It uses AdonisJS, Inertia/React, PostgreSQL, and a database-backed queue worker.

## Run locally

Docker and Docker Compose are required. The app uses Node 24 inside its containers.

```bash
cp .env.example .env
docker compose build
docker compose run --rm app node ace generate:key
docker compose up -d app worker
docker compose exec app node ace db:seed
```

Open [the tournament list](http://localhost:3333/tournaments). The local seed adds two listed tournaments and one archived tournament available only at its direct URL. Mailpit is at [localhost:8025](http://localhost:8025). The seed is limited to the development environment and is idempotent.

## Verify

```bash
docker compose --profile test build tests
docker compose --profile test run --rm tests node ace migration:fresh --force
docker compose --profile test run --rm tests npm run test:unit
docker compose --profile test run --rm tests npm run build
docker compose --profile test run --rm tests npm run test:coverage
docker compose --profile test run --rm tests npm run typecheck
docker compose --profile test run --rm tests npm run lint
```

The full Japa suite uses the `arena_test` PostgreSQL database. To run only the Japa unit suite:

```bash
docker compose --profile test run --rm tests npm run test:unit
```

The coverage command builds instrumented frontend assets, runs Japa unit, API integration, and browser functional tests, then checks server and browser application source for 100% statement, branch, function, and line coverage per file. Framework configuration, generated code, the disabled SSR entrypoint, and type-only files are outside the coverage scope. CSS has no statement or branch coverage metric; the browser tests check rendered pages and navigation.

Public JSON endpoints: `GET /api/v1/tournaments` and `GET /api/v1/tournaments/:id`.
