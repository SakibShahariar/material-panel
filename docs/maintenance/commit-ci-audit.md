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
- Checkpoint SHA: `f1169feabcae0ff3762051bdf558097965977b96`
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
