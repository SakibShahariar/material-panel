# Instructions for AI Coding Agents

These instructions apply to the entire repository. Follow any more specific `AGENTS.md` found in a subdirectory as well. If instructions conflict, prefer the most specific applicable project guidance, while preserving the safety rules below.

## Before Making Changes

- Read the project README, contribution guidance, relevant source files, tests, build configuration, and recent history before editing.
- Identify the default branch and work on it directly. Do not create branches or pull requests unless explicitly requested.
- Check the current working tree and latest remote state before writing. Never overwrite unrelated or newer work.
- Understand the reported problem and reproduce it where practical. Prefer fixing root causes over symptoms.
- Preserve existing architecture, public interfaces, user data, compatibility, and project conventions unless a change is necessary and justified.
- Do not assume a language, framework, package manager, build system, or test command. Discover and use what this repository actually provides.

## Issue Triage and Implementation

- Prioritize existing, actionable open issues over speculative features or cosmetic churn.
- Prefer small, independently verifiable issues that can be completed confidently. Work on multiple independent issues during a maintenance session when practical, without mixing unrelated changes into one commit.
- Do not close an issue merely because code was changed. Close it only after the stated acceptance criteria are met and the fix has been verified to the extent possible.
- Reference the relevant issue number in the commit message when a commit fixes an issue (for example, `Fixes #123` in the commit body when appropriate).
- Keep issues open when validation requires unavailable hardware, a user-specific environment, an interactive desktop session, credentials, or manual confirmation. Explain what remains to be checked instead of claiming completion.
- Do not close user-created issues or mark work as not planned unless the repository owner explicitly directs you to do so.

## Code Quality and Testing

- Follow the repository's established formatting, naming, documentation, dependency, and error-handling conventions.
- Add or update focused tests for behavior changes when the project has a suitable test setup.
- Run relevant available tests, linters, formatters, type checks, and build checks. Do not add CI workflows or checks without a concrete project need.
- Inspect the complete output and exit status of every check. Fix failures caused by your changes; investigate pre-existing failures and report them accurately.
- Review all commits created during the maintenance run and their associated CI/check results, not only the latest commit. Do not report a check as passing unless its result was actually observed.
- Static checks do not prove runtime, graphical, hardware, or platform integration behavior. In particular, do not claim GNOME Shell/session compatibility without testing in a real GNOME session.
- If a necessary test cannot be run in the available environment, state the limitation clearly and leave validation-dependent work unresolved.

## GNOME Shell UX and Lifecycle

- Keep panel chips and popups consistent with the existing Material Panel design language, theme variables, spacing, and interaction patterns. Inspect neighboring modules before introducing a new pattern.
- For empty, loading, unavailable, and error states, explain what happened in concise user-facing language. Provide a relevant next action when one genuinely exists; do not add dead-end or misleading actions.
- Prefer reusable helpers or shared components when the same state pattern is needed in multiple modules. Avoid creating a generic abstraction for a single isolated use case unless it materially improves clarity.
- Preserve keyboard navigation, focus behavior, accessible names, and useful tooltips when changing interactive controls.
- Respect GNOME Shell actor ownership and lifecycle. Disconnect signal handlers, remove timers/sources, cancel asynchronous work, and destroy owned actors during teardown.
- Avoid blocking the Shell main loop with synchronous I/O or expensive work. Preserve existing refresh throttling and avoid unnecessary polling or background activity.
- Treat GNOME Shell version compatibility as a runtime claim: inspect supported APIs and compatibility helpers, but report runtime testing separately from syntax or unit-test results.

## Maintenance Session Continuity

- At the start of each continuation, verify the current default branch, latest commit, relevant open issue, and any work left incomplete by the previous session.
- Keep a clear distinction between commits made, issues fully closed, and issues partially addressed. A commit is not an issue closure.
- Prioritize reducing actionable backlog through verified completions, not merely increasing commit count. Do not spend a session repeatedly polishing already-completed work while straightforward open issues remain.
- Before ending a maintenance run, identify the next actionable issue and any validation needed to finish it. Do not claim the backlog is exhausted without reviewing the remaining open issues.
- If GitHub returns no status checks or workflow runs for a commit, report the CI result as unavailable or not verified. Never infer success, failure, or that workflows were disabled from an empty result alone.

