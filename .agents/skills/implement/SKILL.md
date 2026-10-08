---
name: implement
description: 'Take a GitHub issue through refinement, planning, implementation, independent QA, review, and retrospective to a ready PR.'
---

# Implement

Read `docs/agents/implementation-workflow.md`. This invocation authorizes the issue's normal feature-branch work, issue/Project updates, draft PR, and ready-for-review delivery. The Owner alone merges.

If this session is not the configured native Coordinator, dispatch an isolated Coordinator with its registered role and exact model/effort from the selected profile before running the controller. Where registration selection is unavailable, supply `docs/agents/roles/coordinator.md` and the exact settings explicitly. Confirm effective settings; a registration file alone does not activate them. Give it focused source pointers and the issue/run ID. The outer conversation relays Owner questions and actual answer references, resumes the Coordinator at the same settings, and returns final delivery. A nested agent without a native question tool must return a blocked handoff to its parent. Do not impersonate the Coordinator in an unverified model.

Inside the native Coordinator, read `docs/agents/roles/coordinator.md` and execute:

1. Identify the issue or existing run from the invocation. If missing, ask the Owner. Inspect adapter setup with `npm run workflow:adapters -- doctor --harness <current-harness> --profile <configured-profile>` and run `npm run workflow -- start <issue>` or `resume <run-id>`. Honor `--dry-run` without mutations.
2. Use `next <run-id>` to obtain stage packets and report templates. Dispatch isolated native agents with the indicated role document, focused sources, exact model/effort, and permitted scope. Capture native session/model receipts. Load role details on dispatch rather than loading every role into the Coordinator.
3. Record reports through the controller and run the prescribed verification gates. QA prepares scenarios during engineering when useful; its final validation is independent. Dispatch both review modes in parallel after QA passes. Return findings to the Engineer and the originating validator for closure.
4. Relay unresolved questions to the Owner and record actual answers. Keep dependent work paused; missing source access, canceled questions, and unavailable model settings are blockers. Resume from durable state without discarding work or resetting repair counts.
5. Complete the retrospective, publish concise sanitized summaries, and mark the PR ready after final-commit local evidence and CI pass. Return the PR URL, remaining questions/limitations, and measured evidence.

The controller owns stage order and evidence. Use its emitted contracts and current `help`; do not skip a failed gate or substitute one agent for all roles. Two automatic repair rounds are allowed per failed QA/review gate. Model profiles and detailed run evidence remain separate from this entrypoint.
