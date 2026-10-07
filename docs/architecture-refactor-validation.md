# Architecture refactor validation

Validation date: 2026-10-06. Working-tree baseline: `31eba2e` (email sign-in). The Owner requested repository-based persistence, SOLID dependency direction, TypeScript source imports, permanent instructions, and Mermaid code maps. The existing phone-mask changes are retained.

## Passed

- Both server and browser TypeScript checks.
- ESLint, including the architecture check.
- Production build, with `.ts` source imports rewritten to `.js` output.
- All 12 domain/presentation Japa unit tests, run without the Adonis HTTP bootstrap.
- Adonis provider boot and resolution of application workflows and the identity controller; session adapters resolve separately through each request resolver.
- Negative architecture probes: infrastructure hidden behind a helper, dynamic `.js` project imports, and standalone JavaScript source are rejected. Probe files were removed.
- Read-only standards and behavior reviews found no remaining architectural violations or behavior regressions. Two architecture-check enforcement gaps found during review were fixed and probed.
- Git whitespace check.

## Pending

The full HTTP/PostgreSQL and Chromium suites and 100% per-file Node/browser coverage remain unverified for this working tree. Docker Compose failed because this session cannot access the Docker socket. Host HTTP startup is also restricted. Earlier coverage results for `31eba2e` do not validate this refactor.

Rerun the documented test-container checks in `README.md`, including fresh test migrations, build, type checks, lint, and `npm run test:coverage`, in an environment with Docker access. Keep all application workflows and concrete adapters in coverage. Resolve failures before publishing this implementation as complete or merging it.

The changes remain local and uncommitted. This session has read-only access to `.git`, so the existing PR does not include the refactor.
