# Implementation workflow handoff

Checkpoint requested by the Owner on 2026-10-07 to continue in a fresh session. **The work is incomplete. PR #37 must remain draft.**

## Resume scope

Finish the portable `/implement` command, isolated role agents, deterministic controller, and native Codex/Claude Code/OpenCode adapters. Do not implement issue #4. Existing work is on `feat/portable-implement-workflow`; preserve it and continue rather than starting again.

- PR: [#37](https://github.com/pabloquadrado/eleggante-tournament-management/pull/37).
- Base: `1a76c597e59350a1f1708e9c0254f116f683f46c`.
- Last pushed candidate: `6bcb00b4edd4b2e17d1dfe09fdf19e0a7b6344b5`.
- Imported red-test commit: `3e14ab1dd056ab1f5bec9289d94753a305ffcab1` (QA original: `671a691c2a5018475410f187d78637c9ce509687`).
- Current branch HEAD includes the local restart checkpoint. It has not been pushed or validated as a completed candidate.

Read `AGENTS.md`, `docs/agents/implementation-workflow.md`, and the relevant role document before work. All shell commands use `rtk`. Use Node 24+ and Git with explicit-base `merge-tree` support. Local paths and preserved artifacts are indexed in the gitignored `.agent-workflow/checkpoints/2026-10-07/state.json`.

## Latest Owner decision

**Refine → Plan → Engineer → both reviews → QA → Retrospective → Ready PR.** Any review or QA finding returns to Engineer, then fresh engineering checks, both reviews, and fresh QA. QA final validation cannot overlap review. The two independent review modes may run together. QA may prepare scenarios during implementation.

This supersedes the earlier QA-before-review design. The shared documents now record it; **controller and test ordering migration is still pending**. Remove temporary migration notes from the workflow/code map after completing it.

Other agreed rules remain: one production writer; QA writes tests only in a separate checkout; independent read-only reviewers; two automatic repair rounds per failing gate; actual Owner answers for unresolved questions/deferrals; exact model receipts with no silent substitutions; private evidence stays local; Owner alone merges. Kev remains deferred.

Tech Lead, Engineer, QA, and reviewers use `gpt-6.1-sol` at `xhigh`; Coordinator and Delivery Lead use `gpt-6-luna` at `max`. Alternative Anthropic presets and the optional OpenCode Kimi Engineer are in the registry. Preserve the approved presets. Live harness account/model access and approved private PRD access are first-story preflight requirements, not completed setup claims.

## Completed work and remaining defects

The controller, role documents, registrations, adapter configure/doctor, CI developer-tool tests, and isolation/coverage/publication boundaries are implemented. Independent QA on the last pushed candidate passed 44 workflow tests and 67 application tests, with every measured Node/browser file at 100% statements, branches, functions, and lines (65 Node files, 11 browser files). Its exact-head GitHub `test` check passed. These results do not validate the current checkpoint.

Both independent reviews failed on five distinct enforcement gaps:

1. Configured additional CI checks replaced mandatory `test`.
2. Percent-encoded Unicode PRD/private/native references bypassed publication filtering.
3. Pending QA tests could be cleared without proving full integration.
4. QA approval was required before fresh verification evidence; failed-gate analysis needed one repair count.
5. A changed candidate could be pushed into a ready PR without restoring draft status.

Engineer saved fixes for all five: mandatory-check union; UTF-8/NFC canonicalization; complete QA delta proof with explicit base and persistent history; verify-before-report with immutable artifact receipt and failed-gate audit; pre-push draft restoration and publication-body idempotence. **Final validation and originating-reviewer closure remain pending.**

QA added seven regressions in `tests/workflow/{controller,runtime}-review-regressions.spec.ts`. Against the old candidate, 44 existing tests passed and all seven new tests failed. The last repaired-suite run passed 49/51; two failures were an overly strict Git capability probe. The probe was subsequently fixed to accept `--[no-]merge-base`, but not rerun. No green final-suite claim is justified.

`Dockerfile.test` now uses `node:24-trixie-slim` for compatible Git. A dependency/image preflight build succeeded (`arena-workflow-test-preflight`); it is not a final candidate gate. The product development Dockerfile remains unchanged.

## Next actions, in order

1. Inspect the checkpoint diff and preserved review evidence. Finish the controller order migration: reorder `stages`, stage selection, invalidation, draft dispatch/publication, and QA provisioning/verification so both reviews precede QA. QA verification must invalidate retrospective/downstream evidence without invalidating its completed reviews. Preserve unresolved QA findings until QA closes them after review of the corrected candidate.
2. Migrate fixtures and old/new test sequences to engineering → both reviews → QA verification → final QA report. Update `throughQa` and remove duplicate review submissions from ready helpers. Fix the three `no-await-expression-member` lint errors in the new controller regressions (checkpoint lines 102, 122, 203) by storing awaited results before member access. QA followup has no additional patch: its checkout is clean at the original test commit.
3. Add the planned bounded proofs: compatible extra Engineer tests survive QA delta integration; a same-SHA ready PR with invalidated approval returns to draft; unchanged valid-ready retries remain idempotent. Check all role/native descriptions and diagrams for the approved sequence.
4. Run workflow/adapter tests, formatting, both TypeScript checks, lint, architecture, build, and the required engineering/application coverage gate. Use a Git-capable PATH; the macOS system Git lacks the required flag. Freeze a clean candidate and push to the existing draft PR.
5. Dispatch isolated Standards and Spec reviewers on the fixed base/candidate diff; verify their original findings and the new order. Both must pass **before** independent QA. Then run fresh QA in a detached exact-candidate checkout through the actual Docker runtime, audit per-file Node/browser coverage and meaningful assertions, and close QA findings. Any correction restarts engineering → review → QA.
6. Run the Delivery Lead retrospective only after both reviews and QA pass. Publish proposals only; do not silently change future instructions or model choices. Token/cache statistics are unavailable; do not invent measurements.
7. Update the PR body (currently stale counts and old order), confirm required `test` CI success on the exact final PR head, and mark PR #37 ready. Never merge it. Return the PR URL and verified evidence to the Owner.

The review repair loop is at automatic round 1. Preserve counters; do not restart them to bypass the two-round rule. Issue #4 and Project were not mutated by the read-only dry run. Main's active ruleset requires the `test` check, which includes full coverage.

## Local evidence index

The ignored checkpoint directory preserves the independent Spec/Standards reports and proof, QA report/audit and regression baseline log, forward-test role reports, and draft PR body. `state.json` records original worktree/artifact paths and check commands. No approved PRD content or credentials are included. Agents and the image build stopped at the checkpoint; no new final gates were started after the Owner requested this handoff.
