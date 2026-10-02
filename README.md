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
docker compose --profile test run --rm tests node ace test functional
docker compose --profile test run --rm tests npm run typecheck
docker compose --profile test run --rm tests npm run lint
docker compose --profile test run --rm tests npm run build
```

The functional suite uses the `arena_test` PostgreSQL database. The public visibility and projection unit suite runs with Node's test runner:

```bash
docker compose --profile test run --rm tests node --experimental-strip-types --test tests/unit/public-tournaments.test.mjs
```

Public JSON endpoints: `GET /api/v1/tournaments` and `GET /api/v1/tournaments/:id`.
