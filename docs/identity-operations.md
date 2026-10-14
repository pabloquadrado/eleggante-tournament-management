# Identity operations

Email sign-in and own-profile onboarding are implemented by issue #3; issue #4 adds Google sign-in to the same player account. Versioned consent, organization permissions, and the first Platform Admin bootstrap belong to later stories. The production consent policy denies unrestricted access until #5 supplies current-document acceptance; there is no shared administrator seed or consent bypass.

## Local delivery and configuration

Run `docker compose up -d app worker`. Open `/sign-in` on port 3333 and read the code in Mailpit on port 8025. The worker schedules outbox recovery before starting queue processing. Request handling only saves the challenge and delivery intent; SMTP runs in the worker.

| Setting                                    | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `SESSION_DRIVER=database`                  | PostgreSQL session storage in development, tests, and CI                        |
| `QUEUE_DRIVER`                             | `database` for the worker; `sync` in isolated tests                             |
| `SMTP_HOST`                                | Local `mail` service, or the production SMTP host                               |
| `SMTP_PORT`                                | Local port 1025; the provider's port in production                              |
| `SMTP_SECURE`                              | Whether the transport uses TLS immediately; follow the provider's settings      |
| `SMTP_FROM`                                | Sender address; production must use an authorized sender                        |
| `SMTP_USERNAME`, `SMTP_PASSWORD`           | Optional provider credentials, supplied as private environment variables        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google web OAuth client credentials; both are required                 |
| `APP_URL`                                  | Trusted application origin used to derive the exact `/auth/google/callback` URL |

The app key protects encrypted delivery material and keyed lookup/code verifiers. Store it privately and consistently across app and worker. Arbitrary forwarded IP headers are not trusted: request limits use the direct connection IP. A reverse-proxy deployment must review that boundary before relying on per-client IP limits.

## Google sign-in

Provision a Google OAuth client of type **Web application** in the organization's private Google project. Configure its consent screen and authorized test users as required by that project's publication status. Register the exact redirect URI derived from `APP_URL`: for the local template it is `http://localhost:3333/auth/google/callback`; production uses the deployed HTTPS origin. Supply the client ID and secret through private environment configuration and restart the app. Do not commit credentials or personal test accounts. The callback origin comes from trusted configuration, never request headers or callback input.

If either credential is missing, `Entrar com Google` returns to a clean sign-in page with pt-BR recovery and the email-code option; no Google attempt or authenticated session is created. Deterministic tests substitute only the external provider transport while exercising the real Ally 6.3.2 driver, HTTP endpoints, PostgreSQL sessions and Chromium. A live Google smoke test additionally requires privately supplied authorized credentials and a test account.

The request-scoped Ally adapter requests only `openid email` with online access and pt-BR locale. A ten-minute durable attempt owns random state, browser binding and the S256 verifier. The callback checks those values and pending status before code exchange; the final identity transaction rechecks them and account eligibility, attaches the subject, consumes the attempt, appends minimal audit references, and rotates the session atomically. Provider I/O occurs outside the identity write lock. All token and userinfo requests use fixed trusted Google endpoints, reject redirects, and have a five-second timeout. Identity proof comes exclusively from trusted online userinfo with a valid subject and raw boolean `email_verified === true`; returned ID tokens are discarded.

The same normalized verified email resolves the same player account and immutable Arena Eleggante ID. Subjects remain case-sensitive, and Gmail dot/plus variants are not rewritten. A linked subject with a changed email, or an inactive/anonymized player, is denied without moving the association or changing the account. Google names, pictures and tokens are discarded; sign-in preserves profile fields, versions and consent records. Google authorization grants no Arena document acceptance or administrative permission.

For a first association, Google authority requires an exact `gmail.com` email or strict verification plus a valid trusted hosted-domain (`hd`) value matching the normalized email domain. A verified third-party address can have changed mailbox owners, so its first association requires a fresh code at that exact email. The initiating browser continues at `/sign-in/code` with neutral pt-BR guidance. Code issuance creates only the encrypted challenge/intent, notification intent, and an encrypted immutable subject/email binding on the proof-pending Google attempt. It clears OAuth material to deny callback replay, while leaving the attempt unconsumed, profiles and associations unchanged, and the previous browser session intact.

Resend preserves the original subject, normalized email, attempt, browser, and deadline and applies the existing cooldown and request limits. Successful fresh proof must match the server-held challenge and both encrypted bindings. The final transaction resolves or creates the player, attaches the subject, appends association audit references, consumes the code and Google attempt, and rotates the session together. It activates the browser session after commit. Wrong or abandoned browser context, mismatched intent, expired/replayed proof, inactive account, or conflicting subject is denied without private access. Previously securely linked subjects continue directly through the existing active-account and matching-email checks.

Start and callback responses use `no-store` and `no-referrer`, and redirect to clean application URLs. Configure reverse-proxy/access logs and monitoring to omit query strings for `/auth/google` and `/auth/google/callback`; do not collect callback URLs, authorization headers, provider bodies or encrypted attempt material. Identity exception logs omit diagnostics and audits contain only opaque references. The adapter fails closed when `NODE_DEBUG` enables OAuth/Ally namespaces or wildcard debugging. Keep those settings disabled in deployment and diagnostics. Ally cookie-state and `.stateless()` convenience authentication are not used; the application owns browser binding and one-use state.

Terminal and expired attempts erase state/verifier and pending email-proof material, and retention deletes expired attempt records after twenty-four hours. A failed final proof transaction preserves the prior session and rolls back account, association, audit, both proof consumptions, and session rotation, allowing the same fresh bound email code to be retried. If an immediate authoritative Google transaction fails after code exchange, begin a fresh Google attempt or use email-code sign-in.

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

`app/modules/identity/application/identity-input.ts` is explicitly excluded from Node coverage because it contains only erased TypeScript input aliases and type imports. Every executable use case, shared application service, and domain policy remains included in the per-file 100% gate.
