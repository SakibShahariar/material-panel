# Commit CI Audit Ledger

Persistent record of commit-level CI checks and red-cross investigations for Material Panel. This file is the handoff point between maintenance sessions.

## How to use this ledger

1. Read this file before auditing commit checks.
2. Compare the checkpoint below with the current `main` head. Check only commits after the checkpoint, plus any older **red**, **pending**, or explicitly unresolved entries.
3. Record the exact commit SHA and observed result. Do not infer a result from a missing badge, empty API response, or absent workflow record.
4. For a red cross, preserve the original failure entry and append the diagnosis, fix/rerun references, and final outcome. Do not simply overwrite **red** with **green**; retain the investigation history.
5. Advance the checkpoint only after the range has been reviewed. Carry unresolved entries forward explicitly.

### Result meanings

| Result | Meaning |
|---|---|
| **green** | A completed successful check/run was directly observed. |
| **red** | A completed failing check/run was directly observed; investigation is required. |
| **pending** | A check/run exists but has not reached a final state. |
| **unavailable** | The available GitHub response did not expose a result. This is not a pass or failure. |
| **not applicable** | The commit does not trigger the relevant CI by workflow design, with that fact verified. |

## Checkpoint

- Repository: `SakibShahariar/material-panel`
- Default branch: `main`
- Last fully reviewed commit range: the baseline and incremental commits listed below.
- Checkpoint SHA: `df740f85414b598835f58c664e91606e59b13539`
- Checkpoint date: 2026-11-02
- Next session: start with commits after this checkpoint. The ledger update created at the end of this session will be newer than the checkpoint and should be included in the next incremental check.

## Initial audit baseline

On 2026-11-02, the combined commit-status lookup was queried for each SHA below. GitHub returned an empty status list for all five. Therefore each result is **unavailable**, not green and not red. No red-cross investigation could be confirmed from those responses. If a red badge is visible in the GitHub UI for any of these commits, revisit that exact commit and record the workflow/job evidence rather than assuming the empty response means it passed.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `cbc7c632` | `docs: improve maintenance workflow guidance` | unavailable | 2026-11-02 | No status entries returned; inspect again only if a visible failing run or new evidence is found. |
| `7ac227d7` | `fix(a11y): skip disabled popup controls during navigation (Refs #217)` | unavailable | 2026-11-02 | No status entries returned. |
| `52726593` | `test(a11y): cover popup focus navigation boundaries (Refs #217)` | unavailable | 2026-11-02 | No status entries returned. |
| `a9c9a21e` | `fix(release): use test discovery for packager checks (Refs #241)` | unavailable | 2026-11-02 | No status entries returned. |
| `c652ce1f` | `feat(release): add versioned extension packaging workflow (Refs #241)` | unavailable | 2026-11-02 | No status entries returned. |

## Incremental review: 2026-11-02

The following commits newer than the previous checkpoint were reviewed. The combined-status endpoint and commit-associated workflow-run lookup returned empty results for both; both are recorded as **unavailable**, not green or red. The focused local Node test run for the new coordinator passed 3/3 tests. The repository-wide GitHub Actions suite was not observed running.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `82cc6fd7` | `docs: add persistent commit CI audit ledger` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `ccf2a8b0` | `refactor(state): replace global menu callback (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Focused coordinator tests passed locally (3/3); full repository workflow remains unverified. |
| `dd228465` | `docs: record incremental CI review and state migration` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `0b9e8635` | `refactor(state): localize profile identity preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two isolated Node state tests passed (2/2); full repository test suite and GNOME runtime remain unverified. |
| `aa8ead35` | `fix(state): sync profile identity preference on config changes (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Config-watcher wiring was verified from the committed source; no GNOME runtime test available. |
| `8f5bb94f` | `docs: record profile state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `df740f85` | `refactor(state): localize Bluetooth visibility preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. One isolated Node state test passed (1/1); full repository tests and GNOME runtime remain unverified. |

## Red-cross investigation log

No red result has been confirmed from the status data retrieved for the baseline above. Add one entry per observed failure using this template; preserve prior entries when adding rerun results.

### Template

- Commit SHA:
- Commit subject:
- First observed (date):
- Workflow / run URL:
- Failed job / step:
- Failure summary:
- Classification: regression / pre-existing / inconclusive
- Fix commit(s):
- Rerun attempt(s) and result:
- Final verified outcome:
- Remaining follow-up:

## Session history

| Date | Reviewed range / checkpoint | Result summary |
|---|---|---|
| 2026-11-02 | Baseline through `cbc7c632d1a88d700ac70b086a497bbbcb760fc0` | Queried five commits; all returned empty status lists. Recorded as unavailable, not passing. |
| 2026-11-02 | Incremental review through `ccf2a8b0889b32e528bedbe5084cc76379552704` | Reviewed the ledger setup commit and one code commit. Both CI lookups unavailable; 3 focused local unit tests passed. Full workflow result remains unverified. |
| 2026-11-02 | Incremental review through `aa8ead3516527c2e97fecd96841188969a3a38e3` | Reviewed the previous ledger update and two state-migration commits. All CI lookups unavailable; 2 isolated state tests passed; GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `df740f85414b598835f58c664e91606e59b13539` | Reviewed the previous ledger update and Bluetooth state migration. Both CI lookups unavailable; 1 isolated state test passed; GNOME runtime unverified. |
