import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
    DEFAULT_QUICK_SETTINGS_TILE_IDS,
    formatQuickSettingsTileOrder,
    normalizeQuickSettingsTiles,
    parseQuickSettingsTileOrder,
    normalizeQuickSettingsFavorites,
    parseQuickSettingsFavorites,
    formatQuickSettingsFavorites,
    orderQuickSettingsTiles,
} from '../lib/quickSettingsTiles.js';

test('missing or malformed Quick Settings tile order restores the defaults', () => {
    assert.deepEqual(normalizeQuickSettingsTiles(undefined), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
    assert.deepEqual(normalizeQuickSettingsTiles('wifi'), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
});

test('configured tile order is preserved while unknown and duplicate IDs are removed', () => {
    assert.deepEqual(normalizeQuickSettingsTiles(['wifi', 'bluetooth', 'wifi', 'unknown']),
        ['wifi', 'bluetooth']);
    assert.deepEqual(normalizeQuickSettingsTiles([]), []);
});

test('preference input accepts display names and IDs, and empty input restores defaults', () => {
    assert.deepEqual(parseQuickSettingsTileOrder('Wi-Fi, Bluetooth, dark-mode'),
        ['wifi', 'bluetooth', 'dark-mode']);
    assert.deepEqual(parseQuickSettingsTileOrder(''), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
    assert.equal(parseQuickSettingsTileOrder('Wi-Fi, unknown'), null);
    assert.equal(formatQuickSettingsTileOrder(['wifi', 'bluetooth']), 'Wi-Fi, Bluetooth');
});

test('config store, preferences, and default Quick Settings consume the same tile order', async () => {
    const [config, prefs, extension, quickSettings] = await Promise.all([
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
    ]);
    assert.ok(config.includes('qsTiles: [...DEFAULT_QUICK_SETTINGS_TILE_IDS]'));
    assert.ok(config.includes('merged.qsTiles = normalizeQuickSettingsTiles(merged.qsTiles)'));
    assert.ok(prefs.includes('parseQuickSettingsTileOrder(tileOrderRow.get_text())'));
    assert.ok(prefs.includes('config.qsTiles = parsed'));
    assert.ok(extension.includes('setQuickSettingsTiles(newConfig.qsTiles)'));
    assert.ok(extension.includes('setQuickSettingsTiles(this._config.qsTiles)'));
    assert.ok(extension.includes('clearQuickSettingsState()'));
    assert.ok(!extension.includes('_materialPanelQsTiles'));
    assert.ok(quickSettings.includes('normalizeQuickSettingsTiles(getQuickSettingsTiles())'));
    assert.ok(quickSettings.includes('const configuredRegistry = configuredIds'));
    assert.ok(quickSettings.includes('if (btTile?.devicePanel)'));
    assert.ok(quickSettings.includes('if (wifiRow?.listPanel)'));
});

test('Preferences keeps the tile-order editor synchronized with config watcher updates', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(prefs, /tileOrderRow\.set_text\(formatQuickSettingsTileOrder\(config\.qsTiles\)\)/);
    const watcherStart = prefs.indexOf('store.watch(newConfig => {');
    const watcher = prefs.slice(watcherStart);
    assert.ok(watcher.indexOf('syncObjectInPlace(config, merged)') <
        watcher.indexOf('tileOrderRow.set_text(formatQuickSettingsTileOrder(config.qsTiles))'));
});

test('End-4 and Ryoku Quick Settings honor the shared configured tile visibility', async () => {
    const [end4, ryoku] = await Promise.all([
        readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8'),
    ]);
    for (const source of [end4, ryoku]) {
        assert.match(source, /normalizeQuickSettingsTiles\(getQuickSettingsTiles\(\)\)/);
        assert.match(source, /enabledTiles\.has\('wifi'\)/);
        assert.match(source, /enabledTiles\.has\('bluetooth'\)/);
        assert.match(source, /enabledTiles\.has\('dark-mode'\)/);
        assert.match(source, /enabledTiles\.has\('do-not-disturb'\)/);
        assert.match(source, /enabledTiles\.has\('night-light'\)/);
    }
    assert.match(end4, /const networkGroups = \{\}/);
    assert.match(end4, /const toggleActors = \{/);
    assert.match(end4, /const orderedToggleIds = orderQuickSettingsTiles\(visibleToggleIds, favorites\)/);
    assert.match(end4, /for \(const id of orderedToggleIds\)/);
    assert.match(end4, /flushRoundRow\(\)/);
    assert.match(ryoku, /activeRoutes/);
});


test('favorites accept only known tile IDs, preserve favorite order, and clear on empty input', () => {
    assert.deepEqual(normalizeQuickSettingsFavorites(undefined), []);
    assert.deepEqual(normalizeQuickSettingsFavorites(['wifi', 'wifi', 'unknown']), ['wifi']);
    assert.deepEqual(parseQuickSettingsFavorites('Bluetooth, Wi-Fi, bluetooth'),
        ['bluetooth', 'wifi']);
    assert.deepEqual(parseQuickSettingsFavorites(''), []);
    assert.equal(parseQuickSettingsFavorites('Wi-Fi, unknown'), null);
    assert.equal(formatQuickSettingsFavorites(['night-light', 'wifi']), 'Night light, Wi-Fi');
});

test('favorite ordering pins favorites first without reordering the remaining tiles', () => {
    assert.deepEqual(orderQuickSettingsTiles(
        ['dark-mode', 'do-not-disturb', 'night-light', 'bluetooth', 'wifi'],
        ['wifi', 'night-light'],
    ), ['wifi', 'night-light', 'dark-mode', 'do-not-disturb', 'bluetooth']);
    assert.deepEqual(orderQuickSettingsTiles(['wifi', 'bluetooth'], []), ['wifi', 'bluetooth']);
});

test('favorites flow through config, preferences, and every Quick Settings layout', async () => {
    const [config, prefs, extension, quickSettings, end4, ryoku] = await Promise.all([
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8'),
    ]);
    assert.ok(config.includes('qsFavorites: []'));
    assert.ok(config.includes('merged.qsFavorites = normalizeQuickSettingsFavorites(merged.qsFavorites)'));
    assert.ok(prefs.includes('parseQuickSettingsFavorites(tileFavoritesRow.get_text())'));
    assert.ok(prefs.includes('config.qsFavorites = parsed'));
    assert.ok(prefs.includes('tileFavoritesRow.set_text(formatQuickSettingsFavorites(config.qsFavorites))'));
    assert.ok(extension.includes('setQuickSettingsFavorites(newConfig.qsFavorites)'));
    assert.ok(extension.includes('setQuickSettingsFavorites(this._config.qsFavorites)'));
    assert.ok(!extension.includes('_materialPanelQsFavorites'));
    assert.ok(quickSettings.includes('orderQuickSettingsTiles('));
    assert.ok(end4.includes('orderQuickSettingsTiles('));
    assert.ok(end4.includes('const orderedToggleIds = orderQuickSettingsTiles(visibleToggleIds, favorites)'));
    assert.ok(ryoku.includes('orderQuickSettingsTiles('));
    assert.ok(ryoku.includes('activeRoutes.sort('));
});
