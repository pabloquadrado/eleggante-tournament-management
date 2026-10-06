# Identity operations

Email sign-in and own-profile onboarding are implemented by issue #3. Google sign-in, versioned consent, organization permissions, and the first Platform Admin bootstrap belong to later stories. The production consent policy denies unrestricted access until #5 supplies current-document acceptance; there is no shared administrator seed or consent bypass.

## Local delivery and configuration

Run `docker compose up -d app worker`. Open `/sign-in` on port 3333 and read the code in Mailpit on port 8025. The worker schedules outbox recovery before starting queue processing. Request handling only saves the challenge and delivery intent; SMTP runs in the worker.

| Setting | Purpose |
| --- | --- |
| `SESSION_DRIVER=database` | PostgreSQL session storage in development, tests, and CI |
| `QUEUE_DRIVER` | `database` for the worker; `sync` in isolated tests |
| `SMTP_HOST` | Local `mail` service, or the production SMTP host |
| `SMTP_PORT` | Local port 1025; the provider's port in production |
| `SMTP_SECURE` | Whether the transport uses TLS immediately; follow the provider's settings |
| `SMTP_FROM` | Sender address; production must use an authorized sender |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Optional provider credentials, supplied as private environment variables |

The app key protects encrypted delivery material and keyed lookup/code verifiers. Store it privately and consistently across app and worker. Arbitrary forwarded IP headers are not trusted: request limits use the direct connection IP. A reverse-proxy deployment must review that boundary before relying on per-client IP limits.

## Codes, sessions, and profiles

Codes have six digits, a ten-minute lifetime, and at most five incorrect attempts. Request limits are five per normalized email and twenty per direct IP per fifteen minutes, with a sixty-second email resend cooldown. These values are named in `app/modules/identity/domain/otp-policy.ts`. New and returning addresses receive the same neutral request response. Resend invalidates the prior challenge, and successful verification cannot be replayed into another session.

Sessions expire after two hours of inactivity, rotate after successful verification, and are revoked by CSRF-protected logout. Verification, identity resolution, and the rotated session record commit in one transaction. A failed transaction preserves the requesting browser session so the original code can be retried. Session cookies are HttpOnly and SameSite=Lax, and Secure in production. Own-profile responses are not cached and no public profile endpoint exists.

Initial onboarding requires a display name, unique case-insensitive username, and Brazilian mobile number with DDD, normalized to `+55` and eleven national digits. Email and Arena Eleggante ID are read-only. Profile writes require an idempotency key and the expected version; stale writes return a handled conflict. Changing an existing phone queues a fresh email code bound to the exact pending changes and profile version. This confirms the account owner's action; it does not prove phone ownership. CSRF-protected cancellation is bound to the authenticated user and initiating browser, invalidates the code, and removes pending email material atomically. A confirmed change cannot be canceled retroactively.

## Outbox recovery and delivery limits

`node ace outbox:schedule` registers the stable `otp-outbox-recovery` schedule every five seconds. Run it before `node ace queue:work`; Compose does both automatically. Re-running the scheduler uses the same schedule identifier. Committed delivery intents are recovered even if the app exits before dispatch.

Queue payloads contain only outbox IDs. Delivery locks the challenge and outbox, skips expired/superseded/consumed challenges, and retries transient failures with bounded exponential backoff: up to five attempts, starting at thirty seconds. Retries keep the original code and expiry. Confirmed permanent SMTP rejection invalidates the challenge. A status endpoint is bound to the initiating browser and returns pt-BR guidance without provider diagnostics or account-existence information.

SMTP cannot guarantee exactly-once delivery: a crash after the server accepts mail but before the database commits may cause a duplicate message. Retries reuse the same code and stable Message-ID; they do not create a second valid challenge. Provider-specific asynchronous bounce processing is deferred until a production provider is selected. SMTP acceptance alone is not proof that a mailbox exists or that the player received the message.

Delivery material is encrypted while pending and removed after delivery or terminal cancellation. Recovery also clears challenge secrets after consumption, invalidation, or expiry, removes request-limit events after fifteen minutes, and deletes old challenge/outbox and profile-replay records after twenty-four hours. Audit history contains only opaque references and is retained separately.

## Verification boundaries

Japa covers pure identity rules, real HTTP/PostgreSQL behavior and concurrency, the mail boundary, and Chromium player flows. The full gate requires 100% per-file statements, branches, functions, and lines in Node and the browser, together with meaningful authorization assertions.

Framework configuration and CLI wiring, migrations/maintenance files, generated code, disabled SSR, and type-only files are excluded from application coverage. The outbox command is framework CLI wiring; the dispatcher, delivery, retention, identity adapters, controllers, and frontend behavior remain covered application source.
