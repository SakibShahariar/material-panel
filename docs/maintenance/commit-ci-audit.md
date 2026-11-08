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
- Checkpoint SHA: `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`
- Checkpoint date: 2026-11-07
- Next session: start with the next commit after this checkpoint, then review every subsequent commit.

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
| `851785c9` | `docs: record Bluetooth state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `e083ec86` | `refactor(state): localize media visibility preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. One isolated Node state test passed (1/1); the focused source-wiring test was updated but the complete mediaAutoHide test file and full suite were not run. GNOME runtime remains unverified. |
| `1ee94b2e` | `docs: record media state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `22c687fe` | `refactor(state): localize network speed visibility preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. One isolated Node state test passed (1/1); the complete mediaAutoHide test file and full suite were not run. GNOME runtime remains unverified. |
| `ae1075fb` | `docs: record network speed state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `1bb61da5` | `refactor(state): localize network speed unit preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. One isolated Node normalization/reset test passed (1/1); the full networkSpeedUnits test file and repository suite were not run. GNOME runtime remains unverified. |
| `598fe119` | `docs: record network unit state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `91e32e0a` | `refactor(state): localize workspace display preferences (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Three focused isolated Node state tests passed (3/3); the full repository test suite and GNOME runtime remain unverified. |
| `6b5182b4` | `docs: record workspace state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `91fea747` | `refactor(state): localize media visualizer preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two focused isolated Node state tests passed (2/2); the full repository test suite and GNOME runtime remain unverified. |
| `2b60852a` | `docs: record media visualizer state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `3d37d44b` | `refactor(state): localize weather location preference (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two focused isolated Node state tests passed (2/2); the full repository test suite and GNOME runtime remain unverified. |
| `d43c4bde` | `docs: record weather location state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `a8ffd65d` | `refactor(state): localize Quick Settings preferences (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Three focused isolated Node state tests passed (3/3); full Quick Settings regression tests, full repository suite, and GNOME runtime remain unverified. |
| `c0f00846` | `docs: record Quick Settings state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `41f8c6dd` | `refactor(state): localize panel layout selection (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two focused isolated Node state tests passed (2/2); full test suite and GNOME runtime remain unverified. |
| `93701727` | `docs: record panel layout state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `6fc0d1e2` | `refactor(state): localize CPU activity preferences (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. CPU regression assertions were updated, but the focused CPU test files, full suite, and GNOME runtime were not run. |
| `21d52e72` | `docs: record CPU-local state migration CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `0d455644` | `refactor(state): localize Quick Settings coordination (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two focused isolated callback tests passed (2/2); full coordination regression tests and GNOME runtime remain unverified. |
| `0a371295` | `docs: record Quick Settings coordination CI review` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. |
| `00c67a92` | `refactor(state): localize shared activity samples (Refs #88, #237)` | unavailable | 2026-11-02 | Combined status and commit workflow-run lookups returned no entries. Two focused isolated state tests passed (2/2); the activity-chip regression test, full suite, and GNOME runtime remain unverified. |

## Incremental review: 2026-11-02 — Preferences modularization

The previous checkpoint was `00c67a929dfaa29fe092899b8ba0ffb5fbb65390`. The four commits below were reviewed through the current `main` head. Combined-status lookups returned empty arrays for all four, so the CI states below are based on the associated GitHub Actions workflow runs where available. Empty status arrays are not treated as passing checks.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `69bf2793` | `docs: record shared activity sample state CI review` | unavailable | 2026-11-02 | No combined statuses or commit-associated workflow runs returned. |
| `6a5d7651` | `refactor(prefs): split preferences pages into modules (Fixes #244)` | red | 2026-11-02 | Run [#41485813941](https://github.com/SakibShahariar/material-panel/actions/runs/41485813941) failed in the JavaScript regression step: seven existing source-wiring tests still read moved page code from `prefs.js`. Syntax check passed. Resolved by test updates in `403e9ef8`; see the red-cross investigation below. |
| `403e9ef8` | `test(prefs): follow extracted preference page modules (Refs #244)` | green | 2026-11-02 | Run [#41486151320](https://github.com/SakibShahariar/material-panel/actions/runs/41486151320) passed: JavaScript syntax check, 402/402 JavaScript tests, and 20/20 Python tests. |
| `16331845` | `fix(package): include split preferences modules (Refs #244)` | green | 2026-11-02 | Run [#41486582850](https://github.com/SakibShahariar/material-panel/actions/runs/41486582850) passed: JavaScript syntax check, 402/402 JavaScript tests, and 20/20 Python tests. The package fixture now verifies that `prefs/*.js` files are included in the release archive. |

The refactor moved the Layout, Modules, Tray, and Appearance page builders into `prefs/`, and moved the shared module catalog there as well. The first CI failure was caused by existing tests asserting the old source-file location; those tests now inspect the new page modules. A final packaging review found that the release packager did not include the new directory, so the packager and its fixture were updated before the final green run. Live GNOME Preferences smoke testing remains unverified.

## Incremental review: 2026-11-02 — Theme refactor, shared state, and popup accessibility

The previous checkpoint was `16331845a1dcb778637280f65558b68c2391bdd9`. All 11 commits through `1a403ac2cff4f56a3dc7a39b948cccee2557a648` were checked against their associated GitHub Actions runs. Combined-status responses remained empty; the explicit workflow-run results below are authoritative.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `56a8a837` | `docs: record preferences refactor CI investigation (Refs #244)` | green | 2026-11-02 | [Run #41486775700](https://github.com/SakibShahariar/material-panel/actions/runs/41486775700) completed successfully. |
| `1cb5d1c3` | `refactor(theme): extract pure stylesheet renderers (Refs #221)` | red | 2026-11-02 | [Run #41489441164](https://github.com/SakibShahariar/material-panel/actions/runs/41489441164): 4/406 JS tests failed because theme fallback, dimension, and typography assertions still expected the old implementation location/output. |
| `583e3c9f` | `test(theme): follow extracted renderer modules (Refs #221)` | red | 2026-11-02 | [Run #41489672242](https://github.com/SakibShahariar/material-panel/actions/runs/41489672242): 1/406 JS test still expected typography tokens in `theme.js`. |
| `e448851a` | `refactor(theme): separate palette parsing and file watching (Refs #221)` | red | 2026-11-02 | [Run #41490138200](https://github.com/SakibShahariar/material-panel/actions/runs/41490138200): the same stale typography source assertion remained. |
| `4a0c11e5` | `refactor(theme): isolate palette and watcher services (Refs #221)` | red | 2026-11-02 | [Run #41490267109](https://github.com/SakibShahariar/material-panel/actions/runs/41490267109): nested-symlink and routine-logging tests still expected watcher code in `theme.js`; typography source assertion also remained. |
| `a15f2310` | `test(theme): follow extracted palette and watcher modules (Refs #221)` | red | 2026-11-02 | [Run #41490560322](https://github.com/SakibShahariar/material-panel/actions/runs/41490560322): nested-symlink and typography source assertions still needed relocation. |
| `4faef86f` | `test(theme): read typography tokens from renderer module (Refs #221)` | red | 2026-11-02 | [Run #41490660831](https://github.com/SakibShahariar/material-panel/actions/runs/41490660831): nested-symlink test still expected the resolver in `theme.js`. |
| `1cb96717` | `refactor(theme): isolate stylesheet lifecycle management (Refs #221)` | red | 2026-11-02 | [Run #41491007626](https://github.com/SakibShahariar/material-panel/actions/runs/41491007626): nested-symlink and stylesheet-cache tests still referenced pre-extraction ownership. |
| `f023f637` | `test(theme): verify extracted stylesheet and watcher ownership (Refs #221)` | green | 2026-11-02 | [Run #41491249895](https://github.com/SakibShahariar/material-panel/actions/runs/41491249895) passed 410/410 JavaScript tests and 20/20 Python tests. |
| `977cf1db` | `refactor(state): replace theme color globals with service (Refs #88, #237)` | green | 2026-11-02 | [Run #41492383525](https://github.com/SakibShahariar/material-panel/actions/runs/41492383525) passed 413/413 JavaScript tests and 20/20 Python tests. |
| `1a403ac2` | `fix(a11y): make popup keyboard focus visible and ordered (Refs #217)` | green | 2026-11-02 | [Run #41493069465](https://github.com/SakibShahariar/material-panel/actions/runs/41493069465) passed 416/416 JavaScript tests and 20/20 Python tests. |

The ThemeManager was split into palette, renderer, stylesheet-lifecycle, and watcher modules. The first several CI failures were stale source-location assertions that were updated as each responsibility moved; the final theme extraction run passed. The theme-color globals were then migrated to a module-scoped service, and popup keyboard focus gained visibility/order safeguards and native activation-key propagation. Live GNOME checks remain open for #221, #237, and #217.

## Incremental review: 2026-11-02 — Focus-session DND

The previous checkpoint was `1a403ac2cff4f56a3dc7a39b948cccee2557a648`. All five commits through `2c42b3c744c81a490965e5b73433506d234ebf04` were reviewed against their associated GitHub Actions runs. Combined-status responses remained empty; the explicit workflow-run results below are authoritative.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `2be61e7a` | `docs: record theme state and popup focus CI review` | green | 2026-11-02 | [Run #41493747997](https://github.com/SakibShahariar/material-panel/actions/runs/41493747997) completed successfully. |
| `9d7e1217` | `feat(dnd): add cancellable focus sessions (Refs #214)` | red | 2026-11-02 | [Run #41494374462](https://github.com/SakibShahariar/material-panel/actions/runs/41494374462): new test file had an escaped-template syntax error, and the existing DND accessible-name assertion expected the old label. |
| `55830e99` | `test(dnd): cover focus session UI and accessible state (Refs #214)` | red | 2026-11-02 | [Run #41494592712](https://github.com/SakibShahariar/material-panel/actions/runs/41494592712): one new UI source assertion expected a literal duration string rather than the implementation's generated duration label. |
| `158be27a` | `test(dnd): simplify focus-session source assertions (Refs #214)` | red | 2026-11-02 | [Run #41494694837](https://github.com/SakibShahariar/material-panel/actions/runs/41494694837): the same duration assertion still did not match the template-string implementation. |
| `2c42b3c7` | `test(dnd): assert focus session duration choices (Refs #214)` | green | 2026-11-02 | [Run #41494846774](https://github.com/SakibShahariar/material-panel/actions/runs/41494846774) passed 424/424 JavaScript tests and 20/20 Python tests. |

The DND feature uses a module-scoped focus-session service and the existing GNOME `show-banners` setting. Follow-up commits corrected the test syntax, updated the accessible-name assertion, and aligned the UI source assertion with the generated duration labels. The final CI run is green; live GNOME popup interaction is recommended.

## Incremental review: 2026-11-07 — Quick Launch, notification actions, and workspace filters

The previous checkpoint was `2c42b3c744c81a490965e5b73433506d234ebf04`. All 29 commits through `2e82ddba2107a785774d98b2420f183340245fde` were checked against their actual push-triggered GitHub Actions runs. Empty combined-status responses were not treated as passing; the run results below are the evidence.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `77c122e7` | `docs: record focus-session DND CI investigation` | green | 2026-11-07 | [Run #41495230006](https://github.com/SakibShahariar/material-panel/actions/runs/41495230006) passed. |
| `0289dffb` | `docs: define issue triage categories` | green | 2026-11-07 | [Run #41573352201](https://github.com/SakibShahariar/material-panel/actions/runs/41573352201) passed. |
| `10d3c86e` | `docs(agents): define administrative commit hygiene` | green | 2026-11-07 | [Run #41597953171](https://github.com/SakibShahariar/material-panel/actions/runs/41597953171) passed. |
| `dc9260d4` | `docs(agents): clarify acceptance criteria evidence` | green | 2026-11-07 | [Run #41864057401](https://github.com/SakibShahariar/material-panel/actions/runs/41864057401) passed. |
| `c4ed82ec` | `feat(quick-launch): add optional Quick Settings shortcuts (Refs #253)` | green | 2026-11-07 | [Run #42334603207](https://github.com/SakibShahariar/material-panel/actions/runs/42334603207) passed. |
| `9a76d48b` | `test(quick-launch): extract injectable launch dispatcher (Refs #253)` | green | 2026-11-07 | [Run #42336059838](https://github.com/SakibShahariar/material-panel/actions/runs/42336059838) passed. |
| `6bf19019` | `test(quick-launch): cover app and command launch dispatch (Refs #253)` | green | 2026-11-07 | [Run #42336068784](https://github.com/SakibShahariar/material-panel/actions/runs/42336068784) passed. |
| `754c6b4c` | `refactor(quick-launch): use testable launch dispatcher (Refs #253)` | green | 2026-11-07 | [Run #42336078418](https://github.com/SakibShahariar/material-panel/actions/runs/42336078418) passed. |
| `b6a0cdc1` | `feat(notifications): add safe native action helpers (Refs #250)` | green | 2026-11-07 | [Run #42336348829](https://github.com/SakibShahariar/material-panel/actions/runs/42336348829) passed. |
| `1aa4dc4c` | `test(notifications): cover native action extraction and dispatch (Refs #250)` | green | 2026-11-07 | [Run #42336355222](https://github.com/SakibShahariar/material-panel/actions/runs/42336355222) passed. |
| `1a3fbb09` | `feat(notifications): render native notification actions (Refs #250)` | green | 2026-11-07 | [Run #42336366095](https://github.com/SakibShahariar/material-panel/actions/runs/42336366095) passed. |
| `a1988556` | `test(notifications): verify native action card integration (Refs #250)` | green | 2026-11-07 | [Run #42336372101](https://github.com/SakibShahariar/material-panel/actions/runs/42336372101) passed. |
| `838b931d` | `fix(notifications): refresh cards when native actions change (Refs #250)` | green | 2026-11-07 | [Run #42336388790](https://github.com/SakibShahariar/material-panel/actions/runs/42336388790) passed. |
| `86b0e783` | `test(notifications): cover native action change refresh (Refs #250)` | green | 2026-11-07 | [Run #42336392972](https://github.com/SakibShahariar/material-panel/actions/runs/42336392972) passed 447/447 JavaScript tests and 20/20 Python tests. |
| `9010bc77` | `feat(workspaces): add active and occupied workspace filters (Refs #219)` | green | 2026-11-07 | [Run #42336573829](https://github.com/SakibShahariar/material-panel/actions/runs/42336573829) passed. |
| `1024740d` | `test(workspaces): cover active urgent and occupied filters (Refs #219)` | green | 2026-11-07 | [Run #42336583743](https://github.com/SakibShahariar/material-panel/actions/runs/42336583743) passed. |
| `6f2156f2` | `feat(workspaces): store workspace filter preference (Refs #219)` | green | 2026-11-07 | [Run #42336589047](https://github.com/SakibShahariar/material-panel/actions/runs/42336589047) passed. |
| `d71f3d92` | `feat(config): persist workspace visibility filter (Refs #219)` | green | 2026-11-07 | [Run #42336596088](https://github.com/SakibShahariar/material-panel/actions/runs/42336596088) passed. |
| `96575a14` | `feat(workspaces): sync workspace filter from config (Refs #219)` | green | 2026-11-07 | [Run #42336607357](https://github.com/SakibShahariar/material-panel/actions/runs/42336607357) passed. |
| `fce158fc` | `feat(prefs): add workspace visibility filter (Refs #219)` | green | 2026-11-07 | [Run #42336616020](https://github.com/SakibShahariar/material-panel/actions/runs/42336616020) passed. |
| `c0c396b7` | `feat(workspaces): filter indicators by workspace activity (Refs #219)` | green | 2026-11-07 | [Run #42336628737](https://github.com/SakibShahariar/material-panel/actions/runs/42336628737) passed. |
| `a460e379` | `fix(workspaces): refresh urgent filter on window state changes (Refs #219)` | green | 2026-11-07 | [Run #42336645196](https://github.com/SakibShahariar/material-panel/actions/runs/42336645196) passed. |
| `ae1efb47` | `test(workspaces): cover workspace filter state lifecycle (Refs #219)` | green | 2026-11-07 | [Run #42336651366](https://github.com/SakibShahariar/material-panel/actions/runs/42336651366) passed. |
| `02a4c2a5` | `test(workspaces): verify workspace filter config and signal wiring (Refs #219)` | green | 2026-11-07 | [Run #42336657484](https://github.com/SakibShahariar/material-panel/actions/runs/42336657484) passed. |
| `ad3b5cea` | `fix(workspaces): include urgency state in indicator snapshots (Refs #219)` | green | 2026-11-07 | [Run #42336665717](https://github.com/SakibShahariar/material-panel/actions/runs/42336665717) passed. |
| `cc9afc12` | `test(workspaces): verify filtered indicator lifecycle and activation (Refs #219)` | red | 2026-11-07 | [Run #42336671958](https://github.com/SakibShahariar/material-panel/actions/runs/42336671958) failed on stale source assertions in the new UI test; see investigation below. |
| `d9005047` | `fix(workspaces): include minimized urgent windows in filtering (Refs #219)` | red | 2026-11-07 | [Run #42336691060](https://github.com/SakibShahariar/material-panel/actions/runs/42336691060) still included stale workspace-label and urgency assertions; see investigation below. |
| `9c5f4941` | `test(workspaces): cover minimized urgent windows (Refs #219)` | red | 2026-11-07 | [Run #42336697270](https://github.com/SakibShahariar/material-panel/actions/runs/42336697270) still failed the stale workspace-label assertion; see investigation below. |
| `2e82ddba` | `test(workspaces): fix original workspace label assertion (Refs #219)` | green | 2026-11-07 | [Run #42336713803](https://github.com/SakibShahariar/material-panel/actions/runs/42336713803) passed syntax checks, 460/460 JavaScript tests, and 20/20 Python tests. |

The Quick Launch follow-up commits all have successful push-triggered workflow runs. Notification actions use the same MessageTray action shape across the GNOME 49, 50, and 51 type-definition branches; all six notification commits have successful workflow runs (the final run passed 447 JavaScript and 20 Python tests). Workspace filters are persisted and signal-driven; the final workspace run passed 460 JavaScript and 20 Python tests. The three intermediate workspace failures were test-source assertion mismatches, not demonstrated runtime regressions; the test assertions were updated in `9c5f4941` and `2e82ddba`, and the final run is green. Live GNOME runtime validation remains open for #219, #250, and #253.
## Incremental review: 2026-11-07 — Focus Mode and Control Center

Reviewed every commit after checkpoint `cd0b60e45e7f2c436b64e5c5454eda8bff802977` through `8be72301dea73780992190819ffe8e63a782b6ec`. Every push-triggered run was checked. The intermediate red results are retained and explained below; the final corrected runs are green. GNOME Shell runtime testing remains separate and is not claimed.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `261b0617` | `test(clipboard): guard privacy and panel integration` | green | 2026-11-07 | [Run 42372934201](https://github.com/SakibShahariar/material-panel/actions/runs/42372934201) Passed. |
| `cd7a8bcb` | `fix(clipboard): keep retention limits effective on write errors` | green | 2026-11-07 | [Run 42372974978](https://github.com/SakibShahariar/material-panel/actions/runs/42372974978) Passed. |
| `641a7186` | `test(quick-launch): guard preferences and layout integration` | green | 2026-11-07 | [Run 42373344742](https://github.com/SakibShahariar/material-panel/actions/runs/42373344742) Passed. |
| `ceb4a3af` | `feat(focus-mode): add independent visibility override helpers` | green | 2026-11-07 | [Run 42373978158](https://github.com/SakibShahariar/material-panel/actions/runs/42373978158) Passed. |
| `65a94e5c` | `feat(focus-mode): add disabled-by-default configuration` | green | 2026-11-07 | [Run 42373994326](https://github.com/SakibShahariar/material-panel/actions/runs/42373994326) Passed. |
| `ffe707eb` | `feat(focus-mode): apply temporary panel visibility override` | green | 2026-11-07 | [Run 42374002849](https://github.com/SakibShahariar/material-panel/actions/runs/42374002849) Passed. |
| `f8ae7463` | `feat(focus-mode): add independent module selection preferences` | green | 2026-11-07 | [Run 42374011599](https://github.com/SakibShahariar/material-panel/actions/runs/42374011599) Passed. |
| `10cef86a` | `feat(focus-mode): add Quick Settings toggle` | green | 2026-11-07 | [Run 42374029154](https://github.com/SakibShahariar/material-panel/actions/runs/42374029154) Passed. |
| `75f1cf4e` | `test(focus-mode): cover temporary visibility state` | green | 2026-11-07 | [Run 42374064928](https://github.com/SakibShahariar/material-panel/actions/runs/42374064928) Passed. |
| `46d64863` | `test(focus-mode): guard panel and Quick Settings integration` | green | 2026-11-07 | [Run 42374067370](https://github.com/SakibShahariar/material-panel/actions/runs/42374067370) Passed. |
| `b81b4b5e` | `fix(focus-mode): normalize selected module IDs` | red | 2026-11-07 | [Run 42374112731](https://github.com/SakibShahariar/material-panel/actions/runs/42374112731) Stale config-normalization test expectation; see investigation below. |
| `21af9803` | `refactor(focus-mode): share Quick Settings toggle helper` | red | 2026-11-07 | [Run 42374191910](https://github.com/SakibShahariar/material-panel/actions/runs/42374191910) Stale config-normalization test expectation; see investigation below. |
| `03a2b776` | `feat(focus-mode): add End-4 Quick Settings toggle` | red | 2026-11-07 | [Run 42374194589](https://github.com/SakibShahariar/material-panel/actions/runs/42374194589) Stale config-normalization test expectation; see investigation below. |
| `431f389a` | `test(focus-mode): cover End-4 toggle and config normalization` | red | 2026-11-07 | [Run 42374202006](https://github.com/SakibShahariar/material-panel/actions/runs/42374202006) Stale config-normalization / import contract expectations; see investigation below. |
| `136a4be0` | `test(focus-mode): assert normalized settings and End-4 toggle` | red | 2026-11-07 | [Run 42374230899](https://github.com/SakibShahariar/material-panel/actions/runs/42374230899) Stale End-4 import contract expectation; see investigation below. |
| `2a3ddfbb` | `fix(focus-mode): preserve End-4 import contract` | red | 2026-11-07 | [Run 42374291587](https://github.com/SakibShahariar/material-panel/actions/runs/42374291587) Test and import updates were out of sync in this intermediate commit; see investigation below. |
| `f756e0e8` | `test(focus-mode): preserve existing End-4 import contract` | green | 2026-11-07 | [Run 42374297353](https://github.com/SakibShahariar/material-panel/actions/runs/42374297353) Final Focus Mode test/source contract passed. |
| `e612d1da` | `feat(control-center): add phased dashboard popup shell` | green | 2026-11-07 | [Run 42374399333](https://github.com/SakibShahariar/material-panel/actions/runs/42374399333) Passed. |
| `9824ed40` | `feat(control-center): register built-in module ID` | green | 2026-11-07 | [Run 42374413374](https://github.com/SakibShahariar/material-panel/actions/runs/42374413374) Passed. |
| `05edb3b1` | `feat(control-center): register dashboard module factory` | green | 2026-11-07 | [Run 42374417135](https://github.com/SakibShahariar/material-panel/actions/runs/42374417135) Passed. |
| `8a1c88f7` | `feat(control-center): expose module in Preferences catalog` | green | 2026-11-07 | [Run 42374419930](https://github.com/SakibShahariar/material-panel/actions/runs/42374419930) Passed. |
| `4e6281e0` | `fix(control-center): release section actors on popup close` | green | 2026-11-07 | [Run 42374447138](https://github.com/SakibShahariar/material-panel/actions/runs/42374447138) Passed. |
| `e8b60992` | `test(control-center): verify dashboard ships in extension package` | green | 2026-11-07 | [Run 42374450296](https://github.com/SakibShahariar/material-panel/actions/runs/42374450296) Passed. |
| `27d7be68` | `test(control-center): cover dashboard shell and lifecycle` | green | 2026-11-07 | [Run 42374460024](https://github.com/SakibShahariar/material-panel/actions/runs/42374460024) Passed. |
| `e770c33d` | `fix(control-center): anchor popup to panel edge` | green | 2026-11-07 | [Run 42374483989](https://github.com/SakibShahariar/material-panel/actions/runs/42374483989) Passed. |
| `a54cd87f` | `test(control-center): cover panel-edge popup placement` | green | 2026-11-07 | [Run 42374491443](https://github.com/SakibShahariar/material-panel/actions/runs/42374491443) Passed. |
| `d342b357` | `test(control-center): guard keyboard navigation and async-only shell` | green | 2026-11-07 | [Run 42374569064](https://github.com/SakibShahariar/material-panel/actions/runs/42374569064) Passed. |
| `c02d6b70` | `refactor(quick-settings): expose reusable toggle tile for Control Center` | red | 2026-11-07 | [Run 42374622386](https://github.com/SakibShahariar/material-panel/actions/runs/42374622386) Syntax check failed on duplicated export; see investigation below. |
| `3d0fbed4` | `feat(control-center): add reusable Home quick actions` | red | 2026-11-07 | [Run 42374624967](https://github.com/SakibShahariar/material-panel/actions/runs/42374624967) Syntax check failed on duplicated export; see investigation below. |
| `fabb8d95` | `test(control-center): cover Home quick action backends` | red | 2026-11-07 | [Run 42374627362](https://github.com/SakibShahariar/material-panel/actions/runs/42374627362) Syntax check failed on duplicated export; see investigation below. |
| `e506a19e` | `fix(quick-settings): export reusable dark mode tile correctly` | green | 2026-11-07 | [Run 42374668876](https://github.com/SakibShahariar/material-panel/actions/runs/42374668876) Corrected duplicated export; full workflow passed. |
| `678b97a8` | `fix(media): show compact player row without undefined button reference` | red | 2026-11-07 | [Run 42374753823](https://github.com/SakibShahariar/material-panel/actions/runs/42374753823) Existing media auto-hide test still expected the old undefined button reference; see investigation below. |
| `9d99b1cd` | `feat(control-center): add compact Home media card` | red | 2026-11-07 | [Run 42374756523](https://github.com/SakibShahariar/material-panel/actions/runs/42374756523) Existing media auto-hide test still expected the old undefined button reference; see investigation below. |
| `91227c02` | `test(control-center): cover Home media card lifecycle` | red | 2026-11-07 | [Run 42374758677](https://github.com/SakibShahariar/material-panel/actions/runs/42374758677) Existing media auto-hide test still expected the old undefined button reference; see investigation below. |
| `cedf4eae` | `test(media): follow Quick Settings row visibility fix` | green | 2026-11-07 | [Run 42374862335](https://github.com/SakibShahariar/material-panel/actions/runs/42374862335) Updated the stale media auto-hide assertion; full workflow passed. |
| `8be72301` | `docs(control-center): add phase 1 runtime validation checklist` | green | 2026-11-07 | [Run 42374935435](https://github.com/SakibShahariar/material-panel/actions/runs/42374935435) Passed. |

**Final verified outcomes:** Focus Mode's corrected Quick Settings/End-4 wiring passed run 650. Control Center shell and Home quick-action/media follow-ups passed their final runs 664 and 668; the runtime-checklist documentation passed run 669. Do not infer that the intermediate red runs were green. Their failures were corrected in subsequent commits as detailed in the investigation log.

## Red-cross investigation log

The initial baseline contained no confirmed red results. The later preferences-refactor failure is recorded below. Preserve this history when adding future rerun results.

### 2026-11-02 — Preferences page extraction

- Commit SHA: `6a5d765155385ad534b21c218527719b00c783e2`
- Commit subject: `refactor(prefs): split preferences pages into modules (Fixes #244)`
- First observed (date): 2026-11-02
- Workflow / run URL: [Tests run #41485813941](https://github.com/SakibShahariar/material-panel/actions/runs/41485813941)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: Seven tests still expected layout preview and appearance/tile preference code to remain in `prefs.js` after those page builders were extracted. The JavaScript syntax check passed; the failing assertions were stale source-location assumptions.
- Classification: regression — test wiring was not migrated alongside the source extraction; no runtime behavior failure was demonstrated.
- Fix commit(s): `403e9ef8018f8c9e4aa74a35ca152b5d24cec733` updated the source-wiring tests. `16331845a1dcb778637280f65558b68c2391bdd9` also fixed release packaging to include the new `prefs/` directory.
- Rerun attempt(s) and result: The original failing commit was not rerun because its tests still referenced the old file layout. Follow-up run [#41486151320](https://github.com/SakibShahariar/material-panel/actions/runs/41486151320) passed (402/402 JavaScript, 20/20 Python); subsequent packaging-fix run [#41486582850](https://github.com/SakibShahariar/material-panel/actions/runs/41486582850) also passed (402/402 JavaScript, 20/20 Python).
- Final verified outcome: Follow-up commits are green; release packaging includes the extracted preferences modules.
- Remaining follow-up: Live GNOME Preferences smoke test is still required before claiming desktop runtime verification.

### 2026-11-02 — ThemeManager extraction test-assumption chain

- Commit SHA(s): `1cb5d1c344b93f1943febd7a57812284e53961ad`, `583e3c9f240a8e8e76be73072906cb9a90948d76`, `e448851aea387643ebf27b753aae58640f091536`, `4a0c11e5001a86baed8ad0c56704ed155d778fc2`, `a15f231023f6bf8db3249967e5feda284ede49b7`, `4faef86f371686737a27c5a9c4baf8789986ad27`, `1cb967177d190fbfbd7b28bb279632b4b27b0cc2`
- Commit subject: ThemeManager palette/rendering/watcher/stylesheet extraction and follow-up test updates.
- First observed (date): 2026-11-02
- Workflow / run URLs: [#41489441164](https://github.com/SakibShahariar/material-panel/actions/runs/41489441164), [#41489672242](https://github.com/SakibShahariar/material-panel/actions/runs/41489672242), [#41490138200](https://github.com/SakibShahariar/material-panel/actions/runs/41490138200), [#41490267109](https://github.com/SakibShahariar/material-panel/actions/runs/41490267109), [#41490560322](https://github.com/SakibShahariar/material-panel/actions/runs/41490560322), [#41490660831](https://github.com/SakibShahariar/material-panel/actions/runs/41490660831), [#41491007626](https://github.com/SakibShahariar/material-panel/actions/runs/41491007626)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: As palette parsing, CSS rendering, watcher ownership, and stylesheet writing moved out of `lib/theme.js`, source-based tests continued looking in the old file. One dimension assertion also expected individual top/bottom margin declarations rather than the renderer's combined margin output. No GNOME runtime failure was demonstrated.
- Classification: regression — test assumptions were not migrated atomically with the source extraction.
- Fix commit(s): `583e3c9f`, `e448851a`, `4a0c11e5`, `a15f2310`, `4faef86f`, `1cb96717`, and final test ownership correction `f023f637d71fbb2e64137024a131d9db109facbd`.
- Rerun attempt(s) and result: Each follow-up commit triggered CI and the failure count decreased as the remaining assertions were moved. Final run [#41491249895](https://github.com/SakibShahariar/material-panel/actions/runs/41491249895) passed 410/410 JavaScript tests and 20/20 Python tests.
- Final verified outcome: Theme extraction and its regression suite are green on the final code commit.
- Remaining follow-up: Live GNOME validation for light/dark themes, Matugen updates, panel layouts/sizes, repeated palette changes, extension enable/disable, and reload remains required for #221.

### 2026-11-02 — Focus-session DND test wiring

- Commit SHA(s): `9d7e1217f7ce43c79418fe65bc6959fc8875984b`, `55830e99cbde7a14801e6707b108b31f246d0f3d`, `158be27a28208f02b3647d36e45e974c26cdfaf6`
- Commit subject: Add a cancellable event-based DND focus-session service and its popup UI/tests.
- First observed (date): 2026-11-02
- Workflow / run URLs: [#41494374462](https://github.com/SakibShahariar/material-panel/actions/runs/41494374462), [#41494592712](https://github.com/SakibShahariar/material-panel/actions/runs/41494592712), [#41494694837](https://github.com/SakibShahariar/material-panel/actions/runs/41494694837)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: The first test version contained an invalid escaped template literal and the existing DND accessible-name test expected the pre-session label. Follow-up UI tests then compared against a fully expanded duration string instead of the source's generated template string.
- Classification: regression — test syntax and source assertions did not match the implementation; JavaScript syntax check itself passed on the initial feature commit.
- Fix commit(s): `55830e99` updated the accessible-name expectation and initial UI assertions; `158be27a` simplified source checks; `2c42b3c7` corrected the duration assertion to match the template string.
- Rerun attempt(s) and result: Two follow-up commits still had one stale UI assertion each. Final run [#41494846774](https://github.com/SakibShahariar/material-panel/actions/runs/41494846774) passed 424/424 JavaScript tests and 20/20 Python tests.
- Final verified outcome: Focus-session service, UI wiring, and regression suite are green.
- Remaining follow-up: A live GNOME check of right-click/Menu-key popup behavior and visible focus-session status is recommended.

### 2026-11-07 — Workspace filter UI source assertions

- Commit SHA(s): `cc9afc12a95544149446878496764d5853577386`, `d9005047beea30e0706cb5d0fb958e02a9425547`, `9c5f4941299a38e8acabf1ab687be66e40f81fd3`
- Commit subject: Add filtered workspace indicators, urgency lifecycle handling, and corresponding UI regression assertions.
- First observed (date): 2026-11-07
- Workflow / run URLs: [#42336671958](https://github.com/SakibShahariar/material-panel/actions/runs/42336671958), [#42336691060](https://github.com/SakibShahariar/material-panel/actions/runs/42336691060), [#42336697270](https://github.com/SakibShahariar/material-panel/actions/runs/42336697270)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: The new UI source test expected a workspace accessible-name template that did not match the implementation's actual `Workspace ${i + 1}` text. The intermediate minimized-urgent update also left an old source assertion that expected urgency to be derived from `liveWindows` instead of `attentionWindows`.
- Classification: regression — source assertion drift in the new tests; no production-code failure was demonstrated by these runs.
- Fix commit(s): `9c5f4941` updated the urgency assertion to include minimized windows; `2e82ddba` corrected the workspace label assertion.
- Rerun attempt(s) and result: The first two runs failed on stale assertions; the third still failed only on the label assertion. Final run [#42336713803](https://github.com/SakibShahariar/material-panel/actions/runs/42336713803) passed syntax checks, 460/460 JavaScript tests, and 20/20 Python tests.
- Final verified outcome: The current workspace filter implementation and regression suite pass the full repository workflow.
- Remaining follow-up: Live GNOME validation of urgency detection and filtered switching remains open under #219.
### 2026-11-07 — Focus Mode config and Quick Settings source assertions

- Commit SHA(s): `b81b4b5e0ede48ff78366c377a955049ecf2f8d9`, `21af9803215224e6761b4ef56837489e0dd204f1`, `03a2b776229f84b41950810e78a06560a75b878d`, `431f389a608d502ac570f7e2393fa3554907d128`, `136a4be0f9e9929b581d86f8cb60a0c21ae7c67e`, `2a3ddfbbe563cc32b9677b794bd3cd0464b312b6`
- First observed (date): 2026-11-07
- Workflow / run URLs: [#42374112731](https://github.com/SakibShahariar/material-panel/actions/runs/42374112731), [#42374191910](https://github.com/SakibShahariar/material-panel/actions/runs/42374191910), [#42374194589](https://github.com/SakibShahariar/material-panel/actions/runs/42374194589), [#42374202006](https://github.com/SakibShahariar/material-panel/actions/runs/42374202006), [#42374230899](https://github.com/SakibShahariar/material-panel/actions/runs/42374230899), [#42374291587](https://github.com/SakibShahariar/material-panel/actions/runs/42374291587)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: The Focus Mode config normalizer replaced a previous array-only fallback with `normalizeFocusModeModules(...)`, but the integration test still expected the old implementation. Subsequent changes also exposed an End-4 import contract assertion while the shared toggle helper was being extracted.
- Classification: regression — stale source assertions and an intermediate test/source import mismatch; no production runtime failure was demonstrated by these runs.
- Fix commit(s): `f756e0e8747595289a3e1c10df3de0bd32b61ec7` preserved the existing End-4 import contract and updated the tests to the final normalized-config and shared-toggle design.
- Rerun attempt(s) and result: The final run [#42374297353](https://github.com/SakibShahariar/material-panel/actions/runs/42374297353) passed JavaScript syntax, all JavaScript regression tests and Python regressions.
- Final verified outcome: Focus Mode config normalization and Quick Settings toggles pass on the final code.
- Remaining follow-up: Live GNOME validation remains open under #141.

### 2026-11-07 — Control Center quick-action export syntax

- Commit SHA(s): `c02d6b709a9f8062bef29862c69ceecab59a85db`, `3d0fbed455ac448571837c65b7ab421e67317230`, `fabb8d95130b5ba51aa72f4944448392a6b32b0c`
- First observed (date): 2026-11-07
- Workflow / run URLs: [#42374622386](https://github.com/SakibShahariar/material-panel/actions/runs/42374622386), [#42374624967](https://github.com/SakibShahariar/material-panel/actions/runs/42374624967), [#42374627362](https://github.com/SakibShahariar/material-panel/actions/runs/42374627362)
- Failed job / step: `python-regressions` / `Check JavaScript syntax`
- Failure summary: The automated source edit produced `export export function darkModeTile()`, which failed JavaScript syntax checking before regression tests could run.
- Classification: regression — implementation syntax error introduced while exposing an existing tile builder for reuse.
- Fix commit(s): `e506a19ed52b8f8b470800d49a871954d7ab3460` corrected the duplicate keyword.
- Rerun attempt(s) and result: Final run [#42374668876](https://github.com/SakibShahariar/material-panel/actions/runs/42374668876) passed.
- Final verified outcome: The reusable Dark Mode tile export and Home quick-action integration pass the full workflow.
- Remaining follow-up: Home's weather/system cards, full media progress and responsive bento composition remain open under #121.

### 2026-11-07 — Media row visibility assertion

- Commit SHA(s): `678b97a88307c0d9e2c429af90ce0541c90bfea1`, `9d99b1cdd64d3e7a065cacd1a4e6ea30bd59d983`, `91227c028ce3daefeb11381f5e3adcd50b0b1263`
- First observed (date): 2026-11-07
- Workflow / run URLs: [#42374753823](https://github.com/SakibShahariar/material-panel/actions/runs/42374753823), [#42374756523](https://github.com/SakibShahariar/material-panel/actions/runs/42374756523), [#42374758677](https://github.com/SakibShahariar/material-panel/actions/runs/42374758677)
- Failed job / step: `python-regressions` / `Run JavaScript regression tests`
- Failure summary: The compact Quick Settings media row contained an undefined `button.visible` reference. The implementation correctly changed this to `row.visible`, but the existing media auto-hide source test still asserted the old undefined reference.
- Classification: regression — production bug fixed; a pre-existing test assertion was not migrated with the correction.
- Fix commit(s): `cedf4eae240f9a76b0f116241001f6c96ac64d43` updated the media auto-hide test to assert the row's visibility state.
- Rerun attempt(s) and result: Final run [#42374862335](https://github.com/SakibShahariar/material-panel/actions/runs/42374862335) passed.
- Final verified outcome: The undefined reference is removed, Control Center Home's compact media row is covered, and the full workflow passes.
- Remaining follow-up: Live MPRIS attach/detach behavior remains on the GNOME checklist for #120/#121.

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
| 2026-11-02 | Incremental review through `e083ec8698efccb8130b5ab7c42a811cd64b8330` | Reviewed the prior ledger update and media visibility migration. Both CI lookups unavailable; 1 isolated state test passed; GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `22c687fe3b14e968411b8eca62d55dd0a5925ed1` | Reviewed the prior ledger update and Network Speed visibility migration. Both CI lookups unavailable; 1 isolated state test passed; GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `1bb61da53e9cf1fd33916e637ddb674a2e3d3e03` | Reviewed the prior ledger update and Network Speed unit migration. Both CI lookups unavailable; 1 isolated Node test passed; GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `91e32e0ac2a52cf93a886145d9d757f0607f0ad9` | Reviewed the previous ledger update and workspace preference migration. Both CI lookups unavailable; 3 isolated Node state tests passed; full repository tests and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `91fea747e337c55eda2ac35e68b0bfd4dfe6971b` | Reviewed the previous ledger update and media visualizer preference migration. Both CI lookups unavailable; 2 isolated Node state tests passed; full repository tests and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `3d37d44ba51797bc7c7ee6e0b11567d2e2e313f6` | Reviewed the previous ledger update and weather location preference migration. Both CI lookups unavailable; 2 isolated Node state tests passed; full repository tests and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `a8ffd65df70a2babe682cb7be5a78835db25275d` | Reviewed the previous ledger update and Quick Settings preference migration. Both CI lookups unavailable; 3 isolated Node state tests passed; Quick Settings regression tests, full repository suite, and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `41f8c6dd2475e68f181c8fd62c02d0b06e07e35d` | Reviewed the previous ledger update and panel layout selection migration. Both CI lookups unavailable; 2 isolated Node state tests passed; full test suite and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `6fc0d1e2d519381caff8ab891484ccfc859418be` | Reviewed the previous ledger update and CPU-local activity preference migration. Both CI lookups unavailable; CPU regression test files and GNOME runtime remain unverified. |
| 2026-11-02 | Incremental review through `0d455644120c651235b89d392d1cb1efd037f83a` | Reviewed the previous ledger update and Quick Settings coordination migration. Both CI lookups unavailable; 2 isolated callback tests passed; full coordination regression tests and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `00c67a929dfaa29fe092899b8ba0ffb5fbb65390` | Reviewed the previous ledger update and shared GPU/Network activity sample migration. Both CI lookups unavailable; 2 isolated state tests passed; activity-chip regression tests and GNOME runtime unverified. |
| 2026-11-02 | Incremental review through `16331845a1dcb778637280f65558b68c2391bdd9` | Reviewed the preferences modularization and packaging sequence. Initial source-wiring tests failed; follow-up tests and package inclusion fix passed full CI (402 JavaScript + 20 Python tests). GNOME Preferences runtime smoke test remains open. |
| 2026-11-02 | Incremental review through `1a403ac2cff4f56a3dc7a39b948cccee2557a648` | Reviewed 11 commits: theme extraction had a sequence of stale test-source failures resolved by `f023f637`; final theme CI passed 410/410 JS + 20/20 Python. Theme-color state migration passed 413/413 + 20/20. Popup keyboard-focus update passed 416/416 + 20/20. GNOME runtime checks remain open for #217, #221, and #237. |
| 2026-11-02 | Incremental review through `2c42b3c744c81a490965e5b73433506d234ebf04` | Reviewed five commits: DND focus-session tests had two rounds of stale source assertions, resolved in `2c42b3c7`; final CI passed 424/424 JavaScript tests and 20/20 Python tests. #214 acceptance criteria were checked and the issue was closed. |

| 2026-11-07 | Incremental review through `2e82ddba2107a785774d98b2420f183340245fde` | Reviewed 29 commits since the prior checkpoint. Quick Launch, notification-action, and final workspace-filter CI runs passed; three intermediate workspace UI-test runs were red on stale source assertions and are documented with their final green rerun. GNOME runtime validation remains open. |
| 2026-11-07 | Incremental review through `8be72301dea73780992190819ffe8e63a782b6ec` | Reviewed 36 commits since `cd0b60e4`. Focus Mode and Control Center implementation/tests are committed; intermediate test/source failures are retained with final green corrections. Runs 650, 664, 668 and 669 passed. GNOME runtime validation remains open for #120, #121 and #141. |


## Incremental review: 2026-11-07 — clipboard history implementation

Reviewed every commit after the previous checkpoint through `cd0b60e45e7f2c436b64e5c5454eda8bff802977`. Each commit has an associated completed successful `python-regressions` GitHub Actions run. No red or pending checks remain in this reviewed range. GNOME Shell runtime validation is not represented by CI and remains open under #254.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `d4904ae0` | `test(workspaces): verify filtered accessible names (Refs #219)` | green | 2026-11-07 | Actions run [42336962553](https://github.com/SakibShahariar/material-panel/actions/runs/42336962553) completed successfully. |
| `03bf0179` | `feat(clipboard): add bounded history state helpers (Refs #254)` | green | 2026-11-07 | Actions run [42372053871](https://github.com/SakibShahariar/material-panel/actions/runs/42372053871) completed successfully. |
| `a34514c8` | `feat(clipboard): add opt-in capture lifecycle (Refs #254)` | green | 2026-11-07 | Actions run [42372084590](https://github.com/SakibShahariar/material-panel/actions/runs/42372084590) completed successfully. |
| `929d08fa` | `feat(clipboard): add private local history store (Refs #254)` | green | 2026-11-07 | Actions run [42372141084](https://github.com/SakibShahariar/material-panel/actions/runs/42372141084) completed successfully. |
| `2cf4c462` | `feat(clipboard): add history popup and preferences page (Refs #254)` | green | 2026-11-07 | Actions run [42372283109](https://github.com/SakibShahariar/material-panel/actions/runs/42372283109) completed successfully. |
| `ee2f4aa0` | `feat(clipboard): wire opt-in history into panel (Refs #254)` | green | 2026-11-07 | Actions run [42372332716](https://github.com/SakibShahariar/material-panel/actions/runs/42372332716) completed successfully. |
| `52b2db30` | `feat(clipboard): make retention limits configurable (Refs #254)` | green | 2026-11-07 | Actions run [42372425920](https://github.com/SakibShahariar/material-panel/actions/runs/42372425920) completed successfully. |
| `00f56909` | `feat(clipboard): expose bounded retention preferences (Refs #254)` | green | 2026-11-07 | Actions run [42372507007](https://github.com/SakibShahariar/material-panel/actions/runs/42372507007) completed successfully. |
| `717e61cb` | `fix(clipboard): enforce configured history age limits (Refs #254)` | green | 2026-11-07 | Actions run [42372556803](https://github.com/SakibShahariar/material-panel/actions/runs/42372556803) completed successfully. |
| `63dd361a` | `fix(clipboard): harden capture feedback and self-copy guard (Refs #254)` | green | 2026-11-07 | Actions run [42372604145](https://github.com/SakibShahariar/material-panel/actions/runs/42372604145) completed successfully. |
| `28e15a6c` | `fix(clipboard): serialize retention and capture lifecycle updates (Refs #254)` | green | 2026-11-07 | Actions run [42372685071](https://github.com/SakibShahariar/material-panel/actions/runs/42372685071) completed successfully. |
| `cef219f8` | `feat(clipboard): clarify active panel indicator (Refs #254)` | green | 2026-11-07 | Actions run [42372725619](https://github.com/SakibShahariar/material-panel/actions/runs/42372725619) completed successfully. |
| `4a049dcc` | `test(clipboard): cover opt-in and pause lifecycle races (Refs #254)` | green | 2026-11-07 | Actions run [42372758416](https://github.com/SakibShahariar/material-panel/actions/runs/42372758416) completed successfully. |
| `e340906b` | `test(clipboard): cover storage failure handling (Refs #254)` | green | 2026-11-07 | Actions run [42372786671](https://github.com/SakibShahariar/material-panel/actions/runs/42372786671) completed successfully. |
| `cd0b60e4` | `test(clipboard): verify history files ship in extension zip (Refs #254)` | green | 2026-11-07 | Actions run [42372815244](https://github.com/SakibShahariar/material-panel/actions/runs/42372815244) completed successfully. |

**Unresolved validation:** #254 remains open until the feature is exercised in real GNOME Shell 49, 50, and 51 sessions. CI success does not establish compositor/clipboard runtime compatibility.


## Incremental review: 2026-11-07

The following commits were reviewed individually against their associated GitHub Actions workflow runs. Failures were investigated from job logs and corrected in later commits. No issue was closed based on source tests alone; #122 and #123 remain open for live GNOME validation.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `163c5e5f` | `revert: restore repository tree after broken Media commit (Refs #122)` | green | 2026-11-07 | Workflow [42388365811](https://github.com/SakibShahariar/material-panel/actions/runs/42388365811) passed. Recovery commit restores the complete original tracked tree without rewriting history. |
| `71a062a9` | `feat(control-center): add detailed Media section player (Refs #122)` | red | 2026-11-07 | Workflow [42388472454](https://github.com/SakibShahariar/material-panel/actions/runs/42388472454) failed two source-boundary tests because they expected the previous zero-argument builder signature. Corrected in `e7359d50`; rerun passed. |
| `e7359d50` | `test(media): update player row source boundary (Refs #122)` | green | 2026-11-07 | Workflow [42388543342](https://github.com/SakibShahariar/material-panel/actions/runs/42388543342) passed. |
| `a79f30c0` | `feat(media): add player switching and section visualizer (Refs #122)` | red | 2026-11-07 | Workflow [42388978554](https://github.com/SakibShahariar/material-panel/actions/runs/42388978554) failed tests that assumed no detailed-only player switcher and an adjacent `row.visible`/attach sequence. Updated test expectations in `7fbeb0df` and `f24a1aa8`; final rerun passed. |
| `7fbeb0df` | `test(media): cover detailed player row ownership (Refs #122)` | red | 2026-11-07 | Workflow [42389029726](https://github.com/SakibShahariar/material-panel/actions/runs/42389029726) exposed one remaining old watcher callback expectation. Corrected in `f24a1aa8`; rerun passed. |
| `f24a1aa8` | `test(media): align player watcher assertions (Refs #122)` | green | 2026-11-07 | Workflow [42389193405](https://github.com/SakibShahariar/material-panel/actions/runs/42389193405) passed, including syntax, JavaScript regressions and calendar regressions. |
| `e545d0d0` | `feat(control-center): add System health overview (Refs #123)` | red | 2026-11-07 | Workflow [42389385033](https://github.com/SakibShahariar/material-panel/actions/runs/42389385033) failed one new source assertion: the test expected a const arrow function while the implementation used a function declaration. Corrected in `75a8e01f`; rerun passed. |
| `75a8e01f` | `fix(control-center): harden System monitoring lifecycle (Refs #123)` | green | 2026-11-07 | Workflow [42389437714](https://github.com/SakibShahariar/material-panel/actions/runs/42389437714) passed, including syntax, JavaScript regressions and calendar regressions. |


## Incremental review: 2026-11-07 (Control Center Home continuation)

The following commits after the previous checkpoint were individually checked against their GitHub Actions runs. Every run completed successfully; no pending or red results remain in this reviewed range.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `8fffbe3f` | `test(control-center): cover System metric formatting (Refs #123)` | green | 2026-11-07 | Workflow [42389528517](https://github.com/SakibShahariar/material-panel/actions/runs/42389528517) completed successfully. |
| `6e574ab1` | `feat(control-center): add Home media progress summary (Refs #121)` | green | 2026-11-07 | Workflow [42389675096](https://github.com/SakibShahariar/material-panel/actions/runs/42389675096) completed successfully. |
| `1c3c1811` | `fix(weather): restore shared forecast cache (Refs #228)` | green | 2026-11-07 | Workflow [42390613804](https://github.com/SakibShahariar/material-panel/actions/runs/42390613804) completed successfully. Restored the bounded cache module and its regression tests after a later commit had deleted them while retaining imports/call sites. |
| `4ce603cf` | `feat(control-center): share live Weather summary on Home (Refs #121)` | green | 2026-11-07 | Workflow [42390746385](https://github.com/SakibShahariar/material-panel/actions/runs/42390746385) completed successfully. |
| `aebbb261` | `feat(control-center): add shared calendar summary to Home (Refs #121)` | green | 2026-11-07 | Workflow [42390867762](https://github.com/SakibShahariar/material-panel/actions/runs/42390867762) completed successfully. |

**Unresolved validation:** Home cards, weather refresh behavior, calendar event rendering and responsive layout still require live GNOME visual/interaction checks. #121 remains open.


## Incremental review: 2026-11-07 (Home responsive layout test follow-up)

The responsive Home layout commit had one red CI result caused by an overly specific source assertion, not by a syntax or implementation failure. The test expected a `const homeGrid` declaration, while the implementation assigns the grid to a `let homeGrid` declared earlier in the section renderer. The assertion was corrected in the immediate follow-up commit. The original red result is retained here.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `73e6275b57f396a3fbb24c20fd29bad4d090fd68` | `feat(control-center): add responsive Home bento layout (Refs #121)` | red | 2026-11-07 | Workflow [42390974759](https://github.com/SakibShahariar/material-panel/actions/runs/42390974759), job [128458271791](https://github.com/SakibShahariar/material-panel/actions/runs/42390974759). One JavaScript source assertion failed because it expected a `const` declaration; implementation syntax checks passed and 515 other tests passed. This was a test expectation mismatch, not a product regression. |
| `8e8aad8a7566b46c4670fd09c5fe37116811eb82` | `test(control-center): align Home bento source assertion (Refs #121)` | green | 2026-11-07 | Workflow [42391056149](https://github.com/SakibShahariar/material-panel/actions/runs/42391056149) completed successfully; the corrected assertion matches the actual `let` declaration/assignment. |

**Unresolved validation:** The Home bento layout still requires live GNOME visual checks at narrow widths and scaled displays. #121 remains open.


## Incremental review: 2026-11-07 (Home System summary)

The Home System overview change had one red CI result because the earlier responsive-layout test still asserted the old four-card grid after a fifth System card was added. The implementation syntax checks passed and the failure was limited to that stale source assertion. The follow-up updated the expected System/Calendar two-column placement.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `94dd34a7823ece90f5ffc2f7c2049a8d2259b883` | `feat(control-center): add shared Home system overview (Refs #121, #123)` | red | 2026-11-07 | Workflow [42391365580](https://github.com/SakibShahariar/material-panel/actions/runs/42391365580), job [128459450430](https://github.com/SakibShahariar/material-panel/actions/runs/42391365580). One source assertion expected the previous Calendar full-width placement; the new System card correctly occupies the adjacent cell. 518 other tests passed. |
| `8828979a74521358efbd562edf627da021977792` | `test(control-center): cover Home system summary grid placement (Refs #121)` | green | 2026-11-07 | Workflow [42391434846](https://github.com/SakibShahariar/material-panel/actions/runs/42391434846) completed successfully with the updated two-column placement assertions. |

**Unresolved validation:** System summary sample freshness, usage bars, and the System shortcut still require live GNOME interaction/visual checks. #121 remains open.


## Incremental review: 2026-11-07 (Home System overview follow-up)

The Home System summary implementation commit had one red CI result due to an existing source assertion still expecting the previous Home empty-state wording. The implementation and syntax checks were successful; the test was updated to assert the current copy. The original failure and successful correction are recorded below.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `1bc76a41e9842fed03c5b7f10e7898a515936321` | `feat(control-center): add Home metric bars and System shortcut (Refs #121, #123)` | red | 2026-11-07 | Workflow [42391552549](https://github.com/SakibShahariar/material-panel/actions/runs/42391552549), job [128460020452](https://github.com/SakibShahariar/material-panel/actions/runs/42391552549). One source assertion expected the previous empty-state sentence; 519 other tests passed and JavaScript syntax checks passed. |
| `daf166336358234c5d96986abd59f0a46fdbfe3d` | `test(control-center): align Home summary empty-state assertion (Refs #121)` | green | 2026-11-07 | Workflow [42391607071](https://github.com/SakibShahariar/material-panel/actions/runs/42391607071) completed successfully after updating the expected text. |

**Unresolved validation:** The Home System shortcut, metric bars, and timestamp display still require live GNOME interaction/visual checks. #121 remains open.


## Incremental review: 2026-11-07 (Home sample-time label follow-up)

The Home sample-time refinement had one red CI result because a source test still expected the earlier two-argument-free disk sample-age helper. The implementation and JavaScript syntax checks passed; the assertion was updated to include the fixed wall-clock label. The original failure is retained.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `a7947b3df117ae1cb09456349fa57ec30e9252dc` | `feat(control-center): label Home system sample times (Refs #121, #123)` | red | 2026-11-07 | Workflow [42391884467](https://github.com/SakibShahariar/material-panel/actions/runs/42391884467), job [128460983477](https://github.com/SakibShahariar/material-panel/actions/runs/42391884467). One source assertion still expected `sampleAge(disk.sampledAt)`; the code correctly used the new fixed sample-time label. 520 other tests passed. |
| `71dfc1d16d7bb88f3c1e16c8ae8759e100003bfc` | `test(control-center): cover fixed Home sample-time labels (Refs #121)` | green | 2026-11-07 | Workflow [42391943478](https://github.com/SakibShahariar/material-panel/actions/runs/42391943478) completed successfully after updating the assertion. |

**Unresolved validation:** The Home sample-time labels and optional-card reflow still require live GNOME visual checks. #121 remains open.


## Incremental review: 2026-11-07 (Home optional-card visibility)

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `fb07322da00ce602ae086ad1b24c994815028086` | `feat(control-center): add independent Home card visibility (Refs #121)` | green | 2026-11-07 | Workflow [42392223479](https://github.com/SakibShahariar/material-panel/actions/runs/42392223479) completed successfully. Weather/Calendar visibility preferences, destruction of hidden cards and dynamic Home-grid reflow are covered by regression tests. |

**Unresolved validation:** Weather/Calendar optional-card behavior and responsive reflow still require live GNOME visual checks. #121 remains open.


## Incremental review: 2026-11-07 (System Status Indicators and multi-location Weather)

The commits newer than the previous checkpoint `fb07322da00ce602ae086ad1b24c994815028086` were checked against their associated GitHub Actions runs. One initial Weather implementation run failed only because two source assertions still expected the former no-queue refresh guard and direct cache-apply call. The follow-up updates those assertions and adds per-location error context. The original red result is retained below.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `669a3f45077372736cf2374e4b7d0dd83d7a7403` | `feat(panel): add contextual system status indicators (Refs #251)` | green | 2026-11-07 | Workflow [42393461269](https://github.com/SakibShahariar/material-panel/actions/runs/42393461269) completed successfully; syntax, JavaScript regression, and calendar regression steps all passed. |
| `e1a187b4458b11d3a6cc305c99bc073f69caca32` | `feat(weather): add saved multi-location forecasts (Refs #143)` | red | 2026-11-07 | Workflow [42394450907](https://github.com/SakibShahariar/material-panel/actions/runs/42394450907) passed syntax but failed two existing source assertions in `tests/weatherVisibility.test.mjs`: the tests expected `if (destroyed || fetchInFlight)` and direct `apply(cached.data, cached.savedAt)`. The implementation intentionally queues a refresh after a location switch and guards cached application by request generation. These were stale test expectations, not syntax failures. |
| `f1169feabcae0ff3762051bdf558097965977b96` | `fix(weather): clarify location errors and refresh tests (Refs #143)` | green | 2026-11-07 | Workflow [42394597174](https://github.com/SakibShahariar/material-panel/actions/runs/42394597174) completed successfully; syntax, JavaScript regression, and calendar regression steps all passed. Also identifies the selected city in a failed forecast state. |

**Unresolved validation:** #143 remains Category B and open for live GNOME popup/provider/timezone/switching/rate-limit checks. #251 remains open for live GNOME state-transition and Shell-version checks. #121, #122, #123 and #254 retain their previously documented live-validation requirements.

- Checkpoint SHA: `f1169feabcae0ff3762051bdf558097965977b96`
- Checkpoint date: 2026-11-07
- Next session: start with the commit after this checkpoint, and revisit only entries explicitly marked red, pending, or requiring follow-up.


## Incremental review: 2026-11-07 (global popup shortcuts)

Reviewed all commits newer than checkpoint `f1169feabcae0ff3762051bdf558097965977b96` and checked the actual GitHub Actions results.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `4b16917932176c06510c4be5de516052b14abc55` | `docs: record weather implementation CI review` | green | 2026-11-07 | Workflow [42394710527](https://github.com/SakibShahariar/material-panel/actions/runs/42394710527) passed syntax, JavaScript regression, and calendar/Python regression steps. |
| `9b806a88e3f037d223eda194c61031acf699dd79` | `feat(shortcuts): add configurable global popup keybindings (Refs #249)` | red | 2026-11-07 | Workflow [42395282154](https://github.com/SakibShahariar/material-panel/actions/runs/42395282154) passed GLib schema compiler installation and JavaScript syntax, then failed two source assertions in `tests/networkSpeedUnits.test.mjs` and `tests/panelRebuildCoalescing.test.mjs` because they expected the exact old `only(['networkSpeedUnit'])` classifier expression. |
| `365f1872e13c28d7a7a707f751c645fd05b052ba` | `fix(shortcuts): preserve module setting classifier compatibility (Refs #249)` | green | 2026-11-07 | Workflow [42395383033](https://github.com/SakibShahariar/material-panel/actions/runs/42395383033) passed GLib schema compiler installation, JavaScript syntax, all JavaScript regression tests, and calendar/Python regression tests. The original network-speed classifier remains unchanged and popup shortcuts now have their own module-setting branch. |

**Unresolved validation:** #249 remains Category B and open for live global-keybinding/conflict/popup/teardown checks on GNOME 49–51. #143 remains open for live Weather provider, timezone, popup and rate-limit checks. #251, #121, #122, #123 and #254 retain their previously documented live-validation requirements.

- Checkpoint SHA: `365f1872e13c28d7a7a707f751c645fd05b052ba`
- Checkpoint date: 2026-11-07
- Next session: start with the commit after this checkpoint, and revisit only entries explicitly marked red, pending, or requiring follow-up.


## Incremental review: 2026-11-07 (per-zone density)

Reviewed commits newer than checkpoint `365f1872e13c28d7a7a707f751c645fd05b052ba` and checked their actual GitHub Actions results.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `f34b170b314cb41253b1aa35d0d100140486cf13` | `docs: record popup shortcut CI review` | green | 2026-11-07 | Workflow [42395509405](https://github.com/SakibShahariar/material-panel/actions/runs/42395509405) passed syntax, JavaScript regression, and calendar/Python regression steps. |
| `6d81d1a8ea2f083c21bc8533e081db8d7cb27c9a` | `feat(panel): add per-zone density controls (Refs #111)` | red | 2026-11-07 | Workflow [42396156634](https://github.com/SakibShahariar/material-panel/actions/runs/42396156634) passed syntax but failed three JavaScript tests: the new per-zone CSS output assertion and two existing theme-renderer tests. The generated zone override interpolation had been inserted into the color stylesheet template instead of the dimensions stylesheet template. |
| `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04` | `fix(panel): scope zone density CSS to dimension renderer (Refs #111)` | green | 2026-11-07 | Workflow [42396258847](https://github.com/SakibShahariar/material-panel/actions/runs/42396258847) passed JavaScript syntax, all JavaScript regression tests, and calendar/Python regression tests. |

**Unresolved validation:** #111 remains Category B and open for live visual/monitor-scale checks in both layouts. #249 remains open for live global-keybinding/conflict/teardown checks. #143 remains open for live Weather provider/timezone/switching/rate-limit checks. #251, #121, #122, #123 and #254 retain their previously documented live-validation requirements.

- Checkpoint SHA: `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`
- Checkpoint date: 2026-11-07
- Next session: start with the commit after this checkpoint, and revisit only entries explicitly marked red, pending, or requiring follow-up.


## Incremental review: 2026-11-07 (per-zone density completion)

Checked all commits after checkpoint `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `3f2171294a78fa5b6947b936ec5474e66a8eb362` | `docs: record per-zone density CI review` | green | 2026-11-07 | Workflow [42396390296](https://github.com/SakibShahariar/material-panel/actions/runs/42396390296) passed GLib schema compiler installation, JavaScript syntax, JavaScript regression, and calendar/Python regression steps. |
| `6d81d1a8ea2f083c21bc8533e081db8d7cb27c9a` | `feat(panel): add per-zone density controls (Refs #111)` | red | 2026-11-07 | Workflow [42396156634](https://github.com/SakibShahariar/material-panel/actions/runs/42396156634) passed syntax but failed the per-zone CSS test and two theme-renderer tests because zone override interpolation was inserted in the color stylesheet template instead of the dimensions stylesheet template. |
| `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04` | `fix(panel): scope zone density CSS to dimension renderer (Refs #111)` | green | 2026-11-07 | Workflow [42396258847](https://github.com/SakibShahariar/material-panel/actions/runs/42396258847) passed syntax, all JavaScript regression tests, and calendar/Python regression tests. |

**Unresolved validation:** #111 remains open for live visual and monitor-scale checks. #249 remains open for live global-keybinding/conflict/teardown checks. #143 remains open for live Weather provider/timezone/switching/rate-limit checks. #251, #121, #122, #123 and #254 retain their previously documented live-validation requirements.

- Checkpoint SHA: `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`
- Checkpoint date: 2026-11-07
- Next session: start with the commit after this checkpoint, and revisit only entries explicitly marked red, pending, or requiring follow-up.


## Incremental review: 2026-11-07 (adaptive metric polling)

Reviewed commits after checkpoint `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`. The per-zone density follow-up documentation commit and the adaptive Network Speed/CPU work were checked against their actual GitHub Actions runs. Empty combined-status responses, where returned, are not treated as passing.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `8b559cf2c1f3609527b2c82cebe29d27ba93963f` | `docs: record final per-zone density CI results` | green | 2026-11-07 | Workflow [42396489282](https://github.com/SakibShahariar/material-panel/actions/runs/42396489282) passed syntax, 550/550 JavaScript tests, and 22/22 Python tests. |
| `f902c500798ba9d2ea3bf362c4af4a34d993e812` | `perf(network): adapt idle speed sampling cadence (Refs #223)` | red | 2026-11-07 | Workflow [42399655018](https://github.com/SakibShahariar/material-panel/actions/runs/42399655018) failed JavaScript syntax: the first edit left the previous fixed-interval `tick` beside the adaptive `tick`, causing a duplicate declaration. Corrected in `c6ec7089906e4f22f4d0bfd4a8166a322007fba9`. |
| `c6ec7089906e4f22f4d0bfd4a8166a322007fba9` | `fix(network): remove superseded fixed polling loop (Refs #223)` | red | 2026-11-07 | Workflow [42399713250](https://github.com/SakibShahariar/material-panel/actions/runs/42399713250) passed syntax but one new source assertion expected the base interval in the wrong expression. Corrected in `02e3b1654d2ae9720af5cae3a1e290498ca81c03`. |
| `02e3b1654d2ae9720af5cae3a1e290498ca81c03` | `test(network): match adaptive interval initialization (Refs #223)` | red | 2026-11-07 | Workflow [42399825950](https://github.com/SakibShahariar/material-panel/actions/runs/42399825950) passed syntax but the new test fixture had an incorrectly replaced setup line. Restored in `8ad3f9e42dfcb871766c1cba791752a15ea5b473`. |
| `8ad3f9e42dfcb871766c1cba791752a15ea5b473` | `test(network): restore adaptive polling test setup (Refs #223)` | green | 2026-11-07 | Workflow [42399934711](https://github.com/SakibShahariar/material-panel/actions/runs/42399934711) passed syntax, 556/556 JavaScript tests, and 22/22 Python tests. |
| `ebb78e679daf786c6362e1f0c658350b55b7cc43` | `perf(cpu): adapt activity sampling cadence (Refs #223)` | green | 2026-11-07 | Workflow [42400135802](https://github.com/SakibShahariar/material-panel/actions/runs/42400135802) passed syntax, 556/556 JavaScript tests, and 22/22 Python tests. |

**Unresolved scope:** Network Speed and CPU have adaptive scheduling; memory polling is the next implementation step. Disk, GPU and Weather remain unadapted. The Weather forecast cadence should remain conservative to respect provider rate limits unless a safe jitter-only strategy is justified. Live hardware, suspend/resume, and freshness measurements remain unverified.

- Checkpoint SHA: `ebb78e679daf786c6362e1f0c658350b55b7cc43`
- Checkpoint date: 2026-11-07
- Next session: start with the commit after this checkpoint; review any documentation-ledger commit in the next incremental range.


## Incremental review: 2026-11-07 (adaptive Memory polling)

Reviewed the Memory implementation commit after checkpoint `ebb78e679daf786c6362e1f0c658350b55b7cc43`.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `d1f2205266743ca1228b9aa4eda5f31cfe839e64` | `perf(memory): adapt stable usage polling cadence (Refs #223)` | green | 2026-11-07 | Workflow [42400306168](https://github.com/SakibShahariar/material-panel/actions/runs/42400306168) passed syntax, 557/557 JavaScript tests, and 22/22 Python tests. The same commit records the previous incremental CI review. |

- Checkpoint SHA: `d1f2205266743ca1228b9aa4eda5f31cfe839e64`
- Checkpoint date: 2026-11-07
- Next session: review the commits after this checkpoint, including this ledger/code commit.


## Incremental review: 2026-11-07 (Disk and GPU adaptive polling)

Reviewed the Disk/GPU implementation commit after checkpoint `d1f2205266743ca1228b9aa4eda5f31cfe839e64`.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `12b89ba1d0e71d997ac398e6762a6eb83d4af056` | `perf(system): adapt disk and GPU polling cadence (Refs #223)` | green | 2026-11-07 | Workflow [42400497014](https://github.com/SakibShahariar/material-panel/actions/runs/42400497014) passed syntax, 559/559 JavaScript tests, and 22/22 Python tests. |

- Checkpoint SHA: `12b89ba1d0e71d997ac398e6762a6eb83d4af056`
- Checkpoint date: 2026-11-07
- Next session: review commits after this checkpoint, including the following Weather cadence change.


## Incremental review: 2026-11-08 (context-aware visibility and Quick Launch safety)

Reviewed the maintenance-session commits after checkpoint `12b89ba1d0e71d997ac398e6762a6eb83d4af056`. All eleven code/test commits were checked against their actual GitHub Actions runs. The intermediate red runs are retained rather than rewritten; the final follow-up is green.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `e52204f7b0016a3c207c8656b6364a461a3e4050` | `feat(visibility): add context rule model (Refs #112)` | green | 2026-11-08 | Workflow [42412167865](https://github.com/SakibShahariar/material-panel/actions/runs/42412167865) passed syntax, JavaScript regression, and Python calendar regression. |
| `a5e82af5a273058bb32f773b418287b76f486805` | `test(visibility): cover context rule normalization (Refs #112)` | red | 2026-11-08 | Workflow [42412177564](https://github.com/SakibShahariar/material-panel/actions/runs/42412177564) exposed an incorrect expected ordering in the new combined-context test. |
| `7db68e49bba9354562dea779a37cafdc117e344b` | `feat(visibility): persist per-module context rules (Refs #112)` | red | 2026-11-08 | Workflow [42412184807](https://github.com/SakibShahariar/material-panel/actions/runs/42412184807) retained the same test expectation failure while the feature was being integrated. |
| `98c4ec0db59410d42937fb903fb181f0dec27d0e` | `test(visibility): cover persisted context rule defaults (Refs #112)` | red | 2026-11-08 | Workflow [42412191983](https://github.com/SakibShahariar/material-panel/actions/runs/42412191983) retained the same test expectation failure. |
| `a12000660956a85770a9dd8941f7602facd07fe5` | `feat(visibility): apply fullscreen and overview rules (Refs #112)` | red | 2026-11-08 | Workflow [42412201463](https://github.com/SakibShahariar/material-panel/actions/runs/42412201463) retained the same test expectation failure. |
| `bff053d1e8d352017e1e81655c49a02479979899` | `feat(visibility): refresh on overview and fullscreen changes (Refs #112)` | red | 2026-11-08 | Workflow [42412218067](https://github.com/SakibShahariar/material-panel/actions/runs/42412218067) retained the same test expectation failure. |
| `20596f1e174375879277b383ed1fdca0860d796d` | `feat(visibility): add per-module context preferences (Refs #112)` | red | 2026-11-08 | Workflow [42412232477](https://github.com/SakibShahariar/material-panel/actions/runs/42412232477) retained the same test expectation failure. |
| `2904168296b5840da4974e3a346568ada94fb49b` | `test(visibility): cover preference and signal integration (Refs #112)` | red | 2026-11-08 | Workflow [42412242196](https://github.com/SakibShahariar/material-panel/actions/runs/42412242196) found the ordering mismatch and test paths resolved one directory too high. |
| `eb8144147a57fd0c77e936117a4847ede75f2397` | `test(visibility): correct context lifecycle assertions (Refs #112)` | red | 2026-11-08 | Workflow [42412256301](https://github.com/SakibShahariar/material-panel/actions/runs/42412256301) confirmed the test-path correction but still exposed the ordering mismatch. |
| `5a9bdd004f679e1b61a60420cf563c435e36887b` | `test(quick-launch): guard against shell command execution (Refs #71)` | red | 2026-11-08 | Workflow [42412264080](https://github.com/SakibShahariar/material-panel/actions/runs/42412264080) passed syntax and all but the same visibility-order assertion. The Quick Launch shell-execution guard itself passed. |
| `3beac0ac6f2556696948b3133537e8084c4e0a60` | `test(visibility): align context result ordering (Refs #112)` | green | 2026-11-08 | Workflow [42412298477](https://github.com/SakibShahariar/material-panel/actions/runs/42412298477) passed syntax, all JavaScript regression tests, and Python calendar regression tests. The combined-context expectation now matches the deterministic built-in module ordering. |

**Checkpoint SHA:** `3beac0ac6f2556696948b3133537e8084c4e0a60`  
**Checkpoint date:** 2026-11-08  
**Remaining:** #112 needs live GNOME verification of fullscreen/Overview transitions and teardown on GNOME 49–51. #71 remains open; the new regression guard verifies command tokenization and direct argv dispatch, but the broader custom Quick Settings action scope (including its UI/behavior expectations) still needs review and live validation. The next session should start after this checkpoint and review this ledger commit's CI result.


## Incremental review: 2026-11-08 (shared popup header expansion)

Reviewed all ten commits after checkpoint `3beac0ac6f2556696948b3133537e8084c4e0a60`. Each commit has a completed successful GitHub Actions run. The final run passed JavaScript syntax, 587/587 JavaScript tests, and 22/22 Python tests.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `3260493ede39757d382a13313b32debffa4c66c6` | `refactor(disk): use shared popup header (Refs #208)` | green | 2026-11-08 | Workflow [42416173268](https://github.com/SakibShahariar/material-panel/actions/runs/42416173268) completed successfully. |
| `fd8d2b911b183bcb37871a6e5ed26e0447ea7b5f` | `refactor(gpu): use shared popup header (Refs #208)` | green | 2026-11-08 | Workflow [42416176344](https://github.com/SakibShahariar/material-panel/actions/runs/42416176344) completed successfully. |
| `13f216c7ff4ede2e006e1bfb77909e649dd000be` | `refactor(headphones): use shared popup header (Refs #208)` | green | 2026-11-08 | Workflow [42416181004](https://github.com/SakibShahariar/material-panel/actions/runs/42416181004) completed successfully. |
| `aac0de066e58aea09b32e3d0ef59138ae5f430a7` | `test(disk): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | Workflow [42416193760](https://github.com/SakibShahariar/material-panel/actions/runs/42416193760) completed successfully. |
| `ffdad3c39cd7cb35209589cad6466213279fdc14` | `test(gpu): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | Workflow [42416197763](https://github.com/SakibShahariar/material-panel/actions/runs/42416197763) completed successfully. |
| `f52a6e17f7727099f9afb11582dcf53374392663` | `test(headphones): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | Workflow [42416201435](https://github.com/SakibShahariar/material-panel/actions/runs/42416201435) completed successfully. |
| `1df067e1b8b29400a189ba8bd2f41749f565b71b` | `refactor(battery): add shared popup title header (Refs #208)` | green | 2026-11-08 | Workflow [42416231990](https://github.com/SakibShahariar/material-panel/actions/runs/42416231990) completed successfully. |
| `f13473a4475a1507ad89bc8851cfa5356f2f6173` | `feat(network): add shared connection status header (Refs #208)` | green | 2026-11-08 | Workflow [42416236306](https://github.com/SakibShahariar/material-panel/actions/runs/42416236306) completed successfully. |
| `0bdfff1dfb3867464a660a1fa9695d56964de84d` | `test(battery): cover shared popup title header (Refs #208)` | green | 2026-11-08 | Workflow [42416247013](https://github.com/SakibShahariar/material-panel/actions/runs/42416247013) completed successfully. |
| `aec4c3054fb3ce65dfdda99d33d061d366209ee4` | `test(network): cover shared connection status header (Refs #208)` | green | 2026-11-08 | Workflow [42416251230](https://github.com/SakibShahariar/material-panel/actions/runs/42416251230) completed successfully; 587/587 JavaScript and 22/22 Python tests passed. |

**Unresolved validation:** #208 remains open for live GNOME visual checks of spacing, narrow-width behavior, focus order, dynamic status updates, and popup action placement across migrated modules. Additional popup surfaces still need inventory/review.

- Checkpoint SHA: `aec4c3054fb3ce65dfdda99d33d061d366209ee4`
- Checkpoint date: 2026-11-08
- Next session: review commits after this checkpoint, including the ledger update commit.


## Incremental review: 2026-11-08 (popup continuation and Quick Launch icons)

Reviewed all commits after checkpoint `aec4c3054fb3ce65dfdda99d33d061d366209ee4`. All ten popup-header continuation commits and six Quick Launch icon commits have completed workflows; one test-only commit had a red run caused by an over-escaped regex in the new test and was corrected in the subsequent commit. The final workflow passed syntax, **600/600 JavaScript tests**, and **22/22 Python tests**.

| Commit (full SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `5030954dec44c14fefc30661a2d2b6fcec724884` | `refactor(dnd): use shared popup header (Refs #208)` | green | 2026-11-08 | [42417451554](https://github.com/SakibShahariar/material-panel/actions/runs/42417451554) |
| `38e86c81df76a8864dbefb8908860974ac7546ca` | `test(dnd): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | [42417460541](https://github.com/SakibShahariar/material-panel/actions/runs/42417460541) |
| `0dca7e8cc56accbc7c217112e7df11b799a07c0b` | `refactor(power): use shared popup header (Refs #208)` | green | 2026-11-08 | [42417469693](https://github.com/SakibShahariar/material-panel/actions/runs/42417469693) |
| `dd978dd39444faf15a2b9713e70b0ef90cd50c70` | `test(power): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | [42417480574](https://github.com/SakibShahariar/material-panel/actions/runs/42417480574) |
| `e34617c78bf56f8cd9916e2856a4cfb74add0b8d` | `refactor(calendar): use shared popup header (Refs #208)` | green | 2026-11-08 | [42417494186](https://github.com/SakibShahariar/material-panel/actions/runs/42417494186) |
| `67b0dfbfeaff7b2897dc152d98f4c7bb0f1a7033` | `test(calendar): cover shared popup header wiring (Refs #208)` | green | 2026-11-08 | [42417502726](https://github.com/SakibShahariar/material-panel/actions/runs/42417502726) |
| `9a642e7843723e639d9d77e78451418e54cd6626` | `refactor(quick-settings): use shared popup header (Refs #208)` | green | 2026-11-08 | [42417544213](https://github.com/SakibShahariar/material-panel/actions/runs/42417544213) |
| `8a1a591ede1d76203f78be04d0aab436392dd525` | `test(quick-settings): cover shared popup header (Refs #208)` | green | 2026-11-08 | [42417552711](https://github.com/SakibShahariar/material-panel/actions/runs/42417552711) |
| `07e9dc04d0e19c5c92aad8f2a4c1b2c8f7bafe49` | `refactor(control-center): share section header hierarchy (Refs #208)` | green | 2026-11-08 | [42417572552](https://github.com/SakibShahariar/material-panel/actions/runs/42417572552) |
| `d8632268caf50fac3a322ba72d4536f16c2058c9` | `test(control-center): cover shared section header (Refs #208)` | green | 2026-11-08 | [42417580850](https://github.com/SakibShahariar/material-panel/actions/runs/42417580850); 597/597 JavaScript and 22/22 Python tests passed. |
| `0398d5ddd8231e1f8b280b2abebb0239d1deada2` | `feat(quick-launch): support validated symbolic icons (Refs #71)` | green | 2026-11-08 | [42417980832](https://github.com/SakibShahariar/material-panel/actions/runs/42417980832) |
| `859da1821ad239c0dffbc1c8e6b0618b16279830` | `test(quick-launch): cover symbolic icon validation (Refs #71)` | green | 2026-11-08 | [42417992645](https://github.com/SakibShahariar/material-panel/actions/runs/42417992645) |
| `08f9415cfa79ff2fe3b34d3ec3ed3d13886fc00f` | `feat(quick-launch): render configured symbolic icons (Refs #71)` | green | 2026-11-08 | [42418004438](https://github.com/SakibShahariar/material-panel/actions/runs/42418004438) |
| `ce0fb01e0136fea16542b73114aa99079d1f5798` | `feat(quick-launch): configure shortcut icons in preferences (Refs #71)` | green | 2026-11-08 | [42418049131](https://github.com/SakibShahariar/material-panel/actions/runs/42418049131) |
| `72e6ec0282f6dfc533b87fcd10d2bfe2db94231a` | `test(quick-launch): cover icon preferences and rendering (Refs #71)` | red | 2026-11-08 | [42418063892](https://github.com/SakibShahariar/material-panel/actions/runs/42418063892) failed because the test file contained an over-escaped regular expression; JavaScript syntax checks passed and the other 598 tests passed. Corrected in `21144e16`. |
| `21144e16fd62f8599bd9aaf00a09ebbd1b4eb406` | `test(quick-launch): fix icon UI regression assertions (Refs #71)` | green | 2026-11-08 | [42418123203](https://github.com/SakibShahariar/material-panel/actions/runs/42418123203) passed syntax, 600/600 JavaScript tests and 22/22 Python tests. |

**Issue follow-up:** #208 remains open for live GNOME visual/accessibility validation. #71 now supports optional symbolic icons, but optional toggle-state semantics and live GNOME validation remain outstanding; it stays open.

**Checkpoint SHA:** `21144e16fd62f8599bd9aaf00a09ebbd1b4eb406`  
**Checkpoint date:** 2026-11-08  
**Next session:** review commits after this checkpoint, including the related README/ledger documentation commit.


## Incremental review: 2026-11-08 (Quick Launch label and command validation)

Ten commits were made directly on `main` for issue #71 after checkpoint `36e30deea92452f6543a1298ea6faf584d46243f`. The work sanitizes imported labels, hardens add/edit command validation, rejects duplicate edited commands, and truncates labels without splitting Unicode code points.

| Commit | Subject | CI | Result |
|---|---|---|---|
| `d75e702805c759b5f66d711cb7d07f3e353b880d` | `fix(quick-launch): sanitize configured shortcut labels (Refs #71)` | [42418818044](https://github.com/SakibShahariar/material-panel/actions/runs/42418818044) | red: sanitizer regex over-escaped |
| `f2d6e68e05a6678af7610bd088a5f32ea492860c` | `test(quick-launch): cover shortcut label sanitization (Refs #71)` | [42418827751](https://github.com/SakibShahariar/material-panel/actions/runs/42418827751) | red: inherited sanitizer bug and escaped test input |
| `d842f37d52a76b69617ed245632ac655d01964d0` | `fix(quick-launch): validate edited command entries (Refs #71)` | [42418852984](https://github.com/SakibShahariar/material-panel/actions/runs/42418852984) | red: inherited sanitizer bug |
| `bcae49411dcba6ba23228d95e2e8164f1eb9225f` | `test(quick-launch): cover command editor validation (Refs #71)` | [42418861552](https://github.com/SakibShahariar/material-panel/actions/runs/42418861552) | red: inherited sanitizer bug |
| `a486b69bb88f154ddc031a7f8d763f1f6f543505` | `fix(quick-launch): correct label sanitizer regex (Refs #71)` | [42418932901](https://github.com/SakibShahariar/material-panel/actions/runs/42418932901) | red: test input still used literal escapes |
| `766c830e61ae6de9db86d661fa0b973215588c54` | `test(quick-launch): use real control characters in label cases (Refs #71)` | [42418968650](https://github.com/SakibShahariar/material-panel/actions/runs/42418968650) | green |
| `6633e3c00e4cef07acfb15d7b1dec9f119af0458` | `test(quick-launch): make command validation assertion robust (Refs #71)` | [42418988920](https://github.com/SakibShahariar/material-panel/actions/runs/42418988920) | red: test assertion over-escaped |
| `fc7cfda3c5a71df1eaafa61f869cc3cf758950e9` | `test(quick-launch): assert control-character guard directly (Refs #71)` | [42419054166](https://github.com/SakibShahariar/material-panel/actions/runs/42419054166) | green; 604/604 JavaScript and 22/22 Python tests |
| `7e44e4687f019e21283a3a58c15ceda4b15a1bde` | `fix(quick-launch): preserve Unicode labels when truncating (Refs #71)` | [42419132455](https://github.com/SakibShahariar/material-panel/actions/runs/42419132455) | green; 604/604 JavaScript and 22/22 Python tests |
| `4ce7464c3aa5347c3513d0282ba4fa87b3ca5d56` | `test(quick-launch): cover Unicode-safe label truncation (Refs #71)` | [42419142959](https://github.com/SakibShahariar/material-panel/actions/runs/42419142959) | green; 605/605 JavaScript and 22/22 Python tests |

All red runs were inspected and recorded, not omitted. The final state is green. Issue #71 was updated with implementation details and remaining work; it remains open because toggle-state semantics are not yet defined and live GNOME validation is outstanding.

**Checkpoint SHA:** `4ce7464c3aa5347c3513d0282ba4fa87b3ca5d56`  
**Checkpoint date:** 2026-11-08

## Incremental review: 2026-11-08 (Weather location label hardening)

Reviewed the seven commits after checkpoint `b31439ca9a53991bf34785576fc46e552567f0f8`. The initial implementation and test commits exposed two test/regex defects; each was corrected in follow-up commits. The latest verified run passed JavaScript syntax, **608/608 JavaScript tests**, and **22/22 Python tests**.

| Commit | Subject | CI result | Evidence / follow-up |
|---|---|---|---|
| `1f9a365423923d9d03e97f510e0abf575c51f9c6` | `fix(weather): sanitize configured location labels (Refs #143)` | red | [42419556139](https://github.com/SakibShahariar/material-panel/actions/runs/42419556139) exposed an over-escaped control-character regex that removed ordinary label characters; corrected in `3c549a03`. |
| `3c549a03f1ef1019b4252fb458fa43ee459303a4` | `fix(weather): match actual location label controls (Refs #143)` | green | [42419584529](https://github.com/SakibShahariar/material-panel/actions/runs/42419584529) passed after correcting the regex to match actual Unicode control and bidi-formatting characters. |
| `7ddf371c55068ed041775440c7ce1c2efa884263` | `test(weather): cover sanitized location labels (Refs #143)` | red | [42419595860](https://github.com/SakibShahariar/material-panel/actions/runs/42419595860) exposed test fixtures containing literal backslash sequences rather than actual controls; corrected in `172338dc`. |
| `bea5988000e8e9bb45faf9224c6d8a02f4ca4075` | `fix(weather): expose selected city in accessible names (Refs #143)` | red | [42419642081](https://github.com/SakibShahariar/material-panel/actions/runs/42419642081) inherited the failing label fixtures from the preceding test commit. |
| `ab79bdad9b5e482c2cfa390dcf84937535b64dee` | `test(weather): cover accessible saved-location state (Refs #143)` | red | [42419650960](https://github.com/SakibShahariar/material-panel/actions/runs/42419650960) inherited the same failing label fixtures. |
| `172338dc76136668dc087f6c0823f97fbf39dc75` | `test(weather): use real control characters in label cases (Refs #143)` | red | [42419678441](https://github.com/SakibShahariar/material-panel/actions/runs/42419678441) fixed the fixtures but exposed a reversed ordering assumption in the new UI source assertion; corrected in `a4350b85`. |
| `a4350b8574560415a41dfe43051705e4352837d4` | `test(weather): match saved-location selection order (Refs #143)` | green | [42419691509](https://github.com/SakibShahariar/material-panel/actions/runs/42419691509) passed syntax, **608/608 JavaScript tests**, and **22/22 Python tests**. |

Changes covered: saved city labels now replace control characters, bidi overrides/isolates and direction marks with spaces, collapse repeated whitespace, and retain valid Unicode city names. Imported labels are sanitized before persistence. The Weather location chooser now exposes the active city state through each menu item's accessible name.

**Checkpoint SHA:** `a4350b8574560415a41dfe43051705e4352837d4`  
**Checkpoint date:** 2026-11-08  
**Next session:** review the following commit, which adds a Unicode city-name preservation regression test and this ledger update.

## Incremental review: 2026-11-08 (Unicode-safe weather location names)

Reviewed the commits after checkpoint `a4350b8574560415a41dfe43051705e4352837d4`, including the prior checkpoint/ledger commit. Both implementation checkpoints completed green CI.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `5c4d90030b2a09a2c4e3bdaea2d5cc04fe959744` | `test(weather): preserve Unicode location labels (Refs #143)` | green | [42419822303](https://github.com/SakibShahariar/material-panel/actions/runs/42419822303) passed syntax, **609/609 JavaScript tests**, and **22/22 Python tests**. The run includes the Bengali/Arabic city-name preservation regression. |
| `1761ce3a48d87483867122f999bdacac7e1c2a68` | `fix(weather): truncate city labels by Unicode code point (Refs #143)` | green | [42419899603](https://github.com/SakibShahariar/material-panel/actions/runs/42419899603) passed syntax, **609/609 JavaScript tests**, and **22/22 Python tests**. Location labels now truncate by Unicode code point, preventing a supplementary character from being split at the 64-character limit. |

**Checkpoint SHA:** `1761ce3a48d87483867122f999bdacac7e1c2a68`  
**Checkpoint date:** 2026-11-08  
**Next session:** review the following regression-test/ledger commit and its CI result.

## Incremental review: 2026-11-08 (World Clock #248)

Reviewed all 17 commits after checkpoint `4f3ee1878606c08bcd930b7382618839f34b4471`. The first 13 commits failed the JavaScript syntax step because the initial helper contained escaped template-literal delimiters. Commit `ca99e8e8` corrected the source syntax; subsequent CI runs exposed test expectation issues in preferences wiring, time-zone alias normalization, locale-specific formatting, clock teardown assertions, and the panel-rebuild classifier assertion. These were corrected in `efb1a2cd` and `60cca49f`. The final verified run is green.

| Commit | Subject | CI result | Evidence / failure notes |
|---|---|---|---|
| `77b98ee9c5c732ff4cb2b370116e692289cdb829` | `feat(clock): add world clock data helpers (Refs #248)` | red | [42420358204](https://github.com/SakibShahariar/material-panel/actions/runs/42420358204) — JavaScript syntax failure: escaped template-literal delimiters. |
| `9fee3e158c233e0df47791f33d34854002b9a4e7` | `test(clock): cover world clock normalization and time zones (Refs #248)` | red | [42420384609](https://github.com/SakibShahariar/material-panel/actions/runs/42420384609) — inherited syntax failure. |
| `94fe77d2c9a03528b426696d8418d1c0a3058536` | `feat(config): persist normalized world clock entries (Refs #248)` | red | [42420395243](https://github.com/SakibShahariar/material-panel/actions/runs/42420395243) — inherited syntax failure. |
| `0358060098d9cdd89a4e33f801e47e621f132c3b` | `test(config): cover world clock persistence normalization (Refs #248)` | red | [42420406782](https://github.com/SakibShahariar/material-panel/actions/runs/42420406782) — inherited syntax failure. |
| `4db0d55bdfa6f4045467b71294c36bbb3dd76498` | `feat(prefs): add world clock city configuration (Refs #248)` | red | [42420426626](https://github.com/SakibShahariar/material-panel/actions/runs/42420426626) — inherited syntax failure. |
| `cbed9471b99a354cf0043688f9542533e0dd78a0` | `feat(clock): show saved world clocks in calendar popup (Refs #248)` | red | [42420455474](https://github.com/SakibShahariar/material-panel/actions/runs/42420455474) — inherited syntax failure. |
| `265fef89e9ce70851f3431fab5c0768273190e6f` | `fix(clock): refresh world clocks after preference changes (Refs #248)` | red | [42420469584](https://github.com/SakibShahariar/material-panel/actions/runs/42420469584) — inherited syntax failure. |
| `a3cf45b085b638ed479a77cec550463b2ece7d4c` | `fix(clock): tick world clocks only while popup is open (Refs #248)` | red | [42420493610](https://github.com/SakibShahariar/material-panel/actions/runs/42420493610) — inherited syntax failure. |
| `a971a556799b10d3ccf36cb26382e4d2c8ba38ac` | `fix(config): apply world clock changes without panel rebuild (Refs #248)` | red | [42420512229](https://github.com/SakibShahariar/material-panel/actions/runs/42420512229) — inherited syntax failure. |
| `d9b7396255de4709a1afa519ffa28cdb5a38f4b5` | `test(config): cover world clock watcher classification (Refs #248)` | red | [42420520631](https://github.com/SakibShahariar/material-panel/actions/runs/42420520631) — inherited syntax failure. |
| `cc03323787b8b1352fa08bcefff8f222571fbf02` | `test(clock): cover world clock update and timer lifecycle (Refs #248)` | red | [42420539980](https://github.com/SakibShahariar/material-panel/actions/runs/42420539980) — inherited syntax failure. |
| `3e75276e173fe685e8c09c2dd5a054fdf0ec2323` | `test(prefs): cover world clock configuration controls (Refs #248)` | red | [42420550695](https://github.com/SakibShahariar/material-panel/actions/runs/42420550695) — inherited syntax failure. |
| `1fc86c1b2b1204257e32fdf91f3ff1f38d483fd5` | `fix(clock): canonicalize and validate world clock entries (Refs #248)` | red | [42420570110](https://github.com/SakibShahariar/material-panel/actions/runs/42420570110) — inherited template-literal syntax failure; source syntax corrected next. |
| `ca99e8e886530434fb3ca448e3bf667260ddfd6b` | `fix(clock): correct world clock formatting templates (Refs #248)` | red | [42420581627](https://github.com/SakibShahariar/material-panel/actions/runs/42420581627) — syntax passed; tests exposed incorrect helper-name, alias, date-order, and zero-padded-hour expectations. |
| `6c058015c3366e6d18669cbfb18d73856eb3324d` | `test(clock): cover duplicate aliases and invalid world clock labels (Refs #248)` | red | [42420594600](https://github.com/SakibShahariar/material-panel/actions/runs/42420594600) — remaining preferences/test expectation mismatches. |
| `efb1a2cdb18c539d6b2f88bfa8635cf269ccf619` | `fix(clock): stabilize world clock formatting and regression tests (Refs #248)` | red | [42420669687](https://github.com/SakibShahariar/material-panel/actions/runs/42420669687) — remaining lifecycle teardown, classifier-source assertion, and canonical time-zone expectation mismatches. |
| `60cca49f9fb885952fc707cd4de0e008d103cc87` | `fix(clock): align world clock lifecycle tests and teardown (Refs #248)` | green | [42420747480](https://github.com/SakibShahariar/material-panel/actions/runs/42420747480) — syntax passed, **621/621 JavaScript tests**, and **22/22 Python tests**. |

Implemented so far: a bounded list of up to 12 saved cities; validated IANA identifiers; control/bidi-safe Unicode city labels; ordered Preferences configuration; persistence through ConfigStore; DST-aware local time/date formatting; previous/today/next-day labels; accessible popup rows; a bounded scroll area; one-minute refresh only while the Clock popup is open; and watcher/timer cleanup on teardown. World Clock changes use the existing Clock config watcher and do not force a panel reconstruction.

**Checkpoint SHA:** `60cca49f9fb885952fc707cd4de0e008d103cc87`  
**Checkpoint date:** 2026-11-08  
**Next unreviewed commit:** the next commit after this checkpoint, which adds a 12-hour-format regression test and this ledger update.

## Incremental review: 2026-11-08 (World Clock city search)

Reviewed the five commits after checkpoint `60cca49f9fb885952fc707cd4de0e008d103cc87`. All five workflows completed successfully. The city picker reads the system `zone.tab` database, resolves aliases using the runtime's Intl time-zone support, and uses a searchable GTK dropdown. The manual IANA entry list remains available if the system database cannot be read.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `83a2301e926164bb7a58b70bcc7f128e887d200f` | `test(clock): cover twelve-hour world clock display (Refs #248)` | green | [42420847135](https://github.com/SakibShahariar/material-panel/actions/runs/42420847135) — 622/622 JavaScript and 22/22 Python tests. |
| `af8f9a502befab7cebfc5ce914497308be6a5592` | `feat(clock): parse searchable city time-zone choices (Refs #248)` | green | [42420939756](https://github.com/SakibShahariar/material-panel/actions/runs/42420939756). |
| `14f1c60296b47b939c9755cf2f1aa2ea41821ba7` | `test(clock): cover searchable city time-zone choices (Refs #248)` | green | [42420953851](https://github.com/SakibShahariar/material-panel/actions/runs/42420953851). |
| `a6daf1b0f9f92e2e088ca9e661d69a22c03eaec9` | `feat(prefs): add searchable world clock city picker (Refs #248)` | green | [42420984023](https://github.com/SakibShahariar/material-panel/actions/runs/42420984023). |
| `046d5268bbffab6ecdd4489927ec1719651c1048` | `test(prefs): cover searchable world clock city picker (Refs #248)` | green | [42420993874](https://github.com/SakibShahariar/material-panel/actions/runs/42420993874) — 623/623 JavaScript and 22/22 Python tests. |

The picker supports search over city/comment and IANA zone labels from the host's zone table. It prevents adding an already saved zone and enforces the 12-city limit. If `/usr/share/zoneinfo/zone.tab` is unavailable or cannot be decoded, the manual ordered `City|IANA/Time_Zone` editor remains usable.

**Checkpoint SHA:** `046d5268bbffab6ecdd4489927ec1719651c1048`  
**Checkpoint date:** 2026-11-08  
**Next unreviewed commit:** the next commit after this checkpoint, which adds a regression test for the city picker fallback and add limits.


## Incremental review: 2026-11-08 (Notification action-label hardening, #250)

Reviewed all three commits after checkpoint `046d5268bbffab6ecdd4489927ec1719651c1048`. The World Clock city-picker fallback test and both notification-label commits have green CI. Native notification action labels are now normalized before rendering: invisible control/bidi formatting characters are replaced, whitespace is collapsed, and labels are bounded to 80 Unicode code points without splitting surrogate pairs. The original MessageTray action object and callback remain untouched.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `4a262772c98b7188ebfeb7284464dc854c61937e` | `test(prefs): cover world clock city picker limits (Refs #248)` | green | [42421074413](https://github.com/SakibShahariar/material-panel/actions/runs/42421074413) — 624/624 JavaScript and 22/22 Python tests. |
| `94c708a2ae681429bb1e5b2de658ddb8951b0099` | `fix(notifications): sanitize native action labels (Refs #250)` | green | [42421859865](https://github.com/SakibShahariar/material-panel/actions/runs/42421859865) — syntax passed; 624/624 JavaScript and 22/22 Python tests. |
| `9446b90c62b60fd9917a680d1a0fe3fe27fa8419` | `test(notifications): cover sanitized native action labels (Refs #250)` | green | [42421877227](https://github.com/SakibShahariar/material-panel/actions/runs/42421877227) — syntax passed; 626/626 JavaScript and 22/22 Python tests. |

Issue #250 remains open (Category B): a real notification action still needs live invocation and retained/expired/removed notification verification in GNOME Shell. Issue #248 also remains open pending its documented GNOME runtime checks.

**Checkpoint SHA:** `9446b90c62b60fd9917a680d1a0fe3fe27fa8419`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Weather location preference delimiter safety, #143)

Reviewed commits after checkpoint `9446b90c62b60fd9917a680d1a0fe3fe27fa8419`. The audit-ledger commit itself and both weather-location commits have green CI. Saved location names now replace the reserved `;` and `|` preference delimiters with spaces, preventing city labels from breaking the list serialization format.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `553300c34670c1b2386fc0066b9dc34d4804f11b` | `docs(maintenance): record notification action CI review (Refs #250)` | green | [42421951850](https://github.com/SakibShahariar/material-panel/actions/runs/42421951850) — syntax passed; 626/626 JavaScript and 22/22 Python tests. |
| `d89ff3b4aa0e88146debcf4b90037ff4963e8c3c` | `fix(weather): escape location preference delimiters (Refs #143)` | green | [42422428192](https://github.com/SakibShahariar/material-panel/actions/runs/42422428192) — syntax passed; 626/626 JavaScript and 22/22 Python tests. |
| `39d7b7944109ecaacbbd0e47405fd39398ebdddc` | `test(weather): cover location delimiter round trips (Refs #143)` | green | [42422440766](https://github.com/SakibShahariar/material-panel/actions/runs/42422440766) — syntax passed; 627/627 JavaScript and 22/22 Python tests. |

Issue #143 remains open (Category B) pending live weather-provider, per-location error, timezone, rapid-switching, and request-rate validation. Issues #248 and #250 also remain open for their documented live GNOME checks.

**Checkpoint SHA:** `39d7b7944109ecaacbbd0e47405fd39398ebdddc`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Quick Launch bidi label safety, #253)

Reviewed the two commits after checkpoint `3e749ec769fcf556f4a2698336fef194748b250a`. Both completed green CI.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `eedfc84750a8b05ef9882e7f6431a5b27b146000` | `fix(quick-launch): strip bidi formatting from labels (Refs #253)` | green | [42423512494](https://github.com/SakibShahariar/material-panel/actions/runs/42423512494) — syntax passed; 627/627 JavaScript tests and 22/22 Python tests. |
| `98eb72958c52bd8d6af01ab52b4bbbdd63f31853` | `test(quick-launch): cover bidi-safe labels (Refs #253)` | green | [42423531287](https://github.com/SakibShahariar/material-panel/actions/runs/42423531287) — syntax passed; 628/628 JavaScript tests and 22/22 Python tests. |

Imported Quick Launch labels now remove invisible bidirectional formatting controls while preserving Unicode text and emoji sequences. Issue #253 remains open for interactive Preferences and live GNOME launch validation.

**Checkpoint SHA:** `98eb72958c52bd8d6af01ab52b4bbbdd63f31853`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Clipboard preview Unicode safety, #254)

Reviewed the implementation and regression-test commits after checkpoint `98eb72958c52bd8d6af01ab52b4bbbdd63f31853`.

| Commit | Subject | CI result | Evidence / failure notes |
|---|---|---|---|
| `ab4f49566807cf33b34f59acc0ef278b45b80fa7` | `fix(clipboard): truncate previews without splitting Unicode (Refs #254)` | red | [42424301493](https://github.com/SakibShahariar/material-panel/actions/runs/42424301493) — preview whitespace regex was over-escaped; the regression test caught literal newline text not being collapsed. |
| `02a9d5fe6957f65abd4139fc821af29ecb0eba5c` | `fix(clipboard): normalize preview whitespace correctly (Refs #254)` | red | [42424323251](https://github.com/SakibShahariar/material-panel/actions/runs/42424323251) — source regex was corrected; the remaining failure was a test fixture containing a literal backslash-n sequence. |
| `e43472726ad5da45e645982eace250b688686116` | `test(clipboard): use real newline in preview fixture (Refs #254)` | green | [42424341734](https://github.com/SakibShahariar/material-panel/actions/runs/42424341734) — syntax passed, **629/629 JavaScript tests**, and **22/22 Python tests**. |

Clipboard History popup previews now collapse whitespace and truncate by Unicode code point, so supplementary characters such as emoji are not split into invalid surrogate halves. The stored clipboard payload is unchanged; only its popup preview is formatted. The first two CI failures were test/source escaping defects and are retained in this ledger.

**Checkpoint SHA:** `e43472726ad5da45e645982eace250b688686116`  
**Checkpoint date:** 2026-11-08


## Follow-up review: 2026-11-08 (Clipboard preview regression recovery, #254)

Two later test/ledger commits were also reviewed. Both failed because the tree for the test-only commit was accidentally based on an older tree, dropping the new preview helper and its module import. This is corrected in the current commit using the verified current HEAD tree; no unrelated source changes are intended.

| Commit | Subject | CI result | Evidence / failure notes |
|---|---|---|---|
| `a5241cc867dbbc38c441f7bc3aa971896f55ed7b` | `test(clipboard): cover preview truncation boundaries (Refs #254)` | red | [42424403219](https://github.com/SakibShahariar/material-panel/actions/runs/42424403219) — test module could not import `formatClipboardHistoryPreview` because the commit tree omitted the preceding implementation. |
| `ffc5bd31aafbc452df21fe3cf4ef44b119f0a6c8` | `test(clipboard): use actual whitespace in preview boundary case (Refs #254)` | red | [42424415687](https://github.com/SakibShahariar/material-panel/actions/runs/42424415687) — inherited missing-export failure from the preceding tree. |

The helper and module wiring are restored below the current branch head; the current commit's CI will verify the complete tree.

**Checkpoint SHA:** `ffc5bd31aafbc452df21fe3cf4ef44b119f0a6c8`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Clipboard preview implementation recovery, #254)

Reviewed the corrective implementation commit after the test-only commits that were based on an older tree. The full current tree was restored and CI passed.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `d93799dffd562427cd3e4505dc2acee45635be5d` | `fix(clipboard): restore Unicode-safe preview formatting (Refs #254)` | green | [42424500303](https://github.com/SakibShahariar/material-panel/actions/runs/42424500303) — syntax passed, **630/630 JavaScript tests**, and **22/22 Python tests**. |

**Checkpoint SHA:** `d93799dffd562427cd3e4505dc2acee45635be5d`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Clipboard preview bidi safety, #254)

Reviewed all commits after checkpoint `ffc5bd31aafbc452df21fe3cf4ef44b119f0a6c8` that implement and test the Unicode-safe preview.

| Commit | Subject | CI result | Evidence / failure notes |
|---|---|---|---|
| `d93799dffd562427cd3e4505dc2acee45635be5d` | `fix(clipboard): restore Unicode-safe preview formatting (Refs #254)` | green | [42424500303](https://github.com/SakibShahariar/material-panel/actions/runs/42424500303) — 630/630 JavaScript and 22/22 Python tests. |
| `40b08e50dc677c55a5bf1187f7f0d94e182e982e` | `fix(clipboard): neutralize bidi controls in previews (Refs #254)` | red | [42424632871](https://github.com/SakibShahariar/material-panel/actions/runs/42424632871) — over-escaped whitespace normalization prevented line-break collapsing and left multiple replacement spaces; corrected in the following commit. |
| `bcbf5c339ff4f5c1807b052a997937a5717a9fec` | `test(clipboard): verify bidi-safe preview formatting (Refs #254)` | green | [42424659322](https://github.com/SakibShahariar/material-panel/actions/runs/42424659322) — syntax passed, **631/631 JavaScript tests**, and **22/22 Python tests**. |

The preview now replaces bidi formatting controls with spaces before whitespace normalization, preserving visible Bengali/Arabic text while preventing invisible directional controls from reordering popup previews. Clipboard storage and copy behavior are unchanged.

**Checkpoint SHA:** `bcbf5c339ff4f5c1807b052a997937a5717a9fec`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Clipboard preview bidi range tests, #254)

Reviewed the latest bidi-range regression test commit after checkpoint `bcbf5c339ff4f5c1807b052a997937a5717a9fec`.

| Commit | Subject | CI result | Evidence |
|---|---|---|---|
| `03b7129f160b964362a199b7b21aedf6ee998f23` | `test(clipboard): cover full bidi control range (Refs #254)` | green | [42424729036](https://github.com/SakibShahariar/material-panel/actions/runs/42424729036) — syntax passed, **632/632 JavaScript tests**, and **22/22 Python tests**. |

**Checkpoint SHA:** `03b7129f160b964362a199b7b21aedf6ee998f23`  
**Checkpoint date:** 2026-11-08


## Incremental review: 2026-11-08 (Layout-style configuration validation, #132)

The persisted `layoutStyle` value was only defaulted when null. Unsupported strings could therefore leak into shared layout state and theme generation, where different consumers interpreted them inconsistently. Exported the existing supported-style normalizer and applied it consistently when loading and saving configuration. Added coverage for supported values, malformed values, and both save paths.

**Commit:** pending CI for this update.


## Follow-up: layout-style normalization test setup, #132

- `358bbaf73e062ee0f9fc7e198f32d7cea913e1bd` — implementation and regression tests. CI [42425084799](https://github.com/SakibShahariar/material-panel/actions/runs/42425084799) failed one new test because its source-inspection assertion omitted the `readFile` import. Syntax passed; 634/635 JavaScript tests passed. The production normalizer and configuration wiring tests passed.
- The next commit adds the missing test-only import; it does not change production behavior.


## Layout-style configuration normalization follow-up, #132

- `358bbaf73e062ee0f9fc7e198f32d7cea913e1bd` — introduced the shared whitelist and load/save normalization; CI [42425084799](https://github.com/SakibShahariar/material-panel/actions/runs/42425084799) failed only because a new source-inspection test omitted its `readFile` import.
- `674dc83adae1edb1a94ee6ae73a90a45cff39ede` — added the missing import; CI [42425170794](https://github.com/SakibShahariar/material-panel/actions/runs/42425170794) green: syntax passed, **635/635 JavaScript tests**, and **22/22 Python tests**.

The shared layout-style state setter is now being hardened to use the same whitelist, preventing invalid values from being reintroduced by future callers.


## Incremental review: 2026-11-08 — Popup shortcut hardening and layout normalization

The previous recorded checkpoint was `8f9246041a64e8e4dd54c94dbd2bea7f5242bf04`. Reviewed the commits through `03a405897b206efe2775067141338b476539b999` using their exact commit-associated workflow runs.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `4243e1a9` | `fix(layout): validate shared layout state (Refs #132)` | green | 2026-11-08 | [Run #42425236096](https://github.com/SakibShahariar/material-panel/actions/runs/42425236096) passed syntax, 636/636 JavaScript tests, and 22/22 Python tests. |
| `f46ff190` | `fix(shortcuts): sanitize imported accelerator controls (Refs #249)` | red | 2026-11-08 | [Run #42425648451](https://github.com/SakibShahariar/material-panel/actions/runs/42425648451) failed one new test: fixture used literal backslash sequences rather than actual Unicode controls (636/637 JS tests passed). Corrected by `bca10f36` and `d2b53e18`; final green run #42425728902. |
| `bca10f36` | `test(shortcuts): fix escaped control fixtures (Refs #249)` | red | 2026-11-08 | [Run #42425706112](https://github.com/SakibShahariar/material-panel/actions/runs/42425706112) still failed one new assertion because the newline fixture remained escaped (636/637 JS tests passed). Corrected by `d2b53e18`; final green run #42425728902. |
| `d2b53e18` | `test(shortcuts): correct control-character fixture (Refs #249)` | green | 2026-11-08 | [Run #42425728902](https://github.com/SakibShahariar/material-panel/actions/runs/42425728902) passed syntax, 637/637 JavaScript tests, and 22/22 Python tests. |
| `03a40589` | `fix(shortcuts): reject oversized imported accelerators (Refs #249)` | green | 2026-11-08 | [Run #42425782123](https://github.com/SakibShahariar/material-panel/actions/runs/42425782123) passed syntax, 637/637 JavaScript tests, and 22/22 Python tests. |

The two red shortcut runs were test-fixture mistakes, not production regressions. Both were corrected in subsequent commits, and the final implementation commits are green. Issues #132 and #249 remain open for their explicitly outstanding live GNOME visual/interaction validation; no desktop behavior is claimed as verified.

**Checkpoint SHA:** `03a405897b206efe2775067141338b476539b999`  
**Checkpoint date:** 2026-11-08  
**Next session:** review commits after this checkpoint, including the scheduler hardening change currently being prepared.


## Incremental review: 2026-11-08 — Adaptive polling input hardening

Reviewed commit `3929ab3bb151c64dc36f1f7614a05b3166bc81bf` against its associated workflow.

| Commit (short SHA) | Subject | CI result | Checked | Follow-up |
|---|---|---|---|---|
| `3929ab3b` | `fix(polling): tolerate malformed scheduler options (Refs #223)` | green | 2026-11-08 | [Run #42426529583](https://github.com/SakibShahariar/material-panel/actions/runs/42426529583) passed JavaScript syntax, **638/638 JavaScript tests**, and **22/22 Python tests**. |

The new regression test covers non-convertible JavaScript values for all numeric scheduler options. The shared scheduler now falls back safely rather than throwing during initialization.

**Checkpoint SHA:** `3929ab3bb151c64dc36f1f7614a05b3166bc81bf`  
**Checkpoint date:** 2026-11-08  
**Next session:** review commits after this checkpoint.


## Incremental review: 2026-11-08 — Theme renderer extraction and typography tokens (#221)

Reviewed every commit after checkpoint `3929ab3bb151c64dc36f1f7614a05b3166bc81bf`. Four intermediate commits had red CI while the refactor and its tests were being synchronized; all failures were traced and the latest follow-up is green.

| Commit (full SHA) | Subject | CI result | Evidence / resolution |
|---|---|---|---|
| `ee796790818e83956dfaf62733a6ecd6b75dc76b` | `docs: record adaptive polling CI review` | green | [Run #42426616543](https://github.com/SakibShahariar/material-panel/actions/runs/42426616543): syntax passed, 638/638 JavaScript tests, 22/22 Python tests. |
| `18f8cc83ea0d53fb583ba252d97cb577e17b52a3` | `refactor(theme): extract panel dimension renderer (Refs #221)` | red | [Run #42426903994](https://github.com/SakibShahariar/material-panel/actions/runs/42426903994): 634/638 JS passed. Four failures were stale tests still looking for palette renderer exports and the typography constant in the old module after extraction. |
| `cb30c26b78303de412687792ad2daa5cf4b336df` | `test(theme): follow extracted dimension renderer (Refs #221)` | red | [Run #42426964814](https://github.com/SakibShahariar/material-panel/actions/runs/42426964814): 635/638 JS passed. Three failures remained in palette renderer tests and the typography source assertion; the tests still needed to follow the new module ownership. |
| `7f0920172884ec9b34063259f0ab303b613aa637` | `test(theme): update typography scale source assertion (Refs #221)` | red | [Run #42427000970](https://github.com/SakibShahariar/material-panel/actions/runs/42427000970): 635/638 JS passed. The test now followed the extracted constant but exposed that body/title typography tokens were not yet consumed by generated CSS. |
| `18cea01c503f107b2d1b9aec571fb5b3dff43ac8` | `fix(theme): share typography tokens across renderers (Refs #221)` | red | [Run #42427036671](https://github.com/SakibShahariar/material-panel/actions/runs/42427036671): 637/638 JS passed. The remaining source assertion still expected a body-token use in a particular source expression; the subsequent test update verified the shared token contract in the final renderer. |
| `d28a101b7750c6c6498d8855a4c21c15dd4ef31b` | `test(theme): check shared typography tokens across renderers (Refs #221)` | green | [Run #42427091287](https://github.com/SakibShahariar/material-panel/actions/runs/42427091287): syntax passed, 638/638 JavaScript tests, 22/22 Python tests. |

The four red results are retained as history; the failures were test/refactor synchronization and the missing generated body/title token use, corrected by later commits. A new behavior-level regression test now asserts that the generated stylesheet actually emits caption (10.5px), body (12px), and title (14px) role declarations rather than merely checking source text.

**Next checkpoint:** pending the behavior-test commit's CI result.  
**Reviewed range ends at:** `d28a101b7750c6c6498d8855a4c21c15dd4ef31b`.


### Follow-up test assertion correction

- `cf9e2a8c9280d0f04b5b48d83969ae839f0b713b` — added behavior-level generated typography assertions, but CI [run #42427336415](https://github.com/SakibShahariar/material-panel/actions/runs/42427336415) failed one new test because its regular-expression character-class escaping was incorrect. Syntax passed; 638/639 JavaScript tests passed. This was a test assertion issue, not a renderer regression.
- The follow-up replaces the fragile cross-line regular expressions with direct inspection of each generated CSS rule block. Its CI result is pending.


## Follow-up: generated typography behavior test and direct dimension-input hardening

- `cf9e2a8c9280d0f04b5b48d83969ae839f0b713b` — behavior-level typography test draft. CI [#42427336415](https://github.com/SakibShahariar/material-panel/actions/runs/42427336415) red: one new test assertion used over-escaped regex character classes (638/639 JS passed).
- `c20ee794d9677a0c1906f172a62f5db5a403e405` — replaced the fragile regex with direct generated-rule inspection. CI [#42427422761](https://github.com/SakibShahariar/material-panel/actions/runs/42427422761) green: syntax, **639/639 JavaScript tests**, and **22/22 Python tests**.
- Current follow-up hardens `renderDimensionsCss` against malformed direct-call inputs (including non-convertible Symbols and non-finite numbers), using the same global scale/gap bounds as persisted configuration and the existing per-zone/chip-gap bounds. This protects the extracted renderer from generating invalid `NaNpx`/infinite CSS if a caller bypasses ConfigStore normalization. Added direct-call regression coverage. CI is pending.


### Dimension-renderer input test correction

- `f877e7e0454cf192d47ddc53cc2f280c6bd8165f` — production normalization and malformed-input regression coverage. CI [#42427503425](https://github.com/SakibShahariar/material-panel/actions/runs/42427503425) failed one new test because its expected bar height was miscalculated (638/639 JS passed); the actual normalized output was 49px. Syntax passed. This was a test expectation error, not invalid CSS or a production failure.
- The follow-up corrects the expected geometry while retaining checks for non-finite CSS output and legacy-gap fallback. CI is pending.


### Final verification for the previous checkpoint

- `cf9e2a8c9280d0f04b5b48d83969ae839f0b713b` — red, [run #42427336415](https://github.com/SakibShahariar/material-panel/actions/runs/42427336415): the first generated-CSS behavior assertion used over-escaped regex character classes (638/639 JS tests passed).
- `c20ee794d9677a0c1906f172a62f5db5a403e405` — green, [run #42427422761](https://github.com/SakibShahariar/material-panel/actions/runs/42427422761): syntax, **639/639 JavaScript tests**, **22/22 Python tests**.
- `f877e7e0454cf192d47ddc53cc2f280c6bd8165f` — red, [run #42427503425](https://github.com/SakibShahariar/material-panel/actions/runs/42427503425): malformed-input implementation passed syntax; one new test expected 40px instead of the correctly normalized 49px (638/639 JS tests passed).
- `faf76533db169390420d5c446c4dcac0e13736be` — green, [run #42427557344](https://github.com/SakibShahariar/material-panel/actions/runs/42427557344): syntax, **640/640 JavaScript tests**, **22/22 Python tests**.

**Checkpoint SHA:** `faf76533db169390420d5c446c4dcac0e13736be`  
**Checkpoint date:** 2026-11-08  
**Next session:** review commits after this checkpoint.


## Incremental CI review — 2026-11-08

Commits after the previous checkpoint `faf76533db169390420d5c446c4dcac0e13736be`:

| Commit | Subject | CI | Result |
|---|---|---|---|
| `18f8cc83ea0d53fb583ba252d97cb577e17b52a3` | Extract theme dimensions renderer (#221) | [#42426903994](https://github.com/SakibShahariar/material-panel/actions/runs/42426903994) | Red: 634/638 JS tests; stale source assertions still targeted old module ownership. |
| `cb30c26b78303de412687792ad2daa5cf4b336df` | Update renderer tests (#221) | [#42426964814](https://github.com/SakibShahariar/material-panel/actions/runs/42426964814) | Red: 635/638 JS tests; remaining assertions had not all followed the extraction. |
| `7f0920172884ec9b34063259f0ab303b613aa637` | Update typography source assertion (#221) | [#42427000970](https://github.com/SakibShahariar/material-panel/actions/runs/42427000970) | Red: 635/638 JS tests; exposed missing generated body/title token use. |
| `18cea01c503f107b2d1b9aec571fb5b3dff43ac8` | Share typography tokens (#221) | [#42427036671](https://github.com/SakibShahariar/material-panel/actions/runs/42427036671) | Red: 637/638 JS tests; a remaining source assertion expected a specific implementation expression. |
| `d28a101b7750c6c6498d8855a4c21c15dd4ef31b` | Check shared typography tokens (#221) | [#42427091287](https://github.com/SakibShahariar/material-panel/actions/runs/42427091287) | Green: syntax, 638/638 JS, 22/22 Python. |
| `cf9e2a8c9280d0f04b5b48d83969ae839f0b713b` | Generated typography behavior test (#221) | [#42427336415](https://github.com/SakibShahariar/material-panel/actions/runs/42427336415) | Red: 638/639 JS; over-escaped test regex. |
| `c20ee794d9677a0c1906f172a62f5db5a403e405` | Correct generated CSS assertions (#221) | [#42427422761](https://github.com/SakibShahariar/material-panel/actions/runs/42427422761) | Green: syntax, 639/639 JS, 22/22 Python. |
| `f877e7e0454cf192d47ddc53cc2f280c6bd8165f` | Guard dimension renderer inputs (#111) | [#42427503425](https://github.com/SakibShahariar/material-panel/actions/runs/42427503425) | Red: 638/639 JS; test expected 40px instead of normalized 49px. |
| `faf76533db169390420d5c446c4dcac0e13736be` | Correct normalized bar-height expectation (#111) | [#42427557344](https://github.com/SakibShahariar/material-panel/actions/runs/42427557344) | Green: syntax, 640/640 JS, 22/22 Python. |
| `dfb9642e89da9a02c57e3441bfbc1ca53d987770` | Whitelist dimension renderer styles (#132) | [#42427629641](https://github.com/SakibShahariar/material-panel/actions/runs/42427629641) | Green: syntax, 641/641 JS, 22/22 Python. |

The intermediate red runs are retained as history; each failure was resolved by a later commit, and the final implementation/test runs are green. The adaptive polling change `3929ab3bb151c64dc36f1f7614a05b3166bc81bf` also passed [#42426529583](https://github.com/SakibShahariar/material-panel/actions/runs/42426529583), syntax, 637/637 JS and 22/22 Python.

**Next change:** harden the pure popup-focus index helper against malformed direction values; CI pending.
