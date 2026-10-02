# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues. Use the `gh` CLI for all operations.

## Repository and project

- **Repository:** `pabloquadrado/eleggante-tournament-management`
- **Project:** #1, [Eleggante Tournament Management](https://github.com/users/pabloquadrado/projects/1)

Every new issue created for this repository must also be added to the project:

```bash
gh project item-add 1 --owner pabloquadrado --url <issue-url>
```

## Project status during implementation

- When starting a story's development plan, set that issue's Project #1 **Status** to **In Progress** before writing the plan comment.
- After the implementation code is pushed to `main`, set the Project #1 Status to **Done**. Local completion, a commit on another branch, or an open pull request does not meet this condition.
- These are Project item status changes; they do not change the GitHub issue's open/closed state.

## Conventions

### Story and development-plan language

- Write every user-story issue for a product reader. The title, “As a …” story, outcome, and acceptance criteria describe what a person can do or see and why it matters. Use the domain glossary and plain English; avoid framework, database, container, API, schema, and test jargon in those sections.
- Keep the issue body as the durable product contract: parent, user story, user-visible outcome, acceptance criteria, and blockers. Link to the approved PRD and epic spec for detailed rules. Do not make a story depend on reading an implementation plan to understand its value.
- Put the technical development plan in a separate issue comment before implementation. That comment covers architecture, data/state changes, authorization, public projection, interfaces, TDD/unit and integration tests, infrastructure, and verification. Record refinements or unresolved decisions there and reconcile changes with the approved PRD and spec. Do not turn a plan comment into a second, conflicting source of product requirements.
- During development planning, add a concise Mermaid sequence diagram to that comment for the story's main event or user interaction. Show the actor, relevant system boundaries, and meaningful alternate or denied outcomes. Use plain English messages that a product reader can follow; explain technical choices in the surrounding plan. Base the flow on the approved acceptance criteria and record any new decision before treating the diagram as settled.
- Apply this separation to every new or revised user-story ticket. Add diagrams to existing stories as their development plans are created or revised. Story #2's existing plan demonstrates the body/comment separation and predates the diagram rule.

- **Create an issue:** `gh issue create --title "..." --body "..."`, then add it to Project #1.
- **Read an issue:** `gh issue view <number> --comments`, including labels.
- **List issues:** `gh issue list --state open --json number,title,body,labels,comments` with the appropriate label and state filters.
- **Comment:** `gh issue comment <number> --body "..."`.
- **Apply or remove labels:** `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close:** `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue, apply the requested label, and add it to Project #1.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is one issue labeled `wayfinder:map`, holding the Notes, Decisions-so-far, and Fog body. Add the map and all child issues to Project #1.

- **Child ticket:** link it as a GitHub sub-issue where available; otherwise include `Part of #<map>` at the top of its body. Use `wayfinder:<type>` labels (`research`, `prototype`, `grilling`, or `task`).
- **Blocking:** prefer GitHub native issue dependencies; otherwise use a `Blocked by: #<number>` line in the issue body.
- **Claim:** `gh issue edit <number> --add-assignee @me`.
- **Resolve:** comment with the result, close the issue, and update the map’s Decisions-so-far.