## Git and Commit Practices

- Commit directly to the repository's existing default branch; do not force-push, rewrite history, reset away others' work, or amend published commits.
- Fetch/review the latest branch state before committing. Keep changes focused and avoid including unrelated modifications.
- Use the repository's documented commit convention. If none exists, use clear Conventional Commit messages such as `fix(scope): ...`, `feat(scope): ...`, `docs: ...`, or `test: ...`.
- Include issue references for issue-related commits. Do not create empty or misleading commits.
- After committing, verify the commit exists on the intended default branch and inspect the resulting diff/status.

### Administrative Commit Hygiene

- Do not create standalone commits solely for issue-triage edits, category changes, backlog counts, CI-ledger housekeeping, or routine maintenance notes.
- Keep routine triage and progress information in working notes or the relevant GitHub issues instead of creating repository commits.
- When a substantive code, test, or documentation change is already being committed, include only directly related maintenance-documentation updates in that same focused commit.
- Keep commits logically coherent. Never bundle unrelated changes merely to avoid an administrative-only commit.
- Do not rewrite or force-push published history to remove administrative commits that already exist.

## Documentation and Dependencies

- Keep documentation accurate, concise, and consistent with the actual implementation.
- Do not duplicate information already maintained elsewhere or add lengthy documentation without a clear benefit.
- Avoid new dependencies when the existing stack can solve the problem. Justify any dependency or build-system change.
- Never invent supported platforms, installation commands, test results, performance claims, or feature status.

## Reporting

- Summarize concrete changes with file paths and commit identifiers.
- Distinguish verified results from assumptions and unrun checks.
- List remaining manual validation, blockers, and issues intentionally left open.



## Acceptance-Criteria Checklist Discipline

- Treat every issue acceptance criterion written as a Markdown task-list item as a completion gate, not merely descriptive text.
- Before implementation, record the issue's acceptance criteria and map each one to the code, tests, or documentation that will satisfy it.
- Before closing an issue, verify every criterion individually against the final implementation and available test evidence. Change each satisfied item from `- [ ]` to `- [x]` in the issue body before or as part of closing it.
- Never tick a criterion based only on a commit message, an intended design, or the fact that the issue is already closed. Leave unsupported, untested, or environment-dependent criteria unchecked and explain the remaining validation.
- For already-closed issues, perform a retrospective audit. Edit the issue body to tick only criteria supported by the merged code and test evidence; do not reopen an issue solely to correct its checklist. Reopen only when the audit finds genuinely incomplete work that still needs implementation.
- After editing an issue checklist, fetch the issue again and verify that the updated body and issue state were saved. Report the number of issues and criteria audited, and distinguish verified completions from unresolved items.
- When an issue has no explicit acceptance checklist, do not invent checked boxes. If useful, propose criteria in a separate issue-body edit only when they can be grounded in the original scope and completed work.
- For issues closed as duplicates, identify and link the canonical issue. Keep the duplicate's acceptance checklist unchecked unless its criteria were independently implemented and verified; completion should normally be recorded on the canonical issue.

## Maintenance Session Execution

- Start by reviewing actionable open issues in batches. Identify dependencies, shared root causes, acceptance criteria, and tasks that do not require unavailable runtime access.
- Do not limit a maintenance session to one issue when several independent, source-verifiable issues are ready. Implement multiple useful fixes in the same session and continue until actionable work is exhausted or a genuine blocker remains.
- Group related fixes into coherent commits when they share a root cause or change set. Keep unrelated work in separate focused commits; do not create a commit for every trivial edit or combine unrelated issues merely to increase issue count. Preserve any stricter repository-specific commit requirements above.
- Do not pause for approval or send a progress report after every issue or commit. Continue through the planned batch, verify the work, and report at a meaningful stopping point.
- If an issue requires unavailable hardware, credentials, a live desktop session, or user confirmation, leave it open and continue with independently verifiable work.
- Treat each commit as unfinished until its associated CI and checks reach a final state. Inspect failed job details, fix regressions introduced by the change, and rerun relevant checks. Pending checks are not passing checks.
- Before ending a session, review all commits made during that session, their CI results, remaining actionable issues, and required manual validation.
- Optimize for verified issue completion and a healthy default branch, not commit volume, issue-closure volume, or frequent status messages.

