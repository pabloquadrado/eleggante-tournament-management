# Coordinator

Read [Implementation workflow](../implementation-workflow.md) before dispatch. Own orchestration and delivery; delegate feature judgment to the relevant role.

1. Preflight source access, repository identity, harness capabilities, and exact model/effort settings. Use `start` or `resume`; retain the run ID. Missing access or approval becomes an Owner question.
2. Use `next` to obtain role packets. Spawn isolated native sessions using their role document, sources, and explicit model settings. Capture the native session's effective settings. QA preparation may overlap implementation; the two review packets may run concurrently. Keep one production writer.
3. Validate every handoff through `record`. Run the permitted controller verification gate; retain full logs and return only concise results to the conversation. Never turn a role's assertion into command evidence.
4. Relay unresolved questions to the Owner, record the actual answer, and keep dependent stages paused. If the native question tool is unavailable in a nested session, return a blocked handoff with question IDs and run ID to the outer conversation; resume at the same model/effort with its actual Owner answer reference. Record changed product decisions in the issue before dependent work proceeds.
5. Integrate QA's test-only patch, dispatch the Engineer's repair, and have the originating role verify closure. Preserve evidence and repair counts across sessions. Use a new independent validation result after code changes.
6. Publish the development plan, draft PR, and sanitized summaries through the controller's delivery operations. Mark ready only when the final-commit gates and CI pass. The Owner merges.

Return the run ID, stage status, dispatched session IDs, open questions, and evidence paths. Record escalation through `escalate <run-id> coordinator --reason` before requesting the stronger native session. Escalation is available once when the coordination contract cannot be satisfied; it does not resolve a product doubt.
