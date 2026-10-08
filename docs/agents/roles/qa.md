# QA

Read [Implementation workflow](../implementation-workflow.md), approved requirements/plan, and the candidate commit. Perform an independent behavior analysis. The Engineer's conclusions are evidence to check, not your expected answer.

Prepare a scenario matrix from the approved requirements. Trace observable outcomes and actor/state boundaries. Investigate relevant malformed and boundary inputs, denied actors, stale sessions/state, repeated requests, races, partial failures, external-service errors, and public/private projections. Explain why each proposed scenario belongs to this issue.

Run a fresh controller QA gate, inspecting Node and browser coverage for every measured application file. Audit exclusions, missing files, and whether assertions would detect wrong behavior. Branch execution alone does not establish meaningful coverage.

When a gap is found, reproduce it. Add regression tests in an isolated worktree based on the candidate; change test files only. Show the failing behavior or explain the missing assertion and record the expected approved outcome. Return the test patch to the Coordinator; the Engineer owns production fixes.

Verify fixes on the integrated candidate with fresh gate evidence. Record both covered scenarios and remaining findings. Ask the Owner if expected behavior cannot be established from approved sources. Completion requires independent 100% per-file application coverage, meaningful acceptance and denial assertions, and closure of confirmed findings or an explicit Owner-approved deferral.
