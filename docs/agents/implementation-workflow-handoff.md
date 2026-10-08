# Implementation workflow handoff

Original checkpoint requested by the Owner on 2026-10-07; continuation updated on 2026-10-08. **Final candidate validation is incomplete. PR #37 must remain draft.**

## Resume scope

Finish the portable `/implement` command, isolated role agents, deterministic controller, and native Codex/Claude Code/OpenCode adapters. Do not implement issue #4. Existing work is on `feat/portable-implement-workflow`; preserve it and continue rather than starting again.

- PR: [#37](https://github.com/pabloquadrado/eleggante-tournament-management/pull/37).
- Base: `1a76c597e59350a1f1708e9c0254f116f683f46c`.
- Last pushed candidate, with historical evidence only: `6bcb00b4edd4b2e17d1dfe09fdf19e0a7b6344b5`.
- Imported red-test commit: `3e14ab1dd056ab1f5bec9289d94753a305ffcab1` (QA original: `671a691c2a5018475410f187d78637c9ce509687`).
- The current worktree includes the 2026-10-08 controller/test migration and repairs. A clean final candidate has not yet completed its Docker engineering gate, originating reviews, and fresh QA.

Read `AGENTS.md`, `docs/agents/implementation-workflow.md`, and the relevant role document before work. All shell commands use `rtk`. Use Node 24+ and Git with explicit-base `merge-tree` support. Local paths and preserved artifacts are indexed in the gitignored `.agent-workflow/checkpoints/2026-10-07/state.json`.

## Latest Owner decision

**Refine → Plan → Engineer → both reviews → QA → Retrospective → Ready PR.** Any review or QA finding returns to Engineer, then fresh engineering checks, both reviews, and fresh QA. QA final validation cannot overlap review. The two independent review modes may run together. QA may prepare scenarios during implementation.

This supersedes the earlier QA-before-review design. The controller, tests, shared role instructions, and diagrams now enforce this order. Temporary migration notes have been removed from the canonical workflow/code map.

Other agreed rules remain: one production writer; QA writes tests only in a separate checkout; independent read-only reviewers; two automatic repair rounds per failing gate; actual Owner answers for unresolved questions/deferrals; exact model receipts with no silent substitutions; private evidence stays local; Owner alone merges. Kev remains deferred.

Tech Lead, Engineer, QA, and reviewers use `gpt-6.1-sol` at `xhigh`; Coordinator and Delivery Lead use `gpt-6-luna` at `max`. Alternative Anthropic presets and the optional OpenCode Kimi Engineer are in the registry. Preserve the approved presets. Live harness account/model access and approved private PRD access are first-story preflight requirements, not completed setup claims.

## 2026-10-08 continuation checkpoint

The controller, role documents, registrations, adapter configure/doctor, CI developer-tool tests, and isolation/coverage/publication boundaries are implemented. The order migration and test fixtures are complete: engineering → both independent reviews → QA verification → evidence-citing final QA report → retrospective. QA cannot begin its final gate while either review is pending. QA verification preserves completed reviews and invalidates downstream evidence. Confirmed QA findings survive Engineer repair and fresh reviews until their originating QA report closes them after revalidation.

The three `no-await-expression-member` regression-test lint errors are fixed. Bounded proofs now cover compatible extra Engineer tests surviving the complete multi-commit QA delta integration, a same-commit ready PR returning to draft after approval invalidation, and unchanged valid-ready retries preserving readiness without publication writes. Complete QA test integration remains enforced across later candidate changes; adding tests alone does not consume a failure repair round.

Fresh local workflow/adapter tests pass **54/54**. Formatting, both TypeScript checks, lint, architecture, and build pass. These checks validate the local edits; they do not replace the clean candidate's Docker engineering/application coverage gate, originating review closure, independent QA, retrospective, exact-final-head CI, or ready-PR delivery. All of those stages remain pending.

No issue #4 product work, issue/Project mutation, or PR-ready transition was performed during this continuation. The review repair loop remains at automatic round 1. Approved private PRD access and live first-story preflight are not claimed.

## Historical evidence and pending review closure

The 2026-10-07 independent reviews failed on five distinct enforcement gaps:

1. Configured additional CI checks replaced mandatory `test`.
2. Percent-encoded Unicode PRD/private/native references bypassed publication filtering.
3. Pending QA tests could be cleared without proving full integration.
4. QA approval was required before fresh verification evidence; failed-gate analysis needed one repair count.
5. A changed candidate could be pushed into a ready PR without restoring draft status.

Engineer fixes for all five are present: mandatory-check union; UTF-8/NFC canonicalization; complete QA delta proof with explicit base and persistent history; verify-before-report with immutable artifact receipt and failed-gate audit; pre-push draft restoration and publication-body idempotence. **Originating Standards and Spec review closure remains pending on the clean final candidate.**

The old `6bcb00b4edd4b2e17d1dfe09fdf19e0a7b6344b5` candidate passed 44 workflow tests and 67 application tests, with every measured Node/browser file at 100% statements, branches, functions, and lines (65 Node files, 11 browser files). Its GitHub `test` check passed on that old head. **The 44/67 counts, old 6b coverage artifacts, and old CI result are historical and do not validate the 2026-10-08 continuation or its final candidate.**

QA added seven regressions in `tests/workflow/{controller,runtime}-review-regressions.spec.ts`. Against the old candidate, 44 existing tests passed and all seven new tests failed. An intermediate repair passed 49/51; its two failures came from an overly strict Git capability probe. The corrected probe accepts `--[no-]merge-base` and now passes in the fresh 54/54 local suite.

`Dockerfile.test` now uses `node:24-trixie-slim` for compatible Git. A dependency/image preflight build succeeded (`arena-workflow-test-preflight`); it is not a final candidate gate. The product development Dockerfile remains unchanged.

## Next actions, in order

1. Inspect the completed dirty diff and preserved evidence, freeze a clean committed candidate, and run the actual Docker engineering gate, including the required full application coverage gate. Use a Git-capable PATH; the macOS system Git lacks the required flag. Push the verified clean candidate to the existing draft PR.
2. Dispatch isolated Standards and Spec reviewers on the fixed base/candidate diff. Obtain originating closure for the original findings and verify the approved order. Both must pass **before** independent QA.
3. Run fresh QA in a detached exact-candidate checkout through the actual Docker runtime. Audit 100% statements, branches, functions, and lines per measured Node/browser application file, documented exclusions, and meaningful behavior/authorization assertions. Close confirmed QA findings. Any correction restarts Engineer → fresh engineering checks → both reviews → fresh QA.
4. Run the Delivery Lead retrospective only after both reviews and QA pass. Publish proposals only; do not silently change future instructions or model choices. Token/cache statistics are unavailable; do not invent measurements.
5. Update the PR body (currently stale counts and old order), confirm required `test` CI success on the exact final PR head, and mark PR #37 ready. Never merge it. Return the PR URL and verified evidence to the Owner.

The review repair loop is at automatic round 1. Preserve counters; do not restart them to bypass the two-round rule. Issue #4 and Project were not mutated by the read-only dry run. Main's active ruleset requires the `test` check, which includes full coverage.

## Local evidence index

The durable preserved copies are in the ignored `.agent-workflow/checkpoints/2026-10-07/` directory. Prefer these copies over original temporary paths recorded in `state.json`:

- Reviews: `spec-review.md`, `standards-review.md`, and `standards-proof.mjs`.
- Historical old-6b QA: `qa-report-6bcb00b.md`, `qa-coverage-6bcb00b.json`, and `qa-evidence-6bcb00b.json`.
- Historical regressions and forward checks: `review-regressions-baseline.log`, `forward-qa.md`, and `forward-review.md`.
- Historical PR draft: `draft-pr-body.md`.
- Original checkpoint metadata: `state.json`; preserve its repair counters and source/worktree references.

The 2026-10-08 engineering report is `/private/tmp/eleggante-portable-engineer-report.md`, with fresh 54/54 and focused lint logs at `/private/tmp/eleggante-portable-engineer-workflow.log` and `/private/tmp/eleggante-portable-engineer-lint.log`. The Coordinator retains the complete local gate receipts, including build. No clean-candidate Docker engineering gate, fresh independent QA, retrospective, or final-head CI evidence is claimed by this checkpoint.

The Engineer's native spawn receipt exposes the tool-visible task session `/root/portable_workflow_coordinator/setup_engineer`, requested/effective `gpt-6.1-sol` at `xhigh`. No distinct provider session ID was exposed. No approved private PRD content or credentials are included in these artifacts.
