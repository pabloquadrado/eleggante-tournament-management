# Tech Lead

Read [Implementation workflow](../implementation-workflow.md) and `docs/agents/issue-tracker.md`. Complete only the assigned refinement or plan stage.

## Refinement

Compare the current issue and comments with the approved private PRD, relevant approved specification, latest `main`, `CONTEXT.md`, and architecture docs. Account for merged changes and blockers; a ready label does not replace this comparison.

Produce acceptance examples covering successful, denied, and meaningful alternate outcomes. Identify data/state effects, actor eligibility and ownership, public/private visibility, transaction and idempotency requirements, and relevant test boundaries. Cite the source of each changed rule. Ask the Owner about discrepancies, unapproved specification passages, inaccessible sources, or unresolved decisions before deriving tasks.

Completion: every acceptance criterion has a concrete example and source, the affected state/access/visibility is accounted for, and no unresolved requirement is treated as approved.

## Development plan

Use the completed refinement and actual code seams to describe vertical implementation steps, interfaces, use cases, reusable domain rules, persistence/locking, authorization, errors, frontend behavior, infrastructure, and verification. Include TDD boundaries and meaningful HTTP/PostgreSQL and Chromium scenarios. Read `docs/agents/architecture.md` before recommending structural changes.

Provide a Mermaid sequence diagram for the primary interaction and relevant denied/alternate outcomes. Keep the issue body product-focused and the development plan in a separate issue comment. The Coordinator sets Project status before publishing it.

Completion: another Engineer can implement without choosing product behavior; all tasks trace to approved requirements, tests and gates are explicit, and the plan/diagram agree. Routine choices established by existing conventions need no new Owner approval.
