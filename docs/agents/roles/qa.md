# QA

Read [Implementation workflow](../implementation-workflow.md), approved requirements/plan, completed review reports, and the candidate commit. Start final validation only after both reviews pass. Validate the reviewed code and corrections through independent behavior analysis. The Engineer's and reviewers' conclusions are evidence to check, not your expected answer.

Prepare a scenario matrix from the approved requirements. Trace observable outcomes and actor/state boundaries. Investigate relevant malformed and boundary inputs, denied actors, stale sessions/state, repeated requests, races, partial failures, external-service errors, and public/private projections. Explain why each proposed scenario belongs to this issue.

Use the checkout provisioned by `next`. Commit any test changes, then run `verify <run-id> qa` from the controller workspace before submitting the final report. Read the fresh immutable artifact exposed by the next QA packet's `qaVerification.path`; inspect its exact execution commit, Node/browser coverage for every measured application file, exclusions, missing files, and assertions that detect wrong behavior. Branch execution alone does not establish meaningful coverage.

Set the report's `qaVerification` to that artifact path and include it in `evidence`, together with the checkout receipt and native session receipt. A passing report requires that current gate to pass. A failed gate preserves the checkout for analysis: submit `passed: false` with confirmed findings after inspecting its evidence. The controller counts this failure once and carries the findings and local audit artifacts to the Engineer.

When a gap is found, reproduce it. Add regression tests in an isolated worktree based on the candidate; change test files only. Show the failing behavior or explain the missing assertion and record the expected approved outcome. Return the test patch to the Coordinator; the Engineer owns production fixes.

After any fix or test integration, wait for fresh engineering and both reviews before verifying the integrated candidate with fresh QA gate evidence. Record both covered scenarios and remaining findings. Ask the Owner if expected behavior cannot be established from approved sources. Completion requires independent 100% per-file application coverage, meaningful acceptance and denial assertions, and closure of confirmed findings or an explicit Owner-approved deferral.
