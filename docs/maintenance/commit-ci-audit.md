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
- Last fully reviewed commit range: the five commits listed below.
- Checkpoint SHA: `cbc7c632d1a88d700ac70b086a497bbbcb760fc0`
- Checkpoint date: 2026-11-02
- Next session: start with commits after this checkpoint. The ledger/agent-instructions documentation commit created alongside this file is newer than the checkpoint and should be included in that next incremental check.

## Initial audit baseline

On 2026-11-02, the combined commit-status lookup was queried for each SHA below. GitHub returned an empty status list for all five. Therefore each result is **unavailable**, not green and not red. No red-cross investigation could be confirmed from those responses. If a red badge is visible in the GitHub UI for any of these commits, revisit that exact commit and record the workflow/job evidence rather than assuming the empty response means it passed.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `cbc7c632` | `docs: improve maintenance workflow guidance` | unavailable | 2026-11-02 | No status entries returned; inspect again only if a visible failing run or new evidence is found. |
| `7ac227d7` | `fix(a11y): skip disabled popup controls during navigation (Refs #217)` | unavailable | 2026-11-02 | No status entries returned. |
| `52726593` | `test(a11y): cover popup focus navigation boundaries (Refs #217)` | unavailable | 2026-11-02 | No status entries returned. |
| `a9c9a21e` | `fix(release): use test discovery for packager checks (Refs #241)` | unavailable | 2026-11-02 | No status entries returned. |
| `c652ce1f` | `feat(release): add versioned extension packaging workflow (Refs #241)` | unavailable | 2026-11-02 | No status entries returned. |

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
