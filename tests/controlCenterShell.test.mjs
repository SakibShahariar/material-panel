import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

async function source(path) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Control Center is registered as an optional built-in panel module', async () => {
    const [ids, registry, catalog, config] = await Promise.all([
        source('../lib/moduleIds.js'),
        source('../lib/moduleRegistry.js'),
        source('../prefs/moduleCatalog.js'),
        source('../lib/configStore.js'),
    ]);
    assert.match(ids, /'control-center'/);
    assert.match(registry, /import \{buildControlCenter\} from '\.\.\/modules\/controlCenter\.js'/);
    assert.match(registry, /'control-center': buildControlCenter/);
    assert.match(catalog, /id: 'control-center', name: 'Control Center'/);
    assert.doesNotMatch(config, /control-center/);
});

test('Control Center provides Home, Media and System navigation with bounded scrolling', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /const SECTIONS = \[[\s\S]*?id: 'home'[\s\S]*?id: 'media'[\s\S]*?id: 'system'/);
    assert.match(module, /new St\.ScrollView/);
    assert.match(module, /scroll\.set_policy\(St\.PolicyType\.NEVER, St\.PolicyType\.AUTOMATIC\)/);
    assert.match(module, /const maxHeight = Math\.max\(160, Math\.floor\(\(monitor\?\.height \?\? 800\) \* 0\.78\)\)/);
    assert.match(module, /function popupArrowSide\(\)/);
    assert.match(module, /return y > monitor\.y \+ monitor\.height \/ 2 \? St\.Side\.BOTTOM : St\.Side\.TOP/);
    assert.match(module, /return x > monitor\.x \+ monitor\.width \/ 2 \? St\.Side\.LEFT : St\.Side\.RIGHT/);
    assert.match(module, /navButton\.connect\('clicked', \(\) => renderSection\(section\.id\)\)/);
    assert.match(module, /can_focus: true/);
    assert.doesNotMatch(module, /spawn_command_line_sync|spawn_sync/);
});

test('Control Center Home reuses the existing GNOME quick-toggle backends', async () => {
    const [controlCenter, quickSettings] = await Promise.all([
        source('../modules/controlCenter.js'),
        source('../modules/quicksettings.js'),
    ]);
    assert.match(controlCenter, /darkModeTile, nightLightTile, dndTile/);
    assert.match(controlCenter, /const actions = \[darkModeTile\(\), nightLightTile\(\), dndTile\(\)\]/);
    assert.match(quickSettings, /export function darkModeTile\(\)/);
    assert.match(quickSettings, /export function nightLightTile\(\)/);
    assert.match(quickSettings, /export function dndTile\(\)/);
});

test('Control Center tears down inactive section actors and exposes Focus Mode on Home', async () => {
    const module = await source('../modules/controlCenter.js');
    assert.match(module, /function clearActors\(box\)/);
    assert.match(module, /clearActors\(page\);/);
    assert.match(module, /focusModeItem\.visible = section\.id === 'home'/);
    assert.match(module, /new PopupMenu\.PopupSwitchMenuItem\('Focus Mode', false\)/);
    assert.match(module, /config\.focusModeEnabled = enabled === true/);
    assert.match(module, /else \{\s+clearActors\(page\);\s+focusModeItem\.visible = false;/);
});
