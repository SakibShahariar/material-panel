import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

async function source(path) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Focus Mode configuration defaults off with no selected modules', async () => {
    const config = await source('../lib/configStore.js');
    assert.match(config, /focusModeEnabled:\s*false/);
    assert.match(config, /focusModeModules:\s*\[\]/);
    assert.match(config, /merged\.focusModeEnabled = merged\.focusModeEnabled === true/);
    assert.match(config, /if \(!Array\.isArray\(merged\.focusModeModules\)\)\s+merged\.focusModeModules = \[\]/);
});

test('panel builder layers Focus Mode over normal hidden modules', async () => {
    const builder = await source('../lib/panelBuilder.js');
    assert.match(builder, /getEffectiveHiddenModules\(/);
    assert.match(builder, /config\.hiddenModules/);
    assert.match(builder, /config\.focusModeEnabled === true/);
    assert.match(builder, /config\.focusModeModules/);
});

test('Modules preferences expose a separate Focus Mode selection', async () => {
    const page = await source('../prefs/modulesPage.js');
    assert.match(page, /title: 'Focus Mode'/);
    assert.match(page, /does not change Module Visibility or context-aware visibility rules/);
    assert.match(page, /active: config\.focusModeModules\.includes\(module\.id\)/);
    assert.match(page, /selected\.push\(module\.id\)/);
    assert.match(page, /selected\.splice\(index, 1\)/);
});

test('Quick Settings exposes Focus Mode in Default, End-4, and Ryoku layouts', async () => {
    const quickSettings = await source('../modules/quicksettings.js');
    assert.match(quickSettings, /function addFocusModeToggle\(menu\)/);
    assert.match(quickSettings, /new PopupMenu\.PopupSwitchMenuItem\('Focus Mode', false\)/);
    assert.match(quickSettings, /config\.focusModeEnabled = enabled === true/);
    assert.match(quickSettings, /addFocusModeToggle\(menu\);[\s\S]*?fillRyokuQsMenu/);
    assert.match(quickSettings, /menu\.addMenuItem\(wrapAsMenuItem\(qsSection\(null, grid\)\)\);\s+addFocusModeToggle\(menu\)/);
});
