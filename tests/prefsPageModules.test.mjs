import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('preferences pages are composed from focused modules while save and watch lifecycle stays centralized', async () => {
    const [entry, layout, modules, tray, appearance] = await Promise.all([
        read('prefs.js'), read('prefs/layoutPage.js'), read('prefs/modulesPage.js'),
        read('prefs/trayPage.js'), read('prefs/appearancePage.js'),
    ]);
    for (const [name, source] of [
        ['layout', layout], ['modules', modules], ['tray', tray], ['appearance', appearance],
    ]) {
        assert.match(source, new RegExp(`export function build${name[0].toUpperCase() + name.slice(1)}Page\\(`));
    }
    for (const builder of ['buildLayoutPage', 'buildModulesPage', 'buildTrayPage', 'buildAppearancePage']) {
        assert.match(entry, new RegExp(`import \\{\\s*${builder}\\s*\\}`));
        assert.match(entry, new RegExp(`${builder}\\(`));
    }
    assert.match(entry, /store\.watch\(newConfig =>/);
    assert.match(entry, /mergeConfigChanges\(baseline, config, newConfig\)/);
    assert.match(entry, /const cleanup = \(\) => \{/);
});

test('settings migration remains centralized in ConfigStore and normalization helpers', async () => {
    const [store, normalization, tests] = await Promise.all([
        read('lib/configStore.js'), read('lib/configNormalization.js'),
        read('tests/configNormalization.test.mjs'),
    ]);
    for (const key of ['layoutStyle', 'panelSize', 'clockFormat', 'weatherLocation',
        'hiddenModules', 'foreignRoleZones', 'qsTiles', 'qsFavorites', 'activityChipMetrics']) {
        assert.ok(store.includes(`${key}:`) || store.includes(`${key} =`), `missing persisted key: ${key}`);
    }
    assert.match(normalization, /gap/);
    assert.match(tests, /migrates legacy gap into top and bottom gaps/);
    assert.match(tests, /legacy Activity chip modes migrate/);
});

test('module preferences expose independent active-only controls for supported status indicators', async () => {
    const [modules, catalog, ids, registry, store] = await Promise.all([
        read('prefs/modulesPage.js'), read('prefs/moduleCatalog.js'),
        read('lib/moduleIds.js'), read('lib/moduleRegistry.js'), read('lib/configStore.js'),
    ]);
    assert.match(modules, /title: 'System Status Indicators'/);
    assert.match(modules, /Show \$\{title\} while inactive/);
    assert.match(modules, /options\.enabled = enabledSwitch\.active/);
    assert.match(modules, /options\.showInactive = inactiveSwitch\.active/);
    assert.match(catalog, /id: 'statusIndicators'/);
    assert.match(ids, /'statusIndicators'/);
    assert.match(registry, /statusIndicators: buildStatusIndicators/);
    assert.match(store, /statusIndicatorPreferences:/);
});
