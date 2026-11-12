import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

async function source(path) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Quick Launch configuration is normalized and synchronized with extension lifecycle', async () => {
    const [config, state, extension] = await Promise.all([
        source('../lib/configStore.js'),
        source('../lib/quickLaunchState.js'),
        source('../extension.js'),
    ]);

    assert.match(config, /quickLaunch:\s*\[\]/);
    assert.match(config, /merged\.quickLaunch = normalizeQuickLaunchEntries\(merged\.quickLaunch\)/);
    assert.match(state, /export function setQuickLaunchEntries\(value\)/);
    assert.match(state, /export function setQuickLaunchEntryState\(id, active, expected = null\)/);
    assert.match(state, /export function clearQuickLaunchEntries\(\)/);
    assert.match(extension, /setQuickLaunchEntries\(this\._config\.quickLaunch\)/);
    assert.match(extension, /setQuickLaunchEntries\(newConfig\.quickLaunch\)/);
    assert.match(extension, /clearQuickLaunchEntries\(\)/);
});

test('Preferences registers Quick Launch and refreshes it when configuration changes', async () => {
    const [prefs, page] = await Promise.all([
        source('../prefs.js'),
        source('../prefs/quickLaunchPage.js'),
    ]);

    assert.match(prefs, /import \{buildQuickLaunchPage\} from '\.\/prefs\/quickLaunchPage\.js'/);
    assert.match(prefs, /buildQuickLaunchPage\(\{/);
    assert.match(prefs, /refreshQuickLaunchPage\(\)/);
    assert.match(page, /Installed application/);
    assert.match(page, /Command \(executable and arguments\)/);
    assert.match(page, /Off command \(optional toggle\)/);
    assert.match(page, /offTarget/);
    assert.match(page, /resets when the extension reloads/);
    assert.match(page, /current\.name = value\.slice\(0, 80\)/);
    assert.match(page, /list\.splice\(index - 1, 0, item\)/);
    assert.match(page, /list\.splice\(index \+ 1, 0, item\)/);
    assert.match(page, /config\.quickLaunch = config\.quickLaunch\.filter/);
    assert.match(page, /QUICK_LAUNCH_LIMIT|length >= 12/);
});

test('Quick Launch is included conditionally in Default, End-4, and Ryoku layouts', async () => {
    const [defaultLayout, end4Layout, ryokuLayout] = await Promise.all([
        source('../modules/quicksettings.js'),
        source('../modules/quicksettingsEnd4.js'),
        source('../modules/quicksettingsRyoku.js'),
    ]);

    assert.match(defaultLayout, /import \{buildQuickLaunchSection\} from '\.\/quickLaunch\.js'/);
    assert.match(defaultLayout, /if \(quickLaunchSection\)\s+identityAndMedia\.push\(quickLaunchSection\)/);
    assert.match(end4Layout, /import \{buildQuickLaunchSection\} from '\.\/quickLaunch\.js'/);
    assert.match(end4Layout, /if \(quickLaunchSection\)\s+shell\.add_child\(quickLaunchSection\)/);
    assert.match(ryokuLayout, /import \{buildQuickLaunchSection\} from '\.\/quickLaunch\.js'/);
    assert.match(ryokuLayout, /if \(quickLaunchSection\)\s+root\.add_child\(quickLaunchSection\)/);
});

test('Quick Launch section stays absent when empty and makes unavailable entries non-interactive', async () => {
    const module = await source('../modules/quickLaunch.js');

    assert.match(module, /const entries = getQuickLaunchEntries\(\);\s+if \(!entries\.length\)\s+return null/);
    assert.match(module, /reactive: available/);
    assert.match(module, /can_focus: true/);
    assert.match(module, /if \(!available\)\s*\{[\s\S]*?button\.opacity = 150;[\s\S]*?button\.set_tooltip_text\(unavailableReason\)/);
    assert.match(module, /if \(!isToggle\)\s*\{\s*launchEntry\(entry\)/);
    assert.match(module, /setQuickLaunchEntryState\(entry\.id, nextActive, \{/);
    assert.match(module, /commandTarget,\s*onComplete/);
});


test('Quick Launch command entries are tokenized to argv and never evaluated by a shell', async () => {
    const [module, runner] = await Promise.all([
        source('../modules/quickLaunch.js'),
        source('../lib/quickLaunchRunner.js'),
    ]);
    assert.match(module, /GLib\.shell_parse_argv\(command\)/);
    assert.match(module, /Gio\.Subprocess\.new\(\s*argv,/);
    assert.match(module, /QUICK_LAUNCH_TIMEOUT_SECONDS/);
    assert.match(module, /GLib\.timeout_add_seconds/);
    assert.match(module, /process\.force_exit\(\)/);
    assert.match(module, /timeoutId = 0/);
    assert.match(module, /process\.wait_async/);
    assert.match(module, /Main\.notify\('Quick launch completed'/);
    assert.match(module, /entry\.type === 'app' && launched/);
    assert.doesNotMatch(module, /spawn_command_line|spawn_sync|\/bin\/sh/);
    assert.match(module, /subprocess\.get_if_exited\(\)/);
    assert.match(module, /subprocess\.get_exit_status\(\)/);
    assert.match(module, /subprocess\.get_if_signaled\(\)/);
    assert.match(module, /subprocess\.get_term_sig\(\)/);
    assert.match(runner, /const argv = parseCommand\(commandTarget\)/);
    assert.match(runner, /spawnCommand\(argv, \(success, error = null\) => complete\(success, error\)\)/);
    assert.doesNotMatch(runner, /exec\(|eval\(|shell=True/);
});


test('Quick Launch announces the pending toggle direction and restores the final state', async () => {
    const module = await source('../modules/quickLaunch.js');
    assert.match(module, /const transition = nextActive \? 'on' : 'off'/);
    assert.match(module, /setChipA11y\(button, `\$\{entry\.name\}, turning \$\{transition\}`\)/);
    assert.match(module, /button\.set_tooltip_text\(`\$\{entry\.name\}: turning \$\{transition\}…`\)/);
    assert.match(module, /if \(success && setQuickLaunchEntryState/);
    assert.match(module, /applyVisualState\(\);/);
});
