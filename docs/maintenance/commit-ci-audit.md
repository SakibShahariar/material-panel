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
- Checkpoint SHA: `1a403ac2cff4f56a3dc7a39b948cccee2557a648`
- Checkpoint date: 2026-11-02
- Next session: start with commits after this checkpoint. This ledger update will be newer than the checkpoint and should be included in the next incremental check.

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