## Incremental Commit CI Audit Ledger

- Maintain `docs/maintenance/commit-ci-audit.md` as the persistent source of truth for commit-level CI review across maintenance sessions.
- At the start of a session, read the ledger and compare its recorded checkpoint with the current default-branch head. Inspect only commits newer than the checkpoint, plus older entries explicitly marked red, pending, or requiring follow-up. Do not re-audit resolved commits without a concrete reason.
- For every commit reviewed, record its full SHA, subject, review date, workflow/check result, and evidence link or API result. Use only these states: **green**, **red**, **pending**, **unavailable**, or **not applicable**. An empty status/workflow response is **unavailable**, never green.
- For every red result, record the failing workflow and job, concise failure cause, whether the failure is a regression or pre-existing, the fix/rerun commit, and the final verified result. Keep the entry open until a final result is observed; never erase the original failure history.
- Record reruns against the original failing commit and link the rerun run/attempt. A rerun does not change the commit SHA.
- Advance the checkpoint only after all commits through that point have been reviewed and every red/pending item has either reached a final result or is explicitly carried forward as unresolved. Include the checkpoint SHA and date in the ledger.
- At each session end, add all commits reviewed during that session and leave the next unreviewed commit range clear. Keep the ledger concise; do not copy full logs when a durable run/job URL is available.
- Documentation-only commits that update this ledger are still commits; they may be recorded in the next session's incremental range rather than creating an endless self-referential update loop.

## Issue Classification System

Classify every open issue into exactly one of these categories during triage. Record the category and a brief evidence-based reason in the issue notes or maintenance tracker; do not apply a category based on guesswork.

- **Category A — Fully actionable:** The issue can be implemented, tested, and fully verified with the available source code, automated tests, and CI. No user laptop, live desktop session, special hardware, or manual confirmation is required. Prioritize these issues and close them only after their acceptance criteria are met and verification succeeds.
- **Category B — Implementation ready, validation pending:** The implementation can be completed now, but final acceptance requires unavailable real-world validation such as a live GNOME session, visual/accessibility inspection, or measurements on target hardware. Implement and automate everything possible, but keep the issue open until the remaining validation is completed and recorded.
- **Category C — Environment-dependent:** Reliable implementation or verification is not currently possible without a specific laptop, hardware, operating system/runtime, device, or interactive environment. Document the missing environment and any useful reproduction steps; keep the issue open.
- **Category D — Blocked by external dependencies:** Progress depends on an unavailable external service, upstream change, third-party project, API, or other dependency outside this repository. Identify the exact dependency and the condition that will unblock the work; revisit when it changes.
- **Category E — Needs the repository owner's decision or information:** The issue needs a preference, clarification, approval, credentials, missing requirements, or other information only the owner can provide. Ask the owner a specific, concise question instead of silently deferring it. Once answered, reclassify the issue into the appropriate category and continue.

### Classification workflow

- Review all open issues and assign the best-supported category, with a short reason and any outstanding acceptance criteria.
- Work through Category A first; then complete the implementation portions of Category B where useful. Do not confuse implementation completion with final validation.
- For Category E, ask the owner promptly and track the answer needed. Do not leave it indefinitely in a generic blocked/deferred bucket.
- Keep Categories B, C, and D visible and actionable: state exactly what remains, who or what can unblock it, and when it should be revisited.
- Reassess categories when code, tests, CI, upstream dependencies, environments, or owner decisions change. Never close an issue solely because it has been categorized.


## Acceptance Criteria Integrity

Acceptance criteria must reflect reality: check a criterion only when its complete requirement is implemented and supported by concrete evidence. Leave incomplete, partial, untested, and unverified criteria unchecked. Before closing an issue, compare every checkbox with the current code, tests, CI, and required manual validation. Do not infer completion from a commit or closed issue. Reopen previously closed issues when required criteria remain unmet or unverified, and explain the remaining work.
